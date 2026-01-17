# AI Interaction Guidelines

## Purpose
This document tells AI assistants how to work with the SecureVault codebase safely and consistently.
The core promise is zero-knowledge storage: secrets are encrypted in the browser, and the server never
sees plaintext or the master password.

## Security and Privacy Invariants
- Keep all note content encryption client-side using the existing Web Crypto helpers.
- Never store or log master passwords, decrypted notes, or decrypted keys.
- Do not add server-side decryption, server-side indexing of note contents, or plaintext storage.
- Keep PBKDF2 parameters and AES-GCM usage consistent unless explicitly requested.
- Treat salts as non-secret, but do not change how salts are generated or stored without review.

## Cryptography Modules to Reuse
- Vault key derivation: `src/lib/crypto/deriveKey.ts` (PBKDF2 -> AES-GCM key).
- Note payload encryption: `src/lib/crypto/aesGcm.ts`.
- Raw key import and byte encryption: `src/lib/crypto/aesRaw.ts`, `src/lib/crypto/aesBytes.ts`.
- Sharing keys: `src/lib/crypto/box.ts` (libsodium sealed boxes).

## Storage and Sync Model
- Local storage is IndexedDB with stores: `meta`, `notes`, `note_keys`, `shared_notes`.
- Supabase tables used by the client include:
  - `encrypted_notes` (encrypted payload, plaintext title metadata, optional encrypted note key).
  - `vault_kdf` (per-user KDF salt).
  - `profiles` (user box keys; private key encrypted under vault key).
  - `groups`, `group_members`, `group_keys` (group membership and sealed group keys).
  - `note_shares` (wrapped note keys and permissions for shared notes).

## Editing Expectations
- Use existing helpers instead of rolling new crypto primitives.
- Any new data persisted locally must remain encrypted.
- Avoid UI changes that expose secrets or encourage copying plaintext to logs.
- If a change affects security semantics, call it out clearly in the PR/summary.

## Tests and Validation
- Prefer adding or updating tests in `tests/` when behavior changes.
- Do not commit or keep auto-generated files (e.g., service worker) unless explicitly required.
