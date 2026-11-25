// 診斷 Boot 場景為何沒有 TitlePanel
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save } = makeCtx(ctx0);
  const { log } = ctx0;
  const out = {};
  out.st = await run(`
    const sc = cc.director.getScene();
    const br = __comp('BootRoot');
    let errs = [];
    try { errs = (window.__errs || []).slice(-6); } catch (e) { errs = ['ERR']; }
    let cerrs = [];
    try { cerrs = (window.__consoleErrs || []).slice(-6); } catch (e) { cerrs = ['ERR']; }
    return JSON.stringify({
      scene: sc ? sc.name : '?',
      comps: __comps(),
      nodeCount: __all().length,
      names: __all().slice(0, 40).map((n) => n.name),
      hasBootRoot: !!br,
      bootFields: br ? Object.keys(br) : null,
      hint: br && br.labelHint ? br.labelHint.string : null,
      errs, cerrs,
      frames: cc.director.getTotalFrames ? cc.director.getTotalFrames() : null
    });`);
  log('st: ' + JSON.stringify(out.st).slice(0, 3000));
  await save('p15.json', out);
  return out;
}
