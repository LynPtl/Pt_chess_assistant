import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const DEFAULT_CONFIG = {
  enCroissantPath: "",
  port: 8787,
  pgnTempDir: "",
  logPath: "logs/recognitions.jsonl",
};

/** Resolve a possibly-relative config path against the config file's own
 *  directory, so a config.json stays usable no matter where it is copied. */
function toAbsolute(value, baseDir) {
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

export function loadConfig(configPath = "config.json") {
  const file = resolve(configPath);
  const baseDir = dirname(file);

  let raw = {};
  if (existsSync(file)) {
    const text = readFileSync(file, "utf8");
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new Error(`无法解析配置文件 ${file}: ${err.message}`);
    }
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`配置文件 ${file} 必须是一个 JSON 对象`);
  }

  const merged = { ...DEFAULT_CONFIG, ...raw };

  // The classic Windows trap: JSON reads a backslash before n as a newline,
  // so a backslash-separated path silently becomes garbage and the exe turns up
  // "missing". Say so, instead of reporting an unconfigured path.
  if (typeof merged.enCroissantPath === "string" && /[\u0000-\u001f]/.test(merged.enCroissantPath)) {
    throw new Error(
      `配置文件 ${file} 的 enCroissantPath 含有换行或制表符 —— JSON 会把反斜杠加 n 当成转义。` +
        `请改用正斜杠，例如 "C:/Program Files/En Croissant/en-croissant.exe"，或者把每个反斜杠写成两个。`,
    );
  }

  return {
    enCroissantPath: typeof merged.enCroissantPath === "string" ? merged.enCroissantPath : "",
    port: typeof merged.port === "number" ? merged.port : DEFAULT_CONFIG.port,
    pgnTempDir:
      typeof merged.pgnTempDir === "string" && merged.pgnTempDir.trim() !== ""
        ? toAbsolute(merged.pgnTempDir, baseDir)
        : join(tmpdir(), "mychess-paste"),
    logPath: toAbsolute(
      typeof merged.logPath === "string" && merged.logPath.trim() !== ""
        ? merged.logPath
        : DEFAULT_CONFIG.logPath,
      baseDir,
    ),
  };
}
