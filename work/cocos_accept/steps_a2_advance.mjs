// A2：大地圖落點確認 + 上一個月推進（doAction('advance')）
import fs from 'node:fs';
import path from 'node:path';

const H = `
  const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
  const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
  const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
  const __scene = () => (cc.director.getScene() ? cc.director.getScene().name : '?');
`;

export default async function ({ evaluate, sleep, shot, log, OUTDIR }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = { at: new Date().toISOString() };
  const sh = [];
  const S = async (n) => { const a = await shot(n + '_a'); await sleep(600); const b = await shot(n); sh.push({ name: n, a: a.bytes, b: b.bytes, same: a.bytes === b.bytes }); };

  // 等 Campaign 場景真的載完（冷啟動測到 6.05s）
  let waited = 0;
  for (let i = 0; i < 40; i += 1) {
    const sc = await ev(`(() => { ${H} return JSON.stringify({ scene: __scene() }); })()`);
    if (sc.scene === 'Campaign') break;
    await sleep(1000);
    waited += 1;
  }
  out.waitedForCampaignSec = waited;

  await S('a1_03_campaign');
  out.landing = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    if (!c) return JSON.stringify({ ok: false, scene: __scene() });
    const s = c.save || {};
    const m = c.monarchState || {};
    return JSON.stringify({
      ok: true, scene: __scene(),
      month: s.month, year: s.year, gold: s.gold, owned: s.owned, wins: s.wins, losses: s.losses,
      cities: c.cities ? c.cities.length : null, selected: c.selected, hint: c.hintText,
      monarch: m.monarch, force: m.force, king: m.king, seat: c.monarchSeat, extinct: c.monarchExtinct,
    });
  })()`);

  const readState = async () => ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    const s = c.save || {};
    return JSON.stringify({ month: s.month, year: s.year, gold: s.gold, owned: s.owned, wins: s.wins, losses: s.losses, hint: c.hintText, armies: (c.armies || []).length });
  })()`);

  out.before = await readState();
  out.advanceCall = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    if (!c || typeof c.doAction !== 'function') return JSON.stringify({ ok: false });
    c.doAction('advance');
    return JSON.stringify({ ok: true, monthAfter: (c.save || {}).month, hint: c.hintText });
  })()`);
  await sleep(1200);
  out.after = await readState();
  await S('a2_advance');

  // 再推一個月，看 AI 月報是否穩定出現
  out.advance2 = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    c.doAction('advance');
    return JSON.stringify({ monthAfter: (c.save || {}).month, hint: c.hintText });
  })()`);
  await sleep(1000);
  out.after2 = await readState();

  const ai1 = (out.before && out.advanceCall && out.advanceCall.hint) ? out.advanceCall.hint : '';
  out.hintRegex = {
    hint1: out.advanceCall ? out.advanceCall.hint : null,
    match1: /AI\s*月\s*報：(\d+)\s*個勢力行動/.exec(out.advanceCall ? out.advanceCall.hint || '' : '') ? true : false,
    match2: /AI\s*月\s*報：(\d+)\s*個勢力行動/.exec(out.after && out.after.hint ? out.after.hint : '') ? true : false,
    after2Match: /AI\s*月\s*報：(\d+)\s*個勢力行動/.exec(out.after2 && out.after2.hint ? out.after2.hint : '') ? true : false,
  };
  const m = /AI\s*月\s*報：(\d+)\s*個勢力行動/.exec((out.after2 && out.after2.hint) || '');
  out.aiCount = m ? Number(m[1]) : null;

  out.shots = sh;
  fs.writeFileSync(path.join(OUTDIR, 'r2.json'), JSON.stringify(out, null, 1), 'utf8');
  log('wrote r2.json');
  return out;
}
