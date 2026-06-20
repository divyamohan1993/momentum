"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Mode = "capture" | "ask";

export default function CaptureBar({
  brain,
  onDone,
  onAsk,
}: {
  brain: boolean;
  onDone: (msg?: string) => void;
  onAsk: (answer: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("capture");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<unknown>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(160, ta.scrollHeight) + "px";
    }
  }, [text]);

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (mode === "capture") {
        const r = await api.capture(value);
        setText("");
        onDone(r.degraded ? `Added ${r.count} (brain offline — check dates)` : `✓ Added ${r.count} card${r.count > 1 ? "s" : ""}`);
      } else {
        const r = await api.ask(value);
        setText("");
        onAsk(r.degraded ? "The brain is offline right now — try the board directly." : r.answer);
        const applied = r.outcomes.filter((o) => o.status === "applied" || o.status === "created").length;
        onDone(applied ? `✓ ${applied} change${applied > 1 ? "s" : ""} applied` : undefined);
      }
    } catch {
      onDone("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => unknown; SpeechRecognition?: new () => unknown });
    const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition;
    if (!Ctor) {
      onDone("In-browser mic unsupported — use Win+H voice typing, then Enter");
      return;
    }
    if (listening) {
      (recRef.current as { stop?: () => void })?.stop?.();
      return;
    }
    const rec = new Ctor() as {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      start: () => void;
    };
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i]![0]!.transcript;
      setText(s);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div className="glass mt-4 rounded-2xl p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Toggle active={mode === "capture"} onClick={() => setMode("capture")} label="✏️ Capture" />
        <Toggle active={mode === "ask"} onClick={() => setMode("ask")} label="💬 Ask" disabled={!brain} />
        <div className="ml-auto hidden text-xs text-[var(--color-faint)] sm:block">
          {mode === "capture" ? "Brain-dump everything — it splits, dates & ranks it." : "Ask: \"what's next?\", \"what's blocked?\", \"move this week's work to today\"."}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <button
          onClick={toggleMic}
          aria-label="Dictate"
          className={`focus-ring grid h-11 w-11 flex-none place-items-center rounded-xl transition ${
            listening ? "bg-[var(--color-magenta)] text-black" : "hairline text-[var(--color-mute)] hover:text-[var(--color-ink)]"
          }`}
          title="Dictate (or use Win+H)"
        >
          {listening ? <span className="animate-pulse">●</span> : "🎤"}
        </button>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={mode === "capture" ? "finish the IICA deck tomorrow, fix the citation bug, call mom Sunday…" : "what should I do next? what's blocked? plan my week…"}
          className="focus-ring min-h-[2.75rem] flex-1 resize-none rounded-xl border border-[var(--color-edge)] bg-[var(--color-haze)] px-4 py-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)] outline-none"
        />
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="lift focus-ring btn-primary h-11 flex-none rounded-xl px-5 font-semibold disabled:opacity-40"
        >
          {busy ? "…" : mode === "capture" ? "Add" : "Run"}
        </button>
      </div>
    </div>
  );
}

function Toggle({ active, onClick, label, disabled }: { active: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-30 ${
        active ? "bg-[var(--color-signal)]/15 text-[var(--color-signal)]" : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
      }`}
    >
      {label}
    </button>
  );
}
