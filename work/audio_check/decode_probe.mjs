/**
 * 音频层体检 · 第 2 步：用浏览器真解码器（WebAudio decodeAudioData）测真实的
 * 时长 / RMS / 峰值 / 静音段 / 削波。
 *
 * 为什么绕这一圈：静态帧头只能给"容器级"结论（时长、采样率、帧完整性），
 * 给不出"这一段到底有没有声音"。本机没有 ffmpeg/python，但 Edge 自带 MP3 解码器，
 * 走 CDP 在页面里 fetch + decodeAudioData 就是最权威的实测。
 *
 * 注意：decodeAudioData 会把结果重采样到 AudioContext 的采样率（本机 48 kHz），
 * 所以 decoded.sampleRate 是设备率、不是文件率；文件率以 static.json 为准。
 * 时长不受重采样影响（帧数/源率）。
 *
 * 产物：work/audio_check/decoded.json
 * 用法：node work/audio_check/decode_probe.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'F:\\sanguo';
const OUTDIR = join(ROOT, 'work', 'audio_check');
const PROFILE = join(OUTDIR, 'edgeprof');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9700 + Math.floor(Math.random() * 200);
const ORIGIN = 'http://127.0.0.1:5173';

mkdirSync(OUTDIR, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const staticJson = JSON.parse(readFileSync(join(OUTDIR, 'static.json'), 'utf8'));
const FILES = staticJson.files.map((f) => f.file);
const BATCH = 12;

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--window-size=800,600', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitVersion() {
  for (let i = 0; i < 160; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch { /* not up */ }
    await sleep(150);
  }
  throw new Error('Edge 调试端口没起来');
}

const PAGE_FN = `
window.__probe = async function (list) {
  const out = [];
  let ac = null;
  for (const rel of list) {
    const rec = { file: rel };
    try {
      const t0 = performance.now();
      const res = await fetch('/web/assets/audio/' + rel, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ab = await res.arrayBuffer();
      rec.bytes = ab.byteLength;
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ac.decodeAudioData(ab.slice(0));
      rec.ok = true;
      rec.duration = buf.duration;
      rec.deviceRate = buf.sampleRate;
      rec.channels = buf.numberOfChannels;
      rec.frames = buf.length;
      let sumSq = 0, peak = 0, clipped = 0, n = 0;
      let leadSil = -1, tailSil = 0, runSil = 0, maxRun = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const v = d[i];
          const a = v < 0 ? -v : v;
          if (a > peak) peak = a;
          if (a >= 0.999) clipped++;
          sumSq += v * v;
          n++;
          // 静音判定阈值 -80 dBFS = 1e-4
          if (a < 1e-4) {
            runSil++;
            if (runSil > maxRun) maxRun = runSil;
            if (leadSil < 0) leadSil = i / buf.sampleRate;
          } else {
            if (leadSil < 0) leadSil = i / buf.sampleRate;
            runSil = 0;
          }
          tailSil = a < 1e-4 ? tailSil + 1 : 0;
        }
      }
      const rms = Math.sqrt(sumSq / Math.max(1, n));
      rec.rms = rms;
      rec.rmsDbfs = rms > 0 ? Math.round(20 * Math.log10(rms) * 10) / 10 : -999;
      rec.peak = peak;
      rec.peakDbfs = peak > 0 ? Math.round(20 * Math.log10(peak) * 10) / 10 : -999;
      rec.clipped = clipped;
      rec.maxSilenceSec = Math.round((maxRun / buf.sampleRate) * 1000) / 1000;
      rec.leadSilenceSec = leadSil < 0 ? 0 : Math.round(leadSil * 1000) / 1000;
      rec.tailSilenceSec = Math.round((tailSil / buf.sampleRate) * 1000) / 1000;
      rec.decodeMs = Math.round(performance.now() - t0);
    } catch (e) {
      rec.ok = false;
      rec.error = String(e && e.message || e);
    }
    out.push(rec);
  }
  return out;
};
'ok';
`;

let seq = 0;
let ws = null;
try {
  const ver = await waitVersion();
  console.log('Edge:', ver.Browser);
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: ORIGIN + '/web/index.html' });
  await sleep(2500);
  const inject = await send('Runtime.evaluate', { expression: PAGE_FN, returnByValue: true });
  if (inject.exceptionDetails) throw new Error('注入失败: ' + JSON.stringify(inject.exceptionDetails).slice(0, 300));
  console.log('注入解码函数 ok');

  const all = [];
  for (let i = 0; i < FILES.length; i += BATCH) {
    const chunk = FILES.slice(i, i + BATCH);
    const r = await send('Runtime.evaluate', {
      expression: `window.__probe(${JSON.stringify(chunk)})`,
      returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error('解码批失败: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    const val = r.result && r.result.value;
    if (!Array.isArray(val)) throw new Error('返回非数组: ' + JSON.stringify(r.result).slice(0, 200));
    all.push(...val);
    process.stdout.write(`  ${Math.min(i + BATCH, FILES.length)}/${FILES.length}\r`);
  }
  const fail = all.filter((r) => !r.ok);
  writeFileSync(join(OUTDIR, 'decoded.json'), JSON.stringify({
    at: new Date().toISOString(),
    method: 'Edge headless + WebAudio decodeAudioData（真解码器；RMS/峰值在重采样后的缓冲上算，时长不受影响）',
    count: all.length,
    failed: fail.length,
    files: all,
  }, null, 1), 'utf8');
  console.log(`\n解码 ${all.length} 个，失败 ${fail.length}，-> decoded.json`);
  for (const f of fail) console.log('  FAIL', f.file, f.error);
} finally {
  try { ws && ws.close(); } catch { /* ignore */ }
  try { proc.kill(); } catch { /* ignore */ }
  await sleep(600);
  process.exit(0);
}
