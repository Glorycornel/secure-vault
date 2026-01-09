"use client";

import { useCallback, useMemo, useState } from "react";
import { deriveAesKey } from "@/lib/crypto/deriveKey";
import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import { decryptJson, encryptJson } from "@/lib/crypto/aesGcm";
import { getMeta, setMeta } from "@/lib/db/indexedDb";

const SALT_KEY = "vault_salt_v1";
const CHECK_KEY = "vault_check_v1";
const CHECK_VALUE = { ok: true };

async function getOrCreateSalt(): Promise<Uint8Array> {
  const existing = await getMeta(SALT_KEY);
  if (existing) return base64ToBytes(existing);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  await setMeta(SALT_KEY, bytesToBase64(salt));
  return salt;
}

export function useVault() {
  const [key, setKey] = useState<CryptoKey | null>(null);

  const isUnlocked = !!key;

  const unlock = useCallback(async (masterPassword: string) => {
    const salt = await getOrCreateSalt();
    const derivedKey = await deriveAesKey(masterPassword, salt);

    const existingCheck = await getMeta(CHECK_KEY);

    if (!existingCheck) {
      // First-time setup: create verification blob
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
