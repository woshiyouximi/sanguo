// 帧集 harness 截图：证明 M/N 两套帧像素不同（蓝军 vs 红军），且用的是真模块
import fs from 'node:fs';
import path from 'node:path';

export default async function (ctx) {
  const { send, shot, evaluate, sleep, log, OUTDIR } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const ev = async (e) => { const v = await evaluate(e); if (v && v.__throw) throw new Error('eval threw: ' + v.__throw); return v; };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  const BASE = 'http://127.0.0.1:5180/work/cocos_battlevis/units_mn.html';
  const grab = async (url, name) => {
    await send('Page.navigate', { url });
    await sleep(2000);
    let done = null;
    for (let i = 0; i < 20; i++) {
      done = J(await ev(`(() => JSON.stringify(window.__done || null))()`));
      if (done) break;
      await sleep(500);
    }
    log('HARNESS(' + name + ') =', JSON.stringify(done));
    const rect = J(await ev(`(() => { const c = document.getElementById('cv'); const r = c.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: c.width, h: c.height }); })()`));
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } });
    const f = path.join(OUTDIR, name + '.png');
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    log('shot ->', f, fs.statSync(f).size, JSON.stringify(rect));
    return { path: f, bytes: fs.statSync(f).size, rect, done };
  };

  const grid = await grab(BASE, '20_units_MN_harness');
  const zoom = await grab(BASE + '?zoom=1', '21_units_MN_zoom3x');
  const old = await grab(BASE + '?old=1', '22_cocos_current_frames');
  return { grid, zoom, old };
}
