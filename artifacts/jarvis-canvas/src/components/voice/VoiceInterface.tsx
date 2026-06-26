import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X, Mic, Send, Loader2 } from "lucide-react";
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
  // Mobile flag — set on mount via media query and used to suppress
  // autoFocus so the soft keyboard doesn't pop the moment the orb opens.
  const [isMobile, setIsMobile] = useState(false);
  // Audio analyser for the orb's audio-reactive branch (bass/mid feeding
  // outward push + sine pulse). Set lazily on the first user gesture in
  // startListening(), not on mount, because an AudioContext created outside
  // a user gesture is blocked by autoplay policy and will run in a suspended
  // state forever. Null = orb runs without audio reactivity (still renders,
  // just no bass/mid flow).
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const displayTranscriptRef = useRef("");
  const shouldSubmitRef = useRef(false);
  // Long-lived mic stream + AudioContext refs. Kept across remounts so we
  // only prompt for mic permission once per session even if the user closes
  // and reopens the modal. Released in the cleanup effect on full unmount.
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Hydrate the text input whenever the modal opens with a fresh defaultQuery.
  // Without this, reopening the modal would show a stale value.
  useEffect(() => {
    if (isOpen) {
      setTextInput(defaultQuery ?? "");
    }
  }, [isOpen, defaultQuery]);

  // Esc-to-close. Skipped while the text input is focused AND something is
  // being typed — autoFocus on desktop would otherwise yank the keyboard
  // away mid-word. We only close when the input is empty or blurred.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isTypingInField =
        tag === "INPUT" || tag === "TEXTAREA";
      const inputHasContent = (document.activeElement as HTMLInputElement | null)?.value?.length;
      // Only swallow Escape when nothing is being typed — otherwise respect
      // native input-escape behavior (which clears some mobile keyboards).
      if (!isTypingInField || !inputHasContent) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Detect mobile so we can avoid autoFocus (mobile keyboards pop open
  // immediately on focus and ruin the cinematic-orb first impression).
  // On desktop we keep autoFocus so power-users land cursor-in-input.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMobile(window.matchMedia("(max-width: 640px)").matches);
  }, []);

  // Release the mic + AudioContext on full unmount. The modal opens/closes
  // via the isOpen prop without unmounting, so the stream outlives a single
  // session and we only revoke on actual destruction. Tracks.stop() is the
  // canonical way to release the OS-level mic so the browser's permission
  // indicator turns off. Safe to call repeatedly — guards on null.
  useEffect(() => {
    return () => {
      const stream = audioStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      const node = analyserRef.current;
      if (node) {
        try { node.disconnect(); } catch { /* already disconnected */ }
        analyserRef.current = null;
      }
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => undefined);
        audioCtxRef.current = null;
      }
      setAnalyser(null);
    };
  }, []);

  // Lazy audio-context acquisition. Mirrors the gesture-based constraint
  // Chrome imposes: AudioContext must be created (or resumed) inside a user
  // gesture, otherwise it stays in `suspended` state and getByteFrequencyData
  // returns all-zero arrays forever. Called from startListening() — pointer
  // down counts as a gesture. Idempotent: returns the cached node if we
  // already have one.
  const ensureAnalyser = useCallback(async (): Promise<AnalyserNode | null> => {
    if (analyserRef.current) return analyserRef.current;
    if (typeof navigator === "undefined") return null;
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Disable processing the SpeechRecognition engine already handles
          // so we don't double-apply the noise gate and distort the FFT.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      audioStreamRef.current = stream;
      // Use webkit-prefixed constructor for Safari.
      const AudioCtor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      if (!AudioCtor) return null;
      const ctx = new AudioCtor();
      audioCtxRef.current = ctx;
      // Safari ships AudioContext in `suspended` state until a user gesture
      // resumes it; Chrome starts `running` since we created it inside one.
      // resume() is idempotent and safe to call regardless of state.
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createAnalyser();
      // Small FFT keeps the cost down — 64 bins matches the orb's existing
      // bass/mid split (bins 0-7 bass, 8-23 mid).
      node.fftSize = 128;
      node.smoothingTimeConstant = 0.6;
      source.connect(node);
      // Deliberately NOT connecting node -> ctx.destination: no echo. The
      // analyser reads samples without routing them to speakers.
      analyserRef.current = node;
      setAnalyser(node);
      return node;
    } catch {
      // Permission denied, no mic, or the gesture was rejected — fall back
      // to no analyser so the orb still renders (just without audio react).
      return null;
    }
  }, []);

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
    // Fire-and-forget: we want the orb to react to the mic as soon as the
    // user holds the button. Errors here are non-fatal (try/catch is inside
    // ensureAnalyser) and the SpeechRecognition path still works without it.
    void ensureAnalyser();
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
    <div
      className={`carvis-voice fixed inset-0 z-50 overflow-hidden ${
        isListening ? "is-listening " : ""
      }${isLoading ? "is-loading " : ""}${!hasSubmittedOnce ? "first-time " : ""}`}
    >
      <CarvisOrb state={orbState} analyser={analyser} />

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
          // tabIndex=-1 keeps the full-screen capture layer out of the tab
          // order — otherwise Tab gets trapped on this invisible button and
          // users can never reach the close or text-input controls.
          tabIndex={-1}
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
            <p className="carvis-transcript mb-2 text-center text-sm" aria-live="polite" aria-atomic="true">{transcript}</p>
          )}
          {response && (
            <p className="carvis-response text-center text-sm" aria-live="polite" aria-atomic="true">{response}</p>
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
            autoFocus={!isMobile}
            className="flex-1 bg-transparent border-none outline-none text-[#f5f5f5] font-rajdhani text-sm placeholder:text-[rgba(245,245,245,0.35)]"
          />
          <button
            type="submit"
            hidden={isLoading}
            disabled={!textInput.trim()}
            className="text-[#FF4444] hover:text-[#FF6B3D] disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0"
            aria-label="Send question"
          >
            <Send className="w-4 h-4" />
         </button>
          {/* Loader2 lives OUTSIDE the submit button on purpose — the button has
              hidden={isLoading} which renders as display:none, which would
              also hide any descendant. As a sibling it can show. CSS handles
              toggling it: default display:none; .is-loading on the parent
              root promotes it to display:inline-block. */}
          <Loader2
            className="carvis-loading-spinner w-4 h-4 text-[#FF6B3D] animate-spin"
            aria-label="Waiting for response"
          />
       </div>
     </form>

      <div className="carvis-empty-hint" aria-hidden="true">try: "what's due this week?"</div>
      <div
        className="carvis-status pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2" role="status" aria-live="polite">
        {statusText}
      </div>
      <div className="carvis-label pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
        CARVIS
     </div>
    </div>
  );
}
