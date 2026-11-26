// 探针①：搜索（doSearch 模型层 200 次抽样）—— 是否真产出武将/道具、钱扣没扣、进哪
// 跑法：node work/affairs_audit/probe_search.mjs
import { W, DATA, makeSave, makeCtx, table, pct, cityDef, wildByCity } from './lib.mjs';
import * as M from 'file:///F:/sanguo/game/web/city_model.js';

const header = (s) => console.log('\n=== ' + s + ' ===');
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// —— 0. 关卡/空城名单（RATE===0 或 POPULATION===0）——
const scen = DATA.scenarios[0];
const gates = scen.cities.filter((c) => Number(c.RATE) === 0 || Number(c.POPULATION) === 0).map((c) => c.NAME);
const wild = wildByCity(0);
const zeroWild = scen.cities.map((c) => c.NAME).filter((n) => !wild[n]);
header('0. 剧本0 城/在野分布');
console.log('关城(RATE=0或POP=0)：', gates.join('、') || '无');
console.log('在野将 63 名，分布前 8：', Object.entries(wild).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, k]) => `${n}:${k}`).join('  '));
console.log('零在野城数 =', zeroWild.length, '，示例：', zeroWild.slice(0, 8).join('、'));

// —— 1. 自然池：南皮（9 在野）真实跑 200 次 ——
function runNatural(cityName, times) {
  const save = makeSave({ owned: [cityName], money: { [cityName]: 100000 }, month: 1 });
  const ctx = makeCtx(save);
  const cd = cityDef(cityName);
  const st = save.cities[cityName];
  const kinds = { talent: 0, treasure: 0, talisman: 0, none: 0, fail: 0 };
  const talents = [], itemSeqs = [];
  const bags = new Map(); // 模拟 city.html bagAdd 后的背包
  let bag = M.parseItemsSave(null).bag.slice();
  const moneySpent = [];
  for (let i = 0; i < times; i++) {
    const before = st.money;
    const r = M.search(save, cd, ctx);
    moneySpent.push(before - st.money);
    if (!r.ok) { kinds.fail++; continue; }
    kinds[r.kind]++;
    if (r.kind === 'talent') talents.push(r.general.NAME);
    if ((r.kind === 'treasure' || r.kind === 'talisman') && r.seq) {
      itemSeqs.push(r.seq);
      // city.html:1006-1033 的成功分支：bagAdd(seq) 写 localStorage
      const parsed = { equip: [], bag };
      const next = M.withBagItem(parsed, r.seq);
      bag = next.bag;
    }
  }
  return { save, ctx, kinds, talents, itemSeqs, bag, moneySpent, st };
}

header('1. 自然池：南皮（9 在野 + 2 驻守），连续搜索 200 次');
const N = 200;
const nat = runNatural('南皮', N);
table([
  ['talent 搜到武将', nat.kinds.talent, pct(nat.kinds.talent, N)],
  ['treasure 宝物', nat.kinds.treasure, pct(nat.kinds.treasure, N)],
  ['talisman 兵符/道具', nat.kinds.talisman, pct(nat.kinds.talisman, N)],
  ['none 一无所获', nat.kinds.none, pct(nat.kinds.none, N)],
  ['fail 失败', nat.kinds.fail, pct(nat.kinds.fail, N)],
], ['结果', '次数', '占比']);
console.log('搜到武将（按序）：', nat.talents.join('、') || '无');
console.log('自然池被掏空后 talent 归零 → 后 200−%d 次只能出物品/空。', nat.talents.length);
console.log('钱：起始 100000 → 结束', nat.st.money, '，总扣', sum(nat.moneySpent), '（每次成功 200，失败不扣）');
console.log('每次扣钱分布：', JSON.stringify([...new Set(nat.moneySpent)]));
console.log('save.roster =', JSON.stringify(nat.save.roster));
console.log('rosterOf(南皮).length =', M.rosterOf(nat.save, '南皮', nat.ctx).length, '，wildPool 剩余 =', M.wildPool(nat.save, '南皮', nat.ctx).length);
console.log('save.captured 存在？', 'captured' in nat.save, '（搜索不写 captured）');
console.log('道具进的是 city.html 的 localStorage 背包：bagAdd 后 bag 长度', bag0(), '；模型层 ctx.bag 未变 =>', nat.ctx.bag.length);
function bag0() { return nat.bag.length; }
const dup = nat.itemSeqs.length - new Set(nat.itemSeqs).size;
console.log('搜到道具 seq 数 =', nat.itemSeqs.length, '，去重后 =', new Set(nat.itemSeqs).size, '，重复 =', dup);
console.log('foundItems =', JSON.stringify(nat.save.foundItems));
console.log('searchLog 条数 =', nat.save.searchLog.length, '（MAX_LOG 截断）');
console.log('searchSeq[南皮] =', nat.save.searchSeq['南皮'], ' searchCount(2参) =', M.searchCount(nat.save, '南皮'));

// —— 2. 恒定池：每命中人才立即清出 roster，200 次测第一段概率 ——
function runFixed(cityName, times, level) {
  const save = makeSave({ owned: [cityName], money: { [cityName]: 100000 }, month: 1 });
  const ctx = makeCtx(save, 0, level != null ? { level } : {});
  const cd = cityDef(cityName);
  const st = save.cities[cityName];
  const kinds = { talent: 0, treasure: 0, talisman: 0, none: 0 };
  for (let i = 0; i < times; i++) {
    const r = M.search(save, cd, ctx);
    if (!r.ok) throw new Error('gold:' + JSON.stringify(r));
    kinds[r.kind]++;
    if (r.kind === 'talent') {
      // 把该将移出 roster[城]，恢复 wildPool
      const arr = save.roster[cityName] || [];
      save.roster[cityName] = arr.filter((n) => n !== r.general.NAME);
    }
  }
  return { kinds, st };
}

header('2. 恒定池（每次搜到即清出，池始终 9 人），200 次：测第一段 50/50');
const fx = runFixed('南皮', 200);
table([
  ['talent', fx.kinds.talent, pct(fx.kinds.talent, 200)],
  ['treasure', fx.kinds.treasure, pct(fx.kinds.treasure, 200)],
  ['talisman', fx.kinds.talisman, pct(fx.kinds.talisman, 200)],
  ['none', fx.kinds.none, pct(fx.kinds.none, 200)],
], ['结果', '次数', '占比']);
const itemN = fx.kinds.treasure + fx.kinds.talisman + fx.kinds.none;
console.log('进入物品轮盘（talent 未命中）共', itemN, '次；其中 treasure/talisman/none =',
  pct(fx.kinds.treasure, itemN), '/', pct(fx.kinds.talisman, itemN), '/', pct(fx.kinds.none, itemN),
  '（设计权重 25/20/25 → 35.7/28.6/35.7）');

// —— 3. 零在野城：武将永远搜不到 ——
header('3. 零在野城（代縣），100 次：武将产出必须为 0');
const zc = '代縣';
const zres = runFixed(zc, 100);
console.log('代縣 wildPool =', M.wildPool(makeSave({ owned: [zc], money: { [zc]: 50000 } }), zc, makeCtx(makeSave({ owned: [zc], money: { [zc]: 50000 } }))).length);
table([
  ['talent', zres.kinds.talent, pct(zres.kinds.talent, 100)],
  ['treasure', zres.kinds.treasure, pct(zres.kinds.treasure, 100)],
  ['talisman', zres.kinds.talisman, pct(zres.kinds.talisman, 100)],
  ['none', zres.kinds.none, pct(zres.kinds.none, 100)],
], ['结果', '次数', '占比']);

// —— 4. 钱边界 + 关城搜索 ——
header('4. 金边界 / 关城搜索');
function oneSearch(cityName, money, extra = {}) {
  const save = makeSave({ owned: [cityName], money: { [cityName]: money }, month: 1 });
  const ctx = makeCtx(save, 0, extra);
  const before = save.cities[cityName].money;
  const r = M.search(save, cityDef(cityName), ctx);
  return { r, before, after: save.cities[cityName].money };
}
console.log('金=199：', JSON.stringify(oneSearch('南皮', 199).r));
console.log('金=200：', JSON.stringify(oneSearch('南皮', 200).r));
console.log('金=0 且 ctx.free=true（自治）：', JSON.stringify(oneSearch('南皮', 0, { free: true }).r));
const gateName = gates[0] || zeroWild[0];
const g = oneSearch(gateName, 5000);
console.log(`关城 ${gateName} 搜索：ok=${g.r.ok} kind=${g.r.kind} 钱 ${g.before}→${g.after}（搜索没有 isGate 守卫）`);

// —— 5. 执行将 vs 太守：ctx.exec 是否影响搜索 ——
header('5. 执行将（ctx.exec）是否影响搜索：同城/同月/同 count 换 exec 对比');
const saveA = makeSave({ owned: ['南皮'], money: { 南皮: 50000 }, month: 1 });
const ctxA = makeCtx(saveA, 0, { exec: '關羽' });
const saveB = makeSave({ owned: ['南皮'], money: { 南皮: 50000 }, month: 1 });
const ctxB = makeCtx(saveB, 0, { exec: '張飛' });
const rA = M.search(saveA, cityDef('南皮'), ctxA);
const rB = M.search(saveB, cityDef('南皮'), ctxB);
console.log('exec=關羽 →', rA.kind, rA.seed, '；exec=張飛 →', rB.kind, rB.seed, '；完全相同？', rA.seed === rB.seed);
console.log('searchLevelOf 只看太守/ctx.level，不看 ctx.exec：city.html 也从未设 ctx.searchLevel（grep 结果：无）。');

// —— 6. 一次搜索的随机表（把 seed→前几个数打出来）——
header('6. 一次搜索的随机表（南皮第 1 次，seed 展开）');
const s6 = makeSave({ owned: ['南皮'], money: { 南皮: 50000 }, month: 1 });
const c6 = makeCtx(s6);
const cd6 = cityDef('南皮');
const seed6 = M.searchSeed('南皮', 1, 0, M.searchNonce(s6));
const rng6 = M.mulberry32(seed6);
const n6 = [rng6(), rng6(), rng6(), rng6()];
console.log('seed =', seed6, ' 前 4 个 rng = ', n6.map((x) => x.toFixed(6)).join(', '));
console.log('判定顺序：① rng()<0.5 → 人才（从 9 人池 floor(rng()*9) 选）② 否则 rng()→轮盘 treasure25/talisman20/none25 ③ 命中物品再 rng()→池内按 searchItemWeight 加权。');
console.log('实际搜索 r1 =', JSON.stringify(M.search(s6, cd6, c6), (k, v) => (k === 'general' || k === 'item' ? (v && (v.NAME || v.Name)) : v)));
