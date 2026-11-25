// 探针 2：带 early-hook 重载，抓 boot 阶段的 console/error
export default async function ({ s, send, shot, evaluate, sleep, log }) {
  await s('Page.enable');
  await s('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__log = [];
      (function(){
        const push = (k, a) => { try { window.__log.push(k + ' ' + Array.from(a || []).map(x => { try { return typeof x === 'string' ? x : (x && x.message ? x.message : JSON.stringify(x)); } catch (e) { return String(x); } }).join(' ')); } catch (e) {} };
        const ce = console.error, cw = console.warn, cl = console.log;
        console.error = function(){ push('E', arguments); ce.apply(console, arguments); };
        console.warn = function(){ push('W', arguments); cw.apply(console, arguments); };
        console.log = function(){ push('L', arguments); cl.apply(console, arguments); };
        window.addEventListener('error', function(e){ window.__log.push('X ' + (e.message || '') + ' @' + (e.filename || '') + ':' + (e.lineno || 0)); });
        window.addEventListener('unhandledrejection', function(e){ window.__log.push('R ' + String(e.reason && (e.reason.stack || e.reason.message) || e.reason)); });
      })();`,
  });
  await s('Page.reload', { ignoreCache: false });
  await sleep(1500);
  for (let i = 0; i < 10; i++) {
    const st = await evaluate(`(() => {
      const sc = (window.cc && cc.director && cc.director.getScene && cc.director.getScene()) || null;
      return JSON.stringify({
        t: Math.round(performance.now()),
        hasCC: typeof window.cc,
        inited: !!(window.cc && cc.game && cc.game.inited),
        frames: window.cc && cc.director ? cc.director.getTotalFrames() : null,
        scene: sc ? sc.name : null,
        logn: (window.__log || []).length,
      });
    })()`);
    log(i, st);
    await sleep(3000);
  }
  const dump = await evaluate(`JSON.stringify((window.__log || []).slice(0, 60))`);
  log('LOG: ' + dump);
  return dump;
}
