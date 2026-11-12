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
