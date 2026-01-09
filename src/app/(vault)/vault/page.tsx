"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function VaultPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

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
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checking) {
    return <main className="p-6">Checking session...</main>;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vault</h1>
        <button className="rounded-md border px-3 py-2 text-sm" onClick={logout}>
          Logout
        </button>
      </div>

      <p className="mt-4 text-sm text-gray-600">
        Logged in as: <span className="font-medium">{email}</span>
      </p>

      <div className="mt-8 rounded-lg border p-4">
        <p className="text-sm">✅ Day 1 complete: Auth + protected route works.</p>
        <p className="mt-2 text-sm text-gray-600">
          Day 2: client-side encryption + encrypted notes CRUD.
        </p>
      </div>
    </main>
  );
}
