// 扫 sim 值，找两军都进画面的 tick。只回报状态，不截图。
const BASE = 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&follow=0';
const SIMS = (process.env.SIMS || '120,240,480,720,960,1200').split(',').map(Number);
const TROOP = process.env.TROOP || '0';

export default async ({ s, evaluate, sleep, log }) => {
  await s('Page.bringToFront');
  const out = [];
  for (const sim of SIMS) {
    await s('Page.navigate', { url: `${BASE}&auto=1&sim=${sim}&freeze=1&troop=${TROOP}&btroop=${TROOP}` });
    await evaluate('0');
    await sleep(1200);
    const st = await evaluate(`(()=>{const S=window.__sanguo;const w=S.state.world;
      if(!w) return null; const camX=S.state.camX; const ROW=71.42857142857143;
      const side=(s2)=>w.units.filter(u=>u.side===s2&&!u.isGeneral);
      const vis=(s2)=>side(s2).filter(u=>{const sy=550+(u.x-camX)*ROW;return sy>=20&&sy<=1080;}).length;
      const alive=(s2)=>side(s2).filter(u=>u.alive).length;
      const rng=(s2)=>{const a=side(s2);return a.length?[Math.min(...a.map(u=>u.x)),Math.max(...a.map(u=>u.x))]:null;};
      return {tick:w.tick,camX:+camX.toFixed(2),aX:rng('A'),bX:rng('B'),
        visA:vis('A'),visB:vis('B'),aliveA:alive('A'),aliveB:alive('B'),mode:S.state.mode};})()`);
    log('sim', sim, JSON.stringify(st));
    out.push({ sim, st });
  }
  return out;
};
