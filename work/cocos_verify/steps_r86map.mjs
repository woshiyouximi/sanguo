export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href = 'http://127.0.0.1:5173/web/campaign.html?demo=1&cb=' + Date.now(); 'go'`);
  await sleep(7000);
  const a = await ev(`(() => {
    const t = document.body.innerText;
    return JSON.stringify({
      url: location.pathname + location.search,
      hasMap: !!document.querySelector('#bgmap'),
      hasLegend: t.includes('金環＝我方'),
      king: (t.match(/君主[^\\n]{0,40}/) || [''])[0],
      gold: (t.match(/金\\s*[\\d,]+/) || [''])[0],
      errors: (window.__sgErr || []).length
    });
  })()`);
  log('probe ' + JSON.stringify(a));
  await shot('r86_campaign_after_wire');
}
