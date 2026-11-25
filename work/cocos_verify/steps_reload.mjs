// 步骤：带「前置注入 + 重载」的复现测试 —— 判定 81 条 Error 3804 是否来自应用自身
// 注入的钩子通过 Page.addScriptToEvaluateOnNewDocument 存活到 reload 之后
export default async function ({ s, evaluate, sleep, shot, log }) {
  const HOOK = `(() => {
    window.__c3804 = 0; window.__stacks = [];
    const orig = console.error.bind(console);
    console.error = function (...a) {
      const txt = a.map((x) => { try { return typeof x === 'string' ? x : String(x); } catch (e) { return '<u>'; } }).join(' ');
      if (txt.indexOf('3804') >= 0) {
        window.__c3804++;
        if (window.__stacks.length < 4) {
          try { window.__stacks.push(txt.slice(0, 60) + ' << ' + (new Error('x')).stack.split('\\n').slice(1, 8).join(' | ')); } catch (e) {}
        }
      }
      return orig(...a);
    };
  })();`;
  await s('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const before = await evaluate('JSON.stringify({scene:cc.director.getScene().name, frames:cc.director.getTotalFrames()})');
  await s('Page.reload', { ignoreCache: false });
  await sleep(7000);
  const after = await evaluate(`JSON.stringify({
    scene: (window.cc && cc.director.getScene()) ? cc.director.getScene().name : null,
    frames: window.cc ? cc.director.getTotalFrames() : null,
    c3804: window.__c3804,
    stacks: window.__stacks,
    hooked: typeof window.__c3804 === 'number',
    winErrs: window.__errs || null,
  })`);
  const sp = await shot('after_reload');
  log('before', before);
  log('after', after);
  log('shot', sp.path, sp.bytes);
  return { before, after, shot: sp };
}
