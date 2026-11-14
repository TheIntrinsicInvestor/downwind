// Ask-Downwind chat. Local only: enabled only when NEBIUS_API_KEY is in this process's environment
// (scripts/dev-chat.ps1). The public site has no key, so GET says disabled and POST returns 503.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { connection } from "next/server";
import { offending } from "@/lib/numbers";
import { type Day, roundPct } from "@/lib/replay";

const BASE_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";
const CHAT_MODELS = ["MiniMaxAI/MiniMax-M3", "deepseek-ai/DeepSeek-V4-Pro-0813"];
const FALLBACK = "I can only answer from this day's computed data, and that answer did not pass the number check.";
const SYSTEM = "You answer questions from a provincial fire task force in West Kalimantan using only the facts given " +
  "for one morning. Every number you write must appear in the facts exactly; write numbers as digits, no rounding, " +
  "no number words at all (no seven, million, half or twice). Do not name companies. Fires are locations only. Be brief: at most 120 words, plain English, " +
  "no em dashes. If the facts cannot answer the question, say so.";

function key(): string | undefined {
  return process.env.NEBIUS_API_KEY || undefined;
}

export async function GET() {
  await connection();                       // decide per request, never at build time
  return Response.json({ enabled: Boolean(key()) });
}

function facts(day: Day) {
  const ranked = day.fires.filter((f) => f.rank !== null).sort((a, b) => (a.rank as number) - (b.rank as number)).slice(0, 20);
  return {
    date: day.date, fires_date: day.fires_date, window_hours: day.hours, radius_km: 40, top_list_size: 10,
    counts: day.counts, top10_share_pct: roundPct(day.top10_share),
    fires: ranked.map((f) => ({ rank: f.rank, near: f.place, share_pct: roundPct(f.share ?? 0, 1),
      people_40km: f.people_40km, heading: f.heading, first_arrival_h: f.first_arrival_h,
      top_places: f.top_places?.map((p) => ({ name: p.name, share_pct: roundPct(p.share) })) ?? null })),
    places: day.places.slice(0, 15).map((p) => ({ name: p.name,
      top_sources: p.contributions.slice(0, 3).map((c) => ({ near: day.fires[c.fire].place, rank: day.fires[c.fire].rank,
        share_pct: roundPct(c.share), first_arrival_h: c.first_arrival_h })) })),
    limits: "This is a ranking index, not a forecast of smoke concentration. People outside Indonesia are not counted.",
  };
}

async function callLLM(apiKey: string, messages: { role: string; content: string }[], signal: AbortSignal): Promise<string | null> {
  for (let i = 0; i < 4 && !signal.aborted; i++) {
    const model = CHAT_MODELS[i % CHAT_MODELS.length];
    try {
      const res = await fetch(BASE_URL, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: 4000, temperature: 0.3 }),
      });
      if (res.ok) {
        const j = await res.json();
        const text: string = j?.choices?.[0]?.message?.content ?? "";
        if (text.trim()) return text.trim();
      }
    } catch {
      // network failure: try the next model
    }
    if (i < 3) await delay(3000, undefined, { signal }).catch(() => undefined);
  }
  return null;
}

export async function POST(req: Request) {
  const apiKey = key();
  if (!apiKey) return Response.json({ enabled: false }, { status: 503 });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("date" in body) || !("question" in body) ||
      typeof body.date !== "string" || typeof body.question !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !body.question.slice(0, 500).trim()) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const date = body.date;
  const question = body.question.slice(0, 500);
  let day: Day;
  try {
    day = JSON.parse(await readFile(path.join(process.cwd(), "public", "replay", `${date}.json`), "utf-8"));
  } catch {
    return Response.json({ error: `No replay data for ${date}` }, { status: 404 });
  }
  const f = facts(day);
  const messages = [{ role: "system", content: SYSTEM },
    { role: "user", content: `Facts:\n${JSON.stringify(f)}\n\nQuestion: ${question}` }];
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(20_000)]);
  for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
    const text = await callLLM(apiKey, messages, signal);
    if (text && offending(text, f).length === 0 && !/[—–]/.test(text)) return Response.json({ answer: text });
  }
  return Response.json({ answer: FALLBACK });
}
