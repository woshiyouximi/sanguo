export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/campaign.html?demo=1&cb=' + Date.now() });
  await sleep(5000);
  const info = await ev(`(() => {
    const g = document.getElementById('gold');
    const cards = document.querySelectorAll('#scenStrip > *');
    const titles = [...cards].map((c) => (c.textContent || '').trim().slice(0, 12));
    return JSON.stringify({ title: document.title, gold: g ? g.textContent.trim() : null, cards: cards.length, titles, err: window.__lastError || null });
  })()`);
  log('campaign ' + JSON.stringify(info));
  await shot('w93_campaign');
}
