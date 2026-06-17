import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Volume2, VolumeX, X } from "lucide-react";
import Waveform from "./Waveform";

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

export default function VoiceInterface({ isOpen, onClose }: VoiceInterfaceProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speechSupported] = useState(() => Boolean(getSpeechRecognition()));
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    if (!recognitionRef.current || isLoading || isListening) return;
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050A10]/95 p-6 backdrop-blur-xl">
      <div className="hud-scanline" />

      <button
        onClick={onClose}
        className="hud-gear absolute right-6 top-6 rounded-lg border border-[#00B4FF]/20 p-3 text-[#7d99aa] transition hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
        aria-label="Close voice interface"
      >
        <X className="h-5 w-5" />
      </button>

      <button
        onClick={() => { if (ttsEnabled) stopTts(); setTtsEnabled((e) => !e); }}
        className="hud-gear absolute left-6 top-6 rounded-lg border border-[#00B4FF]/20 p-3 text-[#7d99aa] transition hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
        aria-label={ttsEnabled ? "Turn voice playback off" : "Turn voice playback on"}
      >
        {ttsEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </button>

      <div className="relative z-10 flex w-full max-w-2xl flex-1 flex-col items-center justify-center">
        <div className="hud-section-header mb-4 w-full">
          <span className="font-orbitron text-[10px] tracking-[0.2em] text-[#7d99aa]">VOICE INTERFACE</span>
        </div>

        <div className="mb-8">
          <Waveform isActive={isListening || isTtsPlaying || isLoading} canvasRef={canvasRef} />
        </div>

        <button
          onPointerDown={startListening}
          onPointerUp={stopListening}
          onPointerCancel={stopListening}
          onPointerLeave={stopListening}
          disabled={isLoading || !speechSupported}
          className={`arc-reactor-btn flex h-28 w-28 touch-none items-center justify-center transition-all duration-300 ${isListening ? "!border-[#FF9500]/50 !bg-[#FF9500]/10 shadow-[0_0_40px_rgba(255,149,0,0.22)]" : ""} ${isLoading || !speechSupported ? "!border-[#5a7a8a]/30 !bg-[#0A1520]/50 opacity-70" : ""}`}
        >
          <Mic className={`h-10 w-10 ${isListening ? "text-[#FF9500]" : "text-[#00E5FF]"}`} />
        </button>

        <p className="font-mono-data mt-5 text-[11px] tracking-wide text-[#7d99aa]">
          {!speechSupported ? "SPEECH RECOGNITION IS NOT SUPPORTED" : isListening ? "LISTENING - RELEASE TO SEND" : isLoading ? "PROCESSING" : "PRESS AND HOLD TO SPEAK"}
        </p>

        {transcript && (
          <div className="mt-8 w-full">
            <p className="font-orbitron mb-2 text-[10px] tracking-[0.2em] text-[#7d99aa]">INPUT</p>
            <div className="rounded-lg border border-[#00B4FF]/15 bg-[#0A1520]/70 p-4">
              <p className="font-rajdhani text-sm leading-relaxed text-[#e8f4f8]">{transcript}</p>
            </div>
          </div>
        )}

        {response && (
          <div className="mt-4 w-full">
            <p className="font-orbitron mb-2 text-[10px] tracking-[0.2em] text-[#00B4FF]">JARVIS</p>
            <div className="rounded-lg border border-[#00B4FF]/20 bg-[#0A1520]/70 p-4">
              <p className="font-rajdhani text-sm leading-relaxed text-[#e8f4f8]">{response}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
