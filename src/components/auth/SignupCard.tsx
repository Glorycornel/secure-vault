"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

export function SignupCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/vault");
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
      <div className="mb-6 flex justify-center">
        <Image
          src="/images/logo.png"
          alt="SecureVault logo"
          width={260}
          height={80}
          priority
          className="h-auto w-[220px] drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]"
          style={{ height: "auto" }}
        />
      </div>

      <h1 className="text-center text-2xl font-semibold text-white">Create your account</h1>
      <p className="mt-2 text-center text-sm text-white/70">
        Start securing your notes and passwords in minutes
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-white/80">Email</label>
          <input
            className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 transition outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-white/80">Password</label>
          <input
            className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 transition outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            required
            minLength={8}
          />
          <p className="mt-1 text-[11px] text-white/55">
            Use at least 8 characters for better security.
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(168,85,247,0.45)] transition hover:scale-[1.01] disabled:opacity-60"
        >
          {loading ? "Creating..." : "Sign up"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/70">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-purple-300 hover:text-purple-200">
          Log in
        </Link>
      </p>
    </div>
  );
}
