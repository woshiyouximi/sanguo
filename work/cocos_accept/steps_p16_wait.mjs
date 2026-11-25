// 等 cc 就緒 + 報頁面年齡（判斷是否被 reload）
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = { probes: [] };
  for (let i = 0; i < 60; i += 1) {
    const st = await run(`
      if (typeof cc === 'undefined') return JSON.stringify({ cc: false, age: location.href ? Math.round(performance.now() / 1000) : null });
      return JSON.stringify({ cc: true, age: Math.round(performance.now() / 1000), scene: cc.director.getScene() ? cc.director.getScene().name : '?', comps: __comps(), title: !!__comp('TitlePanel'), frames: cc.director.getTotalFrames ? cc.director.getTotalFrames() : null });`);
    out.probes.push(st);
    if (st && st.cc && (st.title || st.scene === 'Campaign')) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  log('probes: ' + JSON.stringify(out.probes.slice(-6)));
  await save('p16.json', out);
  return out;
}
