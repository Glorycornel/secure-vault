"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listSharedEncryptedNotes, type SharedEncryptedNoteRecord } from "@/lib/db/indexedDb";
import { useVault } from "@/hooks/useVault";
import { fetchGroupNamesByIds } from "@/lib/groups/groups";

export default function SharedNotesPage() {
  const { isUnlocked } = useVault();
  const [items, setItems] = useState<SharedEncryptedNoteRecord[]>([]);
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const rows = await listSharedEncryptedNotes();
        // your index is "by-updatedAt" ascending; reverse for newest-first if you want
        setItems(rows.slice().reverse());
        const groupIds = Array.from(
          new Set(rows.map((row) => row.sharedGroupId).filter(Boolean) as string[])
        );
        const names = await fetchGroupNamesByIds(groupIds);
        setGroupNames(names);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!isUnlocked) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Shared with me</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Unlock your vault to view shared notes.
        </p>
        <div className="mt-6">
          <Link className="underline" href="/vault">
            Unlock vault
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-12 pt-8 text-white">
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
          <Link className="rounded-lg border border-white/20 px-3 py-1.5 text-sm" href="/vault">
            My Notes
          </Link>
        </header>
        <div className="mt-6 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Shared with me</h1>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-white/70">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-6 text-sm text-white/70">No shared notes yet.</p>
        ) : (
          <ul className="mt-6 grid gap-3">
            {items.map((n) => (
              <li
                key={n.id}
                className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Shared note</div>
                    <div className="mt-1 text-xs text-white/60">
                      Updated: {new Date(n.updatedAt).toLocaleString()}
                    </div>
                    {n.sharedGroupId ? (
                      <div className="mt-1 text-xs text-white/70">
                        Group: {groupNames.get(n.sharedGroupId) ?? n.sharedGroupId}
                      </div>
                    ) : null}
                    {n.permission ? (
                      <div className="mt-1 text-xs text-white/70">
                        Permission: {n.permission === "write" ? "Write" : "Read-only"}
                      </div>
                    ) : null}
                  </div>

                  <Link
                    className="rounded-lg border border-white/20 px-3 py-1 text-sm"
                    href={`/shared/${encodeURIComponent(n.id)}`}
                  >
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
