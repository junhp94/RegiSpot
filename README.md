# RegiSpot

A web app for group-based session registration — badminton, tennis, basketball, and more. Members join a group via a 6-digit access code, pick a per-group nickname, and sign up for sessions the owner creates.

**Live:** https://junhp94.github.io/RegiSpot/

---

## Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind CSS | GitHub Pages |
| Backend | Node.js + Express 4 | Render (free tier) |
| Database | PostgreSQL 16 | Neon (free tier) |
| Auth | Custom JWT (bcrypt passwords) | — |

**Total hosting cost: $0/month**

---

## Why this stack

The app was originally built on AWS (Lambda + DynamoDB + Cognito + S3 + CloudFront). It was migrated to cut costs to zero while keeping the same feature set:

- **GitHub Pages** hosts the static Vite build. It's free and deploys automatically on push to `main`.
- **Render free tier** runs the Express API. It spins down after 15 min of inactivity; a GitHub Actions cron pings `/health` every 10 minutes to keep it warm.
- **Neon** provides serverless Postgres with a generous free tier. The pooled connection string keeps the app within Neon's connection limits.
- **Custom JWT auth** replaces Cognito. Passwords are hashed with bcrypt (cost 10); tokens are signed HS256, valid for 7 days, and stored in `localStorage` (not cookies — the frontend on `github.io` and the API on `onrender.com` are cross-origin, so third-party cookies would be blocked by modern browsers).

---

## Project structure

```
├── src/                   # React frontend
│   ├── auth/              # JWT auth context (login, register, logout)
│   ├── pages/             # Route pages (Login, Signup, Dashboard, Group)
│   ├── components/        # UI components
│   ├── hooks/             # useSessions, useGroups
│   └── api.js             # Fetch wrapper for all API endpoints
├── server/                # Express API
│   └── src/
│       ├── routes/        # auth, groups, sessions, signups, members
│       ├── middleware/     # requireAuth (JWT verification)
│       ├── lib/           # db.js (pg Pool), validators.js
│       ├── schema.sql     # Postgres schema (idempotent, run on startup)
│       ├── migrate.js     # Applies schema.sql on every server start
│       └── app.js         # Express app factory (imported by tests too)
├── .github/workflows/
│   ├── pages.yml          # Build + deploy frontend to GitHub Pages
│   ├── api-ci.yml         # Run server tests against a Postgres service container
│   └── keep-warm.yml      # Ping /health every 10 min to prevent Render cold starts
└── render.yaml            # Render service config (rootDir: server)
```

---

## Running locally

### Backend

```bash
cd server
cp .env.example .env     # fill in DATABASE_URL, JWT_SECRET, etc.
npm install
npm run dev              # starts on http://localhost:3000
```

### Frontend

```bash
# in the project root
cp .env.example .env.local   # set VITE_API_BASE=http://localhost:3000
npm install
npm run dev
```

---

## Key design decisions

**Concurrency for signups** — `UPDATE sessions SET signed_up_count = signed_up_count + 1 WHERE signed_up_count < capacity RETURNING id`. Zero rows returned means the session is full. The `(session_id, user_id)` primary key on `signups` catches duplicate registrations. This replicates the DynamoDB `TransactWriteCommand` pattern using plain SQL.

**Schema migration** — `schema.sql` uses `CREATE TABLE IF NOT EXISTS` throughout, so `migrate.js` runs it on every server start without side effects. No separate migration tool needed.

**SPA routing on GitHub Pages** — Vite builds with `base: /RegiSpot/`. The deploy workflow copies `dist/index.html` to `dist/404.html` so GitHub Pages serves the React app on deep-link refreshes instead of a 404.

**Access codes** — 6-digit codes are generated with `crypto.randomInt` (cryptographically random, uniform distribution) rather than `Math.random`.
