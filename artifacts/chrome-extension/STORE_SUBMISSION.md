# Chrome Web Store Submission Guide

## What you need to submit

### 1. Zip the extension
```bash
cd artifacts/chrome-extension
zip -r ../carvis-extension.zip . -x "*.md"
```

### 2. Chrome Web Store Developer Account
- Go to https://chrome.google.com/webstore/devconsole
- Sign in with your Google account
- Pay the one-time **$5 registration fee**

### 3. Store Listing Info

**Name:** CARVIS Canvas Assistant

**Short Description (132 chars max):**
AI assistant for Canvas LMS — deadlines, grades, voice commands, and page control right inside your school's Canvas.

**Detailed Description:**
CARVIS is an AI-powered assistant that lives right inside your Canvas LMS. Click the floating red button on any Canvas page to:

📋 **Intel Feed** — See upcoming deadlines, overdue assignments, and grades at a glance
🗣️ **Voice Agent** — Use natural voice commands like "scroll down", "open assignments", or "what's my grade in Biology?"
🤖 **Page Control** — The AI agent can click buttons, navigate pages, and fill in forms for you on Canvas
📊 **Data Dashboard** — Quick access to all your grades and course data

No admin approval needed — works with any Canvas student account. Just connect with a Personal Access Token and CARVIS pulls your courses, assignments, and grades automatically.

🔒 Your token is encrypted and never shared. CARVIS only reads your Canvas data — it never modifies anything.

**Category:** Productivity

**Language:** English

### 4. Screenshots (1280x800 or 640x400, PNG or JPEG)
Take screenshots of:
1. The CARVIS bubble on a Canvas page
2. The Intel tab showing assignments/deadlines
3. The Agent tab with a voice command
4. The Data tab with grades

### 5. Icons
Already in `artifacts/chrome-extension/icons/` — 128x128 is the store icon.

### 6. Privacy Policy URL
You need a privacy policy. A simple one is at the bottom of this file — host it on your site and put the URL in the store listing.

### 7. Single Purpose Statement (required by Chrome Web Store)
"This extension adds an AI assistant overlay to Canvas LMS pages. It provides students with deadline tracking, grade monitoring, voice commands, and page navigation assistance. The extension only operates on *.instructure.com pages and only reads Canvas data the user has granted access to."

---

## Privacy Policy (host this at carvis.app/privacy)

```
CARVIS Privacy Policy

Last updated: June 2026

CARVIS ("we", "us") is committed to protecting your privacy.

DATA WE COLLECT
- Your Canvas Personal Access Token is encrypted (AES-256-GCM) and stored securely. We never share it.
- Course data, assignments, and grades are fetched from your Canvas account and stored to provide our services.
- Voice commands are processed locally in your browser using the Web Speech API. We do not record or store audio.

DATA WE DO NOT COLLECT
- We do not sell, share, or transmit your Canvas data to third parties.
- We do not track your browsing history outside of Canvas pages.
- We do not serve ads or use analytics tracking.

DATA RETENTION
- Your encrypted token is retained until you delete your account.
- You can request deletion of all your data at any time by contacting us.

SECURITY
- All Canvas tokens are encrypted with AES-256-GCM before storage.
- All sessions use secure, HTTP-only cookies.
- API communication uses HTTPS in production.

THIRD-PARTY SERVICES
- Optional: Groq AI for enhanced voice responses (only if API key is configured by user)
- Optional: ElevenLabs for text-to-speech (only for desktop variant)

CONTACT
Questions? Reach us at the CARVIS support page.

CHANGES
We may update this policy. Major changes will be notified through the app.
```
