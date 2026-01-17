/** @jest-environment node */
import { structuredClone as nodeStructuredClone } from "util";
import {
  deleteEncryptedNote,
  deleteEncryptedNoteKey,
  deleteSharedEncryptedNote,
  getDb,
  getEncryptedNote,
  getEncryptedNoteKey,
  getMeta,
  getSharedEncryptedNote,
  listEncryptedNotes,
  listSharedEncryptedNotes,
  listSharedEncryptedNotesByGroup,
  setMeta,
  upsertEncryptedNote,
  upsertEncryptedNoteKey,
  upsertSharedEncryptedNote,
} from "@/lib/db/indexedDb";

if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = nodeStructuredClone;
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

describe("indexedDb helpers", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores and retrieves meta", async () => {
    await setMeta("vault_check_v1", "value-1");
    await setMeta("vault_check_v1", "value-2");

    const value = await getMeta("vault_check_v1");
    expect(value).toBe("value-2");
  });

  it("CRUDs encrypted notes", async () => {
    await upsertEncryptedNote({
      id: "note-1",
      payload: { iv: "iv-1", ciphertext: "ct-1" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    await upsertEncryptedNote({
      id: "note-2",
      payload: { iv: "iv-2", ciphertext: "ct-2" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-02-01T00:00:00.000Z",
    });

    const note = await getEncryptedNote("note-1");
    expect(note?.id).toBe("note-1");

    const all = await listEncryptedNotes();
    expect(all.map((n) => n.id).sort()).toEqual(["note-1", "note-2"]);

    await deleteEncryptedNote("note-1");
    const deleted = await getEncryptedNote("note-1");
    expect(deleted).toBeUndefined();
  });

  it("CRUDs note keys", async () => {
    await upsertEncryptedNoteKey({
      noteId: "note-1",
      encryptedNoteKey: { iv: "iv-key", ciphertext: "ct-key" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    const stored = await getEncryptedNoteKey("note-1");
    expect(stored?.encryptedNoteKey.ciphertext).toBe("ct-key");

    await deleteEncryptedNoteKey("note-1");
    const deleted = await getEncryptedNoteKey("note-1");
    expect(deleted).toBeUndefined();
  });

  it("CRUDs shared notes", async () => {
    await upsertSharedEncryptedNote({
      id: "shared-1",
      payload: { iv: "iv-s", ciphertext: "ct-s" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      sharedFromUserId: "user-1",
      sharedGroupId: "group-1",
      permission: "read",
    });
    await upsertSharedEncryptedNote({
      id: "shared-2",
      payload: { iv: "iv-s2", ciphertext: "ct-s2" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-02-01T00:00:00.000Z",
      sharedFromUserId: "user-2",
      sharedGroupId: "group-2",
      permission: "write",
    });

    const byId = await getSharedEncryptedNote("shared-1");
    expect(byId?.sharedGroupId).toBe("group-1");

    const all = await listSharedEncryptedNotes();
    expect(all.map((n) => n.id).sort()).toEqual(["shared-1", "shared-2"]);

    const byGroup = await listSharedEncryptedNotesByGroup("group-1");
    expect(byGroup.map((n) => n.id)).toEqual(["shared-1"]);

    await deleteSharedEncryptedNote("shared-1");
    const deleted = await getSharedEncryptedNote("shared-1");
    expect(deleted).toBeUndefined();
  });
});
