import { fetchRemoteEncryptedNotes } from "@/lib/supabase/notesSync";
import {
  getEncryptedNote,
  upsertEncryptedNote,
  upsertEncryptedNoteKey,
  getEncryptedNoteKey,
  type EncryptedPayload,
} from "@/lib/db/indexedDb";
import { devLog } from "@/lib/logger";

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

function toTime(value: string | undefined | null): number {
  if (!value) return NaN;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : NaN;
}

function hasRemoteNoteKey(row: {
  note_key_ciphertext?: string | null;
  note_key_iv?: string | null;
}): row is { note_key_ciphertext: string; note_key_iv: string } {
  return (
    typeof row.note_key_ciphertext === "string" &&
    row.note_key_ciphertext.length > 0 &&
    typeof row.note_key_iv === "string" &&
    row.note_key_iv.length > 0
  );
}

async function upsertLocalNoteKeyIfPresent(row: {
  id: string;
  created_at: string;
  updated_at: string;
  note_key_ciphertext?: string | null;
  note_key_iv?: string | null;
}) {
  if (!hasRemoteNoteKey(row)) return;

  // Avoid rewriting if we already have it (optional optimization)
  const existing = await getEncryptedNoteKey(row.id);
  if (
    existing &&
    existing.encryptedNoteKey.ciphertext === row.note_key_ciphertext &&
    existing.encryptedNoteKey.iv === row.note_key_iv
  ) {
    return;
  }

  await upsertEncryptedNoteKey({
    noteId: row.id,
    encryptedNoteKey: {
      ciphertext: row.note_key_ciphertext,
      iv: row.note_key_iv,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function syncDownFromCloud() {
  const rows = await fetchRemoteEncryptedNotes();

  let imported = 0;
  let skippedBad = 0;
  let skippedOlder = 0;
  let keysUpserted = 0;

  for (const r of rows) {
    const payload = tryParsePayload(r.ciphertext);
    if (!payload) {
      skippedBad++;
      continue;
    }

    const local = await getEncryptedNote(r.id);

    // If we don't have it locally, import it.
    if (!local) {
      await upsertEncryptedNote({
        id: r.id,
        payload,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });

      // NEW: store per-note key locally if present
      await upsertLocalNoteKeyIfPresent(r);
      if (hasRemoteNoteKey(r)) keysUpserted++;

      imported++;
      continue;
    }

    // Compare timestamps as numbers (not strings)
    const localT = toTime(local.updatedAt);
    const remoteT = toTime(r.updated_at);

    // If either timestamp is invalid, prefer remote
    const shouldImport =
      !Number.isFinite(localT) || !Number.isFinite(remoteT) || remoteT > localT;

    if (!shouldImport) {
      // Even if note payload is older, we can still ensure note key exists locally.
      // This helps when a device had the note but not the key stored yet.
      await upsertLocalNoteKeyIfPresent(r);
      if (hasRemoteNoteKey(r)) keysUpserted++;

      skippedOlder++;
      continue;
    }

    await upsertEncryptedNote({
      id: r.id,
      payload,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });

    // NEW: update local key if present
    await upsertLocalNoteKeyIfPresent(r);
    if (hasRemoteNoteKey(r)) keysUpserted++;

    imported++;
  }

  devLog(
    `[syncDown] rows=${rows.length} imported=${imported} keysUpserted=${keysUpserted} skippedOlder=${skippedOlder} skippedBad=${skippedBad}`
  );

  return { rows: rows.length, imported, keysUpserted, skippedOlder, skippedBad };
}
