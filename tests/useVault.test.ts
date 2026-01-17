/** @jest-environment node */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useVault, VaultProvider } from "@/hooks/useVault";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import { getDb, getMeta } from "@/lib/db/indexedDb";
import { getVaultCheckKey, getVaultSaltKey } from "@/lib/vault/metaKeys";

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
let mockVaultKeyAlt: CryptoKey | null = null;

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

describe("useVault", () => {
  beforeEach(async () => {
    await resetDb();
    jest.resetAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    const saltBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    getOrCreateVaultSaltB64.mockResolvedValue(bytesToBase64(saltBytes));
    if (!mockVaultKey) {
      mockVaultKey = await keyFromPassword("strong-password");
      mockVaultKeyAlt = await keyFromPassword("wrong-password");
    }
    deriveAesKey.mockImplementation(async (password: string) => {
      if (password === "strong-password" || password === "correct-password") {
        return mockVaultKey as CryptoKey;
      }
      return mockVaultKeyAlt as CryptoKey;
    });
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it("creates a local check blob on first unlock", async () => {
    const { result, unmount } = renderHook(() => useVault());

    await act(async () => {
      await result.current.unlock("strong-password");
    });

    expect(result.current.isUnlocked).toBe(true);

    const check = await getMeta(getVaultCheckKey("user-1"));
    expect(check).toBeTruthy();

    const parsed = JSON.parse(check as string);
    expect(parsed).toHaveProperty("iv");
    expect(parsed).toHaveProperty("ciphertext");

    const salt = await getMeta(getVaultSaltKey("user-1"));
    expect(salt).toBeTruthy();

    unmount();
  });

  it("locks and rejects incorrect passwords", async () => {
    const { result, unmount } = renderHook(() => useVault());

    await act(async () => {
      await result.current.unlock("correct-password");
    });

    act(() => {
      result.current.lock();
    });

    expect(result.current.isUnlocked).toBe(false);

    let error: unknown;
    await act(async () => {
      try {
        await result.current.unlock("wrong-password");
      } catch (err) {
        error = err;
      }
    });

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Incorrect master password");
    expect(result.current.isUnlocked).toBe(false);

    unmount();
  });
});
