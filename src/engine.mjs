/** 浏览器里的 Stockfish（WASM），只给静态版用。
 *
 *  为什么是 "lite"：完整 NNUE 版的 wasm 有 94.6MB，超过 Cloudflare Pages 单文件
 *  25MiB 的上限；lite-single 只有 1.8MB，能在任何静态托管上跑，也不需要
 *  COOP/COEP（单线程）。代价是**没有神经网络评估**，比本地 Stockfish 弱不少 ——
 *  界面上必须如实说明，否则等于骗人。
 *
 *  许可：npm 包 `stockfish` 是 GPL-3.0。本项目代码是 MIT（可以并入 GPL 作品），
 *  但部署出去的静态站点整体要按 GPL-3 对待，见 README 的许可一节。
 */

import { Chess } from "chess.js";

const LABELS = /^info\s/;

/**
 * 解析一行 UCI info。
 * @returns {{depth:number, multipv:number, cp:number|null, mate:number|null, pv:string[]}|null}
 */
export function parseInfoLine(line) {
  if (typeof line !== "string" || !LABELS.test(line)) return null;
  const tokens = line.trim().split(/\s+/);
  const pvAt = tokens.indexOf("pv");
  if (pvAt === -1) return null;

  const value = (key) => {
    const i = tokens.indexOf(key);
    return i === -1 ? null : Number(tokens[i + 1]);
  };

  const scoreAt = tokens.indexOf("score");
  let cp = null;
  let mate = null;
  if (scoreAt !== -1) {
    const kind = tokens[scoreAt + 1];
    const amount = Number(tokens[scoreAt + 2]);
    if (kind === "cp") cp = amount;
    else if (kind === "mate") mate = amount;
  }

  return {
    depth: value("depth") ?? 0,
    multipv: value("multipv") ?? 1,
    cp,
    mate,
    pv: tokens.slice(pvAt + 1),
  };
}

/** 白方视角的分数：+0.42 / -1.20 / #3。 */
export function formatScore({ cp, mate }) {
  if (typeof mate === "number") return mate > 0 ? `#${mate}` : `#${mate}`;
  if (typeof cp !== "number") return "—";
  const pawns = cp / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(2)}`;
}

/** UCI 着法序列 → 正规记谱。遇到不合法的着法就停在最后一个合法的。 */
export function pvToSan(fen, moves, limit = 8) {
  if (!Array.isArray(moves) || moves.length === 0) return [];
  const game = new Chess(fen);
  const out = [];
  for (const uci of moves.slice(0, limit)) {
    try {
      out.push(game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined }).san);
    } catch {
      break;
    }
  }
  return out;
}

/**
 * UCI over a Web Worker。
 *
 * @param {object} deps
 * @param {() => Worker} deps.createWorker  每次分析时按需创建（懒加载 wasm）
 * @param {(state:object) => void} deps.onUpdate  每次收到 info / 状态变化时回调
 */
export function createEngine({ createWorker, onUpdate = () => {} }) {
  let worker = null;
  let current = null;
  const lines = new Map();

  function reset(fen) {
    current = fen;
    lines.clear();
  }

  function publish(extra = {}) {
    onUpdate({
      fen: current,
      lines: [...lines.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([multipv, line]) => ({ multipv, ...line })),
      ...extra,
    });
  }

  function handle(line) {
    if (typeof line !== "string") return;
    if (line.startsWith("readyok")) {
      worker.postMessage("ucinewgame");
      worker.postMessage(`position fen ${current}`);
      worker.postMessage("go depth 14");
      publish({ running: true });
      return;
    }
    if (line.startsWith("bestmove")) {
      publish({ running: false });
      return;
    }
    const info = parseInfoLine(line);
    if (!info) return;
    lines.set(info.multipv, info);
    publish({ running: true });
  }

  return {
    /** 开始分析某个局面。重复调用会先停掉上一次。 */
    analyse(fen, { multipv = 3, depth = 14 } = {}) {
      this.stop();
      reset(fen);
      publish({ running: true, lines: [] });
      worker = createWorker();
      worker.onmessage = (event) => handle(typeof event.data === "string" ? event.data : event.data?.data);
      worker.onerror = (event) => {
        // Worker 里的异常在 message 里往往只有 "[object Object]"，真正的信息在 error
        const detail =
          event?.error?.message ??
          event?.message ??
          (typeof event?.error === "string" ? event.error : null) ??
          "引擎启动失败";
        publish({ running: false, error: `引擎出错：${detail}` });
      };
      worker.postMessage("uci");
      worker.postMessage(`setoption name MultiPV value ${multipv}`);
      worker.postMessage("isready");
      this.depth = depth;
    },

    stop() {
      if (!worker) return;
      try {
        worker.postMessage("stop");
        worker.terminate();
      } catch {
        /* 已经死了就算了 */
      }
      worker = null;
      publish({ running: false });
    },
  };
}
