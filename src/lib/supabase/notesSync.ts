import { getSupabaseClient } from "@/lib/supabaseClient";
import type { EncryptedPayload } from "@/lib/db/indexedDb";

export type RemoteEncryptedNoteRow = {
  id: string;
  user_id: string;
  title: string;
  ciphertext: string;
  created_at: string;
  updated_at: string;
};

export async function fetchRemoteEncryptedNotes(): Promise<RemoteEncryptedNoteRow[]> {
  const supabase = getSupabaseClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const userId = userData.user?.id;
  if (!userId) {
    console.warn("[fetchRemoteEncryptedNotes] No authenticated user");
    return [];
  }

  console.log("[fetchRemoteEncryptedNotes] userId:", userId);

  const { data, error } = await supabase
    .from("encrypted_notes")
    .select("id,user_id,title,ciphertext,created_at,updated_at")
    .eq("user_id", userId) // <-- explicit filter
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[fetchRemoteEncryptedNotes] error:", error);
    throw error;
  }

  console.log("[fetchRemoteEncryptedNotes] rows:", data?.length ?? 0);
  return (data ?? []) as RemoteEncryptedNoteRow[];
}

export async function upsertRemoteEncryptedNote(input: {
  id: string;
  title: string;
  payload: EncryptedPayload;
}) {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("encrypted_notes").upsert(
    {
      id: input.id,
      title: input.title,
      ciphertext: JSON.stringify(input.payload),
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
