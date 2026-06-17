# JARVIS Chrome Extension

## How to Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **"Developer mode"** (toggle top-right)
3. Click **"Load unpacked"**
4. Select this `chrome-extension` folder
5. Visit [gavirtual.instructure.com](https://gavirtual.instructure.com) — the JARVIS bubble will appear bottom-right

## Usage

- **Click the bubble** → Opens the transparent glass overlay
- **Click the X or press Escape** → Closes the overlay
- **Shift + J** → Toggle the overlay (keyboard shortcut)
- **Tap the mic** → Voice command JARVIS to ask about assignments

## Files

- `manifest.json` — Extension manifest (Manifest V3)
- `contentScript.js` — Injects the floating bubble and overlay iframe
- `styles.css` — Bubble animation and overlay styles
- `icon128.png` — Extension icon (placeholder, replace with real icon)

## Development

- The overlay content is served from `http://localhost:3000/extension/iframe`
- Make sure the Next.js dev server is running: `npm run dev`
- The extension points to `localhost` for development; update `contentScript.js` for production
