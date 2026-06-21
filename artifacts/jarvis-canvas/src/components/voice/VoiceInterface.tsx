import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X, Mic, Send } from "lucide-react";
import CarvisOrb from "./CarvisOrb";
import type { OrbState } from "@/lib/carvisOrb";

interface VoiceInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional text pre-fill. When provided, the text input is shown
   *  immediately with this value — used by the FirstRunNudge chips to make
   *  the magic-moment tap → answer path a single click. */
  defaultQuery?: string;
  /** When false (the default), the text input is the primary interaction
   *  surface and the press-and-hold voice button is hidden. Voice becomes
   *  opt-in to avoid the 30-50% bounce rate from premature mic permission
   *  prompts (NN/g voice UX research). */
  voiceModeEnabled?: boolean;
  /** Fired the first time the user submits a question in this session —
   *  used by the dashboard to fire the first_question_asked activation event
   *  exactly once. */
  onFirstSubmit?: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function getOrbState(isListening: boolean, isLoading: boolean, isTtsPlaying: boolean): OrbState {
  if (isLoading) return "thinking";
  if (isTtsPlaying) return "speaking";
  if (isListening) return "listening";
  return "idle";
}

function getStatusText(
  speechSupported: boolean,
  isListening: boolean,
  isLoading: boolean,
  isTtsPlaying: boolean,
  ttsEnabled: boolean,
): string {
  if (!speechSupported) return "speech not supported";
  if (!ttsEnabled) return "muted";
  if (isLoading) return "thinking...";
  if (isTtsPlaying) return "";
  if (isListening) return "listening...";
  return "press and hold to speak";
}

export default function VoiceInterface({
  isOpen,
  onClose,
  defaultQuery,
  voiceModeEnabled = false,
  onFirstSubmit,
}: VoiceInterfaceProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speechSupported] = useState(() => Boolean(getSpeechRecognition()));
  // Text-input state — the primary first-time interaction path. Hydrated
  // from defaultQuery when the modal opens (e.g. from a FirstRunNudge chip).
  const [textInput, setTextInput] = useState<string>(defaultQuery ?? "");
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const displayTranscriptRef = useRef("");
  const shouldSubmitRef = useRef(false);

  // Hydrate the text input whenever the modal opens with a fresh defaultQuery.
  // Without this, reopening the modal would show a stale value.
  useEffect(() => {
    if (isOpen) {
      setTextInput(defaultQuery ?? "");
    }
  }, [isOpen, defaultQuery]);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onstart = () => setIsTtsPlaying(true);
    utterance.onend = () => setIsTtsPlaying(false);
    utterance.onerror = () => setIsTtsPlaying(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopTts = useCallback(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsTtsPlaying(false);
    }
  }, []);

  const submitCommand = useCallback(async (text: string) => {
    const cleanText = text.trim().replace(/\s+/g, " ");
    if (!cleanText || isLoading) return;

    setTranscript(cleanText);
    setIsLoading(true);
    if (!hasSubmittedOnce) {
      setHasSubmittedOnce(true);
      // Fire exactly once per session. The dashboard's onFirstSubmit handler
      // is responsible for not double-firing across remounts.
      onFirstSubmit?.();
    }
    try {
      const res = await fetch("/api/voice/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: cleanText }),
      });
      const data = await res.json();
      const nextResponse = data.response || "I heard you, but I do not have a response yet.";
      setResponse(nextResponse);
      if (ttsEnabled) speak(nextResponse);
    } catch {
      const fallback = "Sorry, I could not process that. Please try again.";
      setResponse(fallback);
      if (ttsEnabled) speak(fallback);
    } finally {
      setIsLoading(false);
    }
  }, [hasSubmittedOnce, isLoading, onFirstSubmit, speak, ttsEnabled]);

  // Text-submit handler for the primary first-time UX. Mirrors the press-and-hold
  // submit path but reads from a controlled input instead of the recognition
  // transcript.
  const handleTextSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const value = textInput.trim();
    if (!value || isLoading) return;
    // Clear the input on submit so the next prompt is clean. The transcript
    // panel still shows the question we just asked.
    setTextInput("");
    void submitCommand(value);
  }, [isLoading, submitCommand, textInput]);

  useEffect(() => {
    const SpeechRecognitionAPI = getSpeechRecognition();
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const phrase = result[0]?.transcript?.trim();
        if (!phrase) continue;
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${phrase}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${phrase}`.trim();
        }
      }
      const displayText = `${finalTranscriptRef.current} ${interimTranscript}`.trim();
      displayTranscriptRef.current = displayText;
      setTranscript(displayText);
    };

    recognition.onerror = () => {
      shouldSubmitRef.current = false;
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!shouldSubmitRef.current) return;
      shouldSubmitRef.current = false;
      void submitCommand(finalTranscriptRef.current || displayTranscriptRef.current);
    };

    recognitionRef.current = recognition;
    return () => { recognitionRef.current = null; };
  }, [submitCommand]);

  const startListening = () => {
    if (!recognitionRef.current || isLoading || isListening || !speechSupported) return;
    stopTts();
    finalTranscriptRef.current = "";
    displayTranscriptRef.current = "";
    shouldSubmitRef.current = false;
    setTranscript("");
    setResponse("");
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current || !isListening) return;
    shouldSubmitRef.current = true;
    recognitionRef.current.stop();
  };

  if (!isOpen) return null;

  const orbState = getOrbState(isListening, isLoading, isTtsPlaying);
  // Status text adapts to which input mode is active. When voice is off we
  // don't say "press and hold" — that hint is wrong for the text-first flow.
  const statusText = voiceModeEnabled
    ? getStatusText(speechSupported, isListening, isLoading, isTtsPlaying, ttsEnabled)
    : isLoading
      ? "thinking..."
      : isTtsPlaying
        ? ""
        : "type a question — press enter to send";
  // Press-and-hold overlay only enabled when voice mode is on AND the
  // browser exposes a SpeechRecognition implementation. Otherwise the text
  // input is the only path — Firefox and other unsupported browsers
  // shouldn't see a broken mic button (NN/g voice UX).
  const voiceButtonEnabled = voiceModeEnabled && speechSupported;

  return (
    <div className="carvis-voice fixed inset-0 z-50 overflow-hidden bg-black">
      <CarvisOrb state={orbState} />

      <img
        src="/carvis-logo.png"
        alt="CARVIS"
        className="absolute left-4 top-4 z-20 max-h-10 max-w-[140px] object-contain opacity-85"
      />

      <div className="carvis-controls absolute right-4 top-4 z-20 flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (ttsEnabled) stopTts();
            setTtsEnabled((e) => !e);
          }}
          className={`carvis-control-btn ${!ttsEnabled ? "muted" : ""}`}
          aria-label={ttsEnabled ? "Turn voice playback off" : "Turn voice playback on"}
        >
          {ttsEnabled ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="carvis-control-btn"
          aria-label="Close voice interface"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/*
        Press-and-hold layer is only rendered when voice mode is enabled.
        Wrapped in a fragment + guard so the overlay does not intercept
        pointer events on the text input below.
      */}
      {voiceButtonEnabled && (
        <button
          type="button"
          className="absolute inset-0 z-10 touch-none"
          aria-label="Press and hold to speak"
          onPointerDown={startListening}
          onPointerUp={stopListening}
          onPointerCancel={stopListening}
          onPointerLeave={stopListening}
          disabled={isLoading}
        />
      )}

      {(transcript || response) && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 w-full max-w-lg -translate-x-1/2 px-6">
          {transcript && (
            <p className="carvis-transcript mb-2 text-center text-sm">{transcript}</p>
          )}
          {response && (
            <p className="carvis-response text-center text-sm">{response}</p>
          )}
        </div>
      )}

      {/*
        Primary text input. Always rendered — this is the first-time UX path.
        z-30 sits above the press-and-hold layer (z-10) so users can click
        into the field even when voice mode is on, and below the corner
        controls (z-20) is intentional so the close button stays accessible.
        Wait — controls are also z-20, so the input needs z-30 to be on top
        of them in the bottom area; the input is at the bottom-center
        though, so it doesn't overlap the controls visually. Keep z-30 for
        safety in case of layout shifts on small screens.
      */}
      <form
        onSubmit={handleTextSubmit}
        className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2 w-full max-w-xl px-6"
      >
        <div className="flex items-center gap-2 bg-black/60 border border-[#FF4444]/40 rounded-full px-4 py-2 backdrop-blur-sm focus-within:border-[#FF4444] transition">
          {voiceButtonEnabled && (
            <Mic
              className={`w-4 h-4 shrink-0 ${
                isListening ? "text-[#FF4444] hud-sync-active" : "text-[rgba(245,245,245,0.5)]"
              }`}
            />
          )}
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={
              voiceButtonEnabled
                ? "type or hold to speak…"
                : "what's due this week?"
            }
            disabled={isLoading}
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-[#f5f5f5] font-rajdhani text-sm placeholder:text-[rgba(245,245,245,0.35)]"
          />
          <button
            type="submit"
            disabled={isLoading || !textInput.trim()}
            className="text-[#FF4444] hover:text-[#FF6B3D] disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0"
            aria-label="Send question"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      <div className="carvis-status pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2">
        {statusText}
      </div>
      <div className="carvis-label pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
        CARVIS
      </div>
    </div>
  );
}
