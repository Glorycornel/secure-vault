import Link from "next/link";

export function AuthModal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <Link href="/" aria-label="Close auth modal" className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md">
        <Link
          href="/"
          className="mb-3 inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
        >
          Back to home
        </Link>
        {children}
      </div>
    </div>
  );
}
