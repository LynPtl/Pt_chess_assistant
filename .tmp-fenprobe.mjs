import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), "fprobe-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new","--disable-gpu","--window-size=1200,1000","--remote-debugging-port=0",`--user-data-dir=${profile}`, url], { stdio: "ignore" });
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let port; for(let i=0;i<150&&!port;i++){try{const f=join(profile,"DevToolsActivePort");if(existsSync(f))port=Number(readFileSync(f,"utf8").split("\n")[0]);}catch{}if(!port)await sleep(100);}
let t; for(let i=0;i<100&&!t;i++){try{const l=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();t=l.find(x=>x.type==="page"&&x.webSocketDebuggerUrl);}catch{}if(!t)await sleep(150);}
const sock=new WebSocket(t.webSocketDebuggerUrl); let id=0; const pend=new Map();
sock.addEventListener("message",(e)=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>sock.addEventListener("open",r));
const call=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);sock.send(JSON.stringify({id:i,method:m,params:p}));});
for(let i=0;i<200;i++){const r=await call("Runtime.evaluate",{expression:"String(!!window.__done)",returnByValue:true});if(r.result?.value==="true")break;await sleep(100);}
const expr = `(async () => {
  const dt = new DataTransfer();
  dt.setData("text/plain", FEN);
  window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 600));
  return {
    fen: document.querySelector(".placement")?.textContent,
    shotFigure: document.querySelectorAll('img[alt="你粘贴的截图"]').length,
    paletteImages: document.querySelectorAll(".palette img").length,
    columns: getComputedStyle(document.querySelector(".result")).gridTemplateColumns,
  };
})()`.replace("FEN", JSON.stringify("r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b Qk - 0 1"));
const r = await call("Runtime.evaluate",{expression:expr,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails?.exception?.description, null, 1));
chrome.kill("SIGKILL");
