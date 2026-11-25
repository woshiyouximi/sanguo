export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.bringToFront', {});
  const url = 'http://127.0.0.1:5173/web/deploy.html?demo=1&city=%E5%8C%97%E5%B9%B3&wise=32&advisor=%E5%9A%B4%E7%B6%B1';
  await s('Page.navigate', { url });
  await sleep(4000);
  const r = await ev(`(() => JSON.stringify({ hint: (document.getElementById('wisehint')||{}).textContent, on: [...document.querySelectorAll('#wisepick .it.on')].map(e=>e.textContent), err: window.__err || null }))()`);
  log(JSON.stringify(r));
  await shot('wise_advisor');
}
