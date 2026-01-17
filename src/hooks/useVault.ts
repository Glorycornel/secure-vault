"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { deriveAesKey } from "@/lib/crypto/deriveKey";
import { base64ToBytes } from "@/lib/crypto/encoding";
import { decryptJson, encryptJson } from "@/lib/crypto/aesGcm";
import { decryptBytes } from "@/lib/crypto/aesBytes";
import { importAesKey } from "@/lib/crypto/aesRaw";
import { getMeta, setMeta } from "@/lib/db/indexedDb";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getOrCreateVaultSaltB64, setVaultSaltB64 } from "@/lib/supabase/vaultKdf";
import {
  LEGACY_VAULT_CHECK_KEY,
  LEGACY_VAULT_SALT_KEY,
  getVaultCheckKey,
  getVaultSaltKey,
} from "@/lib/vault/metaKeys";

const CHECK_VALUE = { ok: true };

async function ensureLoggedIn() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Not authenticated");
  return data.user;
}

async function getOrCreateSalt(userId: string): Promise<Uint8Array> {
  // 1) Try per-user local cache first (fast)
  const local = await getMeta(getVaultSaltKey(userId));
  if (local) return base64ToBytes(local);

  const legacyLocal = await getMeta(LEGACY_VAULT_SALT_KEY);

  // 2) Otherwise fetch/create from Supabase
  const saltB64 = await getOrCreateVaultSaltB64({
    preferredSaltB64: legacyLocal ?? undefined,
  });

  // 3) Cache locally for future unlocks
  await setMeta(getVaultSaltKey(userId), saltB64);

  return base64ToBytes(saltB64);
}

type RemoteNoteRow = {
  ciphertext: string;
  note_key_ciphertext?: string | null;
  note_key_iv?: string | null;
};

type EncryptedPayload = { iv: string; ciphertext: string };

function tryParsePayload(raw: string): EncryptedPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.iv === "string" &&
      typeof parsed.ciphertext === "string"
    ) {
      return { iv: parsed.iv, ciphertext: parsed.ciphertext };
    }
    return null;
  } catch {
    return null;
  }
}

async function canDecryptAnyRemoteNote(derivedKey: CryptoKey): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("encrypted_notes")
    .select("ciphertext,note_key_ciphertext,note_key_iv,updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  if (!data || data.length === 0) return true;

  for (const row of data as RemoteNoteRow[]) {
    const payload = tryParsePayload(row.ciphertext);
    if (!payload) continue;

    try {
      if (row.note_key_ciphertext && row.note_key_iv) {
        const noteKeyBytes = await decryptBytes(derivedKey, {
          ciphertext: row.note_key_ciphertext,
          iv: row.note_key_iv,
        });
        const noteAes = await importAesKey(noteKeyBytes);
        await decryptJson(noteAes, payload);
        return true;
      }

      await decryptJson(derivedKey, payload);
      return true;
    } catch {
      // Try next note.
    }
  }

  return false;
}

type VaultContextValue = {
  key: CryptoKey | null;
  isUnlocked: boolean;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);

  const isUnlocked = !!key;

  const unlock = useCallback(async (masterPassword: string) => {
    // Must be signed in to fetch the canonical salt
    const user = await ensureLoggedIn();

    const legacySaltB64 = await getMeta(LEGACY_VAULT_SALT_KEY);

    // ✅ stable per-user salt (shared across devices)
    const salt = await getOrCreateSalt(user.id);

    // derive the same AES key on every device for this user
    const derivedKey = await deriveAesKey(masterPassword, salt);

    const checkKey = getVaultCheckKey(user.id);
    const existingCheck = await getMeta(checkKey);
    const legacyCheck = await getMeta(LEGACY_VAULT_CHECK_KEY);

    if (existingCheck || legacyCheck) {
      const check = existingCheck ?? legacyCheck;
      if (!check) {
        throw new Error("Missing vault check blob");
      }
      try {
        const parsed = JSON.parse(check);
        await decryptJson(derivedKey, parsed);
        try {
          const remoteValid = await canDecryptAnyRemoteNote(derivedKey);
          if (!remoteValid) {
            if (legacySaltB64) {
              const legacyKey = await deriveAesKey(
                masterPassword,
                base64ToBytes(legacySaltB64)
              );
              const legacyValid = await canDecryptAnyRemoteNote(legacyKey);
              if (legacyValid) {
                await setVaultSaltB64(legacySaltB64);
                await setMeta(getVaultSaltKey(user.id), legacySaltB64);
                setKey(legacyKey);
                return;
              }
            }
            throw new Error("Incorrect master password");
          }
        } catch {
          // If we cannot reach the server, fall back to local check.
        }
        if (!existingCheck && legacyCheck) {
          await setMeta(checkKey, legacyCheck);
        }
        setKey(derivedKey);
        return;
      } catch {
        if (legacySaltB64) {
          try {
            const legacyKey = await deriveAesKey(
              masterPassword,
              base64ToBytes(legacySaltB64)
            );
            const parsed = JSON.parse(check);
            await decryptJson(legacyKey, parsed);
            await setVaultSaltB64(legacySaltB64);
            await setMeta(getVaultSaltKey(user.id), legacySaltB64);
            if (!existingCheck && legacyCheck) {
              await setMeta(checkKey, legacyCheck);
            }
            setKey(legacyKey);
            return;
          } catch {
            // fall through
          }
        }
        throw new Error("Incorrect master password");
      }
    }

    try {
      const remoteValid = await canDecryptAnyRemoteNote(derivedKey);
      if (!remoteValid) {
        if (legacySaltB64) {
          const legacyKey = await deriveAesKey(
            masterPassword,
            base64ToBytes(legacySaltB64)
          );
          const legacyValid = await canDecryptAnyRemoteNote(legacyKey);
          if (legacyValid) {
            await setVaultSaltB64(legacySaltB64);
            await setMeta(getVaultSaltKey(user.id), legacySaltB64);
            setKey(legacyKey);
            return;
          }
        }
        throw new Error("Incorrect master password");
      }
    } catch {
      // If we cannot reach the server, fall back to local setup.
    }

    // First-time on THIS device: create verification blob
    const encrypted = await encryptJson(derivedKey, CHECK_VALUE);
    await setMeta(checkKey, JSON.stringify(encrypted));
    setKey(derivedKey);
  }, []);

  const lock = useCallback(() => {
    setKey(null);
  }, []);

  const value = useMemo(
    () => ({ key, isUnlocked, unlock, lock }),
    [key, isUnlocked, unlock, lock]
  );

  return React.createElement(VaultContext.Provider, { value }, children);
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error("useVault must be used within VaultProvider");
  }
  return ctx;
}
