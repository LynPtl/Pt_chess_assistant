import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.mjs";

function fakeFetch(responses = {}) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? "GET", body: options.body ? JSON.parse(options.body) : null });
    const body = responses[url] ?? { ok: true };
    return { ok: true, json: async () => body };
  };
  return { calls, impl };
}

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = String(v);
    },
    read: (k) => store[k],
  };
}

test("refreshHealth 读 /healthz", async () => {
  const { calls, impl } = fakeFetch({ "/healthz": { configured: true, reason: "" } });
  const service = createService({ fetchImpl: impl });
  const health = await service.refreshHealth();
  assert.deepEqual(health, { configured: true, reason: "" });
  assert.equal(calls[0].url, "/healthz");
});

test("refreshHealth 连不上时给出可读原因，不抛错", async () => {
  const service = createService({
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  const health = await service.refreshHealth();
  assert.equal(health.configured, false);
  assert.match(health.reason, /ECONNREFUSED/);
});

test("handoff 带上 fen 与元数据，并且把 closeFirst 传下去", async () => {
  const { calls, impl } = fakeFetch({ "/handoff": { ok: true, pgnPath: "x" } });
  const storage = fakeStorage({ "mychess-close-first": "1" });
  const service = createService({ fetchImpl: impl, storage });

  const result = await service.handoff({
    fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
    turn: "w",
    castlingMode: { w: "auto", b: "off" },
    flipped: false,
    meanConfidence: 0.95,
    minConfidence: 0.76,
    reliable: true,
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, "/handoff");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body.closeFirst, true);
  assert.equal(calls[0].body.reliable, true);
  assert.deepEqual(calls[0].body.castlingMode, { w: "auto", b: "off" });
});

test("closeFirst 默认关闭，勾过就记住", () => {
  const storage = fakeStorage();
  const service = createService({ fetchImpl: async () => ({ json: async () => ({}) }), storage });
  assert.equal(service.closeFirst(), false);
  service.setCloseFirst(true);
  assert.equal(service.closeFirst(), true);
  assert.equal(storage.read("mychess-close-first"), "1");
});

test("localStorage 不可用时不炸", () => {
  const service = createService({
    fetchImpl: async () => ({ json: async () => ({}) }),
    storage: {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    },
  });
  assert.equal(service.closeFirst(), false);
  assert.doesNotThrow(() => service.setCloseFirst(true));
});

test("shutdown 和 open 打的是 POST", async () => {
  const { calls, impl } = fakeFetch();
  const service = createService({ fetchImpl: impl });
  await service.shutdown();
  await service.open();
  assert.deepEqual(calls.map((c) => [c.url, c.method]), [["/shutdown", "POST"], ["/open", "POST"]]);
});
