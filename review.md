# SecureVault Review (Senior Platform Engineer)

Rating: 4/5

## Key findings (ordered by severity)

1. Sensitive identifiers are logged in production paths. The client logs user IDs and sync stats, and note IDs/errors in the vault UI. This risks leaking identifiers via browser logs, telemetry, or support screenshots. See `src/lib/supabase/notesSync.ts:51`, `src/lib/supabase/notesSync.ts:55`, `src/lib/supabase/notesSync.ts:66`, `src/lib/supabase/notesSync.ts:70`, `src/lib/sync/syncDown.ts:140`, `src/app/(vault)/vault/page.tsx:147`, `src/app/(vault)/vault/page.tsx:206`, `src/app/(vault)/vault/page.tsx:239`, `src/app/(vault)/vault/page.tsx:286`.
2. Auto-generated PWA artifacts are committed. `public/sw.js` and `public/workbox-e9849328.js` are build outputs that will drift from source and can ship stale caching logic. This also conflicts with the repo guideline to avoid committing service workers unless required. See `public/sw.js`, `public/workbox-e9849328.js`.
3. Documentation claims no readable titles are stored, but the sync layer stores plaintext titles in Supabase. This is a security expectation mismatch and can erode trust. See `README.md` ("No readable titles or content are ever stored") and `src/lib/supabase/notesSync.ts:57`.
4. Missing security headers/CSP. The Next config does not set `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, or `Strict-Transport-Security`. For a secrets app, this is a baseline expectation. See `next.config.ts`.
5. Test coverage is narrow. Only the password generator is tested; crypto, IndexedDB, sync flows, and vault lock/unlock behavior are unverified. See `tests/passwordGenerator.test.ts`.

## What is already strong

- Client-side crypto architecture is documented and consistently used.
- CI runs format/lint/test/build on pushes and PRs.
- Docker build is multi-stage and runs as a non-root user.

## Steps to reach 5/5

1. Remove or gate client-side logging behind `NODE_ENV !== "production"`, and sanitize identifiers before logging. Optionally route to a structured logger with redaction.
2. Stop committing generated PWA assets. Add `public/sw.js` and `public/workbox-*.js` to `.gitignore` and regenerate in CI/build. If PWA is required, add explicit runtime caching rules that exclude vault routes or any response containing decrypted content.
3. Align docs with behavior. Either encrypt titles before sync or update `README.md`/`features.md` to accurately describe plaintext metadata storage and its threat model implications.
4. Add security headers in `next.config.ts` and validate CSP compatibility with Next/React. Include HSTS for production domains.
5. Expand tests to cover crypto helpers, sync import/merge logic, and vault unlock/lock flows. Add at least one integration test that exercises IndexedDB + decrypt path.
