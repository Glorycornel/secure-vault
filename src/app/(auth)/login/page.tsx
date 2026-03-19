import { LoginCard } from "@/components/auth/LoginCard";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="relative min-h-screen w-full overflow-y-auto">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 px-6 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/15"
        >
          <span aria-hidden>←</span>
          <span>Back home</span>
        </Link>
      </div>
      <div className="relative z-10 flex min-h-[calc(100vh-4.5rem)] items-start justify-center px-6 pt-6 pb-8 sm:min-h-screen sm:items-center sm:pt-0">
        <LoginCard />
      </div>
    </main>
  );
}
