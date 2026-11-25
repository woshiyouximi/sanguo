// 打开 web 基准页（campaign/city/items），量 DOM 矩形并截图 750×1334
const PAGES = [
  ['campaign', 'http://127.0.0.1:5173/web/campaign.html'],
  ['city', 'http://127.0.0.1:5173/web/city.html'],
  ['items', 'http://127.0.0.1:5173/web/items.html'],
];

export default async function ({ s, send, shot, log, sleep, evaluate }) {
  // 当前页（cocos）先别动，新开 target 看 web
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
      const out = path.join(process.env.OUTDIR || 'F:\\sanguo\\work\\cocos_layout', name.endsWith('.png') ? name : name + '.png');
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
      return out;
    };
    await ev('1');
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url }, sessionId);
    await sleep(2500);
    const info = await ev(`(() => {
      const g = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { sel, rect: [Math.round(r.x*10)/10, Math.round(r.y*10)/10, Math.round(r.width*10)/10, Math.round(r.height*10)/10], cs: (() => { const c = getComputedStyle(e); return { display: c.display, flex: c.flex, h: c.height, pad: c.padding, bg: c.background.slice(0,80), borderTop: c.borderTopWidth + ' ' + c.borderTopColor }; })() }; };
      const sels = ['#stage','header','header h1','#scstrip','#mapwrap','#map','.bgmap','#list','#logbox','.lt','#logrows','#actions','.btn','#hint','footer','#info','#panel','#cmdgrid','#log','#cityinfo','.infocard','.card'];
      return JSON.stringify({ title: document.title, inner: [innerWidth, innerHeight], body: g('body'), items: sels.map(g).filter(Boolean), html: document.body.className }, null, 0);
    })()`);
    log('### ' + tag + ' => ' + info);
    log('shot ' + await sh('web_' + tag + '.png'));
    await send('Target.closeTarget', { targetId });
  }
  return 'ok';
}
