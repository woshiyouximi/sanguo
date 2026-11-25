// 页面重载 + 预置钩子：抓 boot 期的 Error 3804 调用栈
export default async function (ctx) {
  const { evaluate, sleep, log, s } = ctx;

  // 1) document-start 钩子（重载后先于游戏脚本运行）
  const src = `(function(){
    window.__err84 = { count: 0, keys: {}, stacks: [] };
    const wrap = (fn) => function (...a) {
      try {
        const k = String(a[0]).slice(0, 60);
        const st = window.__err84;
        st.count++; st.keys[k] = (st.keys[k] || 0) + 1;
        if (st.stacks.length < 5) st.stacks.push((new Error('x')).stack);
      } catch (e) {}
      return fn.apply(console, a);
    };
    console.error = wrap(console.error);
    window.addEventListener('error', (e) => {
      try { const st = window.__err84; st.err = st.err || []; st.err.push(String(e.message) + ' @ ' + (e.filename||'').slice(-40) + ':' + e.lineno); } catch (x) {}
    });
  })();`;
  await s('Page.addScriptToEvaluateOnNewDocument', { source: src });
  await s('Page.reload', { ignoreCache: false });
  await sleep(12000);

  const rep = await evaluate(`JSON.stringify({
    count: window.__err84 ? window.__err84.count : 'no hook',
    keys: window.__err84 ? window.__err84.keys : null,
    stacks: window.__err84 ? window.__err84.stacks.slice(0, 3) : null,
    errors: window.__err84 ? (window.__err84.err || []).slice(0, 5) : null,
    scene: (window.cc && cc.director.getScene()) ? cc.director.getScene().name : 'noscene',
  })`);
  log('BOOTERR=' + rep);
  return rep;
}
