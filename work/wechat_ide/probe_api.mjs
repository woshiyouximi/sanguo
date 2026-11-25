// Probe which automator commands actually respond for this GAME project.
// Read-only.
import automator from 'miniprogram-automator';

const withTimeout = (p, ms, label) => Promise.race([
  p.then(v => ({ label, ok: true, value: v })).catch(e => ({ label, ok: false, error: String(e && e.message || e) })),
  new Promise(r => setTimeout(() => r({ label, ok: false, error: `timeout>${ms}ms` }), ms)),
]);

const ws = 'ws://127.0.0.1:9420';
const mini = await automator.connect({ wsEndpoint: ws, timeout: 10000 });
console.log('connected to', ws);

const probes = [
  ['systemInfo', () => mini.systemInfo()],
  ['pageStack', () => mini.pageStack()],
  ['currentPage', () => mini.currentPage()],
  ['callWxMethod(getSystemInfoSync)', () => mini.callWxMethod('getSystemInfoSync')],
  ['screenshot', () => mini.screenshot({ path: 'F:/sanguo/work/wechat_ide/shots/automator_probe.png' })],
];

for (const [label, fn] of probes) {
  const r = await withTimeout(Promise.resolve().then(fn), 12000, label);
  console.log(JSON.stringify(r).slice(0, 600));
}

console.log('--- now try CDP ---');
try {
  const cdp = mini.CDP();
  const en = await withTimeout(cdp.enable(), 10000, 'cdp.enable');
  console.log(JSON.stringify(en).slice(0, 400));
  const pages = await withTimeout(JSON.stringify(cdp.listProtocol()).then(s => s), 10000, 'cdp.listProtocol');
  console.log(JSON.stringify(pages).slice(0, 400));
} catch (e) {
  console.log('CDP setup error:', String(e && e.message || e));
}

try { await mini.disconnect(); } catch {}
process.exit(0);
