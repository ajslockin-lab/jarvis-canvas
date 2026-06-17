// JARVIS Canvas Extension - Content Script
(function() {
  "use strict";
  if (document.getElementById("jarvis-bubble")) return;

  const APP_HOST = "http://localhost:3000";

  // Bubble
  const bubble = document.createElement("div");
  bubble.id = "jarvis-bubble";
  bubble.innerHTML = "<span style='font-size:20px'>🤖</span>";
  bubble.title = "Open JARVIS";
  document.body.appendChild(bubble);

  let overlay = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let overlayStartX = 0;
  let overlayStartY = 0;

  function openOverlay() {
    if (overlay) return;
    overlay = document.createElement("iframe");
    overlay.id = "jarvis-overlay";
    overlay.src = APP_HOST + "/extension/iframe?single=true";
    overlay.allow = "microphone; clipboard-write; clipboard-read";
    document.body.appendChild(overlay);
    window.addEventListener("message", handleMessage);
  }

  function closeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    window.removeEventListener("message", handleMessage);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  function handleMessage(event) {
    if (event.origin !== APP_HOST) return;
    if (event.data === "jarvis-close") closeOverlay();
    if (event.data === "jarvis-start-drag") {
      isDragging = true;
      dragStartX = event.data.clientX;
      dragStartY = event.data.clientY;
      const rect = overlay.getBoundingClientRect();
      overlayStartX = rect.left;
      overlayStartY = rect.top;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
  }

  function onMouseMove(e) {
    if (!isDragging || !overlay) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    overlay.style.left = overlayStartX + dx + "px";
    overlay.style.top = overlayStartY + dy + "px";
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  bubble.addEventListener("click", () => {
    if (overlay) closeOverlay();
    else openOverlay();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay) closeOverlay();
  });

  console.log("[JARVIS] Extension loaded on Canvas");
})();
