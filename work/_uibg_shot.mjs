/**
 * 九屏截图 + console/异常采集。780×1400，无头 Edge，CDP。
 *
 *   node work/_uibg_shot.mjs                # 全部 9 屏
 *   node work/_uibg_shot.mjs m1 m2          # 指定屏
 *
 * 产物：F:\sanguo\work\ui_bg_<id>.png
 * 顺带把每屏的 console / exception / 4xx / loadingFailed 打出来（验收要求 0 exception）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const IDS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['p1', 'm1', 'm2', 'm3', 'd1', 'b1', 'r1', 'g1', 's1'];
const BASE = process.env.BASE || 'http://127.0.0.1:5180/proto/ui/index.html';
const OUT = 'F:\\sanguo\\work\\ui_bg_';
const W = 780, H = 1400;
import { cleanupProfile, sweepStaleProfiles } from './edge_temp_guard.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = await mkdtemp(join(tmpdir(), 'edge-shot-'));

// [C盘防泄漏] 启动时清扫 1 小时以上的旧临时 profile（含杀不掉的僵尸浏览器）
sweepStaleProfiles();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function waitVersion() {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return r.json(); }
    catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('Edge 调试端口没起来');
}

let seq = 0;
const report = [];
try {
  await waitVersion();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  let logs = [], fails = [], http4 = [];
  const fmt = (a) => (!a ? '?' : ('value' in a) ? String(a.value) : (a.description || a.type || '?'));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      return m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
    const p = m.params ?? {};
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(`[${p.type}] ` + (p.args ?? []).map(fmt).join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails ?? {};
      logs.push('[exception] ' + (d.exception?.description || d.text || '?'));
    } else if (m.method === 'Network.loadingFailed') {
      fails.push(`${p.type || '?'} ${p.errorText}`);
    } else if (m.method === 'Network.responseReceived') {
      const r = p.response ?? {};
      if (r.status >= 400) http4.push(`${r.status} ${r.url.replace(BASE.split('?')[0], '')}`);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await send('Runtime.enable'); await send('Log.enable');
  await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  for (const id of IDS) {
    logs = []; fails = []; http4 = [];
    await send('Page.navigate', { url: `${BASE}?s=${id}` });
    await sleep(2000);
    // 收起左侧导航（原型自带的 ≡ 折叠），让 780×1400 里是「手机全屏」，屏幕按 ~104% 画
    await send('Runtime.evaluate', {
      expression: 'document.body.classList.add("nav-collapsed");' +
        'window.dispatchEvent(new Event("resize"));',
    }).catch(() => {});
    await sleep(600);
    // 等 .screen 出现 + 转场动画跑完；m1 还要等地图底图 onload
    for (let i = 0; i < 20; i++) {
      const r = await send('Runtime.evaluate', {
        expression: '(function(){var s=document.querySelector(".screen");' +
          'if(!s)return "no-screen";var im=document.querySelector(".mapbox canvas");' +
          'return s.getAttribute("data-scr")+"/"+(im?"canvas":"")})()',
        returnByValue: true,
      }).catch(() => null);
      if (String(r?.result?.value || '').startsWith(id)) break;
      await sleep(150);
    }
    await sleep(700);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = OUT + id + '.png';
    await mkdir('F:\\sanguo\\work', { recursive: true });
    await writeFile(file, Buffer.from(shot.data, 'base64'));
    const exceptions = logs.filter((l) => l.startsWith('[exception]'));
    const errs = logs.filter((l) => l.startsWith('[error]'));
    report.push({ id, file, exceptions, errs, fails: fails.slice(), http4: http4.slice() });
    console.log(`${id.padEnd(3)} → ${file}  exception=${exceptions.length} consoleError=${errs.length} ` +
      `4xx=${http4.length} netFail=${fails.length}`);
    if (exceptions.length) console.log('   ' + exceptions.join('\n   '));
    if (errs.length) console.log('   ' + errs.join('\n   '));
    if (http4.length) console.log('  4xx: ' + http4.join(', '));
    if (fails.length) console.log('  net: ' + fails.join(', '));
  }
  const bad = report.filter((r) => r.exceptions.length || r.errs.length || r.http4.length);
  console.log('\n=== 汇总 ===');
  console.log(bad.length ? 'FAIL ' + bad.map((b) => b.id).join(',') : 'PASS 九屏 0 exception / 0 console.error / 0 4xx');
  ws.close();
  process.exitCode = bad.length ? 1 : 0;
} finally {
  // [C盘防泄漏] 整棵进程树都杀掉，再等一下删 profile，否则 Windows 上文件仍被占用
  const exited = new Promise((r) => proc.once('exit', r));
  // 掐掉以本 profile 为 --user-data-dir 的整组 msedge 进程，再删目录（有界，删不掉留给启动清扫）
  try { proc.kill(); } catch { /* ignore */ }
  await cleanupProfile(profile);
  process.exit(process.exitCode ?? 0); // 清理完强制退出，防止句柄（WebSocket/Edge 子进程）吊住事件循环导致进程不退出
}
