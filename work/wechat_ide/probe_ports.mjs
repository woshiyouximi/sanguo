// Probe which localhost port serves the devtools automation websocket.
// Read-only: connect + query systemInfo, then disconnect.
import automator from 'miniprogram-automator';

const ports = process.argv.slice(2).map(Number).filter(Boolean);
const results = [];

for (const port of ports) {
  const ws = `ws://127.0.0.1:${port}`;
  const rec = { port, ws, ok: false, error: null, info: null };
  const t0 = Date.now();
  try {
    const mini = await automator.connect({ wsEndpoint: ws, timeout: 8000 });
    rec.ok = true;
    rec.connectMs = Date.now() - t0;
    try {
      rec.info = await mini.systemInfo();
    } catch (e) {
      rec.infoError = String(e && e.message || e);
    }
    try { await mini.disconnect(); } catch {}
  } catch (e) {
    rec.error = String((e && e.message) || e);
    rec.connectMs = Date.now() - t0;
  }
  results.push(rec);
  console.log(JSON.stringify(rec));
}

console.log('---SUMMARY---');
console.log(JSON.stringify(results.map(r => ({ port: r.port, ok: r.ok, error: r.error })), null, 2));
