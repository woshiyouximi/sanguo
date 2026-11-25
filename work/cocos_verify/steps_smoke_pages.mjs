export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.bringToFront', {});
  const pages = [
    ['deploy', 'http://127.0.0.1:5173/web/deploy.html?demo=1'],
    ['city', 'http://127.0.0.1:5173/web/city.html?demo=1&city=%E5%8C%97%E5%B9%B3'],
    ['items', 'http://127.0.0.1:5173/web/items.html?demo=1'],
    ['campaign', 'http://127.0.0.1:5173/web/campaign.html?demo=1&dev=1'],
  ];
  for (const [name, url] of pages) {
    await s('Page.navigate', { url });
    await sleep(3500);
    const r = await ev(`(() => JSON.stringify({ t: document.title, h: document.body ? document.body.innerHTML.length : 0 }))()`);
    log(name + ' ' + JSON.stringify(r));
    await shot('sm_' + name);
  }
}
