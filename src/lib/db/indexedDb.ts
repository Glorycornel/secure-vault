import { openDB, type DBSchema } from "idb";

export type EncryptedPayload = {
  iv: string; // base64
  ciphertext: string; // base64
};

export type EncryptedNoteRecord = {
  id: string;
  payload: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
};

interface VaultDb extends DBSchema {
  meta: {
    key: string;
    value: string;
  };
  notes: {
    key: string;
    value: EncryptedNoteRecord;
    indexes: { "by-updatedAt": string };
  };
}

export const DB_NAME = "secure-vault-db";
export const DB_VERSION = 1;

export async function getDb() {
  return openDB<VaultDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
      if (!db.objectStoreNames.contains("notes")) {
        const store = db.createObjectStore("notes", { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
      }
    },
  });
}

// meta helpers
export async function getMeta(key: string) {
  const db = await getDb();
  return db.get("meta", key);
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  return db.put("meta", value, key);
}

// notes helpers
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
