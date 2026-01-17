/** @jest-environment node */
import { deriveAesKey } from "@/lib/crypto/deriveKey";
import { encryptJson, decryptJson } from "@/lib/crypto/aesGcm";
import { encryptBytes, decryptBytes } from "@/lib/crypto/aesBytes";
import { importAesKey } from "@/lib/crypto/aesRaw";

async function generateAesKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

describe("crypto helpers", () => {
  it("deriveKey produces consistent keys for same password+salt", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key1 = await deriveAesKey("correct horse battery staple", salt);
    const key2 = await deriveAesKey("correct horse battery staple", salt);

    const payload = await encryptJson(key1, { ok: true });
    const decrypted = await decryptJson<{ ok: boolean }>(key2, payload);

    expect(decrypted).toEqual({ ok: true });
  });

  it("deriveKey produces different keys for different salts", async () => {
    const saltA = crypto.getRandomValues(new Uint8Array(16));
    const saltB = crypto.getRandomValues(new Uint8Array(16));
    const key1 = await deriveAesKey("same-password", saltA);
    const key2 = await deriveAesKey("same-password", saltB);

    const payload = await encryptJson(key1, { value: 123 });
    await expect(decryptJson(key2, payload)).rejects.toThrow();
  });

  it("aesGcm encrypt/decrypt round-trip", async () => {
    const key = await generateAesKey();
    const payload = await encryptJson(key, { id: "note-1", body: "secret" });
    const decrypted = await decryptJson<{ id: string; body: string }>(key, payload);

    expect(decrypted).toEqual({ id: "note-1", body: "secret" });
  });

  it("aesRaw + aesBytes round-trip bytes", async () => {
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const key = await importAesKey(rawKey);
    const bytes = crypto.getRandomValues(new Uint8Array(64));

    const encrypted = await encryptBytes(key, bytes);
    const decrypted = await decryptBytes(key, encrypted);

    expect(Array.from(decrypted)).toEqual(Array.from(bytes));
  });
});
