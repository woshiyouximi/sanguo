// 诊断：为什么 `?sur=` 探针没把招降面板弹出来
export default async ({ s, sleep, evaluate, log }) => {
  await s('Page.bringToFront');
  await sleep(800);
  const info = await evaluate(`(() => {
    const out = { search: location.search, hash: location.hash, ready: document.readyState };
    try { out.sgDev = !!(window.SGDev); } catch (e) { out.sgDev = String(e); }
    out.sheets = [...document.querySelectorAll('.sheet')].filter((x) => !x.hidden).map((x) => x.id);
    out.hasBoard = !!document.querySelector('.city');
    out.err = (window.__lastErr || '') + '';
    return out;
  })()`);
  log('page ' + JSON.stringify(info, null, 1));
  return info;
};
