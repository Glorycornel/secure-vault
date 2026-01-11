import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/landing-bg.png')" }}
      />

      {/* Contrast overlay */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Star layers */}
      <div className="pointer-events-none absolute inset-0 sv-stars opacity-60" />
      <div className="pointer-events-none absolute inset-0 sv-twinkle opacity-80" />

      {/* Foreground */}
      <div className="relative z-10 w-full">
        {/* Logo (top, normal flow) */}
        <header className="w-full pl-6 pr-6 pt-0 sm:pl-10 md:pl-16 lg:pl-0">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/images/logo.png"
              alt="SecureVault logo"
              width={420}
              height={120}
              priority
              className="
                h-auto
                w-[320px]
                sm:w-[380px]
                md:w-[420px]
                lg:w-[460px]
                drop-shadow-[0_0_25px_rgba(168,85,247,0.6)]
              "
            />
          </Link>
        </header>

        {/* Content — directly under logo */}
        <section className="w-full px-20 pb-2 pt-0">
          <div className="max-w-none">
            {/* LEFT-ANCHORED TEXT BLOCK */}
            <div className="max-w-lg pl-4 sm:pl-8 md:pl-16 lg:pl-24 xl:pl-5">
              {/* Floating badge (tiny spacing only) */}
              <div className="mt-2 inline-flex sv-float items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-purple-400" />
                Private notes & passwords, safely stored
              </div>

              <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-white md:text-6xl">
                Protect Your Secrets <br />
                <span className="bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                  with SecureVault
                </span>
              </h1>

              <p className="mt-3 text-base leading-relaxed text-white/85 md:text-lg">
                SecureVault keeps your private notes and passwords safe in one place.
                Simple to use, beautifully designed, and built to protect your privacy.
              </p>

              {/* Buttons */}
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Link
                  href="/signup"
                  className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_0_45px_rgba(168,85,247,0.4)] transition hover:scale-[1.02]"
                >
                  Get started
                </Link>

                <Link
                  href="/login"
                  className="rounded-full border border-white/30 bg-white/10 px-8 py-3 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  Login
                </Link>
              </div>

              {/* Highlights */}
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                <Card title="Secure Notes" desc="Keep important notes private and organised." />
                <Card title="Password Vault" desc="Save and generate strong passwords easily." />
                <Card title="Auto Lock" desc="Locks automatically when inactive for a while." />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-10 pl-4 sm:pl-8 md:pl-16 lg:pl-24 xl:pl-32 text-xs text-white/60">
            Your privacy. Your data. Always protected.
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
      <div className="text-sm font-semibold text-white/95">{title}</div>
      <p className="mt-2 text-xs leading-relaxed text-white/75">{desc}</p>
    </div>
  );
}
