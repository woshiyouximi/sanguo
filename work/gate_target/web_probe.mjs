/** work/gate_target/web_probe.mjs — 通用探針：開一個 URL，跑一串表達式，印結果 */
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.PORT || 9413);
const PROFILE = process.env.PROFILE || 'F:\\sanguo\\work\\gate_target\\edge_dbg';
const URL_ = process.env.TARGET || 'http://127.0.0.1:5199/web/campaign.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=750,1334', 'about:blank'], { stdio: 'ignore' });
let ws; let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params }));
});
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r?.result?.value;
}
const EXPRS = (process.env.EXPRS || '').split('\n').filter(Boolean);
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { } await sleep(250); }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_)}`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await sleep(Number(process.env.WAIT || 2500));
  for (const expr of EXPRS) console.log(JSON.stringify(expr), '=>', JSON.stringify(await ev(expr)));
} finally { try { ws?.close(); } catch { } try { child.kill(); } catch { } }
