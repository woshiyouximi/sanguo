// 确定性截图：URL 参数 troop/btroop 定兵种，auto+sim+freeze 冻结在固定 tick。
//   TAG=before|after   TROOPS=0,1,...   SIM=60
//   输出 work/troopmap/_raw/<TAG>_A<tt>_B<bb>.png + _meta_<TAG>.json
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'F:\\sanguo\\work\\troopmap';
const RAW = path.join(OUT, '_raw');
const TAG = process.env.TAG || 'before';
const SIM = process.env.SIM || '60';
const TROOPS = (process.env.TROOPS || '0,1,2,3,4,5,6,7,8,9,10,11,12').split(',').map(Number);
const BASE = 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&follow=0';

export default async ({ s, send, evaluate, sleep, log }) => {
  await s('Page.bringToFront');
  fs.mkdirSync(RAW, { recursive: true });
  const shots = [];
  let view = null;
  for (const t of TROOPS) {
    const url = `${BASE}&auto=1&sim=${SIM}&freeze=1&troop=${t}&btroop=${t}`;
    await s('Page.navigate', { url });
    let st = null;
    for (let i = 0; i < 100; i++) {
      st = await evaluate(`(()=>{const S=window.__sanguo;
        if(!S||!S.booted||!S.state||!S.state.world) return null;
        const w=S.state.world;
        return {mode:S.state.mode,units:!!(S.state.units&&S.state.units.img&&S.state.units.img.naturalWidth),
          tick:w.tick, troopA:w.sides.A.troop, troopB:w.sides.B.troop,
          nA:w.units.filter(u=>u.side==='A'&&!u.isGeneral).length,
          nB:w.units.filter(u=>u.side==='B'&&!u.isGeneral).length,
          aliveA:w.units.filter(u=>u.side==='A'&&!u.isGeneral&&u.alive).length,
          aliveB:w.units.filter(u=>u.side==='B'&&!u.isGeneral&&u.alive).length};})()`);
      if (st && st.units && st.mode === 'fighting' && st.tick >= Number(SIM)) break;
      await sleep(200);
    }
    if (!view) {
      view = await evaluate(`(()=>{const cv=document.getElementById('stage');const r=cv.getBoundingClientRect();
        return {x:r.x+window.scrollX,y:r.y+window.scrollY,w:r.width,h:r.height,cw:cv.width,ch:cv.height};})()`);
      log('canvas', JSON.stringify(view));
    }
    await sleep(150);
    const r = await s('Page.captureScreenshot', {
      format: 'png',
      clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: 1 },
      captureBeyondViewport: true,
    });
    const name = `${TAG}_A${String(t).padStart(2, '0')}_B${String(t).padStart(2, '0')}.png`;
    const p = path.join(RAW, name);
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    shots.push({ troop: t, name, st });
    log('shot', name, JSON.stringify(st));
  }
  fs.writeFileSync(path.join(OUT, `_meta_${TAG}.json`), JSON.stringify({ TAG, SIM, BASE, view, shots }, null, 1), 'utf8');
  return { shots: shots.length, view };
};
