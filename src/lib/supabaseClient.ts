import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;
let handlingInvalidRefresh = false;

async function handleInvalidRefreshToken() {
  if (handlingInvalidRefresh) return;
  handlingInvalidRefresh = true;
  try {
    await supabase?.auth.signOut();
  } finally {
    if (typeof window !== "undefined") {
      window.location.assign("/login?reason=session_expired");
    }
  }
}

function authGuardFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init).then(async (res) => {
    if (res.status === 400) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      if (url.includes("/auth/v1/token")) {
        try {
          const text = await res.clone().text();
          if (text.includes("Invalid Refresh Token")) {
            await handleInvalidRefreshToken();
          }
        } catch {
          // Best-effort only.
        }
      }
    }
    return res;
  });
}

export function getSupabaseClient(): SupabaseClient {
  if (supabase) return supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build/prerender these may be undefined — fail only when actually used
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: authGuardFetch },
  });
  return supabase;
}
