import { openDB, type DBSchema } from "idb";

export type EncryptedPayload = {
  iv: string; // base64
  ciphertext: string; // base64
};

/**
 * Local record for an encrypted note payload.
 * - payload is the encrypted note content (AES-GCM)
 * - NOTE: payload encryption key depends on your design:
 *   - For sharing: payload must be encrypted with a per-note key (noteKey)
 */
export type EncryptedNoteRecord = {
  id: string;
  payload: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
};

/**
 * Metadata for shared notes stored locally.
 * This lets you show "Shared with me" separately and keep origin + permissions.
 */
export type SharedEncryptedNoteRecord = EncryptedNoteRecord & {
  sharedFromUserId?: string; // owner/creator user_id in Supabase encrypted_notes
  sharedGroupId?: string; // group id (if shared_with_type='group')
  permission?: "read" | "write";
};

/**
 * Local storage for per-note keys (noteKey) encrypted under the user's vault key.
 * - encryptedNoteKey is AES-GCM encrypted bytes (base64 payload) of the raw 32-byte noteKey
 * - You will create this when a note is created, and also when a shared note is received.
 */
export type EncryptedNoteKeyRecord = {
  noteId: string;
  encryptedNoteKey: EncryptedPayload; // ciphertext/iv of noteKey bytes, encrypted using vaultAesKey
  createdAt: string;
  updatedAt: string;
};

interface VaultDb extends DBSchema {
  meta: {
    key: string;
    value: string;
  };

  /**
   * "My notes" store (owned notes).
   * Backwards compatible with your existing code.
   */
  notes: {
    key: string;
    value: EncryptedNoteRecord;
    indexes: { "by-updatedAt": string };
  };

  /**
   * "Shared with me" store.
   * Separate store so UI can list shared notes without mixing.
   */
  shared_notes: {
    key: string;
    value: SharedEncryptedNoteRecord;
    indexes: { "by-updatedAt": string; "by-sharedGroupId": string };
  };

  /**
   * Stores per-note encryption keys (noteKey) encrypted under vault key.
   * Needed for E2EE sharing.
   */
  note_keys: {
    key: string; // noteId
    value: EncryptedNoteKeyRecord;
    indexes: { "by-updatedAt": string };
  };
}

export const DB_NAME = "secure-vault-db";
/**
 * v1: meta + notes
 * v2: add note_keys
 * v3: add shared_notes
 */
export const DB_VERSION = 3;

export async function getDb() {
  return openDB<VaultDb>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1 baseline
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
        if (!db.objectStoreNames.contains("notes")) {
          const store = db.createObjectStore("notes", { keyPath: "id" });
          store.createIndex("by-updatedAt", "updatedAt");
        }
      }

      // v2: note_keys store
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains("note_keys")) {
          const store = db.createObjectStore("note_keys", { keyPath: "noteId" });
          store.createIndex("by-updatedAt", "updatedAt");
        }
      }

      // v3: shared_notes store
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains("shared_notes")) {
          const store = db.createObjectStore("shared_notes", { keyPath: "id" });
          store.createIndex("by-updatedAt", "updatedAt");
          store.createIndex("by-sharedGroupId", "sharedGroupId");
        }
      }

      // Defensive: if someone had a partial DB from past experiments, ensure stores exist.
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
      if (!db.objectStoreNames.contains("notes")) {
        const store = db.createObjectStore("notes", { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("note_keys")) {
        const store = db.createObjectStore("note_keys", { keyPath: "noteId" });
        store.createIndex("by-updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("shared_notes")) {
        const store = db.createObjectStore("shared_notes", { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
        store.createIndex("by-sharedGroupId", "sharedGroupId");
      }
    },
  });
}

/* -----------------------------
   meta helpers (unchanged)
------------------------------ */
export async function getMeta(key: string) {
  const db = await getDb();
  return db.get("meta", key);
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  return db.put("meta", value, key);
}

/* -----------------------------
   "My notes" helpers (unchanged)
------------------------------ */
export async function listEncryptedNotes() {
  const db = await getDb();
  return db.getAllFromIndex("notes", "by-updatedAt");
}

export async function getEncryptedNote(id: string) {
  const db = await getDb();
  return db.get("notes", id);
}

export async function upsertEncryptedNote(note: EncryptedNoteRecord) {
  const db = await getDb();
  return db.put("notes", note);
}

export async function deleteEncryptedNote(id: string) {
  const db = await getDb();
  return db.delete("notes", id);
}

/* -----------------------------
   Shared notes helpers (NEW)
------------------------------ */
export async function listSharedEncryptedNotes() {
  const db = await getDb();
  return db.getAllFromIndex("shared_notes", "by-updatedAt");
}

export async function listSharedEncryptedNotesByGroup(groupId: string) {
  const db = await getDb();
  return db.getAllFromIndex("shared_notes", "by-sharedGroupId", groupId);
}

export async function getSharedEncryptedNote(id: string) {
  const db = await getDb();
  return db.get("shared_notes", id);
}

export async function upsertSharedEncryptedNote(note: SharedEncryptedNoteRecord) {
  const db = await getDb();
  return db.put("shared_notes", note);
}

export async function deleteSharedEncryptedNote(id: string) {
  const db = await getDb();
  return db.delete("shared_notes", id);
}

/* -----------------------------
   Note keys helpers (NEW)
   Stores per-note keys encrypted under vault key
------------------------------ */
export async function getEncryptedNoteKey(noteId: string) {
  const db = await getDb();
  return db.get("note_keys", noteId);
}

export async function upsertEncryptedNoteKey(rec: EncryptedNoteKeyRecord) {
  const db = await getDb();
  return db.put("note_keys", rec);
}

export async function deleteEncryptedNoteKey(noteId: string) {
  const db = await getDb();
  return db.delete("note_keys", noteId);
}

/**
 * Convenience helper: delete note + its key (owned note)
 */
export async function deleteNoteAndKey(noteId: string) {
  const db = await getDb();
  const tx = db.transaction(["notes", "note_keys"], "readwrite");
  await Promise.all([tx.objectStore("notes").delete(noteId), tx.objectStore("note_keys").delete(noteId)]);
  await tx.done;
}

/**
 * Convenience helper: delete shared note + its key
 */
export async function deleteSharedNoteAndKey(noteId: string) {
  const db = await getDb();
  const tx = db.transaction(["shared_notes", "note_keys"], "readwrite");
  await Promise.all([
    tx.objectStore("shared_notes").delete(noteId),
    tx.objectStore("note_keys").delete(noteId),
  ]);
  await tx.done;
}
