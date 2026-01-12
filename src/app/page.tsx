import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/background.png')" }}
      />

      {/* Contrast overlay */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Star layers */}
      <div className="pointer-events-none absolute inset-0 sv-stars opacity-60" />
      <div className="pointer-events-none absolute inset-0 sv-twinkle opacity-80" />

      {/* Foreground */}
      <div className="relative z-10 flex min-h-screen flex-col items-center">
        {/* Header */}
        <header className="flex w-full justify-center pt-6">
          <Link href="/" className="inline-flex justify-center">
            <Image
              src="/images/logo.png"
              alt="SecureVault logo"
              width={460}
              height={140}
              priority
              className="
                h-auto
                w-[200px]
                sm:w-[260px]
                md:w-[340px]
                lg:w-[420px]
                drop-shadow-[0_0_25px_rgba(168,85,247,0.6)]
              "
            />
          </Link>
        </header>

        {/* Content */}
        <section className="flex w-full flex-1 items-center px-4 pb-12">
          <div className="mx-auto w-full max-w-3xl text-center">
            {/* Badge */}
            <div className="inline-flex sv-float items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              Private notes & passwords, safely stored
            </div>

            {/* Heading */}
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl md:text-6xl">
              Protect Your Secrets <br />
              <span className="bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                with SecureVault
              </span>
            </h1>

            {/* Description */}
            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base md:text-lg">
              SecureVault keeps your private notes and passwords safe in one place.
              Simple to use, beautifully designed, and built to protect your privacy.
            </p>

            {/* Buttons */}
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
              <Link
                href="/signup"
                className="inline-flex justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_0_45px_rgba(168,85,247,0.4)] transition hover:scale-[1.02]"
              >
                Get started
              </Link>

              <Link
                href="/login"
                className="inline-flex justify-center rounded-full border border-white/30 bg-white/10 px-8 py-3 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Login
              </Link>
            </div>

            {/* Highlights */}
            <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
              <Card title="Secure Notes" desc="Keep important notes private and organised." />
              <Card title="Password Vault" desc="Save and generate strong passwords easily." />
              <Card title="Auto Lock" desc="Locks automatically when inactive for a while." />
            </div>

            {/* Footer */}
            <div className="mt-10 text-xs text-white/60">
              Your privacy. Your data. Always protected.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur text-center">
      <div className="text-sm font-semibold text-white/95">{title}</div>
      <p className="mt-2 text-xs leading-relaxed text-white/75">{desc}</p>
    </div>
  );
}
