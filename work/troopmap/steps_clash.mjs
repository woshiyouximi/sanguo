// 等到两军都进画面（auto 实时战斗，不 freeze），再截图：用于验证「我方 M 蓝 / 敌方 N 红」。
//   TROOP=0  TAG=before  → work/troopmap/_raw/clash_<TAG>_<troop>.png
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'F:\\sanguo\\work\\troopmap';
const RAW = path.join(OUT, '_raw');
const TAG = process.env.TAG || 'before';
const TROOP = Number(process.env.TROOP ?? 0);
const BASE = 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&follow=0';

export default async ({ s, evaluate, sleep, log }) => {
  await s('Page.bringToFront');
  fs.mkdirSync(RAW, { recursive: true });
  const url = `${BASE}&auto=1&troop=${TROOP}&btroop=${TROOP}`;
  await s('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    const ok = await evaluate(`!!(window.__sanguo && window.__sanguo.booted && window.__sanguo.state.units)`);
    if (ok) break;
    await sleep(200);
  }
  const probe = `(()=>{const S=window.__sanguo;const w=S.state.world;if(!w)return null;
    const camX=S.state.camX;const ROW=71.42857142857143;
    const vis=(side)=>w.units.filter(u=>u.side===side&&u.alive&&!u.isGeneral).filter(u=>{
      const sy=550+(u.x-camX)*ROW; return sy>=20&&sy<=1080;}).length;
    return {tick:w.tick,camX:+camX.toFixed(2),visA:vis('A'),visB:vis('B'),
      mode:S.state.mode, troopA:w.sides.A.troop, troopB:w.sides.B.troop};})()`;
  let best = null;
  for (let i = 0; i < 140; i++) {
    const st = await evaluate(probe);
    if (st && st.mode === 'fighting' && st.visA > 12 && st.visB > 12) { best = st; break; }
    if (st && (i % 10 === 0)) log('wait', JSON.stringify(st));
    best = st;
    await sleep(300);
  }
  const view = await evaluate(`(()=>{const cv=document.getElementById('stage');const r=cv.getBoundingClientRect();
    return {x:r.x+window.scrollX,y:r.y+window.scrollY,w:r.width,h:r.height,cw:cv.width,ch:cv.height,camX:window.__sanguo.state.camX};})()`);
  const r = await s('Page.captureScreenshot', {
    format: 'png',
    clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: 1 },
    captureBeyondViewport: true,
  });
  const name = `clash_${TAG}_${TROOP}.png`;
  fs.writeFileSync(path.join(RAW, name), Buffer.from(r.data, 'base64'));
  log('clash', JSON.stringify(best), 'view', JSON.stringify(view));
  return { name, best, view };
};
