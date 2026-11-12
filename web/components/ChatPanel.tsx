"use client";

import { useEffect, useState } from "react";

type Turn = { q: string; a: string };

export default function ChatPanel({ date }: { date: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/chat").then((r) => r.json()).then((j) => setEnabled(Boolean(j.enabled))).catch(() => setEnabled(false));
  }, []);

  if (enabled === null) return <p className="px-4 py-6 text-sm text-stone-600">Checking chat</p>;
  if (!enabled) return <p className="px-4 py-6 text-sm text-stone-600">Chat is switched off on the public site.</p>;

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
    <div className="px-4 py-4 text-sm">
      <p className="text-xs text-stone-500">Answers come only from this day&apos;s computed data; every number is checked.</p>
      <div className="mt-3 space-y-3">
        {turns.map((t, i) => (
          <div key={i}>
            <p className="font-medium text-stone-900">{t.q}</p>
            <p className="mt-1 whitespace-pre-line text-stone-800">{t.a}</p>
          </div>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What if we can only reach five fires?"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1"
        />
        <button type="submit" disabled={busy} className="rounded-md bg-stone-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? "Thinking" : "Ask"}
        </button>
      </form>
    </div>
  );
}
