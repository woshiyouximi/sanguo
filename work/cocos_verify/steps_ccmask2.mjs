// 复核：cc ES 模块命名空间里到底有没有 Mask（Page.reload 后全新状态）
export default async function (ctx) {
  const { evaluate, send, sleep, log, OUTDIR } = ctx;

  await send('Page.reload', { ignoreCache: true });
  await sleep(7000);

  const r = await evaluate(`(async () => {
    const out = { scene: window.cc && cc.director && cc.director.getScene() ? cc.director.getScene().name : null };
    out.windowCC = {
      keys: Object.keys(window.cc || {}).length,
      mask: typeof (window.cc || {}).Mask,
      uiTransform: typeof (window.cc || {}).UITransform,
      uiOpacity: typeof (window.cc || {}).UIOpacity,
    };
    const m = await System.import('cc');
    out.esm = {
      keys: Object.keys(m).length,
      hasMaskOwn: Object.prototype.hasOwnProperty.call(m, 'Mask'),
      inMask: 'Mask' in m,
      mask: typeof m.Mask,
      maskLike: Object.keys(m).filter(k => /mask/i.test(k)),
      uiTransform: typeof m.UITransform,
      uiOpacity: typeof m.UIOpacity,
      label: typeof m.Label,
      graphics: typeof m.Graphics,
      isSameNamespace: m === window.__ccns,
    };
    // 命名空间是否 sealed（能否注入）
    out.descriptor = Object.getOwnPropertyDescriptor(m, 'Mask') ? 'present' : 'absent';
    // 找 SystemJS 里 cc 这个 module 的注册表项
    out.sysReg = (() => {
      const reg = System.constructor && System.constructor.registry ? System.constructor.registry : (System.registry || null);
      if (!reg) return 'no-registry-api';
      const k = Object.keys(reg).filter(x => x === 'cc');
      const v = reg['cc'];
      return { keys: Object.keys(reg).length, matched: k, hasExports: !!(v && v.n), exportKeys: v && v.n ? Object.keys(v.n) : null };
    })();
    return JSON.stringify(out);
  })()`, { awaitPromise: true, returnByValue: true });

  const data = JSON.parse(r);
  log('window.cc =', JSON.stringify(data.windowCC));
  log('esm      =', JSON.stringify(data.esm));
  log('sysReg   =', JSON.stringify(data.sysReg));
  return data;
}
