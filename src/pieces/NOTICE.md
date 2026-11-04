# 棋子素材来源

`spatial/*.svg` —— **Spatial** 棋集，作者 [Maurizio Monge](https://github.com/maurimo/chess-art)，
许可 **MIT**。

取自 [lichess-org/lila](https://github.com/lichess-org/lila) 的 `public/piece/spatial`，
许可信息见 lila 的 `COPYING.md`：

> public/piece/spatial | Maurizio Monge | MIT

文件未做修改。许可与本仓库代码一致，可一并按 MIT 分发。

## 想换棋集？

任何一套 12 个 SVG（`wK/wQ/wR/wB/wN/wP/bK/bQ/bR/bB/bN/bP.svg`）都能直接用：
放到 `src/pieces/<名字>/`，然后改 `src/piece-urls.mjs` 里的 import 路径即可。

lila 里另外几套宽松许可的：

| 棋集 | 许可 |
|---|---|
| `rhosgfx` | CC0 1.0（公共领域） |
| `celtic` / `fantasy` | MIT |
| `chessnut` | Apache 2.0 |
| `kiwen-suwi` / `totoy` / `Firi` | CC BY 4.0 |

⚠️ lila 里 `maestro` / `staunty` / `fresca` / `horsey` 等是 **CC BY-NC-SA**（非商业 + 相同方式共享），
开源项目别用。
