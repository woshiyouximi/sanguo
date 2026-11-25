// work/data_audit/cmp_garrison.mjs
// 表：game/data/garrison.json（5 剧本 × 60 城 × {owner,major,wise,officers[],garrison}）
// 权威源：extract/pak/TIMES1..5.INI
//   [CITY##]    NAME/KING/MAJOR/WISE/POPULATION  → owner/major/wise
//   [GENERAL]   NAME/CITY/STR/INT/LOYAL/Status   → officers（CITY == 城名 的全部武将，含野将）
//
// 派生规则（写在 work/build_garrison.py 里，这里独立复算作交叉校验）：
//   officers 排序 = STR+INT 降序，同分按名字
//   garrison      = min(floor(POPULATION/2500)+110, 600)   ← 原作 CITY 段没有守军字段，属设计公式
//   KING 是纯数字（關隘的 1..12 脏值）时当空串 → 规则归一，不算数据差异
import { P, readIni, readJson, mkTable } from './lib.mjs';

function intOf(v, dflt = 0) {
  const t = String(v ?? '').trim();
  if (!t) return dflt;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

/** 原作里 KING/MAJOR/WISE 混有数值脏值（關隘 KING=1..12），extract 转成数字，本作统一当空串 */
function textOf(v) {
  const s = String(v ?? '').trim();
  if (/^\d+$/.test(s)) return '';
  return s;
}

function garrisonOf(pop) {
  return Math.min(Math.floor(intOf(pop) / 2500) + 110, 600);
}

export function run(opts = {}) {
  const table = readJson(P.data('garrison.json'));
  const t = mkTable('garrison', { ...opts, source: 'TIMES1..5.INI [CITY]/[GENERAL]' });
  let dirtyKing = 0;
  let officerRecords = 0;

  for (let s = 0; s < 5; s++) {
    const ini = readIni(P.timesIni(s + 1));
    const cities = ini.filter((x) => /^CITY\d+$/.test(x.head));
    const generals = ini.filter((x) => x.head === 'GENERAL');
    const ours = (table[s] || {}).cities || {};

    const byName = new Map();
    for (const g of generals) {
      const city = String(g.get('CITY') ?? '').trim();
      if (!city) continue;
      // 原作里 400 行是 `Loyal`、只有「盜賊」一行是 `LOYAL`（大写），按 build_garrison.py 的规则兼容两种
      const loyalRaw = g.get('Loyal') !== undefined ? g.get('Loyal') : g.get('LOYAL');
      const rec = {
        name: String(g.get('NAME') ?? '').trim(),
        str: intOf(g.get('STR')),
        int: intOf(g.get('INT')),
        loyal: intOf(loyalRaw),
        status: String(g.get('Status') ?? '').trim(),
      };
      if (!byName.has(city)) byName.set(city, []);
      byName.get(city).push(rec);
    }
    for (const list of byName.values()) {
      list.sort((a, b) => (b.str + b.int) - (a.str + a.int) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    }

    const seen = new Set();
    cities.forEach((c, ci) => {
      const name = String(c.get('NAME') ?? '').trim();
      seen.add(name);
      const rowIdx = s * 100 + ci;
      const label = `S${s + 1}:${name}`;
      const g = ours[name];
      if (!g) {
        t.add(label, rowIdx, '<城缺失>', name, '<缺失>');
        return;
      }
      const king = c.get('KING');
      if (/^\d+$/.test(String(king ?? '').trim())) dirtyKing++;
      t.add(label, rowIdx, 'owner', textOf(king), g.owner);
      t.add(label, rowIdx, 'major', textOf(c.get('MAJOR')), g.major);
      t.add(label, rowIdx, 'wise', textOf(c.get('WISE')), g.wise);

      const exp = byName.get(name) || [];
      const got = g.officers || [];
      t.add(label, rowIdx, 'officers.length', exp.length, got.length);
      const n = Math.max(exp.length, got.length);
      for (let oi = 0; oi < n; oi++) {
        const e = exp[oi] || {};
        const a = got[oi] || {};
        const oIdx = 100000 + s * 10000 + ci * 100 + oi;
        const oLabel = `${label}/${oi}`;
        t.add(oLabel, oIdx, 'officer.name', e.name, a.name);
        t.add(oLabel, oIdx, 'officer.str', e.str, a.str);
        t.add(oLabel, oIdx, 'officer.int', e.int, a.int);
        t.add(oLabel, oIdx, 'officer.loyal', e.loyal, a.loyal);
        t.add(oLabel, oIdx, 'officer.status', e.status, a.status);
        officerRecords++;
      }

      t.add(label, 200000 + rowIdx, 'garrison.formula',
        garrisonOf(c.get('POPULATION')), g.garrison);
    });

    for (const name of Object.keys(ours)) {
      if (!seen.has(name)) t.add(`S${s + 1}:${name}`, s * 100 + 99, '<多余城>', '', name);
    }
    t.rows += cities.length;
  }

  t.noteUncomparable('owner(KING 纯数字脏值)',
    `TIMES 里關隘的 KING 被写成 1..12（共 ${dirtyKing} 处），原作本身是转换残留；本作统一归一为空串，故这 ${dirtyKing} 格按规则比空串而非比原值`,
    dirtyKing);
  t.noteUncomparable('garrison（守军兵力）',
    `原作 [CITY##] 段没有守军字段，本作按 min(floor(POPULATION/2500)+110, 600) 生成（沿用 game/web/deploy.html）；审计改为校验公式自洽，共 ${officerRecords} 条武将记录`,
    300);
  return [t.done()];
}
