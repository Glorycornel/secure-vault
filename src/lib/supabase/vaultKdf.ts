import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * Returns a stable per-user KDF salt (base64).
 * - If it exists in Supabase, use it
 * - If not, generate + store it once
 *
 * Salt is NOT secret. It just ensures the same master password derives the same key across devices.
 */
export async function getOrCreateVaultSaltB64(params?: {
  preferredSaltB64?: string | null;
}): Promise<string> {
  const supabase = getSupabaseClient();

  // Fetch existing row (RLS ensures it's for the current user)
  const { data: existing, error: selErr } = await supabase
    .from("vault_kdf")
    .select("salt")
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing?.salt) return existing.salt;

  // Create if missing (prefer legacy local salt if provided)
  const preferredSalt = params?.preferredSaltB64;
  const saltB64 =
    preferredSalt ??
    btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

  const { error: insErr } = await supabase.from("vault_kdf").insert({ salt: saltB64 });
  if (insErr) throw insErr;

  return saltB64;
}

export async function fetchVaultSaltB64(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("vault_kdf").select("salt").maybeSingle();
  if (error) throw error;
  return data?.salt ?? null;
}

export async function setVaultSaltB64(saltB64: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const userId = authData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("vault_kdf")
    .upsert({ user_id: userId, salt: saltB64 }, { onConflict: "user_id" });

  if (error) throw error;
}
