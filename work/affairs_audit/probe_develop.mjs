// 探针②：開發 doDevelop —— 是否只加人口/防御、不扣金、上限夹取、月令/逐将年令
// 跑法：node work/affairs_audit/probe_develop.mjs
import { W, C, DATA, makeSave, makeCtx, table, pct, cityDef } from './lib.mjs';

const header = (s) => console.log('\n=== ' + s + ' ===');
const gstat = (n) => DATA.generals.find((g) => g.NAME === n) || {};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function setup(cityName = '南皮', { money = 0, pop = 300000, def = 300, major = null, exec = null, wise = null } = {}) {
  const save = makeSave({ owned: [cityName], money: { [cityName]: money }, month: 1 });
  const st = save.cities[cityName];
  st.pop = pop; st.def = def;
  save.appointed[cityName] = {};
  if (major) save.appointed[cityName].major = major;
  if (wise) save.appointed[cityName].wise = wise;
  const ctx = makeCtx(save, 0, exec ? { exec } : {});
  return { save, ctx, st, cd: cityDef(cityName) };
}

function dev(setupObj, model = W, value = 0.5) {
  model.setRng(() => value);
  try {
    const r = model.develop(setupObj.save, setupObj.cd, setupObj.ctx);
    return r;
  } finally {
    model.setRng(null);
  }
}

// —— 0. 參數表 ——
header('0. 開發參數（web/Cocos 同表）');
console.log('DEV =', JSON.stringify(W.DEV));
console.log('DEV_FORMULA =', JSON.stringify(W.DEV_FORMULA), ' MAJOR_RULE =', JSON.stringify(W.MAJOR_RULE));
console.log('公式：popBase=randBelow(3000)+trunc(執行將INT*100)，defBase=randBelow(12)+trunc(執行將STR*0.4)，');
console.log('      gain=base+trunc(base*(太守INT−70)*2/300)（負數也可為負，old scaledGain），再 min(上限−當前, max(0,gain))。');
console.log('本作 COST =', W.DEV.COST, '（F12：開發不耗金，只保留 gold 檢查的程式碼但條件 COST>0 不成立）');

// —— 1. 不扣金（金=0 也能開發）——
header('1. 金=0：開發仍成功且金不變（F12 口径）');
const s1 = setup('南皮', { money: 0, major: '程遠志', exec: '程遠志' });
const before1 = s1.st.money;
const r1 = dev(s1);
console.log('money %d → %d（差 %d）', before1, s1.st.money, s1.st.money - before1);
console.log('結果：', JSON.stringify(r1), ' pop %d→%d  def %d→%d', 300000, s1.st.pop, 300, s1.st.def);

// —— 2. 公式拆解：固定 rng=0.5 時執行將/太守各自的作用（web）——
header('2. 執行將 vs 太守（web：base 用執行將、縮放用太守；Cocos：全用太守）');
const names = ['程遠志', '呂布', '諸葛亮', '張飛'];
for (const n of names) console.log(`  ${n}: STR=${gstat(n).STR} INT=${gstat(n).INT}`);
function runPair(major, exec, model = W) {
  const s = setup('南皮', { money: 0, major, exec });
  const r = dev(s, model, 0.5);
  return { pop: r.pop, def: r.def, eff: r.eff, popTotal: s.st.pop, defTotal: s.st.def };
}
const rows = [];
for (const [major, exec] of [['呂布', '呂布'], ['諸葛亮', '呂布'], ['呂布', '諸葛亮'], ['諸葛亮', '諸葛亮']]) {
  const w = runPair(major, exec, W);
  const c = runPair(major, exec, C);
  rows.push([`太守=${major} INT${gstat(major).INT}`, `執行=${exec} INT${gstat(exec).INT}`, `+${w.pop}`, `+${w.def}`, `+${c.pop}`, `+${c.def}`]);
}
table(rows, ['太守', '執行將', 'web人口', 'web防御', 'Cocos人口', 'Cocos防御']);
console.log('→ web：換執行將（同太守）人口變；換太守（同執行將）也變（縮放項）。');
console.log('→ Cocos：只有太守欄變化，換執行將完全沒差（CityModel.ts:1156-1186 用 majorOf 當 exec）。');

// —— 3. 军师任命是否影响开发？——
header('3. 軍師（wise）任命是否影响開發？');
const a = setup('南皮', { major: '諸葛亮', exec: '諸葛亮' });
const b = setup('南皮', { major: '諸葛亮', exec: '諸葛亮', wise: '張飛' });
const ra = dev(a), rb = dev(b);
console.log('無軍師：+%d人口 +%d防御；軍師=張飛：+%d人口 +%d防御 → 相同？%s',
  ra.pop, ra.def, rb.pop, rb.def, ra.pop === rb.pop && ra.def === rb.def);
console.log('web city_model.js 里 wiseOf 只被展示层用；develop/search/enlist 没引用军师。');

// —— 4. 上限夹取 ——
header('4. 上限：人口 1,000,000 / 防御 999 是否夹住');
const near = setup('南皮', { pop: 999500, def: 995, major: '諸葛亮', exec: '諸葛亮' });
const rn = dev(near);
console.log('人口 999500 → %d（夹到上限 %d），防御 995 → %d（夹到 %d）', near.st.pop, 1000000, near.st.def, 999);
const sat = setup('南皮', { pop: 1000000, def: 999, major: '諸葛亮', exec: '諸葛亮' });
console.log('已满：', JSON.stringify(dev(sat)));
const popFull = setup('南皮', { pop: 1000000, def: 999, major: '諸葛亮', exec: '諸葛亮' });
popFull.st.def = 0;
const rpf = dev(popFull);
console.log('人口已满、防御 0 → 仍可加防御：', JSON.stringify({ pop: rpf.pop, def: rpf.def, ok: rpf.ok }));

// —— 5. 关城不能开发 ——
header('5. 关城（易京 RATE=0）');
const gateSave = makeSave({ owned: ['易京'], money: { 易京: 1000 }, month: 1 });
const gr = W.develop(gateSave, cityDef('易京'), makeCtx(gateSave, 0, { exec: '程遠志' }));
console.log('易京 develop →', JSON.stringify(gr));

// —— 6. 无太守：模型能跑，UI 拦截（F9）——
header('6. 无太守：模型层能开发，city.html 拒绝（F9）');
const noMajorCity = DATA.scenarios[0].cities.find((c) => !c.MAJOR && Number(c.RATE) > 0 && Number(c.POPULATION) > 0);
const nm = setup(noMajorCity.NAME, { money: 0, major: null, exec: null });
const nmr = dev(nm);
console.log(`城=${noMajorCity.NAME}（MAJOR 空） majorOf=`, JSON.stringify(W.majorOf(nm.save, nm.cd)), ' develop →', JSON.stringify(nmr));
console.log('city.html:847-855 doDevelop 开头：if (!M.majorOf(save, cityDef)) → 拒絕「需先任命太守」（F9 由 UI 把关，模型没守）。');

// —— 7. 月令 / 逐将年令是否记？模型层不写 ——
header('7. 開發是否记月令/年令：模型层不写，由 city.html afterCommand 写');
const s7 = setup('南皮', { major: '諸葛亮', exec: '諸葛亮' });
const snap = JSON.stringify({ acted: s7.save.acted, lastActionMonth: s7.save.lastActionMonth, searchSeq: s7.save.searchSeq });
dev(s7);
console.log('develop 前后 acted/lastActionMonth 相同？', snap === JSON.stringify({ acted: s7.save.acted, lastActionMonth: s7.save.lastActionMonth, searchSeq: s7.save.searchSeq }), '→', snap);
console.log('city.html:794-803 afterCommand(r.ok, execName)：成功 → M.markActed(save, execName) 逐將每年一次；失败/不收窗口 → markMonthActed。');

// —— 8. 随机下限/上限（scaledGain 对低 INT 可把收益压到 0）——
header('8. rng 極值 + 太守 INT 影響（scaledGain 可能變 0/負）');
for (const [label, major] of [['太守 INT100(諸葛亮)', '諸葛亮'], ['太守 INT42(呂布)', '呂布'], ['太守 INT=0(程遠志?)', '程遠志']]) {
  const s = setup('南皮', { major, exec: '呂布' });
  const r0 = dev(s, W, 0);
  const s2 = setup('南皮', { major, exec: '呂布' });
  const r1v = dev(s2, W, 0.999999);
  console.log(`${label}: rng=0 → +${r0.pop}人口/+${r0.def}防御 ; rng≈1 → +${r1v.pop}/+${r1v.def}`);
}
