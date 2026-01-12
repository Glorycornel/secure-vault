import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * Returns a stable per-user KDF salt (base64).
 * - If it exists in Supabase, use it
 * - If not, generate + store it once
 *
 * Salt is NOT secret. It just ensures the same master password derives the same key across devices.
 */
export async function getOrCreateVaultSaltB64(): Promise<string> {
  const supabase = getSupabaseClient();

  // Fetch existing row (RLS ensures it's for the current user)
  const { data: existing, error: selErr } = await supabase
    .from("vault_kdf")
    .select("salt")
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing?.salt) return existing.salt;

  // Create if missing
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = btoa(String.fromCharCode(...bytes));

  const { error: insErr } = await supabase.from("vault_kdf").insert({ salt: saltB64 });
  if (insErr) throw insErr;

  return saltB64;
}
