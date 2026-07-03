# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

- **Development**: `npm run dev` (local) or `npm run dev -- -H 0.0.0.0` (accessible from other devices)
- **Build**: `npm run build`
- **Production**: `npm start`
- **Linting**: `npm run lint`

## Project Overview

**AQL 10by10by10mini Score Manager** — A real-time quiz score management web application for the AQL "10by10by10mini" rule set. Multiple devices (moderator, players, spectators) synchronize score, question count, and game state via Supabase Realtime.

**Tech Stack**:
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL + Realtime WebSocket)
- **Hosting**: Vercel

## Critical Notes on Next.js 16

AGENTS.md warns: **This version has breaking changes.** Before writing code:
- Read guides in `node_modules/next/dist/docs/` for the specific feature
- Check for deprecation notices in commit history
- Do NOT rely on training data from Next.js 15 or earlier

## Architecture

### State Management Pattern

The app uses a **reducer-based pattern** with Supabase Realtime sync:

1. **`useGameState(roomId)`** (`src/hooks/useGameState.ts`) — Main hook that:
   - Manages game state with `gameReducer`
   - Fetches current state from Supabase on mount
   - Subscribes to real-time updates via WebSocket
   - Syncs local actions back to DB when dispatched

2. **`gameReducer`** (`src/lib/gameReducer.ts`) — Pure reducer handling all `GameAction` types (CORRECT, WRONG, UNDO, SET_PLAYER, etc.)

3. **Action Log** — Each `GameAction` wrapped in `LoggedAction` (with UUID, clientId, timestamp). Stored in DB and used for:
   - UNDO: replaying all actions except the last one from this client
   - Sync: conflict detection (actions keyed by clientId to prevent applying remote undo twice)

4. **DB Shape** (`DbRoomState`):
   ```
   {
     currentState: GameState,    // computed final state
     actions: LoggedAction[]     // ordered list of all actions
   }
   ```

### File Organization

- **`src/app/`** — Next.js App Router pages
  - `page.tsx` — Home: create/join room
  - `room/[roomId]/page.tsx` — Main game UI
- **`src/components/`** — React components (Scoreboard, GameHeader, SlotCard, etc.)
- **`src/hooks/`** — `useGameState` (Supabase sync + dispatch)
- **`src/lib/`**
  - `types.ts` — GameState, GameAction, DbRoomState definitions
  - `gameReducer.ts` — State machine reducer
  - `gameLogic.ts` — Pure functions (isReach, score calculation, initial state)
  - `replay.ts` — Action replay for undo/sync
  - `supabase.ts` — Supabase client configuration
  - `constants.ts` — DEFAULT_CONFIG, PLACEHOLDER_NAMES

### Realtime Sync Flow

1. User dispatches action locally → `useGameState` immediately updates local state (optimistic)
2. Action sent to Supabase (`rooms` table, `state` column)
3. Supabase Realtime broadcasts change
4. All clients receive update, merge actions, recompute state
5. Conflict resolution: each action tagged with `clientId`; UNDO only removes *your* actions

## Environment Setup

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

## Key Implementation Details

- **Session Storage**: Player name cached in `sessionStorage` for convenience
- **Client ID**: Auto-generated UUID (or fallback), stored in `sessionStorage.aql_client_id`
- **Room ID**: 5-digit numeric ID (generated on create, user-provided on join)
- **TypeScript Paths**: `@/*` → `./src/*`
- **Tailwind v4**: Uses new `@layer` and PostCSS integration; configuration in `postcss.config.mjs`

## Common Workflows

**Adding a new game action**:
1. Extend `GameAction` union in `src/lib/types.ts`
2. Add reducer case in `src/lib/gameReducer.ts`
3. Dispatch from UI via `dispatch(action)` in component
4. Hook handles DB sync and realtime broadcast

**Testing sync across devices**:
- `npm run dev -- -H 0.0.0.0` then open on multiple IPs
- Or use browser DevTools to simulate multiple clients on localhost
