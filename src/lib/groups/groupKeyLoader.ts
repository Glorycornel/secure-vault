import { getSupabaseClient } from "@/lib/supabaseClient";
import { openSealed, b64ToU8 } from "@/lib/crypto/box";

export async function loadMyGroupKeys(params: {
  myBoxPublicKey: Uint8Array;
  myBoxPrivateKey: Uint8Array;
}) {
  const supabase = getSupabaseClient();
  const { data: u } = await supabase.auth.getUser();
  const me = u.user?.id;
  if (!me) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("group_keys")
    .select("group_id, sealed_group_key, key_version")
    .eq("user_id", me);

  if (error) throw error;

  const out = new Map<string, { keyBytes: Uint8Array; keyVersion: number }>();

  for (const row of data ?? []) {
    const sealed = b64ToU8(row.sealed_group_key);
    const groupKey = await openSealed(
      sealed,
      params.myBoxPublicKey,
      params.myBoxPrivateKey
    );
    const existing = out.get(row.group_id);
    if (!existing || row.key_version > existing.keyVersion) {
      out.set(row.group_id, { keyBytes: groupKey, keyVersion: row.key_version });
    }
  }

  return out; // groupId -> groupKey bytes
}
