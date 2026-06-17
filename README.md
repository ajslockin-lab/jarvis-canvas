# CARVIS: Canvas Intelligence (Desktop)

An AI-powered desktop web interface and extension overlay for Canvas LMS. CARVIS intelligently syncs your Canvas assignments, grades, and deadlines, providing an interactive, voice-driven "JARVIS-like" experience directly on your desktop.

## Features
- **CARVIS Rebrand:** Sleek, red/black HUD aesthetic with dynamic components.
- **Extension Overlay:** Interact with CARVIS seamlessly while browsing.
- **Canvas LMS Sync:** Automatically pulls courses, assignments, and grades using your Canvas PAT or OAuth.
- **Voice Interface:** Native voice-command capabilities.
- **Mobile Integration:** Deep-linked directly with the [CARVIS Mobile PWA](https://github.com/ajslockin-lab/pwajarvismobile).

## Setup & Local Development

This project uses `pnpm` as the package manager and is built using Vite, React, and Drizzle ORM.

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Environment Variables
Create a `.env` file in the root or `artifacts/jarvis-canvas` directory:
```env
# Database configuration for the API server
DATABASE_URL=postgres://user:password@localhost:5432/dbname

# The URL for the companion Mobile PWA
VITE_CARVIS_MOBILE_URL=https://pwajarvismobile.replit.app
```

### 3. Run the Development Servers
You can run the API server and the Vite frontend:
```bash
pnpm run dev
```

*(Note: If you are running locally on Windows, ensure your `pnpm-workspace.yaml` does not exclude Windows build tools like `esbuild` and `rollup`!)*

## Architecture
- **`artifacts/jarvis-canvas`**: The main Vite React frontend.
- **`artifacts/api-server`**: The Express/Drizzle backend powering Canvas data synchronization and NLU.
- **`artifacts/mockup-sandbox`**: UI sandbox for developing components in isolation.
