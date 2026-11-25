// work/data_audit/cmp_generals.mjs
// 表：game/data/generals.json（401 武将）
// 权威源：extract/pak/TIMES1..5.INI 的 [GENERAL] 段（传统字原文）
//
// 三张子表：
//   generals            — 以 TIMES1 为基准逐字段比全部标量/列表字段（含 POS 五槽、SKILL/WISESKILL）
//   generals_era        — 每剧本的 CITY / Status / POS / BLOOD / BattleArray / Force / UseForce /
//                         LoyalKing / Weapon（共 9 字段 × 401 将 × 5 剧本 = 18045 格）
//   generals_baseexp    — BaseEXP 是「剧本级常量」（200/200/800/2000/3800）的规则校验
// 时代差异（本报告 R167 起）：BattleArray/Force/UseForce/LoyalKing/Weapon 在 5 个剧本里会变，
// 本作在 generals.json 里为这 5 个字段各加了 `*_by_times[5]`（生成器 work/data_audit/gen_generals_era.mjs，
// 按 NAME 匹配 times1..5.json），故从「不可比」改成 generals_era 里逐剧本比对；
// 单值字段仍表示 TIMES1，由 generals 表照旧比对。读取方 game/src/core/unlock.ts 的 eraFieldOf() 时代优先。
import { P, readIni, readJson, mkTable } from './lib.mjs';

/** 本作自己加的派生字段，不参与比对 */
const OURS_ONLY = new Set(['id', 'pos_by_times', 'city_by_times', 'status_by_times']);
/** 原作里是空格分隔字符串、JSON 里是数组 */
const LIST_SPLIT = new Set(['POS', 'BattleArray', 'Force']);
/** 原作里是重复键多行、JSON 里是数组 */
const LIST_REPEAT = new Set(['SKILL', 'WISESKILL', 'Skill']);
/** Loyal 有两种大小写（400 行 `Loyal` + 盜賊一行 `LOYAL`） */
const ALIAS = { LOYAL: 'Loyal', Loyal: 'Loyal' };
/** 每剧本会变的字段（数据里各有一份 `*_by_times[5]`，由 cmpEra 逐剧本比对） */
const ERA_VARYING = ['BattleArray', 'Force', 'UseForce', 'LoyalKing', 'Weapon'];
/** 原作 BaseEXP 是剧本级常量 */
const BASEEXP_BY_SCENARIO = { 0: '200', 1: '200', 2: '800', 3: '2000', 4: '3800' };

const splitList = (v) => String(v ?? '').split(/\s+/).filter((s) => s !== '');

function ourValue(o, key) {
  if (ALIAS[key]) return o.Loyal !== undefined ? o.Loyal : o.LOYAL;
  return o[key];
}

/** 本作个别标量字段被包成单元素数组（UseForce:["刀"] vs 原作 `UseForce=刀`）→ 比对前拆包 */
function unwrap1(v) {
  return Array.isArray(v) && v.length === 1 ? v[0] : v;
}

function cmpStatic(opts) {
  const ours = readJson(P.data('generals.json'));
  const ini = readIni(P.timesIni(1)).filter((s) => s.head === 'GENERAL');
  const t = mkTable('generals', { ...opts, source: 'TIMES1.INI [GENERAL]' });
  t.rows = Math.max(ours.length, ini.length);
  if (ours.length !== ini.length) t.add('<行数>', -1, '<count>', ini.length, ours.length);

  ini.forEach((sec, j) => {
    const o = ours[j] || {};
    const name = sec.get('NAME') ?? '?';
    const label = `${j}:${name}`;
    // 归一成「规范键名」再去重：原作 `LOYAL`（盜賊一行）与本作 `Loyal` 视为同一字段，只比一次
    const rawKeys = [...sec.keys(), ...Object.keys(o).filter((k) => !OURS_ONLY.has(k) && !k.endsWith('_by_times'))];
    const keys = [...new Set(rawKeys.map((k) => ALIAS[k] || k))];
    for (const key of keys) {
      const origKey = sec.get(key) !== undefined ? key : key === 'Loyal' ? 'LOYAL' : key;
      const orig = LIST_REPEAT.has(origKey) ? sec.all(origKey) : LIST_SPLIT.has(key) ? splitList(sec.get(origKey)) : sec.get(origKey);
      let gv = ourValue(o, key);
      if (!Array.isArray(orig) && !LIST_SPLIT.has(key)) gv = unwrap1(gv);
      if (orig === undefined) t.add(label, j, `<多余键 ${key}>`, '', gv);
      else if (gv === undefined) t.add(label, j, key, Array.isArray(orig) ? orig.join(' ') : orig, '<缺失>');
      else t.add(label, j, key, orig, gv);
    }
  });

  return t.done();
}

/**
 * 原作 `LoyalKing` 只有模板行「盜賊」没有这个键（该段只有 `LOYAL=`，无君主）；
 * times1..5.json 对它的归一值是 `""`，所以这里只放这一行把缺键当空串。
 * 其余 400 人 5 个剧本都有 LoyalKing 键（值可为空），缺键仍算差异 —— 不放松。
 */
function eraOrig(sec, key, name) {
  const v = sec.get(key);
  if (v !== undefined) return v;
  if (key === 'LoyalKing' && name === '盜賊') return '';
  return v;
}

function cmpEra(opts) {
  const ours = readJson(P.data('generals.json'));
  const t = mkTable('generals_era', { ...opts, source: 'TIMES1..5.INI [GENERAL] 每剧本字段' });
  for (let s = 0; s < 5; s++) {
    const ini = readIni(P.timesIni(s + 1)).filter((x) => x.head === 'GENERAL');
    ini.forEach((sec, j) => {
      const o = ours[j] || {};
      const idx = 1000 + s * 500 + j;
      const name = sec.get('NAME') ?? '?';
      const label = `S${s + 1}:${name}`;
      t.add(label, idx, 'CITY', sec.get('CITY'), (o.city_by_times || [])[s]);
      t.add(label, idx, 'Status', sec.get('Status'), (o.status_by_times || [])[s]);
      t.add(label, idx, 'POS', splitList(sec.get('POS')), splitList((o.pos_by_times || [])[s]));
      const bloodOrig = sec.get('BLOOD');
      const bloodOurs = Array.isArray(o.BLOOD_by_times) ? o.BLOOD_by_times[s] : o.BLOOD;
      t.add(label, idx, 'BLOOD', bloodOrig, bloodOurs);
      // 时代差异 5 字段（R167）：数据里各有一份 `*_by_times[5]`，逐剧本比对。
      // 列表字段（BattleArray/Force/UseForce）原作是空格串，本作存 string[]；标量字段存 string。
      for (const key of ERA_VARYING) {
        const arr = o[`${key}_by_times`];
        const own = Array.isArray(arr) ? arr[s] : undefined;
        const raw = eraOrig(sec, key, name);
        const isList = key === 'BattleArray' || key === 'Force' || key === 'UseForce';
        t.add(label, idx, key, isList ? splitList(raw) : raw, own);
      }
      t.rows++;
    });
  }
  t.noteUncomparable('BLOOD_by_times',
    'BLOOD 在 5 个剧本里只有「孫尚香」不同（T4=孫權），单值字段装不下 → 加可选字段 BLOOD_by_times[5]，读取方优先用它',
    401 * 5);
  return t.done();
}

function cmpBaseExpRule(opts) {
  const t = mkTable('generals_baseexp', { ...opts, source: 'TIMES1..5.INI [GENERAL] BaseEXP' });
  const exceptions = [];
  for (let s = 0; s < 5; s++) {
    const ini = readIni(P.timesIni(s + 1)).filter((x) => x.head === 'GENERAL');
    ini.forEach((sec, j) => {
      const name = sec.get('NAME') ?? '?';
      const orig = sec.get('BaseEXP');
      const expect = name === '盜賊' ? '9999' : BASEEXP_BY_SCENARIO[s];
      const idx = 1000 + s * 500 + j;
      if (String(orig) !== expect) exceptions.push({ s, name, orig, expect });
      t.add(`S${s + 1}:${name}`, idx, 'BaseEXP(=剧本常量)', expect, orig);
      t.rows++;
    });
  }
  t.noteUncomparable('BaseEXP',
    `原作每剧本的 BaseEXP 是剧本级常量（T1..T5 = 200/200/800/2000/3800，盜賊固定 9999）；本作只存 TIMES1 的 200，` +
      `每剧本等级由 game/data/levels_by_scenario.json（401×5）补偿，levels.ts:startLevelOf() 已按它算 —— 属既定分工，不算数据差异（规则校验例外 ${exceptions.length} 处）`,
    401);
  return t.done();
}

export function run(opts = {}) {
  return [cmpStatic(opts), cmpEra(opts), cmpBaseExpRule(opts)];
}
