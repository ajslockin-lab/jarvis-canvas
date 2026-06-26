// ChatPage — standalone /chat page (Phase 1).
//
// Two-pane layout:
//   • Left sidebar: list of up to 5 chat sessions (newest first), with a
//     "New chat" button at the top and a hover-revealed delete (X) per row.
//   • Right main: chat bubbles for the active session, an empty-state when
//     there's no session yet, and a sticky composer at the bottom.
//
// Style follows the existing HUD theme — black background, red accent
// (#FF4444), Rajdhani / system-fallback fonts — so the page feels native to
// the rest of the app instead of bolted on.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, MessageSquare, Plus, Send, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  useChat,
  type ChatMessage,
  type ChatSession,
} from "@/hooks/use-chat";

export default function ChatPage() {
  const {
    sessions,
    activeSessionId,
    currentSession,
    isLoadingSessions,
    isLoadingCurrent,
    createSession,
    isCreating,
    deleteSession,
    sendMessage,
    isSending,
  } = useChat();

  // Local active-session override so clicking a sidebar entry feels instant
  // (the hook updates its own derived `activeSessionId` on cache refresh but
  // we want explicit control here).
  const [activeId, setActiveId] = useState<string | null>(null);
  const effectiveActiveId = activeId ?? activeSessionId ?? null;

  // Reset active id when sessions change shape (e.g. an eviction happens).
  useEffect(() => {
    if (!sessions.find((s) => s.id === effectiveActiveId)) {
      setActiveId(sessions[0]?.id ?? null);
    }
  }, [sessions, effectiveActiveId]);

  const handleNewChat = async () => {
    try {
      const { session } = await createSession();
      setActiveId(session.id);
    } catch {
      // Surface silently — UI shows no new session, error toast could come later.
      console.warn("Failed to create session");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this chat? Messages can't be recovered.")) return;
    await deleteSession(id);
    if (effectiveActiveId === id) setActiveId(null);
  };

  const handleSend = async (text: string) => {
    if (!effectiveActiveId || !text.trim() || isSending) return;
    try {
      await sendMessage(text);
    } catch (err) {
      console.warn("send failed:", err);
    }
  };

  return (
    <div className="carvis-chat min-h-screen flex flex-col bg-black text-white">
      {/* Top bar — gives users a way out and anchors the page identity */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#FF4444]/30 bg-black/80 backdrop-blur-sm sticky top-0 z-10">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
       </Link>
        <h1 className="font-rajdhani uppercase tracking-[0.2em] text-sm text-[#FF4444]">CARVIS Chat</h1>
        <div className="w-10" />
     </header>

      <div className="flex-1 flex min-h-0">
        <SessionSidebar
          sessions={sessions}
          activeId={effectiveActiveId}
          onClick={(id) => setActiveId(id)}
          onDelete={handleDelete}
          onNew={handleNewChat}
          isLoading={isLoadingSessions}
          isCreating={isCreating}
        />
        <ChatMain
          session={currentSession?.session ?? null}
          messages={currentSession?.messages ?? []}
          isLoading={isLoadingCurrent}
          isSending={isSending}
          onSend={handleSend}
          onNewChat={handleNewChat}
        />
     </div>
   </div>
  );
}

interface SessionSidebarProps {
  sessions: ChatSession[];
  activeId: string | null;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  isLoading: boolean;
  isCreating: boolean;
}

function SessionSidebar({
  sessions,
  activeId,
  onClick,
  onDelete,
  onNew,
  isLoading,
  isCreating,
}: SessionSidebarProps) {
  return (
    <aside className="hidden sm:flex w-64 shrink-0 flex-col border-r border-[#FF4444]/20 bg-black/40">
      <div className="p-3 border-b border-[#FF4444]/20">
        <Button
          variant="default"
          className="w-full bg-[#FF4444] hover:bg-[#FF6B3D] text-black font-rajdhani uppercase tracking-wide"
          onClick={onNew}
          disabled={isCreating}
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          New chat
       </Button>
     </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-xs text-white/40">Loading</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-xs text-white/40">
            No chats yet. Start one above.
         </div>
        ) : (
          <ul className="p-2 space-y-1">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                active={session.id === activeId}
                onClick={() => onClick(session.id)}
                onDelete={() => onDelete(session.id)}
              />
            ))}
         </ul>
        )}
     </ScrollArea>

      <div className="p-3 border-t border-[#FF4444]/20 text-[10px] text-white/40 uppercase tracking-widest">
        {sessions.length}/5 chats
     </div>
   </aside>
  );
}

function SessionRow({
  session,
  active,
  onClick,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const displayTitle = session.title || "New chat";
  const lastUpdated = useMemo(() => formatRelative(session.updatedAt), [session.updatedAt]);
  return (
    <li
      className={cn(
        "group rounded-md border transition px-3 py-2 cursor-pointer flex items-start justify-between gap-2",
        active
          ? "border-[#FF4444]/60 bg-[#FF4444]/10"
          : "border-transparent hover:border-[#FF4444]/30 hover:bg-white/5",
      )}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-sm font-rajdhani uppercase tracking-wide truncate",
          active ? "text-[#FF4444]" : "text-white/85",
        )}>{displayTitle}</p>
        <p className="text-[10px] text-white/40 mt-0.5">{lastUpdated}</p>
     </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-[#FF4444] transition"
        aria-label="Delete chat"
      >
        <Trash2 className="h-3.5 w-3.5" />
     </button>
   </li>
  );
}

interface ChatMainProps {
  session: ChatSession | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  onSend: (text: string) => void | Promise<void>;
  onNewChat: () => void;
}

function ChatMain({ session, messages, isLoading, isSending, onSend, onNewChat }: ChatMainProps) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest message whenever the list changes. We only
  // scroll when there are messages — otherwise an empty session would jitter
  // the composer around.
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setDraft("");
    void onSend(value);
  };

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF4444]" />
     </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {session?.title && (
            <h2 className="text-center font-rajdhani uppercase tracking-[0.2em] text-xs text-white/40">
              {session.title}
           </h2>
          )}
          {messages.length === 0 ? (
            <EmptyChat onNewChat={onNewChat} />
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} />)
          )}
          {isSending && <ThinkingBubble />}
          <div ref={bottomRef} />
       </div>
     </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[#FF4444]/30 bg-black/70 backdrop-blur-sm px-4 py-3"
      >
        <div className="mx-auto max-w-2xl flex items-center gap-2 border border-[#FF4444]/40 rounded-full px-4 py-2 bg-black/60 focus-within:border-[#FF4444] transition">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask Carvis anything — deadlines, reminders, study plan..."
            disabled={isSending}
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-white/30 text-white"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isSending || !draft.trim()}
            className="bg-[#FF4444] hover:bg-[#FF6B3D] text-black rounded-full h-8 w-8"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
         </Button>
       </div>
     </form>
   </main>
  );
}

function EmptyChat({ onNewChat }: { onNewChat: () => void }) {
  const starters = [
    "What's due this week?",
    "Help me plan a study session",
    "Note that the midterm covers chapters 4–8",
    "What's on my calendar tomorrow?",
  ];
  return (
    <div className="text-center py-12 space-y-6">
      <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-[#FF4444]/15 border border-[#FF4444]/40">
        <MessageSquare className="h-6 w-6 text-[#FF4444]" />
     </div>
      <div>
        <p className="font-rajdhani uppercase tracking-[0.2em] text-sm text-white/80">
          Start a new chat
       </p>
        <p className="text-xs text-white/40 mt-1">
          Carvis remembers up to your last 20 messages in each session.
       </p>
     </div>
      <div className="grid sm:grid-cols-2 gap-2 max-w-md mx-auto">
        {starters.map((text) => (
          <button
            key={text}
            type="button"
            className="text-left text-xs border border-[#FF4444]/30 hover:border-[#FF4444] hover:bg-[#FF4444]/5 transition rounded-md px-3 py-2 text-white/80"
            onClick={onNewChat}
          >
            {text}
         </button>
        ))}
     </div>
   </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
          isUser
            ? "bg-[#FF4444]/15 border border-[#FF4444]/40 text-white rounded-br-sm"
            : "bg-white/5 border border-white/10 text-white/90 rounded-bl-sm",
        )}
      >
        {message.message}
     </div>
   </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-white/60 flex items-center gap-2">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/40 animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40 animate-pulse [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40 animate-pulse [animation-delay:300ms]" />
       </span>
        thinking
     </div>
   </div>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (diffMs < 60_000) return rtf.format(0, "second");
  if (diffMs < 3_600_000) return rtf.format(-Math.round(diffMs / 60_000), "minute");
  if (diffMs < 86_400_000) return rtf.format(-Math.round(diffMs / 3_600_000), "hour");
  if (diffMs < 7 * 86_400_000) return rtf.format(-Math.round(diffMs / 86_400_000), "day");
  return new Date(iso).toLocaleDateString();
}
