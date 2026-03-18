# 🔐 SecureVault

**SecureVault** is a privacy-first web application for storing **encrypted notes and passwords**.
All sensitive data is encrypted **client-side** before storage, ensuring that only the user can access their secrets — not the server, not the database, not even SecureVault itself.

---

## ✨ Features

- 🔑 **Client-side encryption (AES-256-GCM)**
- 🧠 **Master password–derived key** (never stored or sent)
- 🗂 **Encrypted local vault** using IndexedDB
- 🔐 **Supabase authentication**
- ⏱ **Auto-lock on inactivity**
- 🔄 **Password generator**
- 📱 **Responsive UI (desktop, tablet, mobile)**
- 🐳 **Dockerized for consistent deployment**

---

## 🧱 Architecture Overview

### High-level flow

```
User
 └── Browser (Next.js)
      ├── Supabase Auth (email/password)
      ├── Crypto (Web Crypto API)
      ├── IndexedDB (encrypted records)
      └── UI (Vault, Notes, Passwords)
```

### Key architectural decisions

| Area       | Decision                          |
| ---------- | --------------------------------- |
| Frontend   | Next.js (App Router)              |
| Auth       | Supabase (email/password)         |
| Encryption | Web Crypto API (AES-GCM + PBKDF2) |
| Storage    | IndexedDB (browser-local)         |
| Secrets    | Never stored in plaintext         |
| Deployment | Docker + Vercel compatible        |

---

## 🔐 Cryptographic Model (Important)

SecureVault uses a **zero-knowledge design**.

### Master Password

- Chosen by the user
- **Never stored**
- **Never sent to any server**
- Used only to derive an encryption key in memory

---

### Key Derivation

```text
Master Password
   ↓
PBKDF2 (SHA-256, 210,000 iterations)
   ↓
256-bit AES-GCM key
```

- PBKDF2 slows down brute-force attacks
- Salt is stored locally
- Key exists **only in memory**
- Locking or refreshing clears the key

---

### Encryption

- Algorithm: **AES-256-GCM**
- Each record has:
  - Random IV
  - Encrypted payload
  - Authentication tag

Stored data looks like:

```json
{
  "id": "uuid",
  "payload": "base64(ciphertext)",
  "iv": "base64(iv)",
  "createdAt": "...",
  "updatedAt": "..."
}
```

➡️ **Note titles are stored as plaintext metadata for listing; note bodies remain encrypted**

---

## 🗃 Data Storage Strategy

| Data                  | Location        |
| --------------------- | --------------- |
| Auth session          | Supabase        |
| Encrypted vault       | IndexedDB       |
| Encryption keys       | In-memory only  |
| Environment variables | `.env` / Docker |

This design ensures:

- Server breach ≠ data breach
- Database access ≠ secret access

---

## ⏱ Auto-Lock Model

- Vault auto-locks after **5 minutes of inactivity**
- Any user interaction resets the timer
- On lock:
  - Encryption key is wiped
  - UI is cleared
  - Re-unlock requires master password

---

## ⚖️ Trade-offs & Design Decisions

### Why client-side encryption?

✅ Maximum privacy
❌ Harder to sync across devices (future feature)

---

### Why IndexedDB instead of server storage?

✅ Zero-knowledge security
✅ Fast local access
❌ No automatic cloud backup

---

### Why Supabase?

✅ Simple, secure authentication
✅ Managed infrastructure
❌ Auth only — not trusted with secrets

---

### What happens if the user forgets their master password?

❌ **Data cannot be recovered**

This is intentional and aligns with:

- Password managers
- Zero-knowledge security principles

---

## 🛠 Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase Auth**
- **Web Crypto API**
- **IndexedDB**
- **Docker**
- **pnpm**

---

## 🚀 Getting Started (Local Setup)

### 1️⃣ Clone the repository

```bash
git clone https://github.com/your-username/secure-vault.git
cd secure-vault
```

---

## 🧩 Supabase Policies & Schema

Supabase RLS policies, schema constraints, and RPCs for sharing live in `supabase/README.md`
and `supabase/migrations/`. Apply those migrations to enforce group membership rules,
share access, and key rotation flows.

---

### 2️⃣ Install dependencies

```bash
pnpm install
```

---

### 3️⃣ Create environment variables

Create a `.env` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

> ⚠️ These keys are **public by design** but should still be rotated if leaked.

---

### 4️⃣ Run the app locally

```bash
pnpm dev
```

---

## ⏰ Supabase Keep-Alive (Optional)

If you want a best-effort daily activity check for a Supabase free-tier project, this repo includes a once-daily keep-alive ping:

- Script: `scripts/supabase-keepalive.mjs`
- Command: `pnpm supabase:keepalive`
- GitHub workflow: `.github/workflows/supabase-keepalive.yml` (runs daily + manual trigger)

To enable scheduled keep-alive in GitHub Actions, add these repository secrets:

- `SUPABASE_URL` (e.g. `https://your-project-ref.supabase.co`)
- `SUPABASE_ANON_KEY` (project anon key)

Notes:

- The workflow is intentionally once daily.
- This is best-effort only; it does not guarantee a free-tier project will never be paused for inactivity.
- If the project is already paused, the script will fail with a paused-project message until you resume it in Supabase.

Visit:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🐳 Running with Docker

### Build & start

```bash
docker compose up --build
```

App runs at:

```
http://localhost:3000
```

---

## 🔐 Security Notes

- `.env` is **never committed**
- Pre-commit hooks enforce:
  - Linting
  - Tests

- Supabase anon key is rotated if exposed
- No secrets are logged
- Encryption happens before storage

---

## 🧪 Testing

```bash
pnpm test
```

Tests cover:

- Crypto utilities
- Vault state handling
- IndexedDB helpers

---

## 📦 Deployment

SecureVault is **Vercel-ready**:

1. Push to GitHub
2. Import project into Vercel
3. Add environment variables
4. Deploy

---

## 🛣 Roadmap

- Cloud-encrypted sync
- WebAuthn / biometrics
- Browser extension
- Password autofill
- Export / backup vault

---

## 👤 Author

**Built by:** _Glory Chioma Anunah_
**Focus:** Security-first frontend architecture
**Philosophy:** _Privacy by design, not by policy_
