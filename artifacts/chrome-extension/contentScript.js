// CARVIS Canvas Extension — content script bridge for overlay + page control
(function () {
  "use strict";

  const BUBBLE_ID = "carvis-bubble";
  const OVERLAY_ID = "carvis-overlay";
  const DEFAULT_APP_URL = "https://carvis.app";
  const ELEMENT_ATTR = "data-carvis-id";
  const MAX_ELEMENTS = 250;

  if (document.getElementById(BUBBLE_ID)) return;

  let overlay = null;
  let observer = null;
  let moTimer = null;
  let appOrigin = DEFAULT_APP_URL;

  function getAppUrl(cb) {
    if (typeof chrome !== "undefined" && chrome.storage?.sync) {
      chrome.storage.sync.get(["appUrl"], (result) => {
        const raw = (result.appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
        // Defense-in-depth: chrome.storage.sync is user-writable via the
        // extension popup, so a user (or a script that gets chrome.storage
        // access) could set a hostile appUrl. Refuse anything that isn't
        // https:// so we never mount an iframe over plaintext or to a
        // javascript: / data: / file:// origin.
        try {
          const u = new URL(raw);
          if (u.protocol !== "https:") {
            console.warn("[CARVIS] Refusing non-https appUrl:", raw);
            cb(DEFAULT_APP_URL);
            return;
          }
        } catch {
          cb(DEFAULT_APP_URL);
          return;
        }
        cb(raw);
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
      "[role="tab"]",
      "[role="treeitem"]",
      "[aria-expanded]",
      "[aria-controls]",
      "[data-module-id]",
      ".context_module",
      ".module-url",
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
        role: el.getAttribute("role") || undefined,
        ariaExpanded: el.getAttribute("aria-expanded") || undefined,
        dataModuleId: el.getAttribute("data-module-id") || undefined,
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
      case "keypress": {
        const t = document.querySelector(`[${ELEMENT_ATTR}="${action.elementId}"]`);
        if (t instanceof HTMLElement) {
          t.focus();
          const k = action.key || "";
          t.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
          t.dispatchEvent(new KeyboardEvent("keypress", { key: k, bubbles: true }));
          t.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true }));
        }
        break;
      }
      case "select": {
        const sel0 = document.querySelector(`[${ELEMENT_ATTR}="${action.elementId}"]`);
        if (sel0 instanceof HTMLSelectElement) {
          sel0.value = action.value || "";
          sel0.dispatchEvent(new Event("change", { bubbles: true }));
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

    if (data.type === "jarvis-read-element" && data.elementId) {
      const el = document.querySelector(`[${ELEMENT_ATTR}="${data.elementId}"]`);
      const payload = { type: "jarvis-read-element-result", elementId: data.elementId, found: !!el };
      if (el instanceof HTMLElement) {
        payload.tag = el.tagName.toLowerCase();
        payload.text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 4000);
        payload.html = el.innerHTML.slice(0, 8000);
        payload.attrs = {};
        for (const a of el.attributes) payload.attrs[a.name] = a.value;
      }
      event.source.postMessage(payload, event.origin);
      return;
    }

    if (data.type === "jarvis-read-selection") {
      const sel = (typeof window.getSelection === "function") ? String(window.getSelection() || "") : "";
      event.source.postMessage({ type: "jarvis-read-selection-result", text: sel }, event.origin);
      return;
    }

    if (data.type === "jarvis-close") {
      closeOverlay();
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (moTimer) return;
      moTimer = setTimeout(() => {
        moTimer = null;
        if (overlay && overlay.contentWindow) {
          overlay.contentWindow.postMessage(
            { type: "jarvis-context-delta", url: window.location.href, title: document.title },
            appOrigin
          );
        }
      }, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded", "aria-selected", "class"] });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    if (moTimer) { clearTimeout(moTimer); moTimer = null; }
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
        startObserver();
      });
      return;
    }

    mount(null);
    startObserver();
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    window.removeEventListener("message", handleMessage);

    const bubble = document.getElementById(BUBBLE_ID);
    if (bubble) bubble.style.display = "flex";
    stopObserver();
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
  });
})();
