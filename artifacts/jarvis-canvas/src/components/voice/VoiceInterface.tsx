import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import CarvisOrb from "./CarvisOrb";
import type { OrbState } from "@/lib/carvisOrb";

interface VoiceInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function VoiceInterface({ isOpen, onClose }: VoiceInterfaceProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speechSupported] = useState(() => Boolean(getSpeechRecognition()));
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const displayTranscriptRef = useRef("");
  const shouldSubmitRef = useRef(false);

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
  }, [isLoading, speak, ttsEnabled]);

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
  const statusText = getStatusText(speechSupported, isListening, isLoading, isTtsPlaying, ttsEnabled);

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

      <button
        type="button"
        className="absolute inset-0 z-10 touch-none"
        aria-label="Press and hold to speak"
        onPointerDown={startListening}
        onPointerUp={stopListening}
        onPointerCancel={stopListening}
        onPointerLeave={stopListening}
        disabled={isLoading || !speechSupported}
      />

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

      <div className="carvis-status pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2">
        {statusText}
      </div>
      <div className="carvis-label pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
        CARVIS
      </div>
    </div>
  );
}
