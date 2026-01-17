/** @jest-environment node */
import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { decryptAnyNotePayload, encryptNoteWithPerNoteKey } from "@/lib/notes/noteCrypto";
import { encryptJson } from "@/lib/crypto/aesGcm";
import { encryptBytes } from "@/lib/crypto/aesBytes";
import {
  getEncryptedNoteKey,
  upsertEncryptedNoteKey,
  type EncryptedPayload,
} from "@/lib/db/indexedDb";

jest.mock("@/lib/db/indexedDb", () => ({
  getEncryptedNoteKey: jest.fn(),
  upsertEncryptedNoteKey: jest.fn(),
}));

function ensureWebCrypto() {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto });
  }
  if (!globalThis.TextEncoder) {
    Object.defineProperty(globalThis, "TextEncoder", { value: TextEncoder });
    Object.defineProperty(globalThis, "TextDecoder", { value: TextDecoder });
  }
}

async function createVaultKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

describe("noteCrypto", () => {
  beforeAll(() => {
    ensureWebCrypto();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("encrypts with a per-note key and decrypts using stored note key", async () => {
    const vaultAesKey = await createVaultKey();
    const plain = { title: "Alpha", body: "Secret" };

    (getEncryptedNoteKey as jest.Mock).mockResolvedValue(null);

    const { payload, encryptedNoteKey } = await encryptNoteWithPerNoteKey({
      noteId: "note-1",
      plain,
      vaultAesKey,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    expect(upsertEncryptedNoteKey).toHaveBeenCalledTimes(1);

    (getEncryptedNoteKey as jest.Mock).mockResolvedValue({ encryptedNoteKey });
    const decrypted = await decryptAnyNotePayload({
      noteId: "note-1",
      payload,
      vaultAesKey,
    });

    expect(decrypted).toEqual(plain);
  });

  it("falls back to vault-key decrypt when no per-note key exists", async () => {
    const vaultAesKey = await createVaultKey();
    const plain = { title: "Legacy", body: "Payload" };

    const legacyPayload = (await encryptJson(vaultAesKey, plain)) as EncryptedPayload;

    (getEncryptedNoteKey as jest.Mock).mockResolvedValue(null);

    const decrypted = await decryptAnyNotePayload({
      noteId: "legacy-note",
      payload: legacyPayload,
      vaultAesKey,
    });

    expect(decrypted).toEqual(plain);
  });

  it("reuses an existing per-note key when present", async () => {
    const vaultAesKey = await createVaultKey();
    const noteKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const encryptedNoteKey = await encryptBytes(vaultAesKey, noteKeyBytes);

    (getEncryptedNoteKey as jest.Mock).mockResolvedValue({ encryptedNoteKey });

    const result = await encryptNoteWithPerNoteKey({
      noteId: "note-2",
      plain: { title: "Reuse", body: "Key" },
      vaultAesKey,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    expect(result.encryptedNoteKey).toEqual(encryptedNoteKey);
    expect(upsertEncryptedNoteKey).not.toHaveBeenCalled();
  });
});
