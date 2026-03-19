"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

function errorToMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7a3 3 0 0 0 4 4" />
      <path d="M9.9 5.1A11.5 11.5 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-4 4.9" />
      <path d="M6.7 6.7A17.7 17.7 0 0 0 2 12s3.5 7 10 7a11.6 11.6 0 0 0 5.2-1.2" />
    </svg>
  );
}

export function SignupCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setError(error.message);
        return;
      }

      if (!data.session) {
        setNotice(
          "Account created. Check your email to confirm your account before logging in."
        );
        return;
      }

      window.location.assign("/vault");
    } catch (error) {
      setError(errorToMessage(error, "Unable to sign up right now. Please try again."));
    } finally {
      setLoading(false);
    }
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

      <h1 className="text-center text-2xl font-semibold text-white">
        Create your account
      </h1>
      <p className="mt-2 text-center text-sm text-white/70">
        Start securing your notes and passwords in minutes
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1">
          <label htmlFor="signup-email" className="text-xs font-medium text-white/80">
            Email
          </label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password" className="text-xs font-medium text-white/80">
            Password
          </label>
          <div className="relative">
            <input
              id="signup-password"
              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 pr-12 text-sm text-white placeholder-white/40 transition outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-white/60 transition hover:text-white"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-white/55">
            Use at least 8 characters for better security.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="signup-confirm-password"
            className="text-xs font-medium text-white/80"
          >
            Confirm password
          </label>
          <div className="relative">
            <input
              id="signup-confirm-password"
              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 pr-12 text-sm text-white placeholder-white/40 transition outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              aria-label={
                showConfirmPassword ? "Hide confirm password" : "Show confirm password"
              }
              className="absolute inset-y-0 right-0 flex items-center px-3 text-white/60 transition hover:text-white"
            >
              <EyeIcon open={showConfirmPassword} />
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {notice && (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {notice}
          </p>
        )}

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
