// 探针⑤：移動武將 / 太守·軍師任命 / 情報 / 武將上限
// 跑法：node work/affairs_audit/probe_move_appoint_intel_cap.mjs
import { W, C, DATA, makeSave, makeCtx, table, pct, cityDef, wildByCity } from './lib.mjs';

const header = (s) => console.log('\n=== ' + s + ' ===');
const scen = DATA.scenarios[0];
const cdOf = (n) => scen.cities.find((c) => c.NAME === n);
const clone = (o) => JSON.parse(JSON.stringify(o));

// 选定相邻两座真城（非关）：宛 ↔ 洛陽（在野 3+2、驻守 2+8）
const A = '宛', B = '洛陽';
const st0 = (g) => (Array.isArray(g.status_by_times) ? g.status_by_times[0] : g.Status);
const short = (r) => ({ ok: r.ok, troops: r.troops, asked: r.asked, general: r.general && r.general.NAME, from: r.from, to: r.to, reason: r.reason });
function moveSetup() {
  const save = makeSave({ owned: [A, B], money: { [A]: 5000, [B]: 5000 }, month: 4 });
  const ctx = makeCtx(save);
  return { save, ctx };
}

// ============ 一、移動武將 ============
header(`一、移動武將（${A} → ${B}）：save.away / rosterOf / _moved / 回城`);
const mv = moveSetup();
const wildName = W.wildPool(mv.save, A, mv.ctx)[0].NAME;
console.log('先招一个在野将：', wildName, '（addToRoster 模拟搜索招到）');
W.addToRoster(mv.save, A, wildName);
console.log('移动前：rosterOf(A)=', W.rosterOf(mv.save, A, mv.ctx).map((g) => g.NAME).join(','),
  '; rosterOf(B)=', W.rosterOf(mv.save, B, mv.ctx).map((g) => g.NAME).join(','));
const rMove = W.move(mv.save, cdOf(A), { to: B, troops: 0, general: wildName }, mv.ctx);
console.log('move 结果 =', JSON.stringify(rMove));
console.log('移动后：save.away =', JSON.stringify(mv.save.away), '（移動不写 away）; roster._moved =', JSON.stringify(mv.save.roster._moved));
console.log('rosterOf(A) 含该将？', W.rosterOf(mv.save, A, mv.ctx).some((g) => g.NAME === wildName),
  '; rosterOf(B) 含该将？', W.rosterOf(mv.save, B, mv.ctx).some((g) => g.NAME === wildName),
  '; 目标城武将数 =', W.rosterOf(mv.save, B, mv.ctx).length);
console.log('移動後能不能直接在内政页行动（actedLocked）？', W.actedLocked(mv.save, wildName), '→ 该年剩余命令可在新城下（移动被当作即时换防，不是 save.away）');
const rBack = W.move(mv.save, cdOf(B), { to: A, troops: 0, general: wildName }, mv.ctx);
console.log('再移回 A：', JSON.stringify(rBack));
console.log('回城后：rosterOf(A) 含？', W.rosterOf(mv.save, A, mv.ctx).some((g) => g.NAME === wildName),
  ';_moved =', JSON.stringify(mv.save.roster._moved), '; save.roster[A] =', JSON.stringify(mv.save.roster[A]));
console.log('wildPool(A) 重新出现该将？', W.wildPool(mv.save, A, mv.ctx).some((g) => g.NAME === wildName), '← 在野招来的将回原城会「消失且可再被搜到」');

// 非在野（本城驻守）将的往返
const mv2 = moveSetup();
const stationed = W.rosterOf(mv2.save, A, mv2.ctx).find((g) => g.Status !== '野' || (g.status_by_times && g.status_by_times[0] !== '野'));
console.log('\n本城驻守将（status=', stationed.Status, '）：', stationed.NAME);
W.move(mv2.save, cdOf(A), { to: B, troops: 0, general: stationed.NAME }, mv2.ctx);
console.log('A→B 后 rosterOf(A) 含？', W.rosterOf(mv2.save, A, mv2.ctx).some((g) => g.NAME === stationed.NAME));
W.move(mv2.save, cdOf(B), { to: A, troops: 0, general: stationed.NAME }, mv2.ctx);
console.log('B→A 回城后 rosterOf(A) 含？', W.rosterOf(mv2.save, A, mv2.ctx).some((g) => g.NAME === stationed.NAME), '（驻守将往返正常）');

// 兵力移动
const mv3 = moveSetup();
const sA = mv3.save.cities[A], sB = mv3.save.cities[B];
sA.troops = 500; sA.inf = 500; sA.cav = 0;
const beforeB = sB.troops;
const rT = W.move(mv3.save, cdOf(A), { to: B, troops: 120 }, mv3.ctx);
console.log('\n兵力移动 120：', JSON.stringify(rT), ' A troops 500→', sA.troops, '; B troops', beforeB, '→', sB.troops, '; money 不变', mv3.save.cities[A].money);

// save.away 与 save.armies 的同步（F3）
header('F3：save.away 由 save.armies 重算（cocos 侧才有调用点；web 由 campaign.html 调 syncAway）');
const aw = moveSetup();
const gen = W.rosterOf(aw.save, A, aw.ctx)[0].NAME;
aw.save.armies = [{ side: 'A', id: 'army-1', general: gen, officers: [] }];
W.syncAway(aw.save);
console.log('兵团出征后 away =', JSON.stringify(aw.save.away), '; rosterOf(A) 含主将？', W.rosterOf(aw.save, A, aw.ctx).some((g) => g.NAME === gen));
aw.save.armies = [];
W.syncAway(aw.save);
console.log('撤兵后 away =', JSON.stringify(aw.save.away), '; rosterOf(A) 含主将？', W.rosterOf(aw.save, A, aw.ctx).some((g) => g.NAME === gen));

// ============ 二、太守·軍師任命 ============
header('二、太守/軍師任命：换了之后哪些内政数字立刻变？');
const ap = moveSetup();
const rosterA = W.rosterOf(ap.save, A, ap.ctx);
const g1 = rosterA[0], g2 = rosterA[1] || rosterA[0];
console.log('可选：', rosterA.map((g) => `${g.NAME}(STR${g.STR}/INT${g.INT})`).join('、'));
console.log('appoint(role=major, name=' + g1.NAME + ') →', JSON.stringify(W.appoint(ap.save, cdOf(A), 'major', g1.NAME, ap.ctx)));
console.log('appoint(role=wise, name=' + g2.NAME + ') →', JSON.stringify(W.appoint(ap.save, cdOf(A), 'wise', g2.NAME, ap.ctx)));
console.log('save.appointed =', JSON.stringify(ap.save.appointed));
console.log('非法 role：', JSON.stringify(W.appoint(ap.save, cdOf(A), 'king', g1.NAME, ap.ctx)));
console.log('不在 roster 的将（呂布）：', JSON.stringify(W.appoint(ap.save, cdOf(A), 'major', '呂布', ap.ctx)));
console.log('efficiencyOf（HUD 顯示 ×N）=', W.efficiencyOf(ap.save, cdOf(A), ap.ctx).toFixed(3), ' = majorFactor(太守 INT)');

// 太守等级影响搜索掉落窗（searchLevelOf 用太守，不用执行将）
header('太守等级 → 搜索掉落窗（searchLevelOf 用太守，不用执行将）');
for (const lv of [0, 5, 10, 30]) {
  const save = makeSave({ owned: [A], money: { [A]: 1000 }, month: 1 });
  const ctx = makeCtx(save);
  save.appointed[A] = { major: '程遠志' }; // INT44 的驻守将
  if (lv > 0) save.generalLevel['程遠志'] = lv;
  const pools = W.searchPools(DATA.items, W.ownedItemSeqs(save, ctx), W.searchLevelOf(save, cdOf(A), ctx));
  console.log(`太守等级=${lv} → searchLevelOf=${W.searchLevelOf(save, cdOf(A), ctx)}，talisman 池 ${pools.talisman.length} 件 / treasure 池 ${pools.treasure.length} 件`);
}
console.log('→ 无 ?lv=、也无 save.generalLevel 时（新档）等级=0 ⇒ 掉落不套等级窗，所有 Rate>0 物品都可能出。');

// 军师任命对开发/搜索/征兵的影响
header('軍師（wise）任命：對內政數字有没有影响');
function devOnce(major, wise) {
  const save = makeSave({ owned: [A], money: { [A]: 0 }, month: 1 });
  save.cities[A].pop = 300000; save.cities[A].def = 300;
  save.appointed[A] = { major }; if (wise) save.appointed[A].wise = wise;
  const ctx = makeCtx(save);
  W.setRng(() => 0.5);
  const r = W.develop(save, cdOf(A), ctx);
  W.setRng(null);
  return r;
}
const dNoWise = devOnce('程遠志', null), dWise = devOnce('程遠志', '諸葛亮');
console.log('无军师 +%d人口/+%d防御；军师=諸葛亮(INT100) +%d人口/+%d防御 → 相同？%s',
  dNoWise.pop, dNoWise.def, dWise.pop, dWise.def, dNoWise.pop === dWise.pop && dNoWise.def === dWise.def);
console.log('→ 军师在内政（开发/搜索/徵兵）里完全没有公式参与；wiseOf 只用于显示（city.html:661、campaign.html:1591）与兵团 advisor。');

// ============ 三、情報 ============
header('三、情報：是否只读');
const inf = moveSetup();
W.ensureExtras(inf.save);
const snapBefore = JSON.stringify({ save: inf.save, locked: W.monthLocked(inf.save, false) });
const intel = W.intel(inf.save, cdOf(A), inf.ctx);
const snapAfter = JSON.stringify({ save: inf.save, locked: W.monthLocked(inf.save, false) });
console.log('intel 前后存档完全一致？', snapBefore === snapAfter);
console.log('rows 条数 =', intel.rows.length, '（全剧本城）; self =', JSON.stringify(intel.self).slice(0, 120));
console.log('row 样例 =', JSON.stringify(intel.rows.find((r) => r.name === A)));
console.log('cityRow 字段：name/mine/gate/owner/troops/inf/cav/prep/prepCap/def/generals/major/auto（只读快照）');
console.log('不占月令：city.html:1133-1151 openIntel → afterCommand(false)；Cocos CityPanel cmdIntel:1577-1602 不 consume。');
console.log('情報頁? 情报没有专门页面，是城内抽屉；city.html:754 把情報放副令区（CMD_SECONDARY）。');

// ============ 四、武將上限 ============
header('四、武將上限 CITY_OFFICER_CAP=10：超限拒绝还是标红？搜索到第 11 个怎么办');
console.log('CITY_OFFICER_CAP =', W.CITY_OFFICER_CAP, ' Cocos =', C.CITY_OFFICER_CAP);
// 4.1 剧本自带超编（F19 提到的濮陽）
for (const city of ['濮陽', '洛陽', '江夏', '南皮']) {
  const save = makeSave({ owned: [city], money: { [city]: 0 } });
  const ctx = makeCtx(save);
  const n = W.rosterOf(save, city, ctx).length;
  console.log(`${city}：剧本载入 rosterOf=${n} → officerCapState =`, JSON.stringify(W.officerCapState(n)));
}
// 4.2 搜索突破 10：南皮 9 在野 + 2 驻守 = 11 上限可达
const capSave = makeSave({ owned: ['南皮'], money: { 南皮: 100000 }, month: 1 });
const capCtx = makeCtx(capSave);
const kinds = { talent: 0 };
for (let i = 0; i < 300 && W.wildPool(capSave, '南皮', capCtx).length > 0; i++) {
  const r = W.search(capSave, cityDef('南皮'), capCtx);
  if (r.ok && r.kind === 'talent') kinds.talent++;
}
const nCap = W.rosterOf(capSave, '南皮', capCtx).length;
console.log('南皮搜完 9 个在野后：rosterOf =', nCap, ' → officerCapState =', JSON.stringify(W.officerCapState(nCap)));
console.log('第 11 个将有没有被拒绝？没有：搜索代码没有 officerCap 引用（grep 结果 0 处）；JSON =',
  JSON.stringify(W.rosterOf(capSave, '南皮', capCtx).map((g) => g.NAME)));
console.log('→ 与差异表 F19「剧本自己就超编（濮陽15/洛陽15/江夏17），只標紅不裁切」一致：');
console.log('  city.html:667-673 与 campaign.html:2851 显示 N/CAP 并 hot 标红；Cocos CityPanel:1163 同样。');
console.log('  officerCapState 只返回 {n,cap,over}，不裁切、不拒绝。');
