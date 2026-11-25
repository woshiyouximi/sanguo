// 只看旗子畫得怎麼樣：把部隊周圍 140×140 的區域放大 4 倍截一張（不進交付物）
import fs from 'node:fs';
import path from 'node:path';

const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:5173/web/campaign.html?demo=1&armyui=1';

export default async function ({ evaluate, sleep, log, s, OUTDIR }) {
  const ev = async (expr) => { const v = await evaluate(expr); if (v && v.__throw) throw new Error(v.__throw); return v; };
  const J = async (expr) => { const v = await ev(expr); return typeof v === 'string' ? JSON.parse(v) : v; };
  const state = () => J('JSON.stringify(window.__armyUi ? window.__armyUi.state() : { noProbe: true })');

  await s('Page.bringToFront');
  await ev(`location.href=${JSON.stringify(PAGE)}; 'nav'`);
  await sleep(3200);
  await s('Page.bringToFront');
  let st = await state();
  if (!st.started) {
    await ev('document.querySelector("#pickCards [data-pick]").click(); "sc"');
    await sleep(350);
    await ev('document.getElementById("btnPickStart").click(); "to-king"');
    await sleep(700);
    await ev('(() => { const k = [...document.querySelectorAll("#pickCards [data-king]")].find((e) => e.dataset.off !== "1"); if (k) k.click(); return k ? k.dataset.king : null; })(); "k"');
    await sleep(350);
    await ev('document.getElementById("btnPickStart").click(); "start"');
    await sleep(2000);
  }
  st = await J('JSON.stringify(window.__armyUi.seed("mid"))');
  await sleep(400);
  await s('Page.bringToFront');
  const outs = [];
  for (const [i, a] of (st.armies || []).entries()) {
    log('army ' + i + ' ' + JSON.stringify(a));
    const r = await s('Page.captureScreenshot', {
      format: 'png',
      clip: { x: Math.max(0, a.x - 70), y: Math.max(0, a.y - 70), width: 140, height: 140, scale: 4 },
    });
    const out = path.join(OUTDIR, `zoom_pin_${i}.png`);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    outs.push(out);
  }
  log('zoom ' + JSON.stringify(outs));
  return { outs, state: st };
}
