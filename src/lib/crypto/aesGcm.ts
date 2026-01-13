import { base64ToBytes, bytesToBase64, utf8ToBytes, bytesToUtf8 } from "./encoding";
import type { EncryptedPayload } from "@/lib/db/indexedDb";

export async function encryptJson(
  key: CryptoKey,
  data: unknown
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for GCM
  const plaintext = utf8ToBytes(JSON.stringify(data));

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuf)),
  };
}

export async function decryptJson<T>(
  key: CryptoKey,
  payload: EncryptedPayload
): Promise<T> {
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const text = bytesToUtf8(new Uint8Array(plaintextBuf));
  return JSON.parse(text) as T;
}
