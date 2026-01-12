"use client";

import { useCallback, useMemo, useState } from "react";
import { deriveAesKey } from "@/lib/crypto/deriveKey";
import { base64ToBytes } from "@/lib/crypto/encoding";
import { decryptJson, encryptJson } from "@/lib/crypto/aesGcm";
import { getMeta, setMeta } from "@/lib/db/indexedDb";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getOrCreateVaultSaltB64 } from "@/lib/supabase/vaultKdf";

const SALT_KEY = "vault_salt_v1"; // local cache of the cloud salt (base64)
const CHECK_KEY = "vault_check_v1";
const CHECK_VALUE = { ok: true };

async function ensureLoggedIn() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Not authenticated");
  return data.user;
}

async function getOrCreateSalt(): Promise<Uint8Array> {
  // 1) Try local cache first (fast)
  const local = await getMeta(SALT_KEY);
  if (local) return base64ToBytes(local);

  // 2) Otherwise fetch/create from Supabase
  const saltB64 = await getOrCreateVaultSaltB64();

  // 3) Cache locally for future unlocks
  await setMeta(SALT_KEY, saltB64);

  return base64ToBytes(saltB64);
}

export function useVault() {
  const [key, setKey] = useState<CryptoKey | null>(null);

  const isUnlocked = !!key;

  const unlock = useCallback(async (masterPassword: string) => {
    // Must be signed in to fetch the canonical salt
    await ensureLoggedIn();

    // ✅ stable per-user salt (shared across devices)
    const salt = await getOrCreateSalt();

    // derive the same AES key on every device for this user
    const derivedKey = await deriveAesKey(masterPassword, salt);

    // Local check blob verifies the password quickly.
    // NOTE: This is per-device. That's OK.
    // The important part is: the derived key must match across devices.
    const existingCheck = await getMeta(CHECK_KEY);

    if (!existingCheck) {
      // First-time on THIS device: create verification blob
      const encrypted = await encryptJson(derivedKey, CHECK_VALUE);
      await setMeta(CHECK_KEY, JSON.stringify(encrypted));
      setKey(derivedKey);
      return;
    }

    // Verify password by decrypting check blob
    try {
      const parsed = JSON.parse(existingCheck);
      await decryptJson(derivedKey, parsed);
      setKey(derivedKey);
    } catch {
      throw new Error("Incorrect master password");
    }
  }, []);

  const lock = useCallback(() => {
    setKey(null);
  }, []);

  const value = useMemo(
    () => ({ key, isUnlocked, unlock, lock }),
    [key, isUnlocked, unlock, lock]
  );

  return value;
}
