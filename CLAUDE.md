# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RegiSpot is a serverless web application for group-based session registration (e.g., badminton, tennis, basketball) with custom auth, group management via access codes, per-group nicknames, owner/member roles, and session CRUD.

## Commands

### Frontend (from project root)
```bash
npm run dev      # Start Vite dev server
npm run build    # Production build to /dist
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

### Backend (from backend/regispot-backend/)
```bash
sam build                # Build Lambda functions
sam deploy               # Deploy to AWS
sam local start-api      # Local API testing
sam validate             # Validate SAM template
```

### Frontend Deployment
```bash
npm run build
aws s3 sync dist/ s3://regispot-signup --delete
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

## Architecture

### Frontend (React + Vite + React Router)
- `src/App.jsx` - Router shell with route definitions
- `src/main.jsx` - Entry point with BrowserRouter, AuthProvider
- `src/auth/` - Cognito email/password auth (no OAuth redirect)
  - `config.js` - Amplify config (userPoolId + clientId only)
  - `AuthContext.jsx` - Auth provider with signIn, register, confirmAccount, logout
  - `useAuth.js` - Auth context hook
- `src/pages/` - Route pages
  - `LoginPage.jsx` - Email/password sign-in
  - `SignupPage.jsx` - Two-step registration (register + confirm code)
  - `DashboardPage.jsx` - Lists user's groups, create/join modals
  - `GroupPage.jsx` - Group detail: sessions grid, members tab, session CRUD
- `src/hooks/`
  - `useSessions.js` - Session state (signup, create, delete, toggle signups)
  - `useGroups.js` - Dashboard state (list groups, create, join)
- `src/components/`
  - `AppLayout.jsx` - Shared layout (TopBar + Toast + Outlet)
  - `ProtectedRoute.jsx` - Auth guard, redirects to /login
  - `TopBar.jsx` - Brand + AuthButton
  - `AuthButton.jsx` - Sign-out only (login handled by LoginPage)
  - `SessionCard.jsx` - Session card with register/delete actions
  - `SignupsList.jsx` - Registered users list
  - `CreateGroupModal.jsx` - Group creation form
  - `JoinGroupModal.jsx` - Join via 6-digit access code
  - `CreateSessionModal.jsx` - Session creation form
  - `MembersPanel.jsx` - Member list with kick/leave actions
  - `Toast.jsx` - Toast notifications
- `src/api.js` - API client for all endpoints

**Routes:**
```
/login           -> LoginPage
/signup          -> SignupPage
/dashboard       -> DashboardPage (protected)
/groups/:groupId -> GroupPage (protected)
*                -> redirect to /dashboard
```

### Backend (AWS SAM)
- `backend/regispot-backend/template.yaml` - SAM template
- `backend/regispot-backend/src/` - Lambda handlers:
  - **Groups:** createGroup, joinGroup, getGroup, getUserGroups
  - **Sessions:** getSessions, createSession, deleteSession
  - **Signups:** signup, getSignups
  - **Members:** getMembers, kickMember, leaveGroup
- `backend/regispot-backend/src/lib/utils.js` - Shared DynamoDB client, response helpers, validators, membership helpers

### DynamoDB Schema (Single-table design)
Table: `RegiSpotTable` with composite key (PK, SK)

| Item Type | PK | SK | Key Attributes |
|---|---|---|---|
| Group metadata | `GROUP#<groupId>` | `META` | groupName, sportType, maxMembers, memberCount, accessCode, ownerId |
| Session | `GROUP#<groupId>` | `SESSION#<sessionId>` | date, time, location, capacity, signedUpCount, createdBy |
| Signup | `GROUP#<groupId>` | `SIGNUP#<sessionId>#<nickname_lower>` | nickname, userId, signedUpAt |
| Access code lookup | `ACCESSCODE#<6digits>` | `META` | groupId |
| Group membership | `GROUP#<groupId>` | `MEMBER#<userId>` | nickname, nicknameLower, role, joinedAt |
| Nickname uniqueness | `GROUP#<groupId>` | `NICKNAME#<nickname_lower>` | userId |
| User-group index | `USER#<userId>` | `GROUP#<groupId>` | groupId, groupName, sportType, nickname, role |

### Data Flow
1. User signs up / signs in via custom auth forms (Cognito email/password)
2. Dashboard shows user's groups (queried from USER# partition)
3. User creates group (generates 6-digit access code) or joins via code
4. Inside a group, owner creates sessions
5. Members click Register — backend looks up nickname from MEMBER record
6. Backend uses TransactWriteCommand for atomic operations (capacity checks, uniqueness)
7. Owner can delete sessions, kick members; members can leave

## Environment Variables

Frontend (`.env`):
```
VITE_API_BASE=https://<api-id>.execute-api.us-east-1.amazonaws.com/prod
VITE_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

Backend (set in template.yaml):
- `TABLE_NAME` - DynamoDB table name (auto-set to RegiSpotTable)
- `ALLOWED_ORIGIN` - CORS origin
