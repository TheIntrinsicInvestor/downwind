"use client";

import { useEffect, useState } from "react";

type Turn = { q: string; a: string };

// The app shows the Ask tab only when the provider's chatEnabled is true; this panel keeps its own check as a second guard.
export default function ChatPanel({ date }: { date: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/chat").then((r) => r.json()).then((j) => setEnabled(Boolean(j.enabled))).catch(() => setEnabled(false));
  }, []);

  if (enabled === null) return <p className="py-2 text-sm text-ink-2">Checking chat</p>;
  if (!enabled) return <p className="py-2 text-sm text-ink-2">Chat is switched off on the public site.</p>;

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, question: q }) });
      const j = await res.json();
      setTurns((t) => [...t, { q, a: j.answer ?? j.error ?? "No answer." }]);
      setQuestion("");
    } catch {
      setTurns((t) => [...t, { q, a: "The chat service could not be reached." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-[13px]">
      <p className="text-xs text-ink-3">Answers come only from this day&apos;s computed data; every number is checked.</p>
      <div className="mt-3 divide-y divide-rule">
        {turns.map((t, i) => (
          <div key={i} className="py-3">
            <p className="font-medium text-ink">{t.q}</p>
            <p className="mt-1 whitespace-pre-line leading-relaxed text-ink-2">{t.a}</p>
          </div>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What if we can only reach five fires?"
          className="focus-ring min-h-11 min-w-0 flex-1 border border-ink/55 bg-bg px-3 text-sm text-ink placeholder:text-ink-3"
        />
        <button type="submit" disabled={busy}
          className="focus-ring min-h-11 bg-ink px-4 text-[13px] font-semibold text-bg transition-colors hover:bg-ink-2 disabled:opacity-50">
          {busy ? "Thinking" : "Ask"}
        </button>
      </form>
    </div>
  );
}
