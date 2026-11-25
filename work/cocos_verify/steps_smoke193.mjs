export default async function ({ evaluate, sleep, shot, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const pages = [
    ['deploy', 'http://127.0.0.1:5173/web/deploy.html?demo=1'],
    ['city', 'http://127.0.0.1:5173/web/city.html?demo=1'],
    ['items', 'http://127.0.0.1:5173/web/items.html?demo=1'],
    ['campaign', 'http://127.0.0.1:5173/web/campaign.html?demo=1']
  ];
  for (const [name, url] of pages) {
    await s('Page.bringToFront', {});
    await s('Page.navigate', { url });
    await sleep(3500);
    const st = await ev("(() => ({ t: document.title, h1: (document.querySelector('h1,h2,.title')||{}).textContent || '', ds: document.querySelectorAll('[data-x]').length }))()");
    await shot('smoke_' + name);
    log(name + ' ' + JSON.stringify(st));
  }
}
