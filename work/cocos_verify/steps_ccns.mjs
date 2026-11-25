// 探针：确认 'cc' 模块命名空间到底导出了什么；重点 UITransform 是否缺失
export default async function ({ evaluate, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};
  out.globals = await ev(`(() => {
    const own = Object.getOwnPropertyNames(cc);
    const probe = ['Node','Component','Label','Sprite','Graphics','Mask','UITransform','UIOpacity','Widget','Layout','Button','Color','Vec2','Vec3','Size','Rect','director','view','sys','resources','assetManager','game'];
    const t = {};
    probe.forEach((k) => { t[k] = typeof cc[k]; });
    return JSON.stringify({ keyCount: own.length, probe: t }); })()`);
  out.module = await ev(`(() => {
    if (!window.__ccmod) window.__ccmod = {};
    return JSON.stringify({ hasSystemImport: typeof System !== 'undefined' }); })()`);
  // 用 System.import('cc') 拿真正的模块命名空间
  await evaluate(`System.import('cc').then((m) => { window.__ccns = m; }).catch((e) => { window.__ccns = { __err: String(e) }; });`);
  await new Promise((r) => setTimeout(r, 800));
  out.moduleNs = await ev(`(() => {
    const m = window.__ccns;
    if (!m) return JSON.stringify({ err: 'no ns yet' });
    if (m.__err) return JSON.stringify({ err: m.__err });
    const own = Object.getOwnPropertyNames(m);
    const probe = ['UITransform','UIOpacity','Widget','Label','Sprite','Graphics','Mask','Button','Layout','Node','Component'];
    const t = {};
    probe.forEach((k) => { t[k] = typeof m[k]; });
    return JSON.stringify({ sameAsWindowCC: m === cc, keyCount: own.length, probe: t,
      hasUITransformIn: ('UITransform' in m), desc: String(Object.getOwnPropertyDescriptor(m,'UITransform') || null) });
  })()`);
  log('moduleNs', JSON.stringify(out.moduleNs));
  return out;
}
