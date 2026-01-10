import { utf8ToBytes } from "./encoding";

const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export async function deriveAesKey(masterPassword: string, saltBytes: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8ToBytes(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const salt = toArrayBuffer(saltBytes);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false, // not extractable
    ["encrypt", "decrypt"]
  );
}
