// 探针：当前场景与组件
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = { at: new Date().toISOString(), pageAge: null };
  out.st = await run(`return JSON.stringify({ scene: __scene(), comps: __comps(), nodeCount: __all().length, age: performance.now() / 1000 });`);
  log('st: ' + JSON.stringify(out.st));

  out.load = await run(`try { cc.director.loadScene('Campaign'); return JSON.stringify({ ok: 1 }); } catch (e) { return JSON.stringify({ ok: 0, err: e.message }); }`);
  log('load: ' + JSON.stringify(out.load));
  await new Promise((r) => setTimeout(r, 8000));
  out.after = await run(`return JSON.stringify({ scene: __scene(), comps: __comps() });`);
  log('after: ' + JSON.stringify(out.after));

  await save('p10.json', out);
  return out;
}
