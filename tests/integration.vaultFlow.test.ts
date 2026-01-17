/** @jest-environment node */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useVault, VaultProvider } from "@/hooks/useVault";
import { encryptNoteWithPerNoteKey, decryptAnyNotePayload } from "@/lib/notes/noteCrypto";
import { getDb, getEncryptedNote, upsertEncryptedNote } from "@/lib/db/indexedDb";
import { bytesToBase64 } from "@/lib/crypto/encoding";

jest.mock("@/lib/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
  }),
}));

jest.mock("@/lib/supabase/vaultKdf", () => ({
  getOrCreateVaultSaltB64: jest.fn(),
}));

const { getOrCreateVaultSaltB64 } = jest.requireMock("@/lib/supabase/vaultKdf");

jest.mock("@/lib/crypto/deriveKey", () => ({
  deriveAesKey: jest.fn(),
}));

const { deriveAesKey } = jest.requireMock("@/lib/crypto/deriveKey");

let mockVaultKey: CryptoKey | null = null;

async function keyFromPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function renderHook<T>(hook: () => T) {
  let current: T;
  function Test() {
    current = hook();
    return null;
  }
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(VaultProvider, null, React.createElement(Test))
    );
  });
  return {
    result: {
      get current() {
        return current;
      },
    },
    unmount: () => renderer!.unmount(),
  };
}

function resetDb() {
  return (async () => {
    const db = await getDb();
    const storeNames = Array.from(db.objectStoreNames);
    if (storeNames.length === 0) {
      db.close();
      return;
    }
    const tx = db.transaction(storeNames, "readwrite");
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    await tx.done;
    db.close();
  })();
}

describe("vault flow integration", () => {
  beforeEach(async () => {
    await resetDb();
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    getOrCreateVaultSaltB64.mockResolvedValue(
      bytesToBase64(new Uint8Array([9, 8, 7, 6]))
    );
    if (!mockVaultKey) {
      mockVaultKey = await keyFromPassword("integration-pass");
    }
    deriveAesKey.mockImplementation(async () => mockVaultKey as CryptoKey);
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it("unlocks, encrypts, persists, and decrypts a note", async () => {
    const { result, unmount } = renderHook(() => useVault());

    await act(async () => {
      await result.current.unlock("integration-pass");
    });

    const vaultAesKey = result.current.key;
    expect(vaultAesKey).toBeTruthy();

    const now = new Date().toISOString();
    const { payload } = await encryptNoteWithPerNoteKey({
      noteId: "note-int-1",
      plain: { title: "Test", body: "Secret" },
      vaultAesKey: vaultAesKey as CryptoKey,
      createdAt: now,
      updatedAt: now,
    });

    await upsertEncryptedNote({
      id: "note-int-1",
      payload,
      createdAt: now,
      updatedAt: now,
    });

    const stored = await getEncryptedNote("note-int-1");
    expect(stored).toBeTruthy();

    const decrypted = await decryptAnyNotePayload({
      noteId: "note-int-1",
      payload: stored!.payload,
      vaultAesKey: vaultAesKey as CryptoKey,
    });

    expect(decrypted).toEqual({ title: "Test", body: "Secret" });

    unmount();
  });
});
