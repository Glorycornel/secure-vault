import { syncDownFromCloud } from "@/lib/sync/syncDown";
import { fetchRemoteEncryptedNotes } from "@/lib/supabase/notesSync";
import {
  getEncryptedNote,
  getEncryptedNoteKey,
  upsertEncryptedNote,
  upsertEncryptedNoteKey,
} from "@/lib/db/indexedDb";

jest.mock("@/lib/supabase/notesSync", () => ({
  fetchRemoteEncryptedNotes: jest.fn(),
}));

jest.mock("@/lib/db/indexedDb", () => ({
  getEncryptedNote: jest.fn(),
  getEncryptedNoteKey: jest.fn(),
  upsertEncryptedNote: jest.fn(),
  upsertEncryptedNoteKey: jest.fn(),
}));

describe("syncDownFromCloud", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  it("imports new notes and upserts note keys", async () => {
    (fetchRemoteEncryptedNotes as jest.Mock).mockResolvedValue([
      {
        id: "note-1",
        user_id: "user-1",
        title: "Title",
        ciphertext: JSON.stringify({ iv: "iv-1", ciphertext: "ct-1" }),
        note_key_ciphertext: "nk-1",
        note_key_iv: "nk-iv-1",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (getEncryptedNote as jest.Mock).mockResolvedValue(null);
    (getEncryptedNoteKey as jest.Mock).mockResolvedValue(null);

    const result = await syncDownFromCloud();

    expect(upsertEncryptedNote).toHaveBeenCalledTimes(1);
    expect(upsertEncryptedNoteKey).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      rows: 1,
      imported: 1,
      keysUpserted: 1,
      skippedOlder: 0,
      skippedBad: 0,
    });
  });

  it("skips older payloads but still updates missing note keys", async () => {
    (fetchRemoteEncryptedNotes as jest.Mock).mockResolvedValue([
      {
        id: "note-2",
        user_id: "user-1",
        title: "Title",
        ciphertext: JSON.stringify({ iv: "iv-2", ciphertext: "ct-2" }),
        note_key_ciphertext: "nk-2",
        note_key_iv: "nk-iv-2",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (getEncryptedNote as jest.Mock).mockResolvedValue({
      id: "note-2",
      payload: { iv: "iv-local", ciphertext: "ct-local" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    });
    (getEncryptedNoteKey as jest.Mock).mockResolvedValue(null);

    const result = await syncDownFromCloud();

    expect(upsertEncryptedNote).not.toHaveBeenCalled();
    expect(upsertEncryptedNoteKey).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      rows: 1,
      imported: 0,
      keysUpserted: 1,
      skippedOlder: 1,
      skippedBad: 0,
    });
  });

  it("imports when remote is newer", async () => {
    (fetchRemoteEncryptedNotes as jest.Mock).mockResolvedValue([
      {
        id: "note-3",
        user_id: "user-1",
        title: "Title",
        ciphertext: JSON.stringify({ iv: "iv-3", ciphertext: "ct-3" }),
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-02-01T00:00:00.000Z",
      },
    ]);
    (getEncryptedNote as jest.Mock).mockResolvedValue({
      id: "note-3",
      payload: { iv: "iv-old", ciphertext: "ct-old" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-15T00:00:00.000Z",
    });

    const result = await syncDownFromCloud();

    expect(upsertEncryptedNote).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it("imports when timestamps are invalid", async () => {
    (fetchRemoteEncryptedNotes as jest.Mock).mockResolvedValue([
      {
        id: "note-4",
        user_id: "user-1",
        title: "Title",
        ciphertext: JSON.stringify({ iv: "iv-4", ciphertext: "ct-4" }),
        created_at: "invalid",
        updated_at: "invalid",
      },
    ]);
    (getEncryptedNote as jest.Mock).mockResolvedValue({
      id: "note-4",
      payload: { iv: "iv-local", ciphertext: "ct-local" },
      createdAt: "invalid",
      updatedAt: "invalid",
    });

    const result = await syncDownFromCloud();

    expect(upsertEncryptedNote).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it("does not rewrite note key when identical", async () => {
    (fetchRemoteEncryptedNotes as jest.Mock).mockResolvedValue([
      {
        id: "note-5",
        user_id: "user-1",
        title: "Title",
        ciphertext: JSON.stringify({ iv: "iv-5", ciphertext: "ct-5" }),
        note_key_ciphertext: "nk-5",
        note_key_iv: "nk-iv-5",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ]);
    (getEncryptedNote as jest.Mock).mockResolvedValue({
      id: "note-5",
      payload: { iv: "iv-local", ciphertext: "ct-local" },
      createdAt: "2024-01-02T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
    });
    (getEncryptedNoteKey as jest.Mock).mockResolvedValue({
      encryptedNoteKey: { ciphertext: "nk-5", iv: "nk-iv-5" },
    });

    const result = await syncDownFromCloud();

    expect(upsertEncryptedNote).not.toHaveBeenCalled();
    expect(upsertEncryptedNoteKey).not.toHaveBeenCalled();
    expect(result.skippedOlder).toBe(1);
  });

  it("surfaces fetch errors", async () => {
    (fetchRemoteEncryptedNotes as jest.Mock).mockRejectedValue(new Error("boom"));

    await expect(syncDownFromCloud()).rejects.toThrow("boom");
  });
});
