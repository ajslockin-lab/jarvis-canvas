# 🤖 JARVIS — AI Canvas Assistant

[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![Prisma](https://img.shields.io/badge/Prisma-6.0-2D3748?logo=prisma)](https://prisma.io)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](LICENSE)

> Your personal academic AI assistant that lives inside Canvas. Voice-controlled, deadline-aware, and always one step ahead of your workload.

---

## ✨ Features

- 🗣️ **Voice Commands** — Talk to JARVIS naturally. Ask about assignments, grades, or upcoming deadlines.
- 📅 **Smart Calendar** — Toggleable calendar with **click-to-view** assignment details per day.
- ⏰ **Deadline Tracker** — Automatically syncs with Canvas and highlights urgent assignments.
- 📊 **Grade Monitoring** — Real-time grade overview with visual progress bars.
- 🔌 **Chrome Extension** — Floating bubble on Canvas pages. Click to open a sleek overlay.
- 🌙 **Dark Mode** — HUD-inspired sci-fi design with neon cyan accents.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 22
- **PostgreSQL** database (Neon, Supabase, or local)
- **Canvas API Token** (for sync)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/ajslockin-lab/jarvis-canvas.git
cd jarvis-canvas

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# 4. Run database migrations
npx prisma migrate dev

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page.

---

## 📁 Project Structure

```
jarvis-canvas/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes (Canvas sync, voice, auth)
│   ├── dashboard/            # Main dashboard page
│   ├── extension/iframe/     # Extension overlay (loaded in iframe)
│   ├── landing/              # Public landing page
│   └── settings/             # User settings
├── components/
│   ├── extension/
│   │   └── ExtensionOverlay.tsx   # The sidebar overlay (calendar, deadlines, grades, voice)
│   ├── dashboard/            # Dashboard widgets
│   └── voice/                # Voice interface components
├── chrome-extension/         # Chrome Extension files
│   ├── contentScript.js      # Injected on Canvas pages
│   ├── manifest.json         # Manifest V3
│   └── styles.css            # Extension-specific styles
├── lib/                      # Utilities (Canvas API, NLU, voice)
├── prisma/                   # Database schema
└── types/                    # TypeScript type definitions
```

---

## 🔧 Environment Variables

Create a `.env.local` file:

```bash
# Database
DATABASE_URL="postgresql://..."

# NextAuth
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Canvas API
CANVAS_API_KEY="your-canvas-token"
CANVAS_DOMAIN="gavirtual.instructure.com"

# Optional: AI / Voice
OPENAI_API_KEY="sk-..."
```

---

## 🧩 Chrome Extension Setup

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `chrome-extension/` folder.
5. Visit any Canvas page → the 🤖 bubble appears in the bottom-right corner.

### How It Works

The content script (`contentScript.js`) injects a floating bubble onto Canvas pages. When clicked, it opens a transparent iframe pointing to `/extension/iframe?single=true`, which loads the `ExtensionOverlay` component.

Key permissions needed:
- `activeTab` — to detect Canvas pages
- `clipboard-write` / `clipboard-read` — for copy-to-clipboard features

---

## 🖥️ Extension Overlay

The overlay is a 420px sidebar that defaults to the **right edge** of the screen.

| Feature | Description |
|---------|-------------|
| **Calendar** | Toggleable month view. Click a date with a cyan dot to see that day's assignments. |
| **Upcoming Deadlines** | Auto-synced from Canvas, sorted by due date. Urgency color-coding. |
| **Grades** | Visual progress bars for each course. |
| **Voice** | Tap the mic, speak naturally. JARVIS processes commands via the `/api/voice/command` endpoint. |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16.2 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS 4 + shadcn/ui |
| **Database** | PostgreSQL via Prisma ORM |
| **Auth** | NextAuth.js |
| **Canvas API** | Custom REST client |
| **Voice** | Web Speech API (SpeechRecognition) |
| **Extension** | Chrome Manifest V3 |

---

## 🧪 Development

```bash
# Run dev server (with Turbopack)
npm run dev

# Run Prisma Studio (database GUI)
npx prisma studio

# Run linting
npm run lint

# Build for production
npm run build
```

---

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Commit your changes: `git commit -m "feat: add cool feature"`.
4. Push to the branch: `git push origin feature/my-feature`.
5. Open a Pull Request.

---

## 📝 License

[MIT](LICENSE) © 2026 JARVIS Team

---

## 🔗 Links

- [Live Demo](https://jarvis-canvas.vercel.app) *(coming soon)*
- [Canvas API Docs](https://canvas.instructure.com/doc/api/)
- [Next.js Docs](https://nextjs.org/docs)
