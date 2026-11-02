import { spawn as nodeSpawn } from "node:child_process";

/** Start a detached child and forget about it.
 *
 *  `args` is always an array and there is no shell, so a path with spaces or
 *  CJK characters (the normal case on Windows) can never be re-split.
 *  `windowsHide` stops a console window from flashing on every handoff, and the
 *  error listener stops an asynchronous ENOENT from taking the server down.
 *  A synchronous throw (EACCES, ENOEXEC) is re-thrown so the caller can tell the
 *  user why the handoff failed.
 */
export function launchProcess(command, args, spawnImpl = nodeSpawn) {
  const child = spawnImpl(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {
    /* nothing to do: the caller already reported the handoff as sent */
  });
  child.unref();
  return child;
}

export function openInBrowser(url, platform = process.platform, spawnImpl = nodeSpawn) {
  const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    launchProcess(command, args, spawnImpl);
  } catch {
    /* opening a browser is a convenience; the printed URL is the contract */
  }
}
