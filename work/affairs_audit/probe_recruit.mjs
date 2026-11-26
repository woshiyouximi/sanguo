// 探针③：徵兵 —— F13 钱→预备兵 (prepFromMoney) / 部队徵兵 (enlist) / 自治 tick / 旧 refillPrep
// 跑法：node work/affairs_audit/probe_recruit.mjs
import { W, C, DATA, makeSave, makeCtx, table, cityDef } from './lib.mjs';

const header = (s) => console.log('\n=== ' + s + ' ===');
const tot = (save, field) => Object.values(save.cities).reduce((a, st) => a + Number(st[field] || 0), 0);

// —— 0. 常量 ——
header('0. 徵兵/預備兵參數');
console.log('RECRUIT =', JSON.stringify(W.RECRUIT), ' PREP_PER_GOLD =', W.PREP_PER_GOLD);
console.log('prepCapOf(pop=327000) =', W.prepCapOf(327000), ' troopCapOf 同式:', W.troopCapOf(327000));
console.log('Cocos 有 prepFromMoney?', typeof C.prepFromMoney, ' PREP_PER_GOLD?', typeof C.PREP_PER_GOLD);

// —— 1. F13：100 金 = 1 預備兵 ——
header('1. prepFromMoney：n = min(floor(money/100), prepCap−prep)');
function stPrep(money, prep, pop = 327000) {
  const save = makeSave({ owned: ['南皮'], money: { 南皮: money }, month: 1 });
  const st = save.cities['南皮'];
  st.pop = pop; st.prep = prep; st.troops = st.inf + st.cav;
  return { save, st, cap: W.prepCapOf(pop) };
}
const cases = [
  ['money=250, prep=cap−1', 250, 239],
  ['money=0, prep=100', 0, 100],
  ['money=1000, prep=cap（已满）', 1000, 240],
  ['money=100000, prep=0', 100000, 0],
  ['money=99（不足 100）', 99, 100],
];
const rows = [];
for (const [label, money, prep] of cases) {
  const { save, st, cap } = stPrep(money, prep);
  const r = W.prepFromMoney(save, cityDef('南皮'), {});
  rows.push([label, `cap=${cap}`, r.n, r.cost, `${money}→${st.money}`, `prep ${prep}→${st.prep}`, r.ok]);
}
table(rows, ['场景', '上限', 'n', 'cost', '钱', '预备兵', 'ok']);
console.log('→ 一次调用只做一次批量兑换（无交互），n=0 也返回 ok:true；钱不够 100 或预备兵满 → n=0、钱不动。');

// —— 2. autonomyTick：换月每城（含敌城/关）都跑钱→预备兵 ——
header('2. autonomyTick：换月每城（全剧本 cities）钱→预备兵');
function tickSetup() {
  const save = makeSave({ owned: ['南皮'], money: { 南皮: 5000 }, month: 1 });
  const ctx = makeCtx(save);
  return { save, ctx, before: { money: tot(save, 'money'), prep: tot(save, 'prep') } };
}
const t1 = tickSetup();
const b1 = JSON.parse(JSON.stringify(t1.before));
const tick1 = W.autonomyTick(t1.save, DATA.scenarios[0].cities, t1.ctx);
console.log('第一次 tick：refilled 条数 =', tick1.refilled.length, ' auto =', tick1.auto, ' first =', tick1.first);
console.log('全城 钱 %d→%d，预备兵 %d→%d', b1.money, tot(t1.save, 'money'), b1.prep, tot(t1.save, 'prep'));
console.log('refilled 样例 =', JSON.stringify(tick1.refilled.slice(0, 3)));
console.log('save.autoMonth =', t1.save.autoMonth, '；南皮 money=5000→', t1.save.cities['南皮'].money, ' prep=240→', t1.save.cities['南皮'].prep, '（cap 240 → 只能兑 0！）');
const t2 = tickSetup();
t2.save.cities['南皮'].prep = 100; // 腾出空间再看
const tick2 = W.autonomyTick(t2.save, DATA.scenarios[0].cities, t2.ctx);
console.log('南皮 prep=100/240：tick 后 money 5000→%d prep 100→%d', t2.save.cities['南皮'].money, t2.save.cities['南皮'].prep);
console.log('敌方城 北平：money 2917→%d prep=%d→%d（未被拥有也照样兑换）',
  t2.save.cities['北平'].money, 240, t2.save.cities['北平'].prep);
const tick3 = W.autonomyTick(t2.save, DATA.scenarios[0].cities, t2.ctx); // 同月再调
console.log('同月再调：refilled =', tick3.refilled.length, '（month>autoMonth 才跑）');

// —— 3. ?loose=1 旧 refillPrep 口径 ——
header('3. loose=1 旧设计：每月白补 10%（不扣金）');
const L = makeSave({ owned: ['南皮'], money: { 南皮: 5000 }, month: 1 });
const Lctx = makeCtx(L);
L.cities['南皮'].prep = 100;
const lt1 = W.autonomyTick(L, DATA.scenarios[0].cities, Lctx, { loose: true });
console.log('第 1 次 loose tick：南皮 prep 100→%d（首月只记 prepMonth），money→%d', L.cities['南皮'].prep, L.cities['南皮'].money);
L.month = 2;
const lt2 = W.autonomyTick(L, DATA.scenarios[0].cities, Lctx, { loose: true });
console.log('第 2 次：prep→%d（+max(1,floor(cap*10%%))=%d），money→%d（不扣）', L.cities['南皮'].prep, Math.max(1, Math.floor(W.prepCapOf(L.cities['南皮'].pop) * 0.1)), L.cities['南皮'].money);
console.log('→ campaign.html:5437-5444 换月调 autonomyTick(save, cities, ctx) 不传 loose ⇒ 默认钱→兵；loose 只由 city.html ?loose=1（debug）触发。');

// —— 4. 部队徵兵：预备兵 → 兵（enlist）——
header('4. 部队徵兵 enlist：预备兵 → 步/騎（不花金）');
function enlistSetup({ prep = 240, troops = 240, money = 5000 } = {}) {
  const save = makeSave({ owned: ['南皮'], money: { 南皮: money }, month: 1 });
  const st = save.cities['南皮'];
  st.troops = troops; st.inf = troops; st.cav = 0; st.prep = prep;
  return { save, st, ctx: makeCtx(save), cd: cityDef('南皮') };
}
const e = enlistSetup();
console.log('armCaps =', JSON.stringify(W.armCaps(e.save, e.cd, e.ctx)), '（cav 由武將等級算：無 level 欄位 → level 20 → cavCap 0）');
const er1 = W.enlist(e.save, e.cd, { arm: 'inf', n: 100 }, e.ctx);
console.log('enlist inf 100 →', JSON.stringify(er1), ' st=', JSON.stringify({ inf: e.st.inf, cav: e.st.cav, troops: e.st.troops, prep: e.st.prep, money: e.st.money }));
const er2 = W.enlist(e.save, e.cd, { arm: 'cav', n: 10 }, e.ctx);
console.log('enlist cav 10（cav 上限 0）→', JSON.stringify(er2));
const e3 = enlistSetup({ prep: 50, troops: 595 });
const e3r = W.enlist(e3.save, e3.cd, { arm: 'inf', n: 50 }, e3.ctx);
console.log('troops=595 想补 50 →', JSON.stringify(e3r), '（troopLeft=5 只转 5）');
const e4 = enlistSetup({ prep: 0, troops: 240 });
console.log('prep=0 →', JSON.stringify(W.enlist(e4.save, e4.cd, { arm: 'inf', n: 10 }, e4.ctx)));
const e5 = enlistSetup({ prep: 100, troops: 600 });
console.log('troops=600（满）→', JSON.stringify(W.enlist(e5.save, e5.cd, { arm: 'inf', n: 10 }, e5.ctx)));

// —— 5. 旧 recruit（500 金 → 40 兵，只留给 campaign/自测）——
header('5. 旧 recruit（F15 前的第三套口径，city.html 已不用）');
const r5 = makeSave({ owned: ['南皮'], money: { 南皮: 5000 }, month: 1 });
const r5r = W.recruit(r5, cityDef('南皮'), {});
console.log('web recruit →', JSON.stringify(r5r), ' money→', r5.cities['南皮'].money, ' troops=', r5.cities['南皮'].troops);
console.log('→ city.html doRecruit(:881) 走的是 M.enlist；campaign.html:3854 改成跳 city.html?cmd=recruit。旧 recruit.js 只剩测试/别的入口在用。');
