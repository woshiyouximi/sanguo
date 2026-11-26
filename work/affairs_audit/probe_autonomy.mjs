// 探针④：自治施行 —— runAutonomy（每城代行搜索+开发）/ autonomyTick（换月驱动）
// 跑法：node work/affairs_audit/probe_autonomy.mjs
import { W, DATA, makeSave, makeCtx, table, pct, cityDef } from './lib.mjs';

const header = (s) => console.log('\n=== ' + s + ' ===');
const scen = DATA.scenarios[0];

// —— 1. runAutonomy：auto 城各跑一次搜索 + 一次开发；免费；排除 from ——
header('1. runAutonomy：每自治城 = 1 次静默搜索 + 1 次开发（均免费）');
function autoSetup(autoCities, owned = ['南皮', '平原', '濮陽']) {
  const money = {}; for (const n of owned) money[n] = 10000;
  const save = makeSave({ owned, money, month: 3 });
  const ctx = makeCtx(save);
  save.auto = {}; for (const n of autoCities) save.auto[n] = 1;
  const before = {
    money: JSON.stringify(Object.fromEntries(owned.map((n) => [n, save.cities[n].money]))),
    pop: Object.fromEntries(autoCities.map((n) => [n, save.cities[n].pop])),
    def: Object.fromEntries(autoCities.map((n) => [n, save.cities[n].def])),
    searchSeq: JSON.stringify(save.searchSeq),
    logs: save.searchLog.length,
  };
  return { save, ctx, before };
}
const A = autoSetup(['南皮', '平原'], ['南皮', '平原', '濮陽']);
const resA = W.runAutonomy(A.save, scen.cities, A.ctx, { from: '濮陽' });
console.log('from=濮陽（当前城不入自治）：ran =', JSON.stringify(resA.ran), ' skipped=', JSON.stringify(resA.skipped));
console.log('cost=', resA.cost, ' text=', resA.text);
console.log('钱：%s → %s（自治搜索 free、自治开发 COST=0 ⇒ 完全不花金）',
  A.before.money, JSON.stringify(Object.fromEntries(A.save.owned.map((n) => [n, A.save.cities[n].money]))));
console.log('人口/防御：南皮 %d→%d / %d→%d ; 平原 %d→%d / %d→%d',
  A.before.pop['南皮'], A.save.cities['南皮'].pop, A.before.def['南皮'], A.save.cities['南皮'].def,
  A.before.pop['平原'], A.save.cities['平原'].pop, A.before.def['平原'], A.save.cities['平原'].def);
console.log('searchSeq：%s → %s（每城 +1）', A.before.searchSeq, JSON.stringify(A.save.searchSeq));
console.log('日志 %d 条 → %d 条：', A.before.logs, A.save.searchLog.length);
for (const e of A.save.searchLog) console.log('   -', JSON.stringify(e));

// —— 2. 静默搜索：搜到宝物不写日志，只有人才写「自治搜索」——
header('2. 自治搜索只出人才日志：连续 60 个月统计');
function manyMonths(cityName, months) {
  const save = makeSave({ owned: [cityName], money: { [cityName]: 0 }, month: 1 });
  const ctx = makeCtx(save);
  save.auto = { [cityName]: 1 };
  const foundSeq = new Set();
  let talentLog = 0, otherLog = 0, items = 0, searches = 0;
  for (let m = 1; m <= months; m++) {
    save.month = m;
    save.searchLog.length = 0;
    const r = W.runAutonomy(save, scen.cities, ctx, { from: '' });
    searches += 1;
    for (const e of save.searchLog) {
      if (String(e.text || '').includes('自治搜索')) talentLog++;
      else otherLog++;
    }
    const now = new Set(save.foundItems);
    for (const s of now) if (!foundSeq.has(s)) { foundSeq.add(s); items++; }
  }
  return { talentLog, otherLog, items, foundSeq: foundSeq.size, months, searches, save };
}
const mm = manyMonths('南皮', 60);
console.log('南皮 9 在野、跑 60 个月自治：');
console.log('  「自治搜索」人才日志 =', mm.talentLog, '（约 50% × 池子见底前的月份）');
console.log('  其它日志 =', mm.otherLog, '（应全为「城自治：開墾…」开发日志）');
console.log('  静默搜到的物品 =', mm.items, '件（唯一去重后 ' + mm.foundSeq.size + '），但日志里 0 条宝物提示 → F10「自动模式宝物不显示」成立');
console.log('  save.roster =', JSON.stringify(mm.save.roster));
const devLogs = mm.save.searchLog.filter((e) => String(e.text || '').includes('自治'));
console.log('  最后一个月日志样例：', JSON.stringify(mm.save.searchLog.slice(0, 3)));

// —— 3. 日志文本模板（原作口径：只人才/开发）——
header('3. 日志常量的文本模板');
console.log('AUTONOMY =', JSON.stringify(W.AUTONOMY));

// —— 4. develop 重掷 ≤8 次（F10 配套）：rng 全 0 时首掷 pop=def=0，靠重掷/或直接 skipped ——
header('4. develop 重掷：rng 前两次为 0（首掷 0/0）→ 重掷到成功');
const R = makeSave({ owned: ['襄平'], money: { 襄平: 0 }, month: 5 });
const cdR = cityDef('襄平'); // MAJOR 空 → 太守 INT 0
const ctxR = makeCtx(R);
R.auto = { 襄平: 1 };
let calls = 0;
const seq = [0, 0, 0.999, 0.999, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
W.setRng(() => seq[Math.min(calls++, seq.length - 1)]);
const rr = W.runAutonomy(R, scen.cities, ctxR, { from: '' });
W.setRng(null);
console.log('rng 序列强制首掷 0/0：ran =', JSON.stringify(rr.ran), ' skipped =', JSON.stringify(rr.skipped), ' rng 调用次数 =', calls);

// —— 5. autonomyTick 才驱动 runAutonomy；auto 为空则只跑钱→兵 ——
header('5. autonomyTick 与 auto 的关系');
const T = makeSave({ owned: ['南皮'], money: { 南皮: 2000 }, month: 1 });
const ctxT = makeCtx(T);
const tickNoAuto = W.autonomyTick(T, scen.cities, ctxT);
console.log('auto 为空：tick.auto =', tickNoAuto.auto, '（不跑自治，只跑 60 城钱→预备兵）');
T.auto = { 南皮: 1 };
T.month = 2;
const tickWithAuto = W.autonomyTick(T, scen.cities, ctxT);
console.log('auto=南皮：tick.auto =', JSON.stringify(tickWithAuto.auto), ' refilled=', tickWithAuto.refilled.length);
console.log('→ city.html:576 进内政页时也会补跑一次 autonomyTick；campaign.html:5437 换月跑一次；两处都传全剧本 cities。');

// —— 6. 自治城可以是敌方城吗？（模型层无归属校验）——
header('6. 自治名单里写敌方城：模型层照跑');
const X = makeSave({ owned: ['南皮'], money: { 南皮: 100 }, month: 7 });
X.auto = { 北平: 1 }; // 北平非 owned
const ctxX = makeCtx(X);
const rx = W.runAutonomy(X, scen.cities, ctxX, { from: '' });
console.log('北平（敌城）ran =', JSON.stringify(rx.ran), ' → 模型层没有 owned 校验；城市界面只允许勾己方城（city.html openAuto myCities），但若存档被改/旧档残留会替敌城开发。');
