import { getSupabaseClient } from "@/lib/supabaseClient";

export type RemoteShareRow = {
  note_id: string;
  shared_with_type: "group" | "user";
  shared_with_id: string; // group_id if group
  wrapped_note_key: string;
  wrapped_note_key_iv: string;
  permission: "read" | "write";
  created_at: string;
};

export async function fetchVisibleNoteShares(): Promise<RemoteShareRow[]> {
  const supabase = getSupabaseClient();

  // RLS will ensure you only see shares you’re allowed to see
  const { data, error } = await supabase
    .from("note_shares")
    .select(
      "note_id,shared_with_type,shared_with_id,wrapped_note_key,wrapped_note_key_iv,permission,created_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RemoteShareRow[];
}

export type RemoteEncryptedNoteRow = {
  id: string;
  user_id: string;
  title: string;
  ciphertext: string;
  created_at: string;
  updated_at: string;
};

export async function fetchEncryptedNotesByIds(
  ids: string[]
): Promise<RemoteEncryptedNoteRow[]> {
  if (ids.length === 0) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("encrypted_notes")
    .select("id,user_id,title,ciphertext,created_at,updated_at")
    .in("id", ids);

  if (error) throw error;
  return (data ?? []) as RemoteEncryptedNoteRow[];
}

export async function updateSharedNotePayload(params: {
  noteId: string;
  title: string;
  ciphertext: string;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("update_shared_note_payload", {
    _note_id: params.noteId,
    _title: params.title,
    _ciphertext: params.ciphertext,
  });
  if (error) throw error;
}
