# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RegiSpot is a web application for group-based session registration (badminton, tennis, basketball, etc.) with custom JWT auth, group management via access codes, per-group nicknames, owner/member roles, and session CRUD.

**Stack:** React + Vite (GitHub Pages) · Express API (Render free tier) · Neon Postgres · JWT auth

## Commands

### Frontend (from project root)
```bash
npm run dev      # Start Vite dev server (uses VITE_API_BASE from .env)
npm run build    # Production build to /dist
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

### Backend (from server/)
```bash
npm run dev      # Start Express with nodemon
npm start        # Production start
npm test         # Run integration tests against Neon
```

## Architecture

### Frontend (React + Vite + React Router)
- `src/App.jsx` — Router shell with route definitions
- `src/main.jsx` — Entry point with BrowserRouter (basename from BASE_URL), AuthProvider
- `src/auth/` — Custom JWT auth
  - `AuthContext.jsx` — Auth provider; stores JWT in localStorage under `regispot-token`; validates on mount via GET /auth/me
  - `context.js` — createContext
  - `useAuth.js` — Auth context hook
- `src/api.js` — API client for all endpoints (uses VITE_API_BASE || localhost:3000)
- `src/pages/` — Route pages
- `src/hooks/` — useSessions, useGroups
- `src/components/` — UI components

**Routes:**
```
/login           -> LoginPage
/signup          -> SignupPage (single-step, no email confirm)
/dashboard       -> DashboardPage (protected)
/groups/:groupId -> GroupPage (protected)
/join/:code      -> auto-join flow
*                -> redirect to /dashboard
```

### Backend (Express, server/)
- `server/src/app.js` — Express app factory; mounts all routes; CORS allows any localhost in dev
- `server/src/index.js` — Entry point; runs migrate then starts server
- `server/src/migrate.js` — Applies schema.sql idempotently on startup (uses DATABASE_URL_UNPOOLED)
- `server/src/schema.sql` — All table definitions (users, groups, members, sessions, signups)
- `server/src/lib/db.js` — pg Pool (max: 5 for Neon free tier)
- `server/src/routes/` — auth, groups, sessions, signups, members

**API routes (all prefixed with nothing — paths match src/api.js exactly):**
```
POST   /auth/register
POST   /auth/login
GET    /auth/me
GET    /users/me/groups
POST   /groups
POST   /groups/join
GET    /groups/:id
GET    /groups/:id/sessions
POST   /groups/:id/sessions
DELETE /groups/:id/sessions/:sessionId
POST   /groups/:id/sessions/:sessionId/signup
DELETE /groups/:id/sessions/:sessionId/signup
GET    /groups/:id/sessions/:sessionId/signups
GET    /groups/:id/members
POST   /groups/:id/members/leave
PATCH  /groups/:id/members/:userId
DELETE /groups/:id/members/:userId
GET    /health
```

### Database (Neon Postgres)
See `server/src/schema.sql` for full schema.

Key concurrency pattern: every signup write BEGINs, locks the session row with `SELECT … FOR UPDATE` (`lockSession` in `server/src/lib/signupQueue.js`), applies its change, then calls `promote()` to move waitlisted players into open spots. `signed_up_count` counts `status = 'registered'` rows only. All day-of-lock / visibility maths uses America/Vancouver via `server/src/lib/vancouverTime.js`.

## Environment Variables

**Frontend** (`.env` or `.env.local`, gitignored):
```
VITE_API_BASE=http://localhost:3000
```

**Frontend build** (GitHub Actions):
```
VITE_BASE=/RegiSpot/
VITE_API_BASE=https://your-service.onrender.com
```

**Backend** (`server/.env`, gitignored):
```
DATABASE_URL=postgresql://...     # Neon pooled connection string
DATABASE_URL_UNPOOLED=postgresql://...  # Neon direct (for migrations/tests)
JWT_SECRET=...
ALLOWED_ORIGINS=http://localhost:5173,https://junhp94.github.io
PORT=3000
```

## Deployment

- **Frontend:** GitHub Actions → `npm run build` with `VITE_BASE=/RegiSpot/` → GitHub Pages
- **Backend:** Render free tier — auto-deploys from `server/` directory; keep-warm cron hits /health every 10 min
- **Database:** Neon free tier (Postgres 16)
