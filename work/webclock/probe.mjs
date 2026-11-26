export default async function probe({ evaluate, shot, sleep, log, page }) {
  await sleep(500);
  const raw = [];
  raw.push(['typeof __clock', await evaluate(`typeof window.__clock`)]);
  raw.push(['url', page.url]);
  raw.push(['title', await evaluate(`document.title`)]);
  raw.push(['readExpr', await evaluate(`(() => {
    const c = window.__clock;
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent : ''; };
    const vis = (id) => { const el = document.getElementById(id); return !!(el && !el.hidden); };
    return JSON.stringify({ clock: c ? c.state() : null, ym: txt('ym'), clockNow: txt('clockNow'), pickOpen: vis('pickSheet') });
  })()`)]);
  raw.push(['pickCards', await evaluate(`document.querySelectorAll('#pickCards [data-pick]').length`)]);
  raw.push(['btnPickStartDisabled', await evaluate(`(() => { const b = document.getElementById('btnPickStart'); return b ? b.disabled : 'missing'; })()`)]);
  await shot('probe');
  log(JSON.stringify(raw, null, 1));
  return raw;
}
