import { fetchRemoteEncryptedNotes } from "@/lib/supabase/notesSync";
import {
  getEncryptedNote,
  upsertEncryptedNote,
  type EncryptedPayload,
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

function toTime(value: string | undefined | null): number {
  if (!value) return NaN;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : NaN;
}

export async function syncDownFromCloud() {
  const rows = await fetchRemoteEncryptedNotes();

  let imported = 0;
  let skippedBad = 0;
  let skippedOlder = 0;

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
      imported++;
      continue;
    }

    // Compare timestamps as numbers (not strings)
    const localT = toTime(local.updatedAt);
    const remoteT = toTime(r.updated_at);

    // If either timestamp is invalid, prefer remote (safer for sync correctness)
    const shouldImport =
      !Number.isFinite(localT) ||
      !Number.isFinite(remoteT) ||
      remoteT > localT;

    if (!shouldImport) {
      skippedOlder++;
      continue;
    }

    await upsertEncryptedNote({
      id: r.id,
      payload,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
    imported++;
  }

  console.log(
    `[syncDown] rows=${rows.length} imported=${imported} skippedOlder=${skippedOlder} skippedBad=${skippedBad}`
  );

  return { rows: rows.length, imported, skippedOlder, skippedBad };
}
