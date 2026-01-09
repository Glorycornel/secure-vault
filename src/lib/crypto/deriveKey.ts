import { utf8ToBytes } from "./encoding";

const PBKDF2_ITERATIONS = 210_000; // modern-ish baseline for web
const KEY_LENGTH_BITS = 256;

export async function deriveAesKey(masterPassword: string, saltBytes: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8ToBytes(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false, // not extractable
    ["encrypt", "decrypt"]
  );
}
