"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useVault } from "@/hooks/useVault";
import { getSharedEncryptedNote, upsertSharedEncryptedNote } from "@/lib/db/indexedDb";
import { decryptAnyNotePayload, encryptNoteWithPerNoteKey } from "@/lib/notes/noteCrypto";
import { updateSharedNotePayload } from "@/lib/supabase/sharedNotes";

type PlainNote = { title: string; body: string };

export default function SharedNoteViewPage() {
  const params = useParams<{ id: string }>();
  const noteId = decodeURIComponent(params.id);

  const { key: vaultAesKey, isUnlocked } = useVault();
  const [note, setNote] = useState<PlainNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<"read" | "write">("read");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isUnlocked || !vaultAesKey) return;

    (async () => {
      try {
        setError(null);
        const rec = await getSharedEncryptedNote(noteId);
        if (!rec) {
          setError("Shared note not found locally.");
          return;
        }

        const plain = await decryptAnyNotePayload({
          noteId: rec.id,
          payload: rec.payload,
          vaultAesKey,
        });

        setNote(plain);
        setPermission(rec.permission ?? "read");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to decrypt shared note.";
        setError(message);
      }
    })();
  }, [isUnlocked, vaultAesKey, noteId]);

  if (!isUnlocked) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-sm">Unlock your vault to view this note.</p>
        <div className="mt-4">
          <Link className="underline" href="/shared">
            Back
          </Link>
        </div>
      </main>
    );
  }

  async function save() {
    if (!note || !vaultAesKey) return;
    if (permission !== "write") return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { payload } = await encryptNoteWithPerNoteKey({
        noteId,
        plain: note,
        vaultAesKey,
        createdAt: now,
        updatedAt: now,
      });

      await updateSharedNotePayload({
        noteId,
        title: note.title || "Untitled",
        ciphertext: JSON.stringify(payload),
      });

      await upsertSharedEncryptedNote({
        id: noteId,
        payload,
        createdAt: now,
        updatedAt: now,
        permission,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 pt-8 pb-12 text-white">
        <header className="flex items-center justify-between gap-4">
          <Link href="/">
            <Image
              src="/images/logo.png"
              alt="SecureVault logo"
              width={200}
              height={64}
              priority
              className="drop-shadow-[0_0_18px_rgba(168,85,247,0.6)]"
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              className="rounded-lg border border-white/20 px-3 py-1 text-sm"
              href="/shared"
            >
              Shared notes
            </Link>
            <Link
              className="rounded-lg border border-white/20 px-3 py-1 text-sm"
              href="/vault"
            >
              My Notes
            </Link>
          </div>
        </header>

        {error ? (
          <p className="mt-6 text-sm text-red-300">{error}</p>
        ) : !note ? (
          <p className="mt-6 text-sm text-white/70">Decrypting…</p>
        ) : (
          <div className="mt-6 space-y-4 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/70">
                {permission === "write" ? "Write access" : "Read-only"}
              </div>
              {permission === "write" ? (
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              ) : null}
            </div>

            {permission === "write" ? (
              <>
                <input
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={note.title}
                  onChange={(e) =>
                    setNote((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                  }
                  placeholder="Title"
                />
                <textarea
                  className="min-h-[320px] w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={note.body}
                  onChange={(e) =>
                    setNote((prev) => (prev ? { ...prev, body: e.target.value } : prev))
                  }
                  placeholder="Write your note…"
                />
              </>
            ) : (
              <>
                <h1 className="text-xl font-semibold">{note.title}</h1>
                <p className="text-sm whitespace-pre-wrap text-white/80">{note.body}</p>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
