// src/lib/notes/noteCrypto.ts
import { encryptJson, decryptJson } from "@/lib/crypto/aesGcm";
import { encryptBytes, decryptBytes } from "@/lib/crypto/aesBytes";
import { importAesKey } from "@/lib/crypto/aesRaw";
import {
  getEncryptedNoteKey,
  deleteEncryptedNoteKey,
  upsertEncryptedNoteKey,
  type EncryptedPayload,
} from "@/lib/db/indexedDb";

export type PlainNote = { title: string; body: string };

function random32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Encrypt note content using a per-note key.
 * - payload is encrypted with noteKey (NOT the vault key)
 * - noteKey is stored locally in note_keys, encrypted under vault key
 * - also returns encryptedNoteKey so you can store it in Supabase columns
 *   note_key_ciphertext / note_key_iv (for other devices)
 */
export async function encryptNoteWithPerNoteKey(params: {
  noteId: string;
  plain: PlainNote;
  vaultAesKey: CryptoKey;
  createdAt: string;
  updatedAt: string;
}): Promise<{
  payload: EncryptedPayload;
  noteKeyBytes: Uint8Array;
  encryptedNoteKey: EncryptedPayload;
}> {
  const existing = await getEncryptedNoteKey(params.noteId);

  let noteKeyBytes: Uint8Array;
  let encryptedNoteKey: EncryptedPayload;

  if (existing) {
    noteKeyBytes = await decryptBytes(params.vaultAesKey, existing.encryptedNoteKey);
    encryptedNoteKey = existing.encryptedNoteKey;
  } else {
    noteKeyBytes = random32();
    encryptedNoteKey = await encryptBytes(params.vaultAesKey, noteKeyBytes);

    await upsertEncryptedNoteKey({
      noteId: params.noteId,
      encryptedNoteKey,
      createdAt: params.createdAt,
      updatedAt: params.updatedAt,
    });
  }

  const noteAes = await importAesKey(noteKeyBytes);
  const payload = await encryptJson(noteAes, params.plain);

  return { payload, noteKeyBytes, encryptedNoteKey };
}

/**
 * Decrypt a note payload.
 * - If note_keys has noteId -> decrypt noteKey using vault key -> decrypt payload using noteKey
 * - If noteKey is missing -> legacy fallback decrypt with vault key (keeps old notes working)
 */
export async function decryptAnyNotePayload(params: {
  noteId: string;
  payload: EncryptedPayload;
  vaultAesKey: CryptoKey;
}): Promise<PlainNote> {
  const rec = await getEncryptedNoteKey(params.noteId);

  if (rec) {
    try {
      const noteKeyBytes = await decryptBytes(params.vaultAesKey, rec.encryptedNoteKey);
      const noteAes = await importAesKey(noteKeyBytes);
      try {
        return await decryptJson<PlainNote>(noteAes, params.payload);
      } catch (payloadErr) {
        // If payload was actually encrypted with vault key, recover and drop stale note key.
        try {
          const legacy = await decryptJson<PlainNote>(params.vaultAesKey, params.payload);
          try {
            await deleteEncryptedNoteKey(params.noteId);
          } catch {
            // Best effort cleanup; proceed with decrypted data.
          }
          return legacy;
        } catch {
          throw payloadErr;
        }
      }
    } catch (noteKeyErr) {
      try {
        const legacy = await decryptJson<PlainNote>(params.vaultAesKey, params.payload);
        try {
          await deleteEncryptedNoteKey(params.noteId);
        } catch {
          // Best effort cleanup; proceed with decrypted data.
        }
        return legacy;
      } catch {
        throw noteKeyErr;
      }
    }
  }

  // Legacy notes (encrypted directly with vault key)
  return decryptJson<PlainNote>(params.vaultAesKey, params.payload);
}

export async function loadNoteKeyBytes(params: {
  noteId: string;
  vaultAesKey: CryptoKey;
}): Promise<Uint8Array | null> {
  const rec = await getEncryptedNoteKey(params.noteId);
  if (!rec) return null;
  return decryptBytes(params.vaultAesKey, rec.encryptedNoteKey);
}
