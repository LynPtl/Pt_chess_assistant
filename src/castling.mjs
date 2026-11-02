/** Castling rights, per side, with the one extra signal a screenshot carries.
 *
 *  A right is lost when the king or that rook has moved — history the picture
 *  does not hold. Two things narrow the guess:
 *
 *   1. Geometry: the king must still stand on its home square, and the rook on
 *      the corner it would castle with. No other placement can support a right.
 *   2. The last-move highlight: if the tinted squares include the king's home
 *      square or a corner rook's, that piece just moved, so the right it would
 *      have granted is gone.
 *
 *  Both are still guesses, so the UI defaults to them and lets the user click
 *  either way. `letters` is what the position can support (an explicit "有"),
 *  `defaultLetters` is what we suggest.
 */

const HOME = {
  w: { king: 60, short: 63, long: 56, kingName: "e1", shortName: "h1", longName: "a1" },
  b: { king: 4, short: 7, long: 0, kingName: "e8", shortName: "h8", longName: "a8" },
};

function expand(placement) {
  const cells = [];
  for (const rank of placement.split("/")) {
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") {
        for (let i = 0; i < Number(ch); i++) cells.push("");
      } else {
        cells.push(ch);
      }
    }
  }
  return cells.length === 64 ? cells : null;
}

/**
 * @param {string} placement FEN board field (already oriented white-at-bottom)
 * @param {"w"|"b"} side
 * @param {number[]} highlighted indices from findHighlights, a8..h1
 */
export function castlingOptions(placement, side, highlighted = []) {
  const home = HOME[side];
  const cells = expand(placement);
  const king = side === "w" ? "K" : "k";
  const rook = side === "w" ? "R" : "r";
  const shortLetter = side === "w" ? "K" : "k";
  const longLetter = side === "w" ? "Q" : "q";
  const none = { letters: "-", canHave: false, defaultLetters: "-" };

  if (!cells) return { ...none, reason: "摆位无法解析" };

  if (cells[home.king] !== king) {
    return { ...none, reason: `王不在 ${home.kingName}` };
  }

  const shortOk = cells[home.short] === rook;
  const longOk = cells[home.long] === rook;
  if (!shortOk && !longOk) {
    return { ...none, reason: `王在 ${home.kingName}，但两个车都不在角上` };
  }

  const letters = `${shortOk ? shortLetter : ""}${longOk ? longLetter : ""}`;

  const kingTouched = highlighted.includes(home.king);
  const shortTouched = highlighted.includes(home.short);
  const longTouched = highlighted.includes(home.long);

  let defaultLetters = letters;
  let reason;
  if (kingTouched) {
    defaultLetters = "-";
    reason = `上一步动过王（${home.kingName}），两侧易位权都已失效`;
  } else if (shortTouched && longTouched) {
    defaultLetters = "-";
    reason = `上一步动过两个角上的车（${home.shortName}/${home.longName}）`;
  } else if (shortTouched) {
    defaultLetters = longOk ? longLetter : "-";
    reason = `上一步动过 ${home.shortName} 的车，短易位权已失效`;
  } else if (longTouched) {
    defaultLetters = shortOk ? shortLetter : "-";
    reason = `上一步动过 ${home.longName} 的车，长易位权已失效`;
  } else {
    reason = `王和车都在原位（${home.kingName}/${home.shortName}/${home.longName}）`;
  }

  return {
    letters,
    canHave: true,
    defaultLetters: defaultLetters === "" ? "-" : defaultLetters,
    reason,
  };
}

/**
 * Resolve the two sides into FEN letters, honouring the user's per-side choice.
 * @param {"auto"|"on"|"off"} choices.w  auto = use the inference
 */
export function resolveRights(placement, highlighted, choices = {}) {
  const out = {};
  for (const side of ["w", "b"]) {
    const options = castlingOptions(placement, side, highlighted);
    const choice = choices?.[side] ?? "auto";
    if (choice === "off") out[side] = "-";
    else if (choice === "on") out[side] = options.canHave ? options.letters : "-";
    else out[side] = options.defaultLetters;
  }
  return out;
}

/**
 * What the two buttons should look like for one side.
 *
 * The inference mark belongs *inside* the option it selected, not beside the
 * group: 「有 KQ 推断」 tells you both what we suggest and why it is a guess,
 * in the place you click.
 *
 * @returns {{onSelected:boolean, offSelected:boolean, badge:"on"|"off"|null,
 *            letters:string, canHave:boolean, reason:string}}
 */
export function describeChoice(options, choice = "auto") {
  const inferred = options.defaultLetters !== "-";
  const letters = inferred ? options.defaultLetters.replace(/-/g, "") : "";
  const onSelected = choice === "off" ? false : choice === "on" ? options.canHave : inferred;
  return {
    onSelected,
    offSelected: !onSelected,
    badge: choice === "auto" ? (inferred ? "on" : "off") : null,
    letters: onSelected ? (choice === "on" ? options.letters : letters) : "",
    canHave: options.canHave,
    reason: options.reason,
  };
}
