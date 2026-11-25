export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  const info = async () => await ev(`(() => {
    const t = (id) => { const e = document.getElementById(id); return e ? (e.textContent || '').trim() : null; };
    const lg = [...document.querySelectorAll('[class*=legend], #lg')].map((e) => (e.textContent || '').trim()).join(' | ');
    return JSON.stringify({ scName: t('scName'), ct: t('ct'), gold: t('gold'), ym: t('ym'), lg });
  })()`);
  const rows = [];
  for (let i = 0; i < 5; i += 1) {
    await evaluate('localStorage.clear()');
    await s('Page.navigate', { url: 'http://127.0.0.1:5173/web/campaign.html?cb=' + (Date.now() + i) });
    await sleep(4200);
    const pre = await ev(`(() => { const c = document.querySelectorAll('#pickCards [data-pick]').length; return JSON.stringify({ cards: c }); })()`);
    await evaluate(`(() => { const el = document.querySelector('#pickCards [data-pick="${i}"]'); if (el) el.click(); return 1; })()`);
    await sleep(250);
    await evaluate(`(() => { const b = document.getElementById('btnPickStart'); if (b && !b.disabled) b.click(); return 1; })()`);
    await sleep(600);
    const kings = await ev(`(() => {
      const cards = [...document.querySelectorAll('#pickCards [data-king]')];
      const ok = cards.find((c) => !c.getAttribute('data-off'));
      if (ok) ok.click();
      const b = document.getElementById('btnPickStart');
      return JSON.stringify({ n: cards.length, pick: ok ? ok.getAttribute('data-king') : null, start: b ? !b.disabled : false });
    })()`);
    await sleep(250);
    await evaluate(`(() => { const b = document.getElementById('btnPickStart'); if (b && !b.disabled) b.click(); return 1; })()`);
    await sleep(2200);
    const got = await info();
    rows.push({ i, pre, kings, got });
    log('scen' + (i + 1) + ' ' + JSON.stringify({ kings, got }));
    await shot('scen' + (i + 1) + '_map');
  }
  log('SUMMARY ' + JSON.stringify(rows.map((r) => ({ i: r.i + 1, sc: r.got.scName, ct: r.got.ct, kings: r.kings.n, pick: r.kings.pick, ym: r.got.ym }))));
}
