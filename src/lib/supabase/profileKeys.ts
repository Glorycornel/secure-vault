import { getSupabaseClient } from "@/lib/supabaseClient";
import { genBoxKeypair, u8ToB64, b64ToU8 } from "@/lib/crypto/box";
import { encryptBytes, decryptBytes } from "@/lib/crypto/aesBytes";

type EncBytesPayload = {
  ciphertext: string;
  iv: string;
};

let ensureProfileKeysInFlight: Promise<{
  userId: string;
  boxPublicKeyB64: string;
  encPriv: EncBytesPayload;
}> | null = null;

function errToString(e: unknown) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export async function ensureProfileKeys(params: {
  vaultAesKey: CryptoKey; // derived from master password + vault_kdf salt
  email?: string;
  displayName?: string;
}) {
  if (ensureProfileKeysInFlight) return ensureProfileKeysInFlight;
  ensureProfileKeysInFlight = (async () => {
    const supabase = getSupabaseClient();

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const userId = authData.user?.id;
    if (!userId) throw new Error("Not authenticated");

    // Try fetch existing profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_id, box_public_key, enc_box_secret_key, enc_box_secret_key_iv")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `[ensureProfileKeys] profiles select failed: ${errToString(error)}`
      );
    }

    // If it already exists, return it
    if (
      profile?.box_public_key &&
      profile?.enc_box_secret_key &&
      profile?.enc_box_secret_key_iv
    ) {
      return {
        userId,
        boxPublicKeyB64: profile.box_public_key,
        encPriv: {
          ciphertext: profile.enc_box_secret_key,
          iv: profile.enc_box_secret_key_iv,
        } satisfies EncBytesPayload,
      };
    }

    // Create new keypair
    const { publicKey, privateKey } = await genBoxKeypair();

    // Encrypt private key under vaultAesKey
    const enc = await encryptBytes(params.vaultAesKey, privateKey);

    const upsertRow = {
      user_id: userId,
      email: params.email ?? null,
      display_name: params.displayName ?? null,
      box_public_key: u8ToB64(publicKey),
      enc_box_secret_key: enc.ciphertext,
      enc_box_secret_key_iv: enc.iv,
    };

    const { error: upErr } = await supabase
      .from("profiles")
      .upsert(upsertRow, { onConflict: "user_id" });

    if (upErr) {
      throw new Error(
        `[ensureProfileKeys] profiles upsert failed: ${errToString(upErr)}`
      );
    }

    return {
      userId,
      boxPublicKeyB64: upsertRow.box_public_key,
      encPriv: {
        ciphertext: upsertRow.enc_box_secret_key,
        iv: upsertRow.enc_box_secret_key_iv,
      } satisfies EncBytesPayload,
    };
  })().finally(() => {
    ensureProfileKeysInFlight = null;
  });
  return ensureProfileKeysInFlight;
}

/**
 * Loads your libsodium box keypair from `profiles`.
 * - Requires vaultAesKey (so call after vault unlock)
 * - If missing and autoCreateIfMissing=true, it creates it by calling ensureProfileKeys()
 */
export async function loadMyBoxKeypair(params: {
  vaultAesKey: CryptoKey;
  autoCreateIfMissing?: boolean;
  email?: string;
  displayName?: string;
}) {
  const supabase = getSupabaseClient();

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;

  const userId = authData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  // Use maybeSingle to avoid 406 "0 rows" crash
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("box_public_key, enc_box_secret_key, enc_box_secret_key_iv")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`[loadMyBoxKeypair] profiles select failed: ${errToString(error)}`);
  }

  // If missing profile, optionally create it
  if (!profile) {
    if (!params.autoCreateIfMissing) {
      throw new Error(
        "Profile keys not found. Call ensureProfileKeys({ vaultAesKey }) after unlock first."
      );
    }

    const created = await ensureProfileKeys({
      vaultAesKey: params.vaultAesKey,
      email: params.email,
      displayName: params.displayName,
    });

    const publicKey = b64ToU8(created.boxPublicKeyB64);
    const privateKey = await decryptBytes(params.vaultAesKey, created.encPriv);
    return { publicKey, privateKey };
  }

  // If profile exists but fields are missing, optionally recreate
  if (
    !profile.box_public_key ||
    !profile.enc_box_secret_key ||
    !profile.enc_box_secret_key_iv
  ) {
    if (!params.autoCreateIfMissing) {
      throw new Error("Profile row is missing key fields. Recreate profile keys.");
    }

    const created = await ensureProfileKeys({
      vaultAesKey: params.vaultAesKey,
      email: params.email,
      displayName: params.displayName,
    });

    const publicKey = b64ToU8(created.boxPublicKeyB64);
    const privateKey = await decryptBytes(params.vaultAesKey, created.encPriv);
    return { publicKey, privateKey };
  }

  const publicKey = b64ToU8(profile.box_public_key);
  const privateKey = await decryptBytes(params.vaultAesKey, {
    ciphertext: profile.enc_box_secret_key,
    iv: profile.enc_box_secret_key_iv,
  });

  return { publicKey, privateKey };
}
