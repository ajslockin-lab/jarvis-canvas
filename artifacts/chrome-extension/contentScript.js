// CARVIS Canvas Extension — content script bridge for overlay + page control
(function () {
  "use strict";

  const BUBBLE_ID = "carvis-bubble";
  const OVERLAY_ID = "carvis-overlay";
  const DEFAULT_APP_URL = "http://localhost:20034";
  const ELEMENT_ATTR = "data-carvis-id";
  const MAX_ELEMENTS = 250;

  if (document.getElementById(BUBBLE_ID)) return;

  let overlay = null;
  let appOrigin = DEFAULT_APP_URL;

  function getAppUrl(cb) {
    if (typeof chrome !== "undefined" && chrome.storage?.sync) {
      chrome.storage.sync.get(["appUrl"], (result) => {
        cb((result.appUrl || DEFAULT_APP_URL).replace(/\/$/, ""));
      });
      return;
    }
    cb(DEFAULT_APP_URL);
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  function collectPageElements() {
    const elements = [];
    const selector = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      "nav a",
      "#global_nav a",
      ".ic-app-header__main-navigation a",
    ].join(", ");

    let index = 0;
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue;
      if (!isVisible(el)) continue;

      const id = el.getAttribute(ELEMENT_ATTR) || `carvis-el-${index++}`;
      el.setAttribute(ELEMENT_ATTR, id);

      const tag = el.tagName.toLowerCase();
      const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
      const href = el.getAttribute("href") || undefined;
      if (!text && !href && !el.getAttribute("aria-label") && !el.getAttribute("placeholder")) continue;

      elements.push({
        id,
        tag,
        text,
        ariaLabel: el.getAttribute("aria-label") || undefined,
        placeholder: el.getAttribute("placeholder") || undefined,
        href,
      });

      if (elements.length >= MAX_ELEMENTS) break;
    }

    return elements;
  }

  function executeAction(action) {
    if (!action || !action.type) return;

    switch (action.type) {
      case "scroll": {
        const delta = action.direction === "up" ? -500 : 500;
        window.scrollBy({ top: delta, behavior: "smooth" });
        break;
      }
      case "navigate": {
        if (action.url) window.location.assign(action.url);
        break;
      }
      case "click": {
        const target = document.querySelector(`[${ELEMENT_ATTR}="${action.elementId}"]`);
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
          target.click();
        }
        break;
      }
      case "fill": {
        const input = document.querySelector(`[${ELEMENT_ATTR}="${action.elementId}"]`);
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
          input.focus();
          input.value = action.value || "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        break;
      }
      default:
        break;
    }
  }

  function isAllowedOrigin(origin) {
    try {
      const allowed = new URL(appOrigin).origin;
      return origin === allowed || origin === window.location.origin;
    } catch {
      return false;
    }
  }

  function sendContext(source, origin) {
    source.postMessage(
      {
        type: "jarvis-context",
        url: window.location.href,
        title: document.title,
        elements: collectPageElements(),
      },
      origin
    );
  }

  function handleMessage(event) {
    if (!overlay || event.source !== overlay.contentWindow) return;
    if (!isAllowedOrigin(event.origin)) return;

    const data = event.data || {};

    if (data.type === "jarvis-get-context") {
      sendContext(event.source, event.origin);
      return;
    }

    if (data.type === "jarvis-action" && data.action) {
      executeAction(data.action);
      return;
    }

    if (data.type === "carvis-store-session" && data.sessionToken) {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ sessionToken: data.sessionToken });
      }
      return;
    }

    if (data.type === "jarvis-close") {
      closeOverlay();
    }
  }

  function openOverlay() {
    if (overlay) return;

    const mount = (sessionToken) => {
      overlay = document.createElement("iframe");
      overlay.id = OVERLAY_ID;
      const qs = sessionToken ? `?session_token=${encodeURIComponent(sessionToken)}` : "";
      overlay.src = `${appOrigin}/extension/iframe${qs}`;
      overlay.allow = "microphone; clipboard-write; clipboard-read";
      overlay.setAttribute("title", "CARVIS Assistant");
      document.body.appendChild(overlay);

      const bubble = document.getElementById(BUBBLE_ID);
      if (bubble) bubble.style.display = "none";

      window.addEventListener("message", handleMessage);
    };

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(["sessionToken"], (result) => {
        mount(result.sessionToken || null);
      });
      return;
    }

    mount(null);
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    window.removeEventListener("message", handleMessage);

    const bubble = document.getElementById(BUBBLE_ID);
    if (bubble) bubble.style.display = "flex";
  }

  function toggleOverlay() {
    if (overlay) closeOverlay();
    else openOverlay();
  }

  // Floating bubble
  const bubble = document.createElement("button");
  bubble.id = BUBBLE_ID;
  bubble.type = "button";
  bubble.title = "Open CARVIS";
  bubble.setAttribute("aria-label", "Open CARVIS assistant");
  bubble.innerHTML = '<span class="carvis-bubble-mark">C</span>';
  bubble.addEventListener("click", toggleOverlay);
  document.body.appendChild(bubble);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay) closeOverlay();
  });

  getAppUrl((url) => {
    appOrigin = url;
    console.log("[CARVIS] Extension ready — app URL:", appOrigin);
  });
})();
