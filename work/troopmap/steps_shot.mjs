// 截图：按兵种切换 web 战斗预览，抓 <canvas> 的像素区域。
//   TAG=before|after  兵种号列表 TROOPS=0,3,5,...  SIDE=A|B（A=切换我军兵种，B=切换敌军兵种）
//   输出 work/troopmap/_raw/<TAG>_<side><troop>.png + _meta_<TAG>_<side>.json
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'F:\\sanguo\\work\\troopmap';
const RAW = path.join(OUT, '_raw');
const TAG = process.env.TAG || 'before';
const SIDE = process.env.SIDE || 'A';
const FIXED = Number(process.env.FIXED ?? 10);
const TROOPS = (process.env.TROOPS || '0,1,2,3,4,5,6,7,8,9,10,11,12').split(',').map(Number);

export default async ({ s, send, evaluate, sleep, log }) => {
  await s('Page.bringToFront');
  fs.mkdirSync(RAW, { recursive: true });

  // 等 boot + 两套图集都 onload
  let info = null;
  for (let i = 0; i < 120; i++) {
    info = await evaluate(`(()=>{const S=window.__sanguo;
      if(!S||!S.booted||!S.state||!S.state.world) return null;
      const u=S.state.units, a=S.state.atlas;
      return {mode:S.state.mode, units:!!u, atlas:!!a,
        troopA:S.state.world.sides.A.troop, troopB:S.state.world.sides.B.troop,
        unitsGroups:u?Object.keys(u.groups).length:0,
        unitsImgW:u&&u.img?u.img.naturalWidth:0};})()`);
    if (info && info.units) break;
    await sleep(400);
  }
  log('page state', JSON.stringify(info));

  const view = await evaluate(`(()=>{const cv=document.getElementById('stage');const r=cv.getBoundingClientRect();
    return {x:r.x+window.scrollX,y:r.y+window.scrollY,w:r.width,h:r.height,cw:cv.width,ch:cv.height,
      dpr:window.devicePixelRatio,scrollX:window.scrollX,scrollY:window.scrollY};})()`);
  log('canvas', JSON.stringify(view));

  const shots = [];
  for (const t of TROOPS) {
    const applied = await evaluate(`(()=>{const S=window.__sanguo;
      const a=document.getElementById('troopA'), b=document.getElementById('troopB');
      ${SIDE === 'A' ? `a.value='${t}'; b.value='${FIXED}';` : `b.value='${t}'; a.value='${FIXED}';`}
      S.buildPreview();
      const w=S.state.world;
      return {a:a.value,b:b.value,troopA:w.sides.A.troop,troopB:w.sides.B.troop,
        nA:w.units.filter(u=>u.side==='A'&&!u.isGeneral).length,
        nB:w.units.filter(u=>u.side==='B'&&!u.isGeneral).length,
        tick:w.tick};})()`);
    await sleep(120);
    const r = await s('Page.captureScreenshot', {
      format: 'png',
      clip: { x: view.x, y: view.y, width: view.w, height: view.h, scale: 1 },
      captureBeyondViewport: true,
    });
    const name = `${TAG}_${SIDE}${String(t).padStart(2, '0')}.png`;
    const p = path.join(RAW, name);
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    shots.push({ troop: t, name, applied, bytes: fs.statSync(p).size });
    log('shot', name, JSON.stringify(applied));
  }

  const meta = { TAG, SIDE, FIXED, view, info, shots };
  fs.writeFileSync(path.join(OUT, `_meta_${TAG}_${SIDE}.json`), JSON.stringify(meta, null, 1), 'utf8');
  return { shots: shots.length, dir: RAW, view };
};
