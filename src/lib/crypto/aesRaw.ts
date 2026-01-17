function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  }
  
  export async function importAesKey(raw32: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      "raw",
      toArrayBuffer(raw32),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }
  