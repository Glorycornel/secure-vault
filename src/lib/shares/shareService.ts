// src/lib/shares/shareService.ts
import { getSupabaseClient } from "@/lib/supabaseClient";
import { encryptBytes } from "@/lib/crypto/aesBytes";
import { importAesKey } from "@/lib/crypto/aesRaw";
import { sealTo, u8ToB64 } from "@/lib/crypto/box";

export async function shareNoteToGroup(params: {
  noteId: string;
  groupId: string;
  permission: "read" | "write";
  groupKey: Uint8Array; // decrypted locally
  noteKey: Uint8Array;  // per-note symmetric key
  keyVersion?: number;
}) {
  const supabase = getSupabaseClient();

  const groupAes = await importAesKey(params.groupKey);
  const wrapped = await encryptBytes(groupAes, params.noteKey);

  const { error } = await supabase.rpc("share_note_to_group", {
    _note_id: params.noteId,
    _group_id: params.groupId,
    _permission: params.permission,
    _wrapped_note_key: wrapped.ciphertext,
    _wrapped_note_key_iv: wrapped.iv,
    _key_version: params.keyVersion ?? 1,
  });

  if (error) throw error;
}

export async function shareNoteToUser(params: {
  noteId: string;
  userId: string;
  permission: "read" | "write";
  recipientBoxPublicKey: Uint8Array;
  noteKey: Uint8Array; // per-note symmetric key
}) {
  const supabase = getSupabaseClient();

  const sealed = await sealTo(params.recipientBoxPublicKey, params.noteKey);
  const sealedB64 = u8ToB64(sealed);

  const { error } = await supabase.from("note_shares").upsert(
    {
      note_id: params.noteId,
      shared_with_type: "user",
      shared_with_id: params.userId,
      permission: params.permission,
      wrapped_note_key: sealedB64,
      wrapped_note_key_iv: "",
      key_version: 1,
    },
    { onConflict: "note_id,shared_with_type,shared_with_id" }
  );

  if (error) throw error;
}

export async function removeNoteShare(params: {
  noteId: string;
  sharedWithType: "group" | "user";
  sharedWithId: string;
}) {
  const supabase = getSupabaseClient();

  const { error } = await supabase.rpc("remove_note_share", {
    _note_id: params.noteId,
    _shared_with_type: params.sharedWithType,
    _shared_with_id: params.sharedWithId,
  });

  if (error) throw error;
}
