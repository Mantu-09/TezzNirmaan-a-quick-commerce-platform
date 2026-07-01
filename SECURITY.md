# Security Policy — TezzNirmaan

## What is and is NOT committed to this repository

| File | Committed? | Reason |
|------|-----------|--------|
| `backend/.env.example` | ✅ Yes | Contains **placeholder names only** — no real values |
| `backend/.env` | ❌ Never | Contains real secrets — blocked by `.gitignore` |
| `*.pem`, `*.key`, `*.p12` | ❌ Never | Certificate files — blocked by `.gitignore` |
| `service-account*.json` | ❌ Never | Credential files — blocked by `.gitignore` |

## Secret Management Rules

1. **Never hardcode credentials** in any source file — always use `process.env.VAR_NAME`
2. **Never commit `.env`** — it is in `.gitignore` at both root and `backend/` levels
3. **Rotate immediately** if a key is ever accidentally exposed in a commit
4. **Render Dashboard** is where real production values live (not in code)

## Environment Variables Required

Copy `backend/.env.example` → `backend/.env` and fill in your real values locally.

| Variable | Where to get it |
|----------|----------------|
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API (keep secret!) |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay Dashboard → Settings → API Keys (keep secret!) |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Dashboard → Webhooks → your webhook → Secret |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `CORS_ORIGIN` | Your frontend domain(s), comma-separated |

## If a Secret is Leaked

1. **Immediately rotate** the exposed key in Supabase/Razorpay dashboard
2. Run `git log --all -S "leaked-value" --source` to find the offending commit
3. Use `git filter-repo` or BFG Repo Cleaner to purge the history
4. Force-push to overwrite the remote history
5. Notify all collaborators to re-clone

## Startup Protection

`src/utils/validateEnv.js` runs at server startup and exits with a clear error
if any required environment variable is missing or still set to a placeholder value.
This prevents the server from running in an insecure state.

## Reporting a Vulnerability

If you discover a security issue, please contact the maintainer privately
rather than opening a public GitHub issue.
