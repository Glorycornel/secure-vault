"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useVault } from "@/hooks/useVault";
import {
  deleteEncryptedNote,
  listEncryptedNotes,
  upsertEncryptedNote,
  type EncryptedNoteRecord,
} from "@/lib/db/indexedDb";
import { encryptJson, decryptJson } from "@/lib/crypto/aesGcm";

type DecryptedNote = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

function uid() {
  return crypto.randomUUID();
}

export default function VaultPage() {
  const router = useRouter();
  const { key, isUnlocked, unlock, lock } = useVault();

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  // lock/unlock UI
  const [masterPassword, setMasterPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // notes UI
  const [notes, setNotes] = useState<DecryptedNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  useEffect(() => {
    async function run() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? null);
      setChecking(false);
    }
    run();
  }, [router]);

  async function logout() {
    lock(); // clear key
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function refreshNotes() {
    if (!key) return;
    const encrypted = await listEncryptedNotes();
    // newest last because index is by updatedAt; we'll sort descending for UI
    const sorted = [...encrypted].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    const decrypted: DecryptedNote[] = [];
    for (const rec of sorted) {
      const data = await decryptJson<{ title: string; body: string }>(key, rec.payload);
      decrypted.push({
        id: rec.id,
        title: data.title,
        body: data.body,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      });
    }
    setNotes(decrypted);
    if (!selectedId && decrypted[0]) setSelectedId(decrypted[0].id);
  }

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockError(null);
    setUnlocking(true);
    try {
      await unlock(masterPassword);
      setMasterPassword("");
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Failed to unlock vault");
    } finally {
      setUnlocking(false);
    }
  }

  useEffect(() => {
    if (isUnlocked) {
      refreshNotes();
    } else {
      setNotes([]);
      setSelectedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked]);

  async function createNote() {
    if (!key) return;
    const now = new Date().toISOString();
    const id = uid();
    const payload = await encryptJson(key, { title: "Untitled", body: "" });

    const rec: EncryptedNoteRecord = {
      id,
      payload,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEncryptedNote(rec);
    await refreshNotes();
    setSelectedId(id);
  }

  async function saveNote(id: string, title: string, body: string) {
    if (!key) return;
    const existing = notes.find((n) => n.id === id);
    const now = new Date().toISOString();

    const payload = await encryptJson(key, { title, body });

    const rec: EncryptedNoteRecord = {
      id,
      payload,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEncryptedNote(rec);
    await refreshNotes();
    setSelectedId(id);
  }

  async function removeNote(id: string) {
    await deleteEncryptedNote(id);
    await refreshNotes();
    if (selectedId === id) setSelectedId(null);
  }

  if (checking) return <main className="p-6">Checking session...</main>;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Secure Vault</h1>
          <p className="text-sm text-gray-600">Signed in as {email}</p>
        </div>

        <div className="flex gap-2">
          {isUnlocked ? (
            <button className="rounded-md border px-3 py-2 text-sm" onClick={lock}>
              Lock
            </button>
          ) : null}
          <button className="rounded-md border px-3 py-2 text-sm" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {!isUnlocked ? (
        <section className="mt-8 max-w-md rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Unlock vault</h2>
          <p className="mt-1 text-sm text-gray-600">
            Your master password derives the encryption key. We never store it.
          </p>

          <form className="mt-4 space-y-3" onSubmit={onUnlock}>
            <div className="space-y-2">
              <label className="text-sm">Master password</label>
              <input
                className="w-full rounded-md border px-3 py-2"
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            {unlockError ? (
              <p className="text-sm text-red-600" role="alert">
                {unlockError}
              </p>
            ) : null}

            <button
              className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
              disabled={unlocking}
              type="submit"
            >
              {unlocking ? "Unlocking..." : "Unlock"}
            </button>
          </form>
        </section>
      ) : (
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {/* left: list */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Notes</h2>
              <button className="rounded-md bg-black px-3 py-2 text-xs text-white" onClick={createNote}>
                New
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {notes.length === 0 ? (
                <li className="text-sm text-gray-600">No notes yet. Create one.</li>
              ) : (
                notes.map((n) => (
                  <li key={n.id}>
                    <button
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        n.id === selectedId ? "border-black" : ""
                      }`}
                      onClick={() => setSelectedId(n.id)}
                    >
                      <div className="font-medium">{n.title || "Untitled"}</div>
                      <div className="text-xs text-gray-600">
                        Updated {new Date(n.updatedAt).toLocaleString()}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* right: editor */}
          <div className="md:col-span-2 rounded-lg border p-4">
            {!selected ? (
              <p className="text-sm text-gray-600">Select a note to view/edit.</p>
            ) : (
              <NoteEditor
                note={selected}
                onSave={saveNote}
                onDelete={removeNote}
              />
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function NoteEditor({
  note,
  onSave,
  onDelete,
}: {
  note: DecryptedNote;
  onSave: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
  }, [note.id, note.title, note.body]);

  async function save() {
    setSaving(true);
    await onSave(note.id, title, body);
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <button
          className="rounded-md border px-3 py-2 text-sm"
          onClick={() => onDelete(note.id)}
        >
          Delete
        </button>
      </div>

      <textarea
        className="min-h-[320px] w-full rounded-md border px-3 py-2 text-sm"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your note..."
      />

      <div className="flex justify-end">
        <button
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
