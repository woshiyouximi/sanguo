/**
 * work/flow_audit/probe_flow.mjs —— 内政/大地图审计的量化探针（只读，不改 game/**）
 * 产出：
 *   1) 每个剧本的势力数与色板撞色情况（saves.js forceColorOf 真源）
 *   2) 每城武将数与「上限 10」超编情况（原作面板 13/10）
 *   3) 城池数据字段覆盖（garrison.json / save.cities）
 * 用法：node work\flow_audit\probe_flow.mjs
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = 'F:\\sanguo\\';
const G = JSON.parse(readFileSync(ROOT + 'game\\data\\garrison.json', 'utf8'));
const saves = await import(pathToFileURL(ROOT + 'game\\web\\saves.js').href);

const out = [];
const say = (s) => { out.push(s); console.log(s); };

say('== 1) 势力色板（saves.js FORCE_PALETTE 14 固定 + 14 备色 hash） ==');
for (const k of Object.keys(G)) {
  const cs = G[k].cities;
  const names = Object.keys(cs);
  const owners = [...new Set(names.map((n) => cs[n].owner).filter(Boolean))];
  const byColor = new Map();
  for (const f of owners) {
    const c = saves.forceColorOf(f);
    if (!byColor.has(c)) byColor.set(c, []);
    byColor.get(c).push(f);
  }
  const dup = [...byColor.entries()].filter(([, v]) => v.length > 1);
  const fixedHit = owners.filter((f) => saves.forceColorIndex(f) < 14).length;
  say(`剧本${k}（${G[k].scenario}）：${owners.length} 家势力，落在固定 14 色板的 ${fixedHit} 家，`
    + `撞色 ${dup.length} 组${dup.length ? '：' + dup.map(([c, v]) => `${c}=${v.join('/')}`).join('；') : ''}`);
  say(`   势力：${owners.join('、')}`);
}

say('');
say('== 2) 每城武将数 vs 原作面板上限（13/10 的 10） ==');
for (const k of Object.keys(G)) {
  const cs = G[k].cities;
  const rows = Object.keys(cs).map((n) => ({ n, c: (cs[n].officers || []).length }))
    .sort((a, b) => b.c - a.c);
  const over = rows.filter((r) => r.c > 10);
  say(`剧本${k}：最多 ${rows[0].n} ${rows[0].c} 人；>10 人的城 ${over.length} 座`
    + (over.length ? `（${over.slice(0, 6).map((r) => r.n + ' ' + r.c).join('、')}${over.length > 6 ? ' …' : ''}）` : ''));
}

say('');
say('== 3) 城池数据字段覆盖 ==');
const one = Object.values(G['0'].cities)[0];
say(`garrison.json 单城字段：${Object.keys(one).join(' / ')}`);
const scen = JSON.parse(readFileSync(ROOT + 'game\\data\\scenarios.json', 'utf8'));
const s0 = (scen.scenarios || scen.list || scen)[0];
const c0 = (s0.cities || s0.CITIES || [])[0];
say(`scenarios.json 单城字段：${Object.keys(c0).join(' / ')}`);
say(`save.cities 字段（saves.js cityState）：${Object.keys(saves.cityState ? saves.cityState(0, 'x') || {} : {}).join(' / ') || '（运行期生成，见 city_model.ensureCityState）'}`);

say('');
say('== 4) 年份：剧本起始年 vs 游戏内 yearOf(month) ==');
say(`yearOf(1)=${saves.yearOf(1)}  yearOf(13)=${saves.yearOf(13)}  isYearStart(1)=${saves.isYearStart(1)}  isYearStart(7)=${saves.isYearStart(7)}`);
say(`剧本列表（picker 文案里的年份）：${(scen.scenarios || scen.list || scen).map((s) => (s.name || s.NAME || '?') + (s.year || s.YEAR || '?')).join(' / ')}`);
