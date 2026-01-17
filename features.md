# SecureVault Features

## Overview

SecureVault is a privacy-first web app for storing encrypted notes and passwords. It is built on
Next.js (App Router) with Supabase authentication. All note content is encrypted client-side before
being stored locally in IndexedDB or synced to Supabase.

## Core User Flows

- Landing page introduces the product and routes to signup/login.
- Signup/login uses Supabase email/password auth.
- After login, users unlock the local vault with a separate master password.
- Notes can be created, edited, and deleted; password generation is built into the vault.
- Shared notes are listed and can be opened once the vault is unlocked.

## Vault Unlock and Key Derivation

- Master password is never stored or sent to Supabase.
- A per-user KDF salt is stored in Supabase (`vault_kdf`) and cached in IndexedDB (`meta`).
- The vault key is derived using PBKDF2 (SHA-256, 210,000 iterations) to produce an AES-GCM key.
- A local check blob (`vault_check_v1`) verifies the password on the device without network access.
- Locking or page refresh clears the in-memory vault key.

## Local Storage (IndexedDB)

IndexedDB is the source of truth for client-side state and decryption.

Stores and contents:

- `meta`: cached salt and local unlock check data.
- `notes`: encrypted note payloads (`iv`, `ciphertext`) and timestamps.
- `note_keys`: per-note keys encrypted under the vault key.
- `shared_notes`: encrypted payloads for notes shared with the user, plus metadata.

## Note Encryption Model

- Each note is encrypted with a per-note AES-GCM key.
- The per-note key is encrypted with the vault key and stored in `note_keys`.
- Legacy notes (without a per-note key) fall back to vault-key encryption for backward compatibility.

## Cloud Sync for Owned Notes

- Supabase table `encrypted_notes` stores encrypted payloads and metadata.
- Sync-down imports remote notes into IndexedDB based on `updated_at` timestamps.
- Per-note keys can be stored in Supabase as `note_key_ciphertext` and `note_key_iv` so other devices
  can decrypt notes after unlocking with the same master password.
- Title metadata is stored in Supabase to support listing; payloads remain encrypted.

## Shared Notes and Group Sharing

- User profiles store a libsodium box keypair; the private key is encrypted with the vault key.
- Groups have a symmetric group key that is sealed to each member's box public key.
- Sharing a note wraps the per-note key with the group key and stores it in `note_shares`.
- Sync-down for shared notes:
  - Load the user's box keypair and decrypt group keys.
  - Fetch shared note rows and the corresponding encrypted notes.
  - Decrypt the wrapped note key with the group key.
  - Store shared notes in `shared_notes` and note keys in `note_keys` for local decryption.
- Shared notes are read-only in the current UI (permission metadata is stored but not enforced in UI).

## Auto-Lock and Inactivity Handling

- Vault auto-locks after 5 minutes of inactivity.
- Mouse, keyboard, scroll, and touch events reset the timer.
- Auto-lock clears the in-memory vault key and requires re-unlock.

## Password Generator

- Built-in generator supports length selection and character set toggles.
- Guarantees at least one character from each selected pool.
- Strength indicator is based on length and character variety.
- Copy-to-clipboard support included.

## UI and Routes

- `/`: marketing landing page.
- `/signup` and `/login`: authentication screens.
- `/vault`: main notes UI with unlock flow and password generator.
- `/shared`: list of shared notes available locally.
- `/shared/[id]`: decrypt and view a specific shared note.

## PWA and Deployment

- PWA configured via `next-pwa` and `public/manifest.json`.
- Dockerfile and docker-compose are provided for local or containerized deployment.
- Environment variables required:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Testing

- Jest configuration supports browser-like tests via JSDOM.
- Current unit tests cover the password generator.
