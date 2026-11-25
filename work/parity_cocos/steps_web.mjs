// web 侧取证：5 页各截一张 750×1334 + DOM 普查（元素/字号/九宫/阴影/滚动/穿透）
const PAGES = [
  ['index', 'http://127.0.0.1:5173/web/index.html'],
  ['campaign', 'http://127.0.0.1:5173/web/campaign.html'],
  ['city', 'http://127.0.0.1:5173/web/city.html'],
  ['deploy', 'http://127.0.0.1:5173/web/deploy.html'],
  ['items', 'http://127.0.0.1:5173/web/items.html'],
];

const CENSUS = `(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const tags = {};
  all.forEach((e) => { const t = e.tagName.toLowerCase(); tags[t] = (tags[t] || 0) + 1; });
  const vis = all.filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0; });
  const textEls = vis.filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0));
  const fs = {};
  textEls.forEach((e) => { const s = getComputedStyle(e).fontSize; fs[s] = (fs[s] || 0) + 1; });
  const bi = vis.filter((e) => { const v = getComputedStyle(e).borderImageSource; return v && v !== 'none'; }).length;
  const shadow = vis.filter((e) => { const c = getComputedStyle(e); return (c.boxShadow && c.boxShadow !== 'none') || (c.textShadow && c.textShadow !== 'none'); }).length;
  const grad = vis.filter((e) => /gradient/.test(getComputedStyle(e).backgroundImage || '')).length;
  const pe = vis.filter((e) => getComputedStyle(e).pointerEvents === 'none').length;
  const trans = vis.filter((e) => { const c = getComputedStyle(e); return (c.transitionDuration && c.transitionDuration !== '0s') || (c.animationName && c.animationName !== 'none'); }).length;
  const blur = vis.filter((e) => /blur|saturate|brightness|contrast/.test(getComputedStyle(e).filter || '')).length;
  const scrollers = all.filter((e) => { const c = getComputedStyle(e); return /(auto|scroll)/.test(c.overflowY + c.overflowX) && e.scrollHeight > e.clientHeight + 2; }).map((e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + (e.className || '').toString().split(' ')[0]) + ':' + e.scrollHeight + '/' + e.clientHeight);
  const canvas = document.querySelector('canvas');
  const textLines = textEls.reduce((a, e) => a + Array.from(e.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim()).length, 0);
  const bodyOverflow = document.documentElement.scrollHeight > innerHeight + 2 || document.documentElement.scrollWidth > innerWidth + 2;
  return JSON.stringify({
    title: document.title,
    viewport: [innerWidth, innerHeight],
    doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    bodyOverflow,
    canvas: canvas ? [canvas.width, canvas.height, canvas.getBoundingClientRect().width | 0, canvas.getBoundingClientRect().height | 0] : null,
    total: all.length,
    visible: vis.length,
    tags,
    textEls: textEls.length,
    textLines,
    fontSizes: fs,
    borderImage: bi,
    shadow,
    gradient: grad,
    pointerNone: pe,
    transition: trans,
    filter: blur,
    scrollers,
  });
})()`;

export default async function ({ s, send, evaluate, sleep, shot, log }) {
  const out = {};
  for (const [tag, url] of PAGES) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) return { __throw: r.exceptionDetails.exception ? r.exceptionDetails.exception.description : JSON.stringify(r.exceptionDetails) };
      return r.result.value;
    };
    const sh = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const fs = await import('node:fs');
      const path = await import('node:path');
      const p = path.join(process.env.OUTDIR || 'F:\\sanguo\\work\\parity_cocos', name.endsWith('.png') ? name : name + '.png');
      fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
      return p;
    };
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url }, sessionId);
    await sleep(3500);
    const info = await ev(CENSUS);
    out[tag] = typeof info === 'string' ? JSON.parse(info) : info;
    out[tag].shot = await sh('web_' + tag + '.png');
    out[tag].url = url;
    log('### ' + tag + ' ' + JSON.stringify(out[tag]).slice(0, 900));
    await send('Target.closeTarget', { targetId });
  }
  return out;
}
