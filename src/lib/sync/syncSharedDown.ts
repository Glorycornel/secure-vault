import {
  fetchEncryptedNotesByIds,
  fetchVisibleNoteShares,
} from "@/lib/supabase/sharedNotes";
import { loadMyBoxKeypair } from "@/lib/supabase/profileKeys";
import { loadMyGroupKeys } from "@/lib/groups/groupKeyLoader";
import { decryptBytes, encryptBytes } from "@/lib/crypto/aesBytes";
import { importAesKey } from "@/lib/crypto/aesRaw";
import { b64ToU8, openSealed } from "@/lib/crypto/box";
import type { EncryptedPayload } from "@/lib/db/indexedDb";
import {
  deleteEncryptedNoteKey,
  deleteSharedEncryptedNote,
  getEncryptedNote,
  getEncryptedNoteKey,
  listSharedEncryptedNotes,
  upsertEncryptedNoteKey,
  upsertSharedEncryptedNote,
} from "@/lib/db/indexedDb";

function tryParsePayload(raw: string): EncryptedPayload | null {
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

export async function syncDownSharedNotes(params: { vaultAesKey: CryptoKey }) {
  const myBox = await loadMyBoxKeypair({
    vaultAesKey: params.vaultAesKey,
    autoCreateIfMissing: true,
  });

  const groupKeyMap = await loadMyGroupKeys({
    myBoxPublicKey: myBox.publicKey,
    myBoxPrivateKey: myBox.privateKey,
  });

  const shares = await fetchVisibleNoteShares();
  const noteIds = [...new Set(shares.map((s) => s.note_id))];
  const notes = await fetchEncryptedNotesByIds(noteIds);

  const sharesByNoteId = new Map<string, (typeof shares)[number][]>();
  for (const s of shares) {
    const list = sharesByNoteId.get(s.note_id);
    if (list) {
      list.push(s);
    } else {
      sharesByNoteId.set(s.note_id, [s]);
    }
  }

  const existingShared = await listSharedEncryptedNotes();
  const currentShareIds = new Set(shares.map((s) => s.note_id));

  let imported = 0;
  let skipped = 0;
  let keysUpserted = 0;

  for (const local of existingShared) {
    if (!currentShareIds.has(local.id)) {
      await deleteSharedEncryptedNote(local.id);

      const ownedNote = await getEncryptedNote(local.id);
      if (!ownedNote) {
        await deleteEncryptedNoteKey(local.id);
      }
    }
  }

  for (const n of notes) {
    const noteShares = sharesByNoteId.get(n.id) ?? [];
    let selectedShare: (typeof shares)[number] | null = null;
    let noteKeyBytes: Uint8Array | null = null;

    for (const share of noteShares) {
      if (share.shared_with_type === "group") {
        const groupKeyEntry = groupKeyMap.get(share.shared_with_id);
        if (!groupKeyEntry) continue;
        const groupAes = await importAesKey(groupKeyEntry.keyBytes);
        try {
          noteKeyBytes = await decryptBytes(groupAes, {
            ciphertext: share.wrapped_note_key,
            iv: share.wrapped_note_key_iv,
          });
          selectedShare = share;
          break;
        } catch {
          continue;
        }
      }

      if (share.shared_with_type === "user") {
        try {
          noteKeyBytes = await openSealed(
            b64ToU8(share.wrapped_note_key),
            myBox.publicKey,
            myBox.privateKey
          );
          selectedShare = share;
          break;
        } catch {
          continue;
        }
      }
    }

    if (!selectedShare || !noteKeyBytes) {
      skipped++;
      continue;
    }

    const payload = tryParsePayload(n.ciphertext);
    if (!payload) {
      skipped++;
      continue;
    }

    await upsertSharedEncryptedNote({
      id: n.id,
      payload,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
      sharedFromUserId: n.user_id,
      sharedGroupId:
        selectedShare.shared_with_type === "group"
          ? selectedShare.shared_with_id
          : undefined,
      permission: selectedShare.permission,
    });

    // Encrypt noteKey under vault key for local storage
    const encNoteKey = await encryptBytes(params.vaultAesKey, noteKeyBytes);

    // Avoid rewriting if identical
    const existingKey = await getEncryptedNoteKey(n.id);
    if (
      !existingKey ||
      existingKey.encryptedNoteKey.ciphertext !== encNoteKey.ciphertext ||
      existingKey.encryptedNoteKey.iv !== encNoteKey.iv
    ) {
      await upsertEncryptedNoteKey({
        noteId: n.id,
        encryptedNoteKey: encNoteKey,
        createdAt: n.created_at,
        updatedAt: n.updated_at,
      });

      keysUpserted++;
    }

    imported++;
  }

  return {
    shares: shares.length,
    notes: notes.length,
    imported,
    keysUpserted,
    skipped,
  };
}
