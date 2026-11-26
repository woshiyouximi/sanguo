// 端到端：大地图 → 点敌城 → 「出 征」 → 出征编成页 → 「出 征」 → 战斗页 → 叫阵两段 → 回我方主将。
// 这是用户实际走的入口（不是 ?from=campaign 直连），用来证明叫阵在真实链路里也生效。
export default async function ({ s, evaluate, sleep, shot, log }) {
  const BASE = 'http://127.0.0.1:5173/web/';
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const js = async (expr) => JSON.parse(await ev(expr));
  const shotSafe = async (name) => { try { const r = await shot(name); return r && r.bytes; } catch (e) { return 'shot-fail:' + e.message; } };
  const out = {};

  // 1) 大地图
  await s('Page.navigate', { url: BASE + 'campaign.html?dev=1&unlimited=1&armyui=1' });
  await sleep(4500);
  out.map = await js(`(() => {
    const ui = window.__armyUi;
    return JSON.stringify({ owned: ui.owned().slice(0, 6), n: ui.owned().length,
      rows: document.querySelectorAll('#list .city').length });
  })()`);
  log('map', JSON.stringify(out.map));

  // 2) 逐个点非我方城，直到跳进 deploy.html（不接壤的会 toast 拒绝）
  const owned = new Set(out.map.owned || []);
  const tried = [];
  let onDeploy = false;
  for (let i = 0; i < 40 && !onDeploy; i += 1) {
    const name = await ev(`(() => {
      const rows = Array.from(document.querySelectorAll('#list .city'));
      const row = rows[${i}];
      if (!row) return '';
      row.click();
      return (row.querySelector('.n') || {}).textContent || '';
    })()`);
    await sleep(250);
    const cityName = String(name || '').replace(/[我方無主].*$/, '').trim();
    if (!cityName || owned.has(cityName)) continue;
    await ev(`(() => { const b = document.querySelector('.btn[data-act="march"]'); if (b && !b.disabled) b.click(); return 1; })()`);
    await sleep(2600);
    const where = await ev(`location.pathname + location.search`);
    tried.push(cityName + ' -> ' + where);
    if (String(where).includes('deploy.html')) { onDeploy = true; out.target = cityName; out.deployUrl = where; }
  }
  out.tried = tried.slice(0, 6);
  log('deploy', JSON.stringify({ onDeploy, target: out.target, url: out.deployUrl }));
  if (!onDeploy) { out.result = 'no-adjacent-city'; log('RESULT', JSON.stringify(out)); return out; }
  out.deploy = await js(`(() => JSON.stringify({
    gen: (document.querySelector('#gensub') || {}).textContent || '',
    go: (document.querySelector('#go') || {}).textContent || '',
    mode: (window.MARCH_MODE || '?'),
  }))()`);
  out.shotDeploy = await shotSafe('e01_deploy.png');

  // 3) 编成页点「出 征」→ 战斗页；把窗口提到前台，否则 rAF 被节流、叫阵不会推进
  const snap = `(() => {
    const st = window.__sanguo && window.__sanguo.state;
    if (!st) return JSON.stringify({ boot: false });
    const w = st.world;
    const t = st.taunt;
    const gs = w ? w.units.filter((u) => u.isGeneral).map((u) => ({ side: u.side, x: +(+u.x).toFixed(2), name: w.sides[u.side].general ? w.sides[u.side].general.name : '' })) : [];
    return JSON.stringify({
      boot: true, tick: Number(st.tick) || (w && w.tick) || 0, camX: +(+st.camX).toFixed(2), taunt: !!t,
      line: t && t.seq && t.seq[t.i] ? { side: t.seq[t.i].side, text: String(t.seq[t.i].text).slice(0, 16) } : null,
      gens: gs,
    });
  })()`;
  await s('Page.bringToFront');
  await ev(`(() => { const b = document.querySelector('#go'); if (b) b.click(); return 1; })()`);
  const samples = [];
  let shotDone = false;
  for (let i = 0; i < 160; i += 1) {
    let v = null;
    try { v = await js(snap); } catch (e) { v = null; }
    if (v && v.boot) {
      samples.push(v);
      if (v.taunt && !shotDone) { shotDone = true; out.shotEnemy = await shotSafe('e02_taunt_enemy.png'); }
      if (!v.taunt && v.tick > 0 && samples.some((x) => x.taunt)) break;
    }
    await sleep(120);
  }
  out.battleUrl = await ev(`location.pathname + location.search`);
  const tauntSamples = samples.filter((x) => x.taunt);
  const lines = [];
  for (const x of tauntSamples) if (x.line && !lines.some((y) => y.side === x.line.side && y.text === x.line.text)) lines.push(x.line);
  out.taunt = {
    seen: tauntSamples.length,
    cams: [...new Set(tauntSamples.map((x) => x.camX))],
    lines,
    ticks: [...new Set(tauntSamples.map((x) => x.tick))],
  };
  out.gensAtStart = samples.length ? samples[0].gens : null;
  log('taunt', JSON.stringify(out.taunt));
  log('gens', JSON.stringify(out.gensAtStart));

  await sleep(1500);
  out.afterResume = await js(snap);
  log('afterResume', JSON.stringify(out.afterResume));
  out.shotOwn = await shotSafe('e03_after_resume.png');

  const genA = (out.gensAtStart || []).find((g) => g.side === 'A') || {};
  const ok = lines.length >= 2 && lines[0].side === 'B'
    && out.afterResume.camX > 50 && out.afterResume.tick > 0
    && (typeof genA.x !== 'number' || genA.x - out.afterResume.camX <= 5);
  out.result = ok ? 'OK' : 'CHECK';
  log('RESULT', JSON.stringify(out));
  return out;
}
