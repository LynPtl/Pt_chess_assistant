import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRecent, pushRecent, RECENT_LIMIT } from "../src/history.mjs";

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

const FEN1 = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";
const FEN2 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("空仓库返回空数组", () => {
  assert.deepEqual(loadRecent(fakeStorage()), []);
});

test("pushRecent 把新条目放到最前面", () => {
  const storage = fakeStorage();
  pushRecent(storage, { fen: FEN1, source: "screenshot" });
  pushRecent(storage, { fen: FEN2, source: "fen" });
  const list = loadRecent(storage);
  assert.equal(list.length, 2);
  assert.equal(list[0].fen, FEN2);
  assert.equal(list[1].fen, FEN1);
  assert.equal(list[0].source, "fen");
  assert.ok(!Number.isNaN(Date.parse(list[0].ts)));
});

test("同一个局面重复识别只留一条（并提到最前）", () => {
  const storage = fakeStorage();
  pushRecent(storage, { fen: FEN1 });
  pushRecent(storage, { fen: FEN2 });
  pushRecent(storage, { fen: FEN1 });
  const list = loadRecent(storage);
  assert.equal(list.length, 2);
  assert.equal(list[0].fen, FEN1);
});

test("最多留 RECENT_LIMIT 条", () => {
  const storage = fakeStorage();
  for (let i = 0; i < RECENT_LIMIT + 5; i++) {
    pushRecent(storage, { fen: `${FEN1} #${i}` });
  }
  assert.equal(loadRecent(storage).length, RECENT_LIMIT);
});

test("存的东西坏掉时返回空数组，不抛错", () => {
  assert.deepEqual(loadRecent(fakeStorage({ "mychess-recent": "not json" })), []);
  assert.deepEqual(loadRecent(fakeStorage({ "mychess-recent": JSON.stringify({ a: 1 }) })), []);
  assert.deepEqual(loadRecent(fakeStorage({ "mychess-recent": JSON.stringify([{ nope: 1 }, { fen: FEN1 }]) })).length, 1);
});

test("localStorage 不可用时不炸", () => {
  const broken = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  };
  assert.deepEqual(loadRecent(broken), []);
  assert.doesNotThrow(() => pushRecent(broken, { fen: FEN1 }));
});
