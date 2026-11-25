export default async function ({ evaluate, sleep, shot, log }) {
  await evaluate(`location.href = 'http://127.0.0.1:5173/web/campaign.html?demo=1&dev=1&cb=' + Date.now(); 'go'`);
  await sleep(7000);
  const v = await evaluate(`(() => {
    if (typeof window.__scenLv !== 'function') return JSON.stringify({ ok: false, why: 'no __scenLv' });
    const names = ['曹操', '劉備', '董卓', '盜賊'];
    const rows = names.map((n) => [n, [0,1,2,3,4].map((i) => window.__scenLv(n, i))]);
    return JSON.stringify({ ok: true, counts: window.__scenLevels(), rows });
  })()`);
  log('levels ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  await shot('r86_campaign_devprobe');
}
