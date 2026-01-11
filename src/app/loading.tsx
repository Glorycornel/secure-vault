export default function Loading() {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-black" />
  
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-5">
          {/* Spinner */}
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
  
          {/* Text */}
          <p className="text-sm tracking-wide text-white/70">
            Loading SecureVault…
          </p>
        </div>
      </main>
    );
  }
  