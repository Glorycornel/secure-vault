import { getSupabaseClient } from "@/lib/supabaseClient";

export async function lookupProfileByEmail(email: string): Promise<{
  userId: string;
  boxPublicKeyB64: string | null;
} | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("lookup_profile_by_email", {
    _email: email,
  });
  if (error) throw error;
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    userId: row.user_id,
    boxPublicKeyB64: row.box_public_key ?? null,
  };
}
