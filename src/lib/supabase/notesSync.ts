import { getSupabaseClient } from "@/lib/supabaseClient";
import { devError, devLog, devWarn } from "@/lib/logger";
import type { EncryptedPayload } from "@/lib/db/indexedDb";

export type RemoteEncryptedNoteRow = {
  id: string;
  user_id: string;
  title: string;

  // This is still your encrypted note payload (JSON string of {iv,ciphertext})
  ciphertext: string;

  // NEW: encrypted per-note key (noteKey) stored in Supabase so other devices can decrypt
  // This is EncryptedPayload encrypted under the vault key (AES-GCM)
  note_key_ciphertext?: string | null;
  note_key_iv?: string | null;

  created_at: string;
  updated_at: string;
};

type MaybeSupabaseErrorShape = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

function errorToDebugObject(err: unknown) {
  if (err && typeof err === "object") {
    const e = err as MaybeSupabaseErrorShape;
    return {
      message: typeof e.message === "string" ? e.message : undefined,
      details: typeof e.details === "string" ? e.details : undefined,
      hint: typeof e.hint === "string" ? e.hint : undefined,
      code: typeof e.code === "string" ? e.code : undefined,
      raw: err,
    };
  }

  return { raw: err };
}

export async function fetchRemoteEncryptedNotes(): Promise<RemoteEncryptedNoteRow[]> {
  const supabase = getSupabaseClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const userId = userData.user?.id;
  if (!userId) {
    devWarn("[fetchRemoteEncryptedNotes] No authenticated user");
    return [];
  }

  devLog("[fetchRemoteEncryptedNotes] userId:", userId);

  const { data, error } = await supabase
    .from("encrypted_notes")
    .select(
      "id,user_id,title,ciphertext,note_key_ciphertext,note_key_iv,created_at,updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    devError("[fetchRemoteEncryptedNotes] error:", errorToDebugObject(error));
    throw error;
  }

  devLog("[fetchRemoteEncryptedNotes] rows:", data?.length ?? 0);

  // Supabase returns `any`-ish data; we assert to our row type after selecting exact columns.
  return (data ?? []) as RemoteEncryptedNoteRow[];
}

export async function fetchRemoteEncryptedNote(
  id: string
): Promise<RemoteEncryptedNoteRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("encrypted_notes")
    .select(
      "id,user_id,title,ciphertext,note_key_ciphertext,note_key_iv,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return data as RemoteEncryptedNoteRow;
}

export async function upsertRemoteEncryptedNote(input: {
  id: string;
  title: string;
  payload: EncryptedPayload;

  // NEW (optional): per-note key encrypted under vault key
  encryptedNoteKey?: EncryptedPayload;
}) {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("encrypted_notes").upsert(
    {
      id: input.id,
      title: input.title,
      ciphertext: JSON.stringify(input.payload),

      // NEW columns (must exist in Supabase table)
      note_key_ciphertext: input.encryptedNoteKey?.ciphertext ?? null,
      note_key_iv: input.encryptedNoteKey?.iv ?? null,
    },
    { onConflict: "id" }
  );

  if (error) throw error;
}

export async function deleteRemoteEncryptedNote(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("encrypted_notes").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchRemoteEncryptedNoteKey(
  id: string
): Promise<EncryptedPayload | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("encrypted_notes")
    .select("note_key_ciphertext,note_key_iv")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  if (data?.note_key_ciphertext && data?.note_key_iv) {
    return { ciphertext: data.note_key_ciphertext, iv: data.note_key_iv };
  }

  return null;
}
