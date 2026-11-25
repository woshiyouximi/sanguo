/** work/gate_target/web_debug.mjs — 一次性診斷：新遊戲→重載→?sel=北平 的狀態 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9412;
const HTTP = 5199;
const ORIGIN = `http://127.0.0.1:${HTTP}`;
const OUT = 'work/gate_target';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { await fetch(`${ORIGIN}/web/campaign.html`, { method: 'HEAD' }); } catch {
  spawn(process.execPath, ['work/serve.mjs', String(HTTP), 'F:\\sanguo\\game'], { stdio: 'ignore', detached: true }).unref();
  await sleep(1200);
}
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=F:\\sanguo\\${OUT}\\edge_dbg`, '--window-size=750,1334', 'about:blank'], { stdio: 'ignore' });

let ws; let msgId = 0; const pending = new Map(); const logs = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) return { __err: r.exceptionDetails.text };
  return r?.result?.value;
}
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { } await sleep(250); }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`${ORIGIN}/web/campaign.html`)}`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map(a => a.value ?? a.description).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EX ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await sleep(2500);
  console.log('A store =', await ev('Object.keys(localStorage)'));
  console.log('A picker =', await ev('document.getElementById("pickSheet")?.className'));
  await ev('document.querySelector(\'[data-pick="0"]\')?.click()');
  await sleep(200);
  await ev('document.getElementById("btnPickStart").click()');
  await sleep(400);
  console.log('B king card =', await ev('!!document.querySelector(\'[data-king="\\u516C\\u5B6B\\u74DA"]\')'));
  await ev('document.querySelector(\'[data-king="\\u516C\\u5B6B\\u74DA"]\')?.click()');
  await sleep(200);
  await ev('document.getElementById("btnPickStart").click()');
  await sleep(1500);
  console.log('C pickSheet class =', await ev('document.getElementById("pickSheet")?.className'));
  console.log('C kingName =', await ev('document.getElementById("kingName")?.textContent'));
  console.log('C acts =', await ev('[...document.querySelectorAll("[data-act]")].map(b=>b.dataset.act).join(",")'));
  console.log('C store =', await ev('Object.keys(localStorage)'));
  console.log('C hasnAny =', await ev('(() => { try { const s = JSON.parse(localStorage.getItem("sanguo_saves_v1")||"null"); return s ? Object.keys(s) + " slots=" + (s.slots||[]).map(x=>x?"Y":"-").join("") : "no-store"; } catch (e) { return "ERR " + e.message; } })()'));
  console.log('C hint =', await ev('document.getElementById("hint")?.textContent'));

  await send('Page.navigate', { url: `${ORIGIN}/web/campaign.html?sel=${encodeURIComponent('北平')}` });
  await sleep(3000);
  console.log('D pickSheet class =', await ev('document.getElementById("pickSheet")?.className'));
  console.log('D kingName =', await ev('document.getElementById("kingName")?.textContent'));
  console.log('D acts =', await ev('[...document.querySelectorAll("[data-act]")].map(b=>b.dataset.act).join(",")'));
  console.log('D selTitle =', await ev('document.querySelector("#selTitle, .selname, #mapCity")?.textContent'));
  console.log('D hint =', await ev('document.getElementById("hint")?.textContent'));
  console.log('D sheet classes =', await ev('[...document.querySelectorAll(".sheet")].map(s=>s.id+":"+s.className).join(" | ")'));
  writeFileSync(`${OUT}/web_debug.txt`, [
    'logs:', ...logs.slice(-40), '',
    'localStorage:', JSON.stringify(await ev('Object.keys(localStorage)')),
  ].join('\n'), 'utf8');
} finally { try { ws?.close(); } catch { } try { child.kill(); } catch { } }
