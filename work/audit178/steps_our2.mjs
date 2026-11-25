// 178 复核：截 web 版（Canvas2D）战斗各阶段 + 招降面板 + 部队指令菜单
// 纪律：先 Page.bringToFront，再确认帧在涨
export default async function ({ s, evaluate, sleep, log }) {
  const BASE = 'http://127.0.0.1:5173/web/index.html';
  const ev = async (e) => { const v = await evaluate(e); if (v && v.__throw) throw new Error(v.__throw); return v; };
  const fs = await import('node:fs');
  const path = await import('node:path');
  const OUT = process.env.OUTDIR || 'F:\\sanguo\\work\\audit178';

  const nav = async (q) => {
    await s('Page.navigate', { url: `${BASE}?${q}` });
    let ok = false;
    for (let i = 0; i < 50; i++) {
      await sleep(350);
      ok = await ev('!!(window.__sanguo && window.__sanguo.booted)');
      if (ok) break;
    }
    await sleep(600);
    await s('Page.bringToFront');
    return ok;
  };
  const rect = async () => {
    const r = await ev(`(() => { const c = document.querySelector('#stage') || document.querySelector('canvas'); if (!c) return null; const b = c.getBoundingClientRect(); return JSON.stringify({ left: b.left, top: b.top, w: b.width, h: b.height }); })()`);
    return typeof r === 'string' ? JSON.parse(r) : r;
  };
  const shotClip = async (name) => {
    const rc = await rect();
    const r = await s('Page.captureScreenshot', { format: 'png', clip: { x: rc.left, y: rc.top, width: rc.w, height: rc.h, scale: 1 } });
    const out = path.join(OUT, name);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return { path: out, w: rc.w, h: rc.h };
  };
  const dump = async () => ev(`(() => {
    const st = window.__sanguo.state;
    const w = st && st.world;
    if (!w) return JSON.stringify({ mode: st && st.mode, world: null });
    const g = w.sides.A.general, e = w.sides.B.general;
    return JSON.stringify({
      mode: st.mode, tick: w.tick, over: !!w.over, winner: w.winner || null,
      generalKeys: Object.keys(g),
      A: { gx: g.gx, gy: g.gy, hp: g.hp, x: g.x, y: g.y, alive: g.alive },
      B: { gx: e.gx, gy: e.gy, hp: e.hp, x: e.x, y: e.y, alive: e.alive },
      aliveA: w.sides.A.aliveCount, aliveB: w.sides.B.aliveCount, startA: w.sides.A.start, startB: w.sides.B.start,
      units: w.units.slice(0, 6).map((u) => ({ side: u.side, x: u.x, y: u.y, gx: u.gx, gy: u.gy, alive: u.alive, st: u.state,
        keys: Object.keys(u) })),
      msg: st.message || null,
    });
  })()`);

  const out = {};
  out.front = await (async () => { await s('Page.bringToFront'); const a = await ev('window.__sanguo ? 1 : 0'); await sleep(800); return a; })();

  // 1) 开局第 1 tick
  out.nav1 = await nav('dev=1&auto=1&sim=1&freeze=1&terrain=7');
  out.d1 = await dump();
  out.s1 = await shotClip('our_b01_t1.png');

  // 2) 120 tick
  out.nav2 = await nav('dev=1&auto=1&sim=120&freeze=1&terrain=7');
  out.d2 = await dump();
  out.s2 = await shotClip('our_b02_t120.png');

  // 3) 600 tick
  out.nav3 = await nav('dev=1&auto=1&sim=600&freeze=1&terrain=7');
  out.d3 = await dump();
  out.s3 = await shotClip('our_b03_t600.png');

  // 4) 1500 tick（应已接敌）
  out.nav4 = await nav('dev=1&auto=1&sim=1500&freeze=1&terrain=7');
  out.d4 = await dump();
  out.s4 = await shotClip('our_b04_t1500.png');

  // 5) 部队指令菜单（S 键）—— 在 t=600 的冻结画面上开
  await nav('dev=1&auto=1&sim=600&freeze=1&terrain=7');
  await s('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, text: 's' });
  await s('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 });
  await sleep(500);
  out.d5 = await dump();
  out.s5 = await shotClip('our_b05_armymenu.png');

  // 6) 招降面板
  out.nav6 = await nav('dev=1&auto=1&sim=900&end=win&freeze=1&terrain=7');
  out.d6 = await ev(`(() => { const st = window.__sanguo.state; return JSON.stringify({ mode: st.mode, msg: st.message || null, keys: Object.keys(st) }); })()`);
  await s('Page.bringToFront');
  await sleep(400);
  out.s6 = await shotClip('our_b06_surrender.png');

  return out;
}
