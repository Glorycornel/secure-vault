import { base64ToBytes, bytesToBase64 } from "./encoding";

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  // WebCrypto wants a real ArrayBuffer (not ArrayBufferLike / SharedArrayBuffer)
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export async function encryptBytes(key: CryptoKey, bytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    toArrayBuffer(bytes)
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function decryptBytes(
  key: CryptoKey,
  payload: { iv: string; ciphertext: string }
) {
  const iv = base64ToBytes(payload.iv);
  const ct = base64ToBytes(payload.ciphertext);

  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    toArrayBuffer(ct)
  );

  return new Uint8Array(pt);
}
