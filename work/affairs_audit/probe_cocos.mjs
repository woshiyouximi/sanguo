// 探针⑥：Cocos vs web 分叉 —— 搜索双跑 200 次 / 搜到东西去哪 / 月令规则 / 换月钱变兵 / 开发公式 / 大地图旧口径
// 跑法：node work/affairs_audit/probe_cocos.mjs
import fs from 'node:fs';
import { W, C, DATA, makeSave, makeCtx, table, pct, cityDef } from './lib.mjs';

const header = (s) => console.log('\n=== ' + s + ' ===');
const ROOT = 'F:/sanguo';
const src = (p) => fs.readFileSync(`${ROOT}/game/${p}`, 'utf8').split('\n');
const show = (p, a, b) => {
  const s = src(p);
  console.log(`--- ${p}:${a}-${b} ---`);
  console.log(s.slice(a - 1, b).map((l, i) => String(i + a).padStart(4) + ': ' + l).join('\n'));
};
const dup = (o) => JSON.parse(JSON.stringify(o));
const kindsOf = (k, N) => [
  ['talent 武将', k.talent, pct(k.talent, N)],
  ['treasure 宝物', k.treasure, pct(k.treasure, N)],
  ['talisman 兵符/阵法书', k.talisman, pct(k.talisman, N)],
  ['none 一无所获', k.none, pct(k.none, N)],
  ['fail 失败', k.fail || 0, pct(k.fail || 0, N)],
];

// ============ 0. 双端导出/常量差异 ============
header('0. 双端模型导出与常量（node 直接 import CityModel.ts 可跑）');
const wn = Object.keys(W).sort(), cn = Object.keys(C).sort();
console.log('web 导出', wn.length, '；Cocos 导出', cn.length);
const onlyWeb = wn.filter((n) => !cn.includes(n)), onlyCocos = cn.filter((n) => !wn.includes(n));
console.log('只有 web 有：', onlyWeb.join(', '));
console.log('只有 Cocos 有：', onlyCocos.join(', '));
console.log('Cocos prepFromMoney =', typeof C.prepFromMoney, '（F13 钱变兵未移植）');
console.log('Cocos markActed/actedLocked/actedNames =', typeof C.markActed, typeof C.actedLocked, typeof C.actedNames, '（逐将年令未移植）');
console.log('Cocos markMonthActed/monthLocked =', typeof C.markMonthActed, typeof C.monthLocked);
for (const k of ['CITY_OFFICER_CAP', 'DEV', 'RECRUIT', 'MOVE', 'APPOINT', 'PATH_SENTINEL', 'FLAG_GATE', 'BAG_KEY', 'DEFAULT_BAG', 'MAJOR_RULE', 'DEV_FORMULA', 'CMD_ORDER', 'CMD_SECONDARY']) {
  const a = JSON.stringify(W[k]), b = JSON.stringify(C[k]);
  if (a !== b) console.log(`  常量不同 ${k}: web=${a} cocos=${b}`);
}
console.log('SEARCH web  =', JSON.stringify(W.SEARCH));
console.log('SEARCH cocos=', JSON.stringify(C.SEARCH));

// ============ 1. 搜索 200 次：web / Cocos 双列 ============
header('1. 搜索 200 次双跑：web 与 Cocos 是不是同一张表');
function mkSearch(money = 100000) {
  const save = makeSave({ owned: ['南皮'], money: { 南皮: money }, month: 1 });
  return { save, ctx: makeCtx(save), cd: cityDef('南皮') };
}
function runNatural(model, N = 200) {
  const x = mkSearch();
  const kinds = { talent: 0, treasure: 0, talisman: 0, none: 0, fail: 0 };
  const seqs = [], talents = [], seeds = [];
  for (let i = 0; i < N; i++) {
    const r = model.search(x.save, x.cd, x.ctx);
    if (!r.ok) { kinds.fail++; continue; }
    kinds[r.kind]++;
    seeds.push(r.seed);
    if (r.kind === 'talent') talents.push(r.general.NAME);
    if (r.seq) seqs.push(r.seq);
  }
  return { kinds, seqs, talents, seeds, x };
}
const wa = runNatural(W), ca = runNatural(C);
function twoCol(kw, kc, N) {
  const names = [['talent','talent 武将'],['treasure','treasure 宝物'],['talisman','talisman 兵符'],['none','none 一无所获'],['fail','fail 失败']];
  return names.map(([k, label]) => [label, kw[k] || 0, pct(kw[k] || 0, N), kc[k] || 0, pct(kc[k] || 0, N)]);
}
table(twoCol(wa.kinds, ca.kinds, 200), ['结果', 'web 次数', 'web 占比', 'Cocos 次数', 'Cocos 占比']);
console.log('200 次逐次判定完全相同？', JSON.stringify(wa.seeds) === JSON.stringify(ca.seeds) && JSON.stringify(wa.seqs) === JSON.stringify(ca.seqs) && JSON.stringify(wa.talents) === JSON.stringify(ca.talents));
console.log('搜到武将（web）：', wa.talents.join('、'));
console.log('道具 seq 序列（web）前 12：', wa.seqs.slice(0, 12).join(','));
console.log('→ 结论：两端 search() 字节级同一实现（同 seed 哈希、同 mulberry32、同 STAGE1 50/50、同 25/20/25 物品轮盘）。');
console.log('原文依据（web city_model.js:219-227 注释）：原作 0x48a260 表头 (50,30,20)；格0=50% 武将分支、格1/2=30+20=50% 落物品轮盘；');
console.log('  第二段（宝物/兵符/空手）原作未定位，本作沿用 25/20/25。第一段实际 50/50，而不是 50/30/20 三选一。');

function runFixedPool(model, N = 200) {
  const x = mkSearch(200 * 300);
  const kinds = { talent: 0, treasure: 0, talisman: 0, none: 0 };
  for (let i = 0; i < N; i++) {
    const r = model.search(x.save, x.cd, x.ctx);
    kinds[r.kind]++;
    if (r.kind === 'talent') { // 立刻清出 roster，池子保持 9 人
      const arr = x.save.roster['南皮'] || [];
      x.save.roster['南皮'] = arr.filter((n) => n !== r.general.NAME);
    }
  }
  return kinds;
}
const wf = runFixedPool(W), cf = runFixedPool(C);
table(twoCol(wf, cf, 200), ['结果', 'web 次数', 'web 占比', 'Cocos 次数', 'Cocos 占比']);
const itemN = wf.treasure + wf.talisman + wf.none;
console.log('恒定池（每次搜到人才清出）物品轮盘内部占比 web：treasure', pct(wf.treasure, itemN), '/ talisman', pct(wf.talisman, itemN), '/ none', pct(wf.none, itemN), '（设计 25/20/25 = 35.7/28.6/35.7）');

// ============ 2. 搜到的东西去哪 ============
header('2. 搜到的东西去哪（Cocos 页层 vs web 页层）');
const story = mkSearch(200 * 300);
let bag = W.parseItemsSave(null).bag.slice(); // 模拟 localStorage sanguo_items_v1 初始 12 件
const bag0 = bag.slice();
let seq21Events = 0;
let logTexts = new Set();
const talentAll = [];
for (let i = 0; i < 200; i++) {
  // Cocos CityPanel.cmdSearch:1444-1457：只 M.search + acted('搜索')；没有 withBagItem/bagAdd
  const r = C.search(story.save, story.cd, story.ctx);
  if (r.text) logTexts.add(r.text);
  if (r.kind === 'talent') talentAll.push(r.general.NAME);
  if (r.seq === 21) seq21Events++;
}
console.log('Cocos 路径跑 200 次：');
console.log('  日志里出现过「找到物品鳳嘴刀」？', [...logTexts].some((t) => t.includes('鳳嘴刀')), '（鳳嘴刀 = items.json Sequence 21，SearchType1 Lv10 Rate200 STR+7，非 ONLYONE）');
console.log('  鳳嘴刀被「找到」次数 =', seq21Events);
console.log('  localStorage 背包（items 頁讀的那份）200 次後 =', JSON.stringify(bag), '（长度', bag.length, '，与初始相同？', JSON.stringify(bag) === JSON.stringify(bag0), '）');
console.log('  save.foundItems（真的持久化的只有这个）=', JSON.stringify(story.save.foundItems));
console.log('  foundItems 含 21（鳳嘴刀）？', story.save.foundItems.includes(21), '；背包含 21？', bag.includes(21), '→ 物品页看不到它');
console.log('  如果用 web city.html:1026 的 bagAdd（M.withBagItem）會怎樣：', JSON.stringify(W.withBagItem({ equip: {}, bag }, 21).bag.length), '件（即 21 會進背包）');
console.log('  搜到武将（Cocos 路径）=', talentAll.join('、'));
console.log('  save.roster =', JSON.stringify(story.save.roster));
console.log('  save.captured 存在？', 'captured' in story.save, '；武将进的是 roster（不是 captured、不是直接入城 generals）');
console.log('  rosterOf(南皮) =', C.rosterOf(story.save, '南皮', story.ctx).length, '人 → 任命/移動/HUD 武将数都能看到');
console.log('  搜到武将日志（r.text）=', JSON.stringify([...logTexts].filter((t) => t.includes('將軍'))));
// web 页层模拟
const wstory = mkSearch(200 * 300);
let wbag = W.parseItemsSave(null).bag.slice();
for (let i = 0; i < 200; i++) {
  const r = W.search(wstory.save, wstory.cd, wstory.ctx);
  if ((r.kind === 'treasure' || r.kind === 'talisman') && r.seq) wbag = W.withBagItem({ equip: {}, bag: wbag }, r.seq).bag;
}
console.log('  对比 web city.html doSearch:1006-1033 路径同 200 次：背包', bag0.length, '→', wbag.length, '件（物品页可见）');
console.log('  ItemsPanel.ts:92 ITEM_SAVE_KEY=\'sanguo_items_v1\'，:350 读同一键；CityPanel 搜索从不调用 M.withBagItem（全仓只有定义 1 处、0 调用）');
show('cocos/assets/scripts/CityModel.ts', 1834, 1842);
show('cocos/assets/scripts/CityPanel.ts', 1444, 1458);

// ============ 3. Cocos「主令每項每月一次」＝ F7 误读 ============
header('3. Cocos 月令规则查源：主令每項每月一次是哪来的？');
const q = mkSearch(200 * 100);
q.save.month = 1;
const m1 = C.markCmdOrder(q.save, '搜索');
const m2 = C.markCmdOrder(q.save, '搜索');
console.log('markCmdOrder(搜索) 第一次 =', m1, '；第二次 =', m2, '；cmdOrderUsed =', C.cmdOrderUsed(q.save, '搜索'));
console.log('ordersUsedCount =', C.ordersUsedCount(q.save), '/', C.CMD_ORDER.length);
console.log('副令 markCmdOrder(情報) =', C.markCmdOrder(q.save, '情報'), '、cmdOrderUsed(情報) =', C.cmdOrderUsed(q.save, '情報'), '、isSecondaryCmd =', C.isSecondaryCmd('情報'), C.isSecondaryCmd('移動'));
console.log('模型层本身不拦：同月连点两次 C.search → 两次都成功（配额只是 UI 闸门）。');
const two = mkSearch(100000);
console.log('  ', C.search(two.save, two.cd, two.ctx).kind, '+', C.search(two.save, two.cd, two.ctx).kind, '（模型层无 cmdOrders 判断）');
console.log('换月清位：');
q.save.month = 2;
C.ensureExtras(q.save);
console.log('  month=2 + ensureExtras 后 cmdOrderUsed(搜索) =', C.cmdOrderUsed(q.save, '搜索'), '；cmdOrders =', JSON.stringify(q.save.cmdOrders));
show('cocos/assets/scripts/CityPanel.ts', 973, 975);
show('cocos/assets/scripts/CityPanel.ts', 1297, 1310);
show('cocos/assets/scripts/CityPanel.ts', 1318, 1338);
show('cocos/assets/scripts/CityModel.ts', 1970, 1982);
console.log('→ 「主令每項每月一次」的出處是 CityPanel.ts:1297-1303 註解自己寫的「web 是 CMD_ORDER 7 項各每月一次（city.html:754-759）」；');
console.log('   但 city.html:754-759 只是把 CMD_ORDER 畫成按鈕，web 真正的配額在 city.html:794-803 afterCommand → M.markActed(逐將年令)。');
show('web/city.html', 754, 760);
show('web/city.html', 788, 803);
console.log('web 模型有逐将年令 API：markActed/actedLocked/actedNames；Cocos 全无（见第 0 節导出差）。');
console.log('原作口径（work/ref_pdf/sanguo2_guide.txt）：');
console.log('  L21-23 每年 1 月停下来管一次内政，其余时间在大地图；L43-44 每个武将每年只能做一件事（搜索或开发）；L106-107 同上 + 在路上的将这一年不能内政。');
console.log('  → 原作粒度 = 「每将每年一次」，不是「每条主令每月一次」；Cocos 把 F7（7 条主令的集合）误读成 F7（每令月配额）。');
console.log('  Cocos 也没有正月门：CampaignRoot.ts:2092「月令改成每項主令每月一次…所以不再有 web 的正月閘門」，而 :2154 注释仍写「逐將年令、正月窗口」（同文件自相矛盾）。');
show('cocos/assets/scripts/CampaignRoot.ts', 2084, 2094);
show('cocos/assets/scripts/CampaignRoot.ts', 2152, 2172);

// ============ 4. searchSeq 不落盘 → 第 60 次后种子冻结 ============
header('4. Cocos 搜索种子：searchSeq 不落盘 → 第 60 次后 count 冻结');
function cocosReload(save, extrasBag = W.parseItemsSave(null).bag) {
  // 模拟 CityPanel.mergeSave():766-808 从 extras 重建，extras 里没有 searchSeq
  const save2 = {
    gold: 0, goldMigrated: true, month: save.month, owned: save.owned.slice(),
    cities: dup(save.cities), roster: dup(save.roster), appointed: dup(save.appointed),
    searchLog: dup(save.searchLog), foundItems: dup(save.foundItems), auto: dup(save.auto), autoMonth: save.autoMonth,
    lastActionMonth: save.lastActionMonth, cmdOrders: dup(save.cmdOrders), bag: extrasBag.slice(),
  };
  C.ensureExtras(save2);
  return save2;
}
const S = mkSearch(200 * 300);
const seeds = [];
for (let i = 0; i < 65; i++) seeds.push(C.search(S.save, S.cd, S.ctx).seed);
console.log('连续 65 次：searchSeq =', JSON.stringify(S.save.searchSeq), '；searchLog 条数 =', S.save.searchLog.length, '（MAX_LOG 60 截断）');
const reloaded = cocosReload(S.save);
console.log('模拟重进内政页（mergeSave 不带 searchSeq）→ ensureExtras 从 searchLog 重算：searchSeq =', JSON.stringify(reloaded.searchSeq), ' searchCount =', C.searchCount(reloaded, '南皮'));
const r61 = C.search(reloaded, S.cd, S.ctx);
console.log('重进后下一次搜索 seed =', r61.seed, '；与第 61 次（历史 count=60）的 seed', seeds[60], '相同？', r61.seed === seeds[60]);
console.log('→ 第 60 次之后 count 永远 =60，种子固定重复；web 把 searchSeq 存进战役档（不会冻结）。');
console.log('（web 基准：searchCount 走 save.searchSeq；见 city_model.js:1426-1444）');

// ============ 5. 换月：Cocos 白补 10% vs web 每城钱→兵 ============
header('5. 换月钱变兵：Cocos 仍是每月白补 10%（F13/F14 未移植）');
function prepFixture(model, month) {
  const save = makeSave({ owned: ['南皮'], money: { 南皮: 5000 }, month });
  save.cities['南皮'].prep = 100;
  save.cities['南皮'].pop = 327000;
  return { save, saveCities: DATA.scenarios[0].cities, ctx: makeCtx(save) };
}
const wTick = prepFixture(W, 2);
W.autonomyTick(wTick.save, wTick.saveCities, wTick.ctx);
console.log('web   : 南皮 money 5000→', wTick.save.cities['南皮'].money, ' prep 100→', wTick.save.cities['南皮'].prep, '（n=min(floor(5000/100),140)=50 → 应 150）');
const cTick = prepFixture(C, 2);
C.autonomyTick(cTick.save, cTick.saveCities, cTick.ctx);
const cPre = cTick.save.cities['南皮'].prep, cMoney = cTick.save.cities['南皮'].money;
cTick.save.month = 3;
C.autonomyTick(cTick.save, cTick.saveCities, cTick.ctx);
console.log('Cocos : 南皮 money 5000→', cMoney, ' prep 100→', cTick.save.cities['南皮'].prep, '（首月只记 prepMonth，次月 +10%cap 白补）');
console.log('Cocos 有 prepFromMoney？', typeof C.prepFromMoney, '；全仓只有 game/web/city_model.js 有');
show('cocos/assets/scripts/CityModel.ts', 1712, 1730);
show('cocos/assets/scripts/GameState.ts', 849, 862);
console.log('→ GameState.advanceMonth:849-862 还留着「守军每月白补 2%」，web 的 F14 已删；注释自己承认是未修差异。');

// ============ 6. 开发公式分叉 + 徵兵/大地图旧口径 ============
header('6. 开发公式：web 用执行将算基数、太守做缩放；Cocos 全用太守');
function devPair(major, exec) {
  const out = {};
  for (const [tag, model] of [['web', W], ['cocos', C]]) {
    const save = makeSave({ owned: ['南皮'], money: { 南皮: 0 }, month: 1 });
    save.cities['南皮'].pop = 300000; save.cities['南皮'].def = 300;
    save.appointed['南皮'] = { major };
    const ctx = makeCtx(save, 0, { exec });
    model.setRng(() => 0.5);
    const r = model.develop(save, cityDef('南皮'), ctx);
    model.setRng(null);
    out[tag] = `+${r.pop}/+${r.def}`;
  }
  return out;
}
table(
  [
    ['太守呂布42/執行呂布42', devPair('呂布', '呂布').web, devPair('呂布', '呂布').cocos],
    ['太守諸葛亮100/執行呂布42', devPair('諸葛亮', '呂布').web, devPair('諸葛亮', '呂布').cocos],
    ['太守呂布42/執行諸葛亮100', devPair('呂布', '諸葛亮').web, devPair('呂布', '諸葛亮').cocos],
  ],
  ['配置（人口/防御）', 'web', 'Cocos'],
);
show('cocos/assets/scripts/CityModel.ts', 1156, 1188);

header('6b. Cocos 大地图仍有第三套徵兵/开发口径（F12/F15 未接入）');
console.log('GameState.recruit：本城金 500 → 兵 +40（GameState.ts:867-877）；GameState.develop：本城金 400 → 民 +3000（:879-889）');
show('cocos/assets/scripts/GameState.ts', 867, 890);
show('cocos/assets/scripts/CampaignRoot.ts', 2148, 2172);
console.log('→ Cocos 大地图：无敌情时「內 政」进城内页（新口径）；有敌军抵达/在途时 actions() 返回旧「徵 兵 500金/開 發 400金」按钮，走 GameState.recruit/develop（旧口径）。');
show('cocos/assets/scripts/CampaignRoot.ts', 1920, 1940);


header('3b. 同一年能搜几次：web 逐将年令 vs Cocos 逐令月配額');
// web：平原 3 驻守将；每将每年一次
const wq = makeSave({ owned: ['平原'], money: { 平原: 200000 }, month: 1 });
const wctx = makeCtx(wq);
const rosterW = W.rosterOf(wq, '平原', wctx).map((g) => g.NAME);
console.log('web 平原 rosterOf =', rosterW.join('、'), '（', rosterW.length, '人）');
const free1 = rosterW.filter((n) => !W.actedLocked(wq, n));
console.log('1 月未行动的人 =', free1.length, '人 → 同一月内可用不同将各搜一次（最多', free1.length, '次/年，因只有 1 月能进内政）');
W.markActed(wq, rosterW[0]);
console.log('  張飛式：markActed(', rosterW[0], ') 后 actedLocked =', W.actedLocked(wq, rosterW[0]), '；其余将仍可下 =', rosterW.filter((n) => !W.actedLocked(wq, n)).length, '人');
wq.month = 13;
console.log('  跨年（month=13，yearOf=2）后 actedLocked(', rosterW[0], ') =', W.actedLocked(wq, rosterW[0]), '→ 次年又能用');
// Cocos：同一武将不限次数，只限「每条主令每月一次」
const cq = makeSave({ owned: ['平原'], money: { 平原: 200000 }, month: 1 });
const cctx = makeCtx(cq);
let searches = 0;
for (let m = 1; m <= 12; m++) {
  cq.month = m; C.ensureExtras(cq);
  if (!C.cmdOrderUsed(cq, '搜索')) { C.search(cq, cityDef('平原'), cctx); C.markCmdOrder(cq, '搜索'); searches++; }
}
console.log('Cocos 同一年（12 个月各进一次内政）用无将限制方式搜索 =', searches, '次/年/城（每月 1 次，同一批武将重复用，无 acted 状态）');
console.log('→ 原作/ web 粒度：每将每年 1 次（平原 3 将 ≤ 3 次/年，且只 1 月）；Cocos：每条主令每月 1 次（搜索最多 12 次/年/城，不看将）。');
