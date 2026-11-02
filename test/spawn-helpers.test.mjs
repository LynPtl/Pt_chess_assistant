import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { launchProcess, openInBrowser } from "../src/spawn-helpers.mjs";

function fakeSpawn() {
  const calls = [];
  const child = new EventEmitter();
  child.unref = () => {
    child.unrefCalled = true;
  };
  const spawnImpl = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return child;
  };
  return { calls, child, spawnImpl };
}

test("launchProcess 传参不拼 shell，路径原样进入 args 数组", () => {
  const { calls, spawnImpl } = fakeSpawn();
  launchProcess("C:\\Program Files\\En Croissant\\en-croissant.exe", ["C:\\tmp\\a b\\position.pgn"], spawnImpl);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["C:\\tmp\\a b\\position.pgn"]);
  assert.equal(calls[0].options.shell, undefined);
});

test("launchProcess 隐藏子进程窗口并脱离父进程", () => {
  const { calls, child, spawnImpl } = fakeSpawn();
  launchProcess("x.exe", ["p.pgn"], spawnImpl);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(child.unrefCalled, true);
});

test("spawn 抛错时 launchProcess 把它抛回给调用方", () => {
  const boom = () => {
    throw new Error("EACCES");
  };
  assert.throws(() => launchProcess("x.exe", [], boom), /EACCES/);
});

test("子进程异步 error 事件不会让进程崩掉", () => {
  const { child, spawnImpl } = fakeSpawn();
  launchProcess("x.exe", [], spawnImpl);
  // No listener would make this an unhandled 'error' event and exit the process.
  assert.doesNotThrow(() => child.emit("error", new Error("ENOENT")));
});

test("openInBrowser 在 Windows 上走 cmd start", () => {
  const { calls, spawnImpl } = fakeSpawn();
  openInBrowser("http://127.0.0.1:8787/", "win32", spawnImpl);
  assert.equal(calls[0].cmd, "cmd");
  assert.deepEqual(calls[0].args, ["/c", "start", "", "http://127.0.0.1:8787/"]);
});

test("openInBrowser 在 darwin 上走 open", () => {
  const { calls, spawnImpl } = fakeSpawn();
  openInBrowser("http://127.0.0.1:8787/", "darwin", spawnImpl);
  assert.equal(calls[0].cmd, "open");
});

test("openInBrowser 在 linux 上走 xdg-open", () => {
  const { calls, spawnImpl } = fakeSpawn();
  openInBrowser("http://127.0.0.1:8787/", "linux", spawnImpl);
  assert.equal(calls[0].cmd, "xdg-open");
});

test("openInBrowser 的命令不存在时不会崩", () => {
  const spawnImpl = () => {
    throw new Error("ENOENT");
  };
  assert.doesNotThrow(() => openInBrowser("http://127.0.0.1:8787/", "linux", spawnImpl));
});

test("describeListenError 把 EADDRINUSE 说成人话", async () => {
  const { describeListenError } = await import("../src/spawn-helpers.mjs");
  const msg = describeListenError({ code: "EADDRINUSE" }, 8787);
  assert.match(msg, /8787/);
  assert.match(msg, /占用|已经在跑/);
});

test("describeListenError 对其它错误保留原始信息", async () => {
  const { describeListenError } = await import("../src/spawn-helpers.mjs");
  const msg = describeListenError({ code: "EACCES", message: "permission denied" }, 8787);
  assert.match(msg, /permission denied/);
});
