import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), "w-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new","--disable-gpu","--window-size=1200,1000","--remote-debugging-port=0",`--user-data-dir=${profile}`, url], { stdio: "ignore" });
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
let port; for(let i=0;i<150&&!port;i++){try{const f=join(profile,"DevToolsActivePort");if(existsSync(f))port=Number(readFileSync(f,"utf8").split("\n")[0]);}catch{}if(!port)await sleep(100);}
let t; for(let i=0;i<100&&!t;i++){try{const l=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();t=l.find(x=>x.type==="page"&&x.webSocketDebuggerUrl);}catch{}if(!t)await sleep(150);}
const sock=new WebSocket(t.webSocketDebuggerUrl); let id=0; const pend=new Map();
sock.addEventListener("message",(e)=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
await new Promise(r=>sock.addEventListener("open",r));
const call=(m,p={})=>Promise.race([
  new Promise(res=>{const i=++id;pend.set(i,res);sock.send(JSON.stringify({id:i,method:m,params:p}));}),
  sleep(6000).then(()=>({__timeout:m})),
]);
await call("Runtime.enable");
for(let i=0;i<200;i++){const r=await call("Runtime.evaluate",{expression:"String(!!window.__done)",returnByValue:true});if(r.result?.value==="true")break;await sleep(100);}
const log = [];
const step = async (label, fn) => { const r = await fn(); log.push([label, r.__timeout ? "TIMEOUT" : "ok"]); return r; };

await step("click send", () => call("Runtime.evaluate",{expression:'document.querySelector("[data-action=send]").click()'}));
await sleep(4000);
await step("eval after send", () => call("Runtime.evaluate",{expression:"1+1",returnByValue:true}));
await step("navigate", () => call("Page.navigate",{url:url.split("?")[0]}));
await sleep(1500);
await step("eval after nav", () => call("Runtime.evaluate",{expression:"location.href",returnByValue:true}));
console.log(JSON.stringify(log));
chrome.kill("SIGKILL");
