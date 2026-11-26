export default async function probe({ evaluate, shot, sleep, log }) {
  const PAGE = 'http://127.0.0.1:9351/web/campaign.html?dev=1&auto=1';
  const dumpExpr = `(() => {
    const c = window.__clock;
    const sheetVis = [...document.querySelectorAll('.sheet')].filter((el) => !el.hidden).map((el) => el.id);
    return JSON.stringify({
      clock: c ? c.state() : null,
      scrimHidden: document.getElementById('scrim').hidden,
      stageClass: document.getElementById('stage').className,
      docHidden: document.hidden,
      sheets: sheetVis,
      pickBar: getComputedStyle(document.getElementById('pickBar')).display,
      path: location.pathname + location.search,
      ym: (document.getElementById('ym') || {}).textContent,
      hint: (document.getElementById('hint') || {}).textContent,
    });
  })()`;
  const dump = async () => { for (let i = 0; i < 6; i += 1) { const v = await evaluate(dumpExpr); try { return JSON.parse(v); } catch { await sleep(300); } } return null; };
  await evaluate(`localStorage.clear(); location.href = ${JSON.stringify(PAGE)}; true`);
  await sleep(2000);
  log('boot', JSON.stringify(await dump()));
  for (let i = 0; i < 24; i += 1) {
    const open = await evaluate(`!document.getElementById('pickSheet').hidden`);
    if (!open) break;
    await evaluate(`(() => {
      const start = document.getElementById('btnPickStart');
      if (start && !start.disabled) { start.click(); return 'start'; }
      const pick = document.querySelector('#pickCards [data-pick]');
      if (pick) { pick.click(); return 'pick'; }
      const king = document.querySelector('#pickCards [data-king]');
      if (king) { king.click(); return 'king'; }
      return '';
    })()`);
    await sleep(300);
  }
  for (let t = 0; t < 6; t += 1) {
    await sleep(700);
    log('t+' + (t + 1), JSON.stringify(await dump()));
  }
  await shot('probe_state');
  return await dump();
}
