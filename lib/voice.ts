// Wispr AI + Web Speech API wrappers

/**
 * Initialize Wispr AI (if available) or Web Speech API for speech-to-text.
 * Falls back to Web Speech API if Wispr is not loaded.
 */
export function createWisprRecognizer(): any {
  // Check if Wispr is available globally
  const wispr = (window as any).Wispr?.SpeechRecognizer;
  if (wispr) {
    return new wispr();
  }
  return null;
}

/**
 * Create a Web Speech API recognition instance.
 */
export function createWebSpeechRecognizer(): any {
  const SpeechRecognitionAPI =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionAPI) return null;

  const recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  return recognition;
}

/**
 * Text-to-Speech wrapper using Web Speech API.
 */
export function speak(text: string, onStart?: () => void, onEnd?: () => void): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  // Cancel any existing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;

  utterance.onstart = () => {
    onStart?.();
  };

  utterance.onend = () => {
    onEnd?.();
  };

  utterance.onerror = () => {
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any ongoing text-to-speech.
 */
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Check if the browser supports speech recognition.
 */
export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
}

/**
 * Check if the browser supports speech synthesis (TTS).
 */
export function isTTSSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}
