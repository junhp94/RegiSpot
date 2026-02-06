# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RegiSpot is a serverless web application for group-based session registration (e.g., badminton sessions) with real-time capacity tracking.

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

### Frontend (React + Vite)
- `src/App.jsx` - Main component, renders TopBar and SessionCards
- `src/hooks/useSessions.js` - Central state management hook (sessions, signups, toast notifications)
- `src/api.js` - API client with fetch calls to backend
- `src/components/` - UI components (SessionCard, SignupsList, TopBar, Toast)

### Backend (AWS SAM)
- `backend/regispot-backend/template.yaml` - SAM template defining API Gateway, Lambda functions, and DynamoDB
- `backend/regispot-backend/src/` - Lambda handlers:
  - `getSessions.js` - GET /groups/{groupId}/sessions
  - `signup.js` - POST /groups/{groupId}/sessions/{sessionId}/signup
  - `getSignups.js` - GET /groups/{groupId}/sessions/{sessionId}/signups
- `backend/regispot-backend/src/lib/utils.js` - Shared DynamoDB client and response helpers

### DynamoDB Schema (Single-table design)
Table: `RegiSpotTable` with composite key (PK, SK)

| Item Type | PK | SK | Attributes |
|-----------|----|----|------------|
| Group metadata | `GROUP#{groupId}` | `META` | groupName |
| Session | `GROUP#{groupId}` | `SESSION#{sessionId}` | date, time, venue, capacity, signupCount |
| Signup | `GROUP#{groupId}` | `SIGNUP#{sessionId}#{userName}` | userName, signedUpAt |

### Data Flow
1. User enters Group ID in TopBar
2. Frontend fetches sessions via API
3. User enters name and clicks Register on a SessionCard
4. Backend uses DynamoDB TransactWriteCommand to atomically:
   - Check capacity not exceeded
   - Prevent duplicate signups (by lowercase username)
   - Increment signupCount
   - Create signup record
5. Frontend refreshes session list and shows Toast notification

## Environment Variables

Frontend (`.env`):
```
VITE_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/prod
```

Backend (set in template.yaml):
- `TABLE_NAME` - DynamoDB table name (auto-set to RegiSpotTable)
