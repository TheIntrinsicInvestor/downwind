import { afterEach, expect, test, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
import { GET, POST } from "./route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("GET reports chat switched off without a key", async () => {
  vi.stubEnv("NEBIUS_API_KEY", "");
  const res = await GET();
  expect(await res.json()).toEqual({ enabled: false });
});

test("POST without a key returns 503 and makes no outbound request", async () => {
  vi.stubEnv("NEBIUS_API_KEY", "");
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const res = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ date: "2026-09-20", question: "hi" }) }));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ enabled: false });
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("POST rejects a malformed date", async () => {
  vi.stubEnv("NEBIUS_API_KEY", "x");
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const res = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ date: "../secrets", question: "hi" }) }));
  expect(res.status).toBe(400);
  expect(fetchSpy).not.toHaveBeenCalled();
});


test("128 concurrent malformed chat requests return 400 without reaching the provider", async () => {
  vi.stubEnv("NEBIUS_API_KEY", "sandbox-only");
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const bodies = [null, { date: "2026-09-20", question: 8 }, { date: ["2026-09-20"], question: "hi" }, {"question":[]}, {}];
  const statuses = await Promise.all(Array.from({length:128}, async (_, i) => {
    try {
      return (await POST(new Request("http://localhost/api/chat", {method: "POST", body: JSON.stringify(bodies[i % bodies.length])}))).status;
    } catch {
      return "uncaught";
    }
  }));
  expect(upstream).not.toHaveBeenCalled();
  expect(statuses.every(s => s === 400)).toBe(true);
});

test("client cancellation aborts a stalled provider call without retrying", async () => {
  vi.stubEnv("NEBIUS_API_KEY", "sandbox-only");
  const client = new AbortController();
  const upstream = vi.fn(async (_url: string, init: RequestInit) => {
    client.abort();
    expect(init.signal?.aborted).toBe(true);
    init.signal?.throwIfAborted();
    throw new Error("Provider request was not cancelled");
  });
  vi.stubGlobal("fetch", upstream);
  const res = await POST(new Request("http://localhost/api/chat", {
    method: "POST", signal: client.signal,
    body: JSON.stringify({ date: "2026-09-20", question: "What is the outlook?" }),
  }));
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(upstream.mock.calls[0][1].signal?.aborted).toBe(true);
  expect((await res.json()).answer).toContain("computed data");
});
