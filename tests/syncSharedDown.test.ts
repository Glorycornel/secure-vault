/** @jest-environment node */
import { syncDownSharedNotes } from "@/lib/sync/syncSharedDown";
import { decryptBytes, encryptBytes } from "@/lib/crypto/aesBytes";
import { importAesKey } from "@/lib/crypto/aesRaw";
import {
  listSharedEncryptedNotes,
  getEncryptedNoteKey,
  upsertEncryptedNoteKey,
  upsertSharedEncryptedNote,
} from "@/lib/db/indexedDb";
import {
  fetchVisibleNoteShares,
  fetchEncryptedNotesByIds,
} from "@/lib/supabase/sharedNotes";
import { loadMyBoxKeypair } from "@/lib/supabase/profileKeys";
import { loadMyGroupKeys } from "@/lib/groups/groupKeyLoader";
import { openSealed } from "@/lib/crypto/box";

jest.mock("@/lib/supabase/sharedNotes", () => ({
  fetchVisibleNoteShares: jest.fn(),
  fetchEncryptedNotesByIds: jest.fn(),
}));

jest.mock("@/lib/supabase/profileKeys", () => ({
  loadMyBoxKeypair: jest.fn(),
}));

jest.mock("@/lib/groups/groupKeyLoader", () => ({
  loadMyGroupKeys: jest.fn(),
}));

jest.mock("@/lib/db/indexedDb", () => ({
  deleteEncryptedNoteKey: jest.fn(),
  deleteSharedEncryptedNote: jest.fn(),
  getEncryptedNote: jest.fn(),
  getEncryptedNoteKey: jest.fn(),
  listSharedEncryptedNotes: jest.fn(),
  upsertEncryptedNoteKey: jest.fn(),
  upsertSharedEncryptedNote: jest.fn(),
}));

jest.mock("@/lib/crypto/aesBytes", () => ({
  encryptBytes: jest.fn(),
  decryptBytes: jest.fn(),
}));

jest.mock("@/lib/crypto/box", () => ({
  b64ToU8: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
  openSealed: jest.fn().mockResolvedValue(new Uint8Array(32)),
}));

async function generateAesKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

describe("syncDownSharedNotes", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (decryptBytes as jest.Mock).mockResolvedValue(new Uint8Array(32));
    (encryptBytes as jest.Mock).mockResolvedValue({ ciphertext: "ct", iv: "iv" });
    (openSealed as jest.Mock).mockResolvedValue(new Uint8Array(32));
  });

  it("loads group keys, unwraps note keys, and persists shared notes", async () => {
    const vaultAesKey = await generateAesKey();
    const groupKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const groupAes = await importAesKey(groupKeyBytes);
    const noteKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await encryptBytes(groupAes, noteKeyBytes);

    (loadMyBoxKeypair as jest.Mock).mockResolvedValue({
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(64),
    });
    (loadMyGroupKeys as jest.Mock).mockResolvedValue(
      new Map([["group-1", { keyBytes: groupKeyBytes, keyVersion: 1 }]])
    );
    (fetchVisibleNoteShares as jest.Mock).mockResolvedValue([
      {
        note_id: "note-1",
        shared_with_type: "group",
        shared_with_id: "group-1",
        wrapped_note_key: wrapped.ciphertext,
        wrapped_note_key_iv: wrapped.iv,
        permission: "read",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (fetchEncryptedNotesByIds as jest.Mock).mockResolvedValue([
      {
        id: "note-1",
        user_id: "user-1",
        title: "Shared",
        ciphertext: JSON.stringify({ iv: "iv-1", ciphertext: "ct-1" }),
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (listSharedEncryptedNotes as jest.Mock).mockResolvedValue([]);
    (getEncryptedNoteKey as jest.Mock).mockResolvedValue(null);

    const result = await syncDownSharedNotes({ vaultAesKey });

    expect(upsertSharedEncryptedNote).toHaveBeenCalledTimes(1);
    expect(upsertEncryptedNoteKey).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      shares: 1,
      notes: 1,
      imported: 1,
      keysUpserted: 1,
      skipped: 0,
    });
  });

  it("skips when group key is missing", async () => {
    const vaultAesKey = await generateAesKey();
    (loadMyBoxKeypair as jest.Mock).mockResolvedValue({
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(64),
    });
    (loadMyGroupKeys as jest.Mock).mockResolvedValue(new Map());
    (fetchVisibleNoteShares as jest.Mock).mockResolvedValue([
      {
        note_id: "note-1",
        shared_with_type: "group",
        shared_with_id: "group-1",
        wrapped_note_key: "wrapped",
        wrapped_note_key_iv: "iv",
        permission: "read",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (fetchEncryptedNotesByIds as jest.Mock).mockResolvedValue([
      {
        id: "note-1",
        user_id: "user-1",
        title: "Shared",
        ciphertext: JSON.stringify({ iv: "iv-1", ciphertext: "ct-1" }),
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (listSharedEncryptedNotes as jest.Mock).mockResolvedValue([]);

    const result = await syncDownSharedNotes({ vaultAesKey });

    expect(result.skipped).toBe(1);
    expect(upsertSharedEncryptedNote).not.toHaveBeenCalled();
  });

  it("skips when wrapped note key is invalid", async () => {
    const vaultAesKey = await generateAesKey();
    const groupKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    (loadMyBoxKeypair as jest.Mock).mockResolvedValue({
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(64),
    });
    (loadMyGroupKeys as jest.Mock).mockResolvedValue(
      new Map([["group-1", { keyBytes: groupKeyBytes, keyVersion: 1 }]])
    );
    (fetchVisibleNoteShares as jest.Mock).mockResolvedValue([
      {
        note_id: "note-1",
        shared_with_type: "group",
        shared_with_id: "group-1",
        wrapped_note_key: "wrapped",
        wrapped_note_key_iv: "iv",
        permission: "read",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (fetchEncryptedNotesByIds as jest.Mock).mockResolvedValue([
      {
        id: "note-1",
        user_id: "user-1",
        title: "Shared",
        ciphertext: JSON.stringify({ iv: "iv-1", ciphertext: "ct-1" }),
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (listSharedEncryptedNotes as jest.Mock).mockResolvedValue([]);
    (decryptBytes as jest.Mock).mockRejectedValue(new Error("bad wrap"));

    const result = await syncDownSharedNotes({ vaultAesKey });

    expect(result.skipped).toBe(1);
    expect(upsertSharedEncryptedNote).not.toHaveBeenCalled();
  });

  it("dedupes duplicate shares per note", async () => {
    const vaultAesKey = await generateAesKey();
    const groupKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const groupAes = await importAesKey(groupKeyBytes);
    const noteKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await encryptBytes(groupAes, noteKeyBytes);

    (loadMyBoxKeypair as jest.Mock).mockResolvedValue({
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(64),
    });
    (loadMyGroupKeys as jest.Mock).mockResolvedValue(
      new Map([["group-1", { keyBytes: groupKeyBytes, keyVersion: 1 }]])
    );
    (fetchVisibleNoteShares as jest.Mock).mockResolvedValue([
      {
        note_id: "note-1",
        shared_with_type: "group",
        shared_with_id: "group-1",
        wrapped_note_key: wrapped.ciphertext,
        wrapped_note_key_iv: wrapped.iv,
        permission: "read",
        created_at: "2024-01-01T00:00:00.000Z",
      },
      {
        note_id: "note-1",
        shared_with_type: "group",
        shared_with_id: "group-1",
        wrapped_note_key: wrapped.ciphertext,
        wrapped_note_key_iv: wrapped.iv,
        permission: "read",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (fetchEncryptedNotesByIds as jest.Mock).mockResolvedValue([
      {
        id: "note-1",
        user_id: "user-1",
        title: "Shared",
        ciphertext: JSON.stringify({ iv: "iv-1", ciphertext: "ct-1" }),
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (listSharedEncryptedNotes as jest.Mock).mockResolvedValue([]);
    (getEncryptedNoteKey as jest.Mock).mockResolvedValue(null);

    const result = await syncDownSharedNotes({ vaultAesKey });

    expect(result.imported).toBe(1);
    expect(upsertSharedEncryptedNote).toHaveBeenCalledTimes(1);
  });

  it("removes revoked shares and cleans up note keys when not owned", async () => {
    const vaultAesKey = await generateAesKey();
    (loadMyBoxKeypair as jest.Mock).mockResolvedValue({
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(64),
    });
    (loadMyGroupKeys as jest.Mock).mockResolvedValue(new Map());
    (fetchVisibleNoteShares as jest.Mock).mockResolvedValue([]);
    (fetchEncryptedNotesByIds as jest.Mock).mockResolvedValue([]);
    (listSharedEncryptedNotes as jest.Mock).mockResolvedValue([
      {
        id: "note-1",
        payload: { iv: "iv-1", ciphertext: "ct-1" },
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        sharedGroupId: "group-1",
      },
    ]);
    const { deleteSharedEncryptedNote, deleteEncryptedNoteKey, getEncryptedNote } =
      jest.requireMock("@/lib/db/indexedDb");
    getEncryptedNote.mockResolvedValue(null);

    const result = await syncDownSharedNotes({ vaultAesKey });

    expect(result.imported).toBe(0);
    expect(deleteSharedEncryptedNote).toHaveBeenCalledTimes(1);
    expect(deleteEncryptedNoteKey).toHaveBeenCalledTimes(1);
  });

  it("unwraps user-shared notes with sealed box", async () => {
    const vaultAesKey = await generateAesKey();
    (loadMyBoxKeypair as jest.Mock).mockResolvedValue({
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(64),
    });
    (loadMyGroupKeys as jest.Mock).mockResolvedValue(new Map());
    (fetchVisibleNoteShares as jest.Mock).mockResolvedValue([
      {
        note_id: "note-2",
        shared_with_type: "user",
        shared_with_id: "user-2",
        wrapped_note_key: "sealed-b64",
        wrapped_note_key_iv: "",
        permission: "write",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (fetchEncryptedNotesByIds as jest.Mock).mockResolvedValue([
      {
        id: "note-2",
        user_id: "user-1",
        title: "Shared",
        ciphertext: JSON.stringify({ iv: "iv-2", ciphertext: "ct-2" }),
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (listSharedEncryptedNotes as jest.Mock).mockResolvedValue([]);
    (getEncryptedNoteKey as jest.Mock).mockResolvedValue(null);

    const result = await syncDownSharedNotes({ vaultAesKey });

    expect(openSealed).toHaveBeenCalled();
    expect(result.imported).toBe(1);
    expect(upsertSharedEncryptedNote).toHaveBeenCalledTimes(1);
  });
});
