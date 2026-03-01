#!/usr/bin/env node

/**
 * Keep Supabase project warm by issuing a small authenticated request.
 * Run daily from a scheduler (GitHub Actions, cron, etc.).
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  process.exit(1);
}

if (!SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  process.exit(1);
}

const target = new URL("/rest/v1/", SUPABASE_URL).toString();
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);

try {
  const res = await fetch(target, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    },
    signal: controller.signal,
  });

  // The endpoint may return 200/404 depending on API configuration.
  // Any non-5xx response confirms the project responded.
  if (res.status >= 500) {
    const body = await res.text();
    console.error(`Supabase keep-alive failed with ${res.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }

  console.log(`Supabase keep-alive OK (${res.status}) at ${new Date().toISOString()}`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Supabase keep-alive request error: ${message}`);
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
