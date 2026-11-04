/** Everything the page asks the local server to do.
 *
 *  Pulled out of main.js so the request shapes are testable without a browser:
 *  a wrong field name here is the kind of bug that shows up as "送入没反应" in
 *  production and nowhere in a unit test.
 */

const CLOSE_FIRST_KEY = "mychess-close-first";

export function createService({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage } = {}) {
  async function refreshHealth() {
    try {
      return await (await fetchImpl("/healthz")).json();
    } catch (err) {
      return { configured: false, reason: `连不上本地服务：${err.message}` };
    }
  }

  /** En Croissant 的单实例保护实测无效（第二次启动会留下第二个进程），而深链只认
   *  chess.com/lichess 的 URL，没法把局面交给已开着的窗口。所以给一个可选的
   *  "先关掉旧窗口"——默认关，用户勾过就一直记住。 */
  function closeFirst() {
    try {
      return storage?.getItem(CLOSE_FIRST_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setCloseFirst(value) {
    try {
      storage?.setItem(CLOSE_FIRST_KEY, value ? "1" : "0");
    } catch {
      /* 隐私模式下写不进去，忽略 */
    }
  }

  async function post(path, body) {
    const options = body === undefined
      ? { method: "POST" }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const response = await fetchImpl(path, options);
    return await response.json();
  }

  return {
    refreshHealth,
    closeFirst,
    setCloseFirst,
    shutdown: () => post("/shutdown"),
    open: () => post("/open"),
    handoff: (position) => post("/handoff", { closeFirst: closeFirst(), ...position }),
  };
}
