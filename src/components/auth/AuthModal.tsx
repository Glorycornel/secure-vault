"use client";

import Link from "next/link";
import { redirectTo } from "@/lib/navigation";

export function AuthModal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close auth modal"
        onClick={() => redirectTo("/")}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col justify-start pt-6 pb-4 sm:justify-center sm:py-0">
        <button
          type="button"
          onClick={() => redirectTo("/")}
          className="mb-3 inline-flex w-fit rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
        >
          Back to home
        </button>
        {children}
      </div>
    </div>
  );
}
