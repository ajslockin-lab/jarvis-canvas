# CARVIS Chrome Extension

Injects a floating bubble on Canvas (`*.instructure.com`) that opens the CARVIS overlay and bridges page control to the agent.

## Install (development)

1. Start the app: from repo root run `pnpm dev` (web on port **20034** by default).
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select this folder: `artifacts/chrome-extension`
5. Open your school's Canvas site — you should see a red **C** bubble bottom-right.

## First use

1. Click the bubble to open CARVIS.
2. If you see **CARVIS OFFLINE**, click **CONNECT CANVAS** and sign in (same flow as the main app).
3. Use **INTEL**, **AGENT**, or **DATA** tabs. Agent commands like "scroll down", "open assignments", or "open grades" control the Canvas page you're on.

## Custom app URL

Default overlay URL is `http://localhost:20034`. To point at a deployed host, open the extension service worker storage or run in the Canvas page console:

```js
chrome.storage.sync.set({ appUrl: "https://your-carvis-host.example" });
```

Reload the Canvas tab after changing.

## Message bridge

The content script implements the protocol expected by `ExtensionOverlay`:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `jarvis-get-context` | iframe → parent | Request page URL, title, interactive elements |
| `jarvis-context` | parent → iframe | Page snapshot for the agent |
| `jarvis-action` | iframe → parent | Execute scroll / click / fill / navigate |
| `jarvis-close` | iframe → parent | Close overlay (Escape also closes) |

## Notes

- **Microphone**: Agent voice uses Web Speech API inside the iframe; allow mic when prompted.
- **CSP**: Some Canvas pages may restrict embedding external iframes. If the overlay is blank, check the browser console on the Canvas tab.
- **Icons**: Place `icon48.png` and `icon128.png` in `icons/` or remove the `icons` block from `manifest.json` for local dev.
