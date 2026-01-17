"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { fetchVaultSaltB64 } from "@/lib/supabase/vaultKdf";
import { useVault } from "@/hooks/useVault";
import { useIdleLock } from "@/hooks/useIdleLock";
import PasswordGenerator from "@/components/vault/PasswordGenerator";
import {
  deleteEncryptedNote,
  getMeta,
  setMeta,
  listEncryptedNotes,
  upsertEncryptedNote,
  upsertEncryptedNoteKey,
  type EncryptedNoteRecord,
} from "@/lib/db/indexedDb";
import { devError, devWarn } from "@/lib/logger";

// ✅ Cloud sync helpers
import { syncDownFromCloud } from "@/lib/sync/syncDown";
import {
  upsertRemoteEncryptedNote,
  deleteRemoteEncryptedNote,
  fetchRemoteEncryptedNoteKey,
  fetchRemoteEncryptedNote,
} from "@/lib/supabase/notesSync";

// ✅ New: note crypto (per-note keys)
import {
  decryptAnyNotePayload,
  encryptNoteWithPerNoteKey,
  loadNoteKeyBytes,
} from "@/lib/notes/noteCrypto";

// ✅ New: shared sync (call if you already implemented it)
import { syncDownSharedNotes } from "@/lib/sync/syncSharedDown";
import { shareNoteToGroup, shareNoteToUser } from "@/lib/shares/shareService";
import {
  createGroup,
  fetchGroupMemberKeys,
  fetchGroupNoteShares,
  fetchGroupMembers,
  listMyGroups,
  inviteMemberByEmail,
  leaveGroup,
  removeGroupMember,
  rotateGroupKeysWithPayload,
  type GroupSummary,
} from "@/lib/groups/groups";
import { loadMyGroupKeys } from "@/lib/groups/groupKeyLoader";
import { lookupProfileByEmail } from "@/lib/supabase/profiles";
import { b64ToU8 } from "@/lib/crypto/box";
import { ensureProfileKeys, loadMyBoxKeypair } from "@/lib/supabase/profileKeys";
import { getVaultCheckKey, LEGACY_VAULT_CHECK_KEY } from "@/lib/vault/metaKeys";

type DecryptedNote = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

function uid() {
  return crypto.randomUUID();
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const CLOUD_POLL_MS = 10_000;
const CORRUPT_NOTES_KEY = "corrupt_notes_v1";

export default function VaultPage() {
  const router = useRouter();
  const { key: vaultAesKey, isUnlocked, unlock, lock } = useVault();

  const [checking, setChecking] = useState(true);

  // Master password UX
  const [needsMasterSetup, setNeedsMasterSetup] = useState<boolean | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmMasterPassword, setConfirmMasterPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [notes, setNotes] = useState<DecryptedNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<
    Array<{ user_id: string; role: string }>
  >([]);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const [rotationStatus, setRotationStatus] = useState<string | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [boxPublicKeyB64, setBoxPublicKeyB64] = useState<string | null>(null);
  const [groupKeys, setGroupKeys] = useState<
    Map<string, { keyBytes: Uint8Array; keyVersion: number }>
  >(new Map());
  const [groupLoading, setGroupLoading] = useState(false);

  // prevent overlapping sync calls
  const syncingRef = useRef(false);
  const corruptNotesRef = useRef<Set<string> | null>(null);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );
  const isGroupOwner = !!selectedGroup && selectedGroup.owner_id === myUserId;

  useIdleLock(isUnlocked, IDLE_TIMEOUT_MS, () => {
    lock();
    setUnlockError(null);
  });

  useEffect(() => {
    async function run() {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/login");
        return;
      }

      // Detect if this user already has a master password setup
      try {
        const userId = data.user.id;
        const remoteSalt = await fetchVaultSaltB64();
        if (remoteSalt) {
          setNeedsMasterSetup(false);
        } else {
          const check = await getMeta(getVaultCheckKey(userId));
          if (check) {
            setNeedsMasterSetup(false);
          } else {
            const legacyCheck = await getMeta(LEGACY_VAULT_CHECK_KEY);
            setNeedsMasterSetup(!legacyCheck);
          }
        }
      } catch {
        setNeedsMasterSetup(true);
      }

      // Pull OWNED encrypted notes from cloud into IndexedDB (best effort)
      try {
        await syncDownFromCloud();
      } catch (e) {
        devWarn("Initial sync down failed (ok if offline):", e);
      }

      setChecking(false);
    }

    run();
  }, [router]);

  async function logout() {
    const supabase = getSupabaseClient();
    lock();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const refreshNotes = useCallback(
    async (nextSelectedId?: string | null) => {
      if (!vaultAesKey) return;

      const encrypted = await listEncryptedNotes();
      const sorted = [...encrypted].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

      const decrypted: DecryptedNote[] = [];

      async function getCorruptNotes() {
        if (corruptNotesRef.current) return corruptNotesRef.current;
        try {
          const raw = await getMeta(CORRUPT_NOTES_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              corruptNotesRef.current = new Set(
                parsed.filter((id) => typeof id === "string")
              );
              return corruptNotesRef.current;
            }
          }
        } catch {
          // Ignore malformed data and reset.
        }
        corruptNotesRef.current = new Set();
        return corruptNotesRef.current;
      }

      const corruptNotes = await getCorruptNotes();

      function parsePayload(raw: string) {
        try {
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            typeof parsed.iv === "string" &&
            typeof parsed.ciphertext === "string"
          ) {
            return { iv: parsed.iv, ciphertext: parsed.ciphertext };
          }
          return null;
        } catch {
          return null;
        }
      }

      for (const rec of sorted) {
        if (corruptNotes.has(rec.id)) {
          continue;
        }

        let payloadForRetry = rec.payload;
        try {
          const data = await decryptAnyNotePayload({
            noteId: rec.id,
            payload: rec.payload,
            vaultAesKey,
          });

          decrypted.push({
            id: rec.id,
            title: data.title,
            body: data.body,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
          });
        } catch (e) {
          let recovered = false;
          try {
            const remote = await fetchRemoteEncryptedNote(rec.id);
            if (remote) {
              const parsed = parsePayload(remote.ciphertext);
              if (parsed) {
                await upsertEncryptedNote({
                  id: remote.id,
                  payload: parsed,
                  createdAt: remote.created_at,
                  updatedAt: remote.updated_at,
                });
                if (remote.note_key_ciphertext && remote.note_key_iv) {
                  await upsertEncryptedNoteKey({
                    noteId: remote.id,
                    encryptedNoteKey: {
                      ciphertext: remote.note_key_ciphertext,
                      iv: remote.note_key_iv,
                    },
                    createdAt: remote.created_at,
                    updatedAt: remote.updated_at,
                  });
                }
                recovered = true;
                payloadForRetry = parsed;
              }
            }
          } catch (recoverErr) {
            devWarn("Failed to recover note from cloud", {
              noteId: rec.id,
              error: recoverErr,
            });
          }

          try {
            const remoteKey = await fetchRemoteEncryptedNoteKey(rec.id);
            if (remoteKey) {
              await upsertEncryptedNoteKey({
                noteId: rec.id,
                encryptedNoteKey: remoteKey,
                createdAt: rec.createdAt,
                updatedAt: rec.updatedAt,
              });
              recovered = true;
            }
          } catch (recoverErr) {
            devWarn("Failed to recover note key", { noteId: rec.id, error: recoverErr });
          }

          if (recovered) {
            try {
              const data = await decryptAnyNotePayload({
                noteId: rec.id,
                payload: payloadForRetry,
                vaultAesKey,
              });
              decrypted.push({
                id: rec.id,
                title: data.title,
                body: data.body,
                createdAt: rec.createdAt,
                updatedAt: rec.updatedAt,
              });
              continue;
            } catch (retryErr) {
              devWarn("Failed to decrypt note after key recovery", {
                noteId: rec.id,
                error: retryErr,
              });

              corruptNotes.add(rec.id);
              try {
                await setMeta(CORRUPT_NOTES_KEY, JSON.stringify([...corruptNotes]));
              } catch {}
              continue;
            }
          }

          devWarn("Failed to decrypt note", { noteId: rec.id, error: e });
        }
      }

      setNotes(decrypted);

      const desired = nextSelectedId ?? selectedId;
      const stillExists = desired ? decrypted.some((n) => n.id === desired) : false;

      if (!stillExists) setSelectedId(decrypted[0]?.id ?? null);
    },
    [vaultAesKey, selectedId]
  );

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockError(null);

    if (needsMasterSetup) {
      if (masterPassword.length < 8) {
        setUnlockError("Master password must be at least 8 characters.");
        return;
      }
      if (masterPassword !== confirmMasterPassword) {
        setUnlockError("Master passwords do not match.");
        return;
      }
      if (masterPassword.length < 12) {
        devWarn("Consider using 12+ characters for your master password.");
      }
    }

    setUnlocking(true);

    try {
      await unlock(masterPassword);
      setMasterPassword("");
      setConfirmMasterPassword("");
      setNeedsMasterSetup(false);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Failed to unlock vault");
    } finally {
      setUnlocking(false);
    }
  }

  // On unlock: sync down OWNED notes + SHARED notes, then decrypt/list
  useEffect(() => {
    if (!isUnlocked) {
      setNotes([]);
      setSelectedId(null);
      return;
    }
    if (!vaultAesKey) return;

    (async () => {
      try {
        await syncDownFromCloud();
      } catch (e) {
        devWarn("Sync down after unlock failed (ok if offline):", e);
      }

      // If you implemented shared sync (9C), do it here too:
      try {
        await syncDownSharedNotes({ vaultAesKey });
      } catch (e) {
        devWarn("Shared sync down after unlock failed (ok if offline):", e);
      }

      await refreshNotes();
    })();
  }, [isUnlocked, vaultAesKey, refreshNotes]);

  useEffect(() => {
    if (!isUnlocked || !vaultAesKey) {
      setGroups([]);
      setSelectedGroupId(null);
      setGroupMembers([]);
      setGroupKeys(new Map());
      return;
    }

    (async () => {
      setGroupLoading(true);
      setGroupError(null);
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getUser();
        setMyUserId(data.user?.id ?? null);

        const profile = await ensureProfileKeys({ vaultAesKey });
        setBoxPublicKeyB64(profile.boxPublicKeyB64);

        const myBox = await loadMyBoxKeypair({ vaultAesKey, autoCreateIfMissing: true });
        const keys = await loadMyGroupKeys({
          myBoxPublicKey: myBox.publicKey,
          myBoxPrivateKey: myBox.privateKey,
        });
        setGroupKeys(keys);

        const rows = await listMyGroups();
        setGroups(rows);
        if (!selectedGroupId && rows.length > 0) {
          setSelectedGroupId(rows[0].id);
        }
      } catch (e) {
        setGroupError(e instanceof Error ? e.message : "Failed to load groups.");
      } finally {
        setGroupLoading(false);
      }
    })();
  }, [isUnlocked, vaultAesKey, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupMembers([]);
      return;
    }
    (async () => {
      try {
        const members = await fetchGroupMembers(selectedGroupId);
        setGroupMembers(members);
      } catch (e) {
        devWarn("Failed to load group members", e);
      }
    })();
  }, [selectedGroupId]);

  // Background polling while unlocked
  useEffect(() => {
    if (!isUnlocked || !vaultAesKey) return;

    let alive = true;

    const tick = async () => {
      if (!alive) return;
      if (syncingRef.current) return;

      syncingRef.current = true;
      try {
        const res = await syncDownFromCloud();
        await syncDownSharedNotes({ vaultAesKey });

        if (alive && (res?.imported ?? 0) > 0) {
          await refreshNotes(selectedId);
        }
      } catch (e) {
        devWarn("Background sync failed:", e);
      } finally {
        syncingRef.current = false;
      }
    };

    tick();
    const t = setInterval(tick, CLOUD_POLL_MS);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [isUnlocked, vaultAesKey, refreshNotes, selectedId]);

  async function createNote() {
    if (!vaultAesKey) return;

    const now = new Date().toISOString();
    const id = uid();

    // ✅ NEW: encrypt with per-note key
    const { payload, encryptedNoteKey } = await encryptNoteWithPerNoteKey({
      noteId: id,
      plain: { title: "Untitled", body: "" },
      vaultAesKey,
      createdAt: now,
      updatedAt: now,
    });

    const rec: EncryptedNoteRecord = {
      id,
      payload,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEncryptedNote(rec);

    try {
      await upsertRemoteEncryptedNote({
        id,
        title: "Untitled",
        payload,
        encryptedNoteKey, // ✅ store in Supabase so other devices can decrypt
      });
    } catch (e) {
      devError("Cloud sync failed (create):", e);
    }

    await refreshNotes(id);
    setSelectedId(id);
  }

  async function saveNote(id: string, title: string, body: string) {
    if (!vaultAesKey) return;

    const existing = notes.find((n) => n.id === id);
    const now = new Date().toISOString();

    // ✅ NEW: encrypt with per-note key (reuses existing noteKey if present)
    const { payload, encryptedNoteKey } = await encryptNoteWithPerNoteKey({
      noteId: id,
      plain: { title, body },
      vaultAesKey,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    const rec: EncryptedNoteRecord = {
      id,
      payload,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEncryptedNote(rec);

    try {
      await upsertRemoteEncryptedNote({
        id,
        title: title || "Untitled",
        payload,
        encryptedNoteKey, // ✅ sync noteKey for other devices
      });
    } catch (e) {
      devError("Cloud sync failed (save):", e);
    }

    await refreshNotes(id);
    setSelectedId(id);
  }

  async function removeNote(id: string) {
    await deleteEncryptedNote(id);

    try {
      await deleteRemoteEncryptedNote(id);
    } catch (e) {
      devError("Cloud delete failed:", e);
    }

    await refreshNotes(selectedId === id ? null : selectedId);
    if (selectedId === id) setSelectedId(null);
  }

  async function refreshGroupsAndKeys() {
    if (!vaultAesKey) return;
    setGroupLoading(true);
    try {
      const myBox = await loadMyBoxKeypair({ vaultAesKey, autoCreateIfMissing: true });
      const keys = await loadMyGroupKeys({
        myBoxPublicKey: myBox.publicKey,
        myBoxPrivateKey: myBox.privateKey,
      });
      setGroupKeys(keys);
      const rows = await listMyGroups();
      setGroups(rows);
      if (rows.length > 0 && !selectedGroupId) {
        setSelectedGroupId(rows[0].id);
      }
    } finally {
      setGroupLoading(false);
    }
  }

  async function handleCreateGroup() {
    if (!groupNameInput.trim() || !boxPublicKeyB64) return;
    setGroupError(null);
    try {
      const res = await createGroup(groupNameInput.trim(), boxPublicKeyB64);
      setGroupNameInput("");
      await refreshGroupsAndKeys();
      setSelectedGroupId(res.groupId);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Failed to create group.");
    }
  }

  async function handleInviteMember() {
    if (!selectedGroupId) return;
    if (!inviteEmail.trim()) return;
    const groupEntry = groupKeys.get(selectedGroupId);
    if (!groupEntry) {
      setGroupError("Group key not loaded. Try reloading groups.");
      return;
    }
    setGroupError(null);
    try {
      await inviteMemberByEmail({
        groupId: selectedGroupId,
        email: inviteEmail.trim(),
        groupKey: groupEntry.keyBytes,
        keyVersion: groupEntry.keyVersion,
      });
      setInviteEmail("");
      await refreshGroupsAndKeys();
      const members = await fetchGroupMembers(selectedGroupId);
      setGroupMembers(members);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Failed to invite member.");
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedGroupId) return;
    setGroupError(null);
    try {
      await removeGroupMember({ groupId: selectedGroupId, memberUserId: userId });
      const members = await fetchGroupMembers(selectedGroupId);
      setGroupMembers(members);
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Failed to remove member.");
    }
  }

  async function handleLeaveGroup() {
    if (!selectedGroupId) return;
    setGroupError(null);
    try {
      await leaveGroup(selectedGroupId);
      setSelectedGroupId(null);
      await refreshGroupsAndKeys();
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Failed to leave group.");
    }
  }

  async function handleRotateGroupKey() {
    if (!selectedGroupId || !vaultAesKey) return;
    if (!isGroupOwner) return;

    const confirmed = window.confirm(
      "Rotate group key? Members will need to sync to regain access."
    );
    if (!confirmed) return;

    setRotationError(null);
    setRotationStatus("Rotating group key...");

    try {
      const members = await fetchGroupMemberKeys(selectedGroupId);
      const shares = await fetchGroupNoteShares(selectedGroupId);

      const noteShares = [];
      for (const share of shares) {
        const noteId = share.note_id;
        let noteKeyBytes = await loadNoteKeyBytes({ noteId, vaultAesKey });
        if (!noteKeyBytes) {
          const note = notes.find((n) => n.id === noteId);
          if (!note) {
            throw new Error(`Missing note key for note ${noteId}. Open the note first.`);
          }

          const now = new Date().toISOString();
          const {
            payload,
            encryptedNoteKey,
            noteKeyBytes: newNoteKeyBytes,
          } = await encryptNoteWithPerNoteKey({
            noteId,
            plain: { title: note.title, body: note.body },
            vaultAesKey,
            createdAt: note.createdAt,
            updatedAt: now,
          });

          await upsertEncryptedNote({
            id: noteId,
            payload,
            createdAt: note.createdAt,
            updatedAt: now,
          });

          await upsertRemoteEncryptedNote({
            id: noteId,
            title: note.title || "Untitled",
            payload,
            encryptedNoteKey,
          });

          noteKeyBytes = newNoteKeyBytes;
        }

        noteShares.push({
          noteId,
          noteKey: noteKeyBytes,
          sharedWithType: "group" as const,
          sharedWithId: selectedGroupId,
        });
      }

      const newGroupKey = crypto.getRandomValues(new Uint8Array(32));
      const currentKeyVersion = groupKeys.get(selectedGroupId)?.keyVersion ?? 1;
      const newKeyVersion = currentKeyVersion + 1;

      await rotateGroupKeysWithPayload({
        groupId: selectedGroupId,
        newKeyVersion,
        newGroupKey,
        members: members.map((member) => ({
          userId: member.user_id,
          boxPublicKeyB64: member.box_public_key,
        })),
        noteShares,
      });

      await refreshGroupsAndKeys();
      setRotationStatus("Group key rotated.");
      setTimeout(() => setRotationStatus(null), 3000);
    } catch (e) {
      setRotationError(e instanceof Error ? e.message : "Failed to rotate group key.");
      setRotationStatus(null);
    }
  }

  async function shareNoteWithGroup(
    noteId: string,
    groupId: string,
    permission: "read" | "write"
  ) {
    if (!vaultAesKey) return;
    const groupEntry = groupKeys.get(groupId);
    if (!groupEntry) {
      throw new Error("Group key not loaded.");
    }

    let noteKeyBytes = await loadNoteKeyBytes({ noteId, vaultAesKey });
    if (!noteKeyBytes) {
      const note = notes.find((n) => n.id === noteId);
      if (!note) throw new Error("Note not found locally.");

      const now = new Date().toISOString();
      const {
        payload,
        encryptedNoteKey,
        noteKeyBytes: newNoteKeyBytes,
      } = await encryptNoteWithPerNoteKey({
        noteId,
        plain: { title: note.title, body: note.body },
        vaultAesKey,
        createdAt: note.createdAt,
        updatedAt: now,
      });

      await upsertEncryptedNote({
        id: noteId,
        payload,
        createdAt: note.createdAt,
        updatedAt: now,
      });

      await upsertRemoteEncryptedNote({
        id: noteId,
        title: note.title || "Untitled",
        payload,
        encryptedNoteKey,
      });

      noteKeyBytes = newNoteKeyBytes;
    }

    await shareNoteToGroup({
      noteId,
      groupId,
      permission,
      groupKey: groupEntry.keyBytes,
      noteKey: noteKeyBytes,
      keyVersion: groupEntry.keyVersion,
    });
  }

  async function shareNoteWithUser(
    noteId: string,
    email: string,
    permission: "read" | "write"
  ) {
    if (!vaultAesKey) return;
    const profile = await lookupProfileByEmail(email);
    if (!profile) {
      throw new Error("No user found for that email.");
    }
    if (!profile.boxPublicKeyB64) {
      throw new Error("Recipient has not set up sharing keys yet.");
    }

    let noteKeyBytes = await loadNoteKeyBytes({ noteId, vaultAesKey });
    if (!noteKeyBytes) {
      const note = notes.find((n) => n.id === noteId);
      if (!note) throw new Error("Note not found locally.");

      const now = new Date().toISOString();
      const {
        payload,
        encryptedNoteKey,
        noteKeyBytes: newNoteKeyBytes,
      } = await encryptNoteWithPerNoteKey({
        noteId,
        plain: { title: note.title, body: note.body },
        vaultAesKey,
        createdAt: note.createdAt,
        updatedAt: now,
      });

      await upsertEncryptedNote({
        id: noteId,
        payload,
        createdAt: note.createdAt,
        updatedAt: now,
      });

      await upsertRemoteEncryptedNote({
        id: noteId,
        title: note.title || "Untitled",
        payload,
        encryptedNoteKey,
      });

      noteKeyBytes = newNoteKeyBytes;
    }

    await shareNoteToUser({
      noteId,
      userId: profile.userId,
      permission,
      recipientBoxPublicKey: b64ToU8(profile.boxPublicKeyB64),
      noteKey: noteKeyBytes,
    });
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white">
        Checking session…
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />
      <div className="absolute inset-0 bg-black/45" />

      <div className="relative z-10 min-h-screen px-6 pb-12">
        <header className="flex items-center justify-between py-6">
          <Link href="/">
            <Image
              src="/images/logo.png"
              alt="SecureVault logo"
              width={220}
              height={70}
              priority
              className="drop-shadow-[0_0_18px_rgba(168,85,247,0.6)]"
            />
          </Link>

          <div className="flex items-center gap-3">
            {isUnlocked && (
              <>
                <Link
                  href="/shared"
                  className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                >
                  Shared
                </Link>
                <button
                  onClick={lock}
                  className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                >
                  Lock
                </button>
              </>
            )}
            <button
              onClick={logout}
              className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
            >
              Logout
            </button>
          </div>
        </header>

        {!isUnlocked ? (
          <section className="mx-auto mt-12 max-w-md rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-xl">
            <h2 className="text-lg font-semibold text-white">
              {needsMasterSetup ? "Set your master password" : "Unlock your vault"}
            </h2>

            <p className="mt-1 text-sm text-white/70">
              Your <span className="font-medium text-white/85">login password</span>{" "}
              (Supabase) is separate from your{" "}
              <span className="font-medium text-white/85">master password</span>.
              {needsMasterSetup ? (
                <>
                  {" "}
                  This master password will be required to unlock your vault on any
                  device. We never store it.
                </>
              ) : (
                <> We never store your master password.</>
              )}
            </p>

            <form onSubmit={onUnlock} className="mt-4 space-y-4">
              <input
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder={
                  needsMasterSetup ? "Create master password" : "Master password"
                }
                required
                minLength={8}
                autoComplete="new-password"
              />

              {needsMasterSetup && (
                <input
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
                  type="password"
                  value={confirmMasterPassword}
                  onChange={(e) => setConfirmMasterPassword(e.target.value)}
                  placeholder="Confirm master password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              )}

              {unlockError && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {unlockError}
                </p>
              )}

              <button
                type="submit"
                disabled={unlocking}
                className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.45)] disabled:opacity-60"
              >
                {unlocking
                  ? needsMasterSetup
                    ? "Setting up…"
                    : "Unlocking…"
                  : needsMasterSetup
                    ? "Set master password"
                    : "Unlock"}
              </button>
            </form>
          </section>
        ) : (
          <section className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Notes</h3>
                  <button
                    onClick={createNote}
                    className="rounded-lg bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    New
                  </button>
                </div>

                <ul className="mt-3 space-y-2">
                  {notes.length === 0 ? (
                    <li className="text-sm text-white/60">No notes yet. Create one.</li>
                  ) : (
                    notes.map((n) => (
                      <li key={n.id}>
                        <button
                          onClick={() => setSelectedId(n.id)}
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                            n.id === selectedId
                              ? "border-purple-400 bg-white/10"
                              : "border-white/15"
                          }`}
                        >
                          <div className="font-medium text-white">
                            {n.title || "Untitled"}
                          </div>
                          <div className="text-xs text-white/60">
                            Updated {new Date(n.updatedAt).toLocaleString()}
                          </div>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Groups</h3>
                  {groupLoading ? (
                    <span className="text-xs text-white/60">Loading…</span>
                  ) : null}
                </div>

                {groupError ? (
                  <p className="mt-2 text-xs text-red-300">{groupError}</p>
                ) : null}

                <div className="mt-3 space-y-2">
                  <input
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white outline-none"
                    value={groupNameInput}
                    onChange={(e) => setGroupNameInput(e.target.value)}
                    placeholder="New group name"
                  />
                  <button
                    onClick={handleCreateGroup}
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white"
                  >
                    Create group
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {groups.length === 0 ? (
                    <p className="text-xs text-white/60">No groups yet.</p>
                  ) : (
                    groups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => setSelectedGroupId(group.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${
                          group.id === selectedGroupId
                            ? "border-purple-400 bg-white/10"
                            : "border-white/15"
                        }`}
                      >
                        <div className="font-semibold text-white">{group.name}</div>
                        <div className="text-[11px] text-white/60">
                          {group.owner_id === myUserId ? "Owner" : "Member"}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {selectedGroup ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-white/70">Group details</div>
                    <div className="text-sm font-semibold text-white">
                      {selectedGroup.name}
                    </div>

                    <div>
                      <div className="text-xs text-white/60">Members</div>
                      <ul className="mt-2 space-y-2">
                        {groupMembers.map((member) => (
                          <li
                            key={member.user_id}
                            className="flex items-center justify-between"
                          >
                            <div className="text-xs text-white/70">
                              {member.user_id === myUserId ? "You" : member.user_id}
                            </div>
                            {isGroupOwner && member.user_id !== myUserId ? (
                              <button
                                onClick={() => handleRemoveMember(member.user_id)}
                                className="text-[11px] text-red-300"
                              >
                                Remove
                              </button>
                            ) : (
                              <span className="text-[11px] text-white/40">
                                {member.role}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {isGroupOwner ? (
                      <div className="space-y-2">
                        <input
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white outline-none"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Invite by email"
                        />
                        <button
                          onClick={handleInviteMember}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white"
                        >
                          Invite member
                        </button>
                        <button
                          onClick={handleRotateGroupKey}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white"
                        >
                          Rotate group key
                        </button>
                        {rotationStatus ? (
                          <p className="text-xs text-emerald-300">{rotationStatus}</p>
                        ) : null}
                        {rotationError ? (
                          <p className="text-xs text-red-300">{rotationError}</p>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        onClick={handleLeaveGroup}
                        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-white"
                      >
                        Leave group
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl md:col-span-2">
              <PasswordGenerator />

              {!selected ? (
                <p className="text-sm text-white/60">Select a note to view or edit.</p>
              ) : (
                <NoteEditor
                  key={selected.id}
                  note={selected}
                  onSave={saveNote}
                  onDelete={removeNote}
                  groups={groups}
                  onShare={shareNoteWithGroup}
                  onShareUser={shareNoteWithUser}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function NoteEditor({
  note,
  onSave,
  onDelete,
  groups,
  onShare,
  onShareUser,
}: {
  note: DecryptedNote;
  onSave: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  groups: GroupSummary[];
  onShare: (id: string, groupId: string, permission: "read" | "write") => Promise<void>;
  onShareUser: (id: string, email: string, permission: "read" | "write") => Promise<void>;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareGroupId, setShareGroupId] = useState(groups[0]?.id ?? "");
  const [sharePermission, setSharePermission] = useState<"read" | "write">("read");
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [shareUserEmail, setShareUserEmail] = useState("");
  const [shareUserError, setShareUserError] = useState<string | null>(null);
  const [shareUserSuccess, setShareUserSuccess] = useState<string | null>(null);
  const [shareUserLoading, setShareUserLoading] = useState(false);
  const permissionRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!permissionOpen) return;
    function handleClick(event: MouseEvent) {
      if (!permissionRef.current) return;
      if (!permissionRef.current.contains(event.target as Node)) {
        setPermissionOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setPermissionOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [permissionOpen]);

  useEffect(() => {
    if (!groupOpen) return;
    function handleClick(event: MouseEvent) {
      if (!groupRef.current) return;
      if (!groupRef.current.contains(event.target as Node)) {
        setGroupOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") setGroupOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [groupOpen]);

  async function save() {
    setSaving(true);
    await onSave(note.id, title, body);
    setSaving(false);
  }

  async function share() {
    setShareError(null);
    setShareSuccess(null);
    const targetGroupId = shareGroupId || groups[0]?.id;
    if (!targetGroupId) {
      setShareError("Select a group to share with.");
      return;
    }
    const confirmShare = window.confirm(
      `Share this note with ${groups.find((g) => g.id === targetGroupId)?.name ?? "group"}?`
    );
    if (!confirmShare) return;
    try {
      await onShare(note.id, targetGroupId, sharePermission);
      setShareSuccess("Shared successfully.");
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Failed to share note.");
    }
  }

  async function shareToUser() {
    setShareUserError(null);
    setShareUserSuccess(null);
    const email = shareUserEmail.trim();
    if (!email) {
      setShareUserError("Enter an email to share with.");
      return;
    }
    setShareUserLoading(true);
    try {
      await onShareUser(note.id, email, sharePermission);
      setShareUserSuccess("Shared with user.");
      setShareUserEmail("");
    } catch (e) {
      setShareUserError(e instanceof Error ? e.message : "Failed to share note.");
    } finally {
      setShareUserLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <button
          onClick={() => onDelete(note.id)}
          className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white"
        >
          Delete
        </button>
        <button
          onClick={() => setShareOpen((prev) => !prev)}
          className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white"
        >
          Share
        </button>
      </div>

      <textarea
        className="min-h-[320px] w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your note…"
      />

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.45)] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {shareOpen ? (
        <div className="space-y-3 rounded-2xl border border-white/15 bg-white/5 p-4">
          <div className="text-xs text-white/70">Share with group</div>
          {groups.length === 0 ? (
            <p className="text-xs text-white/60">Create a group first.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <div ref={groupRef} className="relative min-w-[180px]">
                  <button
                    type="button"
                    onClick={() => setGroupOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-xl border border-white/20 bg-purple-500/15 px-3 py-2 text-xs text-white outline-none"
                    aria-haspopup="listbox"
                    aria-expanded={groupOpen}
                  >
                    <span>
                      {groups.find(
                        (group) => group.id === (shareGroupId || groups[0]?.id)
                      )?.name ?? "Select group"}
                    </span>
                    <span className="text-white/60" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {groupOpen ? (
                    <div
                      className="absolute top-full left-0 z-20 mt-2 w-full rounded-xl border border-white/20 bg-purple-950/80 p-1 text-xs text-white shadow-lg backdrop-blur"
                      role="listbox"
                      aria-label="Share group"
                    >
                      {groups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          role="option"
                          aria-selected={shareGroupId === group.id}
                          className={`flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-white/10 ${
                            shareGroupId === group.id ? "bg-white/10" : "text-white/80"
                          }`}
                          onClick={() => {
                            setShareGroupId(group.id);
                            setGroupOpen(false);
                          }}
                        >
                          {group.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div ref={permissionRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setPermissionOpen((prev) => !prev)}
                    className="flex min-w-[140px] items-center justify-between rounded-xl border border-white/20 bg-purple-500/15 px-3 py-2 text-xs text-white outline-none"
                    aria-haspopup="listbox"
                    aria-expanded={permissionOpen}
                  >
                    <span>{sharePermission === "write" ? "Write" : "Read-only"}</span>
                    <span className="text-white/60" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {permissionOpen ? (
                    <div
                      className="absolute top-full left-0 z-20 mt-2 w-full min-w-[140px] rounded-xl border border-white/20 bg-purple-950/80 p-1 text-xs text-white shadow-lg backdrop-blur"
                      role="listbox"
                      aria-label="Share permission"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSharePermission("read");
                          setPermissionOpen(false);
                        }}
                        role="option"
                        aria-selected={sharePermission === "read"}
                        className={`w-full rounded-lg px-3 py-2 text-left hover:bg-white/10 ${
                          sharePermission === "read" ? "bg-white/10" : "text-white/80"
                        }`}
                      >
                        Read-only
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSharePermission("write");
                          setPermissionOpen(false);
                        }}
                        role="option"
                        aria-selected={sharePermission === "write"}
                        className={`mt-1 w-full rounded-lg px-3 py-2 text-left hover:bg-white/10 ${
                          sharePermission === "write" ? "bg-white/10" : "text-white/80"
                        }`}
                      >
                        Write
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={share}
                  className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-2 text-xs font-semibold text-white"
                >
                  Share note
                </button>
              </div>
              {shareError ? <p className="text-xs text-red-300">{shareError}</p> : null}
              {shareSuccess ? (
                <p className="text-xs text-emerald-300">{shareSuccess}</p>
              ) : null}
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="text-xs text-white/70">Share with user (email)</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className="min-w-[220px] flex-1 rounded-xl border border-white/20 bg-purple-500/15 px-3 py-2 text-xs text-white outline-none"
                    placeholder="user@example.com"
                    value={shareUserEmail}
                    onChange={(e) => setShareUserEmail(e.target.value)}
                    type="email"
                  />
                  <button
                    onClick={shareToUser}
                    disabled={shareUserLoading}
                    className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {shareUserLoading ? "Sharing…" : "Share to user"}
                  </button>
                </div>
                {shareUserError ? (
                  <p className="mt-2 text-xs text-red-300">{shareUserError}</p>
                ) : null}
                {shareUserSuccess ? (
                  <p className="mt-2 text-xs text-emerald-300">{shareUserSuccess}</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
