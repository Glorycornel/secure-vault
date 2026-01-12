declare module "next-pwa" {
  import type { NextConfig } from "next";

  type PWAOptions = {
    dest: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
  };

  // Use unknown instead of any (passes no-explicit-any)
  type NextConfigWithPwa = NextConfig & {
    pwa?: PWAOptions;
    turbopack?: unknown;
  };

  export default function nextPwa(
    options?: PWAOptions
  ): (nextConfig: NextConfigWithPwa) => NextConfig;
}
