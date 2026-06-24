# Nexus Dashboard — Android (Capacitor + React)

## Overview
Nexus Dashboard is the central hub/launcher for the Limecore OS suite. React 18 + Vite + Capacitor 7 + Supabase + Zustand. Serves as the bridge between StudyDesk and Workout Tracker. Android native wrapper under `android/`.

## Token Efficiency Rules (READ THESE FIRST)
- **Prefer `grep`/`rg` over reading entire files** — search for the function/component first
- **Read only relevant sections** — not the whole file. Use `rg -n "functionName" src/` to find locations
- **Keep tool output minimal** — grep for what matters, don't dump full file contents
- **Don't scan unnecessary directories** — stay in `src/` and `android/app/src/main/` unless a task specifically crosses layers

## Build Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Web build | `npm run build` (tsc + vite) |
| Sync to Android | `npm run cap:sync` (runs build + cap sync) |
| Android build | `cd android && ./gradlew-quiet assembleDebug` |
| Android build (full) | `cd android && ./gradlew assembleDebug` (only if quiet mode hides the issue) |
| Icon generation | `npm run icons` |

## Project Structure
- `src/` — React frontend (components/, screens/, store/, api/, lib/, db/)
- `android/` — Capacitor Android native wrapper (Capacitor 7)
- `public/` — Static assets
- `dist/` — Built web output (gitignored)
- `scripts/` — Build tooling scripts

## Code Style
- React 18 with TypeScript (`.tsx` files)
- Zustand for state management
- Dexie (IndexedDB) for offline storage
- Supabase for backend
- React Router v6 for navigation

## Conventions
- Read `src/` first — only go to `android/` for native plugin or build config issues
- State lives in Zustand stores (`src/store/`), not component-local state
- API layer in `src/api/`, database layer in `src/db/`
- Don't read `node_modules/` or `dist/`
