"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useVault } from "@/hooks/useVault";
import { useIdleLock } from "@/hooks/useIdleLock";
import PasswordGenerator from "@/components/vault/PasswordGenerator";
import {
  deleteEncryptedNote,
  getMeta,
  listEncryptedNotes,
  upsertEncryptedNote,
  type EncryptedNoteRecord,
} from "@/lib/db/indexedDb";
import { decryptJson, encryptJson } from "@/lib/crypto/aesGcm";

// ✅ Cloud sync helpers
import { syncDownFromCloud } from "@/lib/sync/syncDown";
import {
  upsertRemoteEncryptedNote,
  deleteRemoteEncryptedNote,
} from "@/lib/supabase/notesSync";

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
const CLOUD_POLL_MS = 10_000; // ✅ background polling while unlocked

// Must match CHECK_KEY in useVault.ts
const CHECK_KEY = "vault_check_v1";

export default function VaultPage() {
  const router = useRouter();
  const { key, isUnlocked, unlock, lock } = useVault();

  const [checking, setChecking] = useState(true);

  // ✅ Master password UX: explicit setup vs unlock
  const [needsMasterSetup, setNeedsMasterSetup] = useState<boolean | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmMasterPassword, setConfirmMasterPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [notes, setNotes] = useState<DecryptedNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ✅ prevent overlapping sync calls
  const syncingRef = useRef(false);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

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

      // ✅ Detect if this device has completed master password setup
      try {
        const check = await getMeta(CHECK_KEY);
        setNeedsMasterSetup(!check);
      } catch {
        setNeedsMasterSetup(true);
      }

      // ✅ Pull encrypted notes from cloud into IndexedDB (best effort; ok if offline)
      try {
        await syncDownFromCloud();
      } catch (e) {
        console.warn("Initial sync down failed (ok if offline):", e);
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
      if (!key) return;

      const encrypted = await listEncryptedNotes();
      const sorted = [...encrypted].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : -1
      );

      const decrypted: DecryptedNote[] = [];

      for (const rec of sorted) {
        try {
          const data = await decryptJson<{ title: string; body: string }>(
            key,
            rec.payload
          );
          decrypted.push({
            id: rec.id,
            title: data.title,
            body: data.body,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
          });
        } catch (e) {
          // helpful during debugging; safe to keep (doesn't leak secrets)
          console.warn("Failed to decrypt note", rec.id, e);
        }
      }

      setNotes(decrypted);

      const desired = nextSelectedId ?? selectedId;
      const stillExists = desired
        ? decrypted.some((n) => n.id === desired)
        : false;

      if (!stillExists) setSelectedId(decrypted[0]?.id ?? null);
    },
    [key, selectedId]
  );

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockError(null);

    // ✅ Make it explicit when setting a master password (first-time on this device)
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
        // UX nudge (not blocking)
        // You can remove this if you prefer
        console.warn("Consider using 12+ characters for your master password.");
      }
    }

    setUnlocking(true);

    try {
      await unlock(masterPassword);
      setMasterPassword("");
      setConfirmMasterPassword("");
      setNeedsMasterSetup(false);
    } catch (err) {
      setUnlockError(
        err instanceof Error ? err.message : "Failed to unlock vault"
      );
    } finally {
      setUnlocking(false);
    }
  }

  // ✅ On unlock: sync down FIRST, then decrypt/list (so other-device notes appear)
  useEffect(() => {
    if (!isUnlocked) {
      setNotes([]);
      setSelectedId(null);
      return;
    }

    (async () => {
      try {
        await syncDownFromCloud();
      } catch (e) {
        console.warn("Sync down after unlock failed (ok if offline):", e);
      }
      await refreshNotes();
    })();
  }, [isUnlocked, refreshNotes]);

  // ✅ Background polling while unlocked (so devices see each other's changes)
  useEffect(() => {
    if (!isUnlocked) return;

    let alive = true;

    const tick = async () => {
      if (!alive) return;
      if (syncingRef.current) return;

      syncingRef.current = true;
      try {
        const res = await syncDownFromCloud();
        if (alive && res?.imported > 0) {
          await refreshNotes(selectedId);
        }
      } catch (e) {
        console.warn("Background sync failed:", e);
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
  }, [isUnlocked, refreshNotes, selectedId]);

  async function createNote() {
    if (!key) return;

    const now = new Date().toISOString();
    const id = uid();
    const payload = await encryptJson(key, { title: "Untitled", body: "" });

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
      });
    } catch (e) {
      console.error("Cloud sync failed (create):", e);
    }

    await refreshNotes(id);
    setSelectedId(id);
  }

  async function saveNote(id: string, title: string, body: string) {
    if (!key) return;

    const existing = notes.find((n) => n.id === id);
    const now = new Date().toISOString();
    const payload = await encryptJson(key, { title, body });

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
      });
    } catch (e) {
      console.error("Cloud sync failed (save):", e);
    }

    await refreshNotes(id);
    setSelectedId(id);
  }

  async function removeNote(id: string) {
    await deleteEncryptedNote(id);

    try {
      await deleteRemoteEncryptedNote(id);
    } catch (e) {
      console.error("Cloud delete failed:", e);
    }

    await refreshNotes(selectedId === id ? null : selectedId);
    if (selectedId === id) setSelectedId(null);
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center text-white">
        Checking session…
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />
      <div className="absolute inset-0 bg-black/45" />

      {/* Content */}
      <div className="relative z-10 min-h-screen px-6 pb-12">
        {/* Header */}
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
              <button
                onClick={lock}
                className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
              >
                Lock
              </button>
            )}
            <button
              onClick={logout}
              className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Unlock / Setup */}
        {!isUnlocked ? (
          <section className="mx-auto mt-12 max-w-md rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-xl">
            <h2 className="text-lg font-semibold text-white">
              {needsMasterSetup ? "Set your master password" : "Unlock your vault"}
            </h2>

            <p className="mt-1 text-sm text-white/70">
              Your <span className="font-medium text-white/85">login password</span> (Supabase)
              is separate from your <span className="font-medium text-white/85">master password</span>.
              {needsMasterSetup ? (
                <>
                  {" "}
                  This master password will be required to unlock your vault on any device.
                  We never store it.
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
                placeholder={needsMasterSetup ? "Create master password" : "Master password"}
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

              {needsMasterSetup && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                  <div className="font-semibold text-white/85">Important</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>We can’t recover your master password.</li>
                    <li>Use a strong password (12+ characters recommended).</li>
                    <li>Your notes remain encrypted even on our servers.</li>
                  </ul>
                </div>
              )}
            </form>
          </section>
        ) : (
          <section className="mt-10 grid gap-4 md:grid-cols-3">
            {/* Notes list */}
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
                  <li className="text-sm text-white/60">
                    No notes yet. Create one.
                  </li>
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

            {/* Editor */}
            <div className="md:col-span-2 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl space-y-4">
              {/* ✅ Password generator UX: strength indicator + length dropdown
                  (You'll implement this inside the PasswordGenerator component.) */}
              <PasswordGenerator />

              {!selected ? (
                <p className="text-sm text-white/60">
                  Select a note to view or edit.
                </p>
              ) : (
                <NoteEditor
                  key={selected.id}
                  note={selected}
                  onSave={saveNote}
                  onDelete={removeNote}
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
}: {
  note: DecryptedNote;
  onSave: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(note.id, title, body);
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
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
    </div>
  );
}
