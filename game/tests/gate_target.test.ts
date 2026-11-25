// @ts-nocheck —— 被测模块 `web/city_model.js` 是浏览器端的无类型 ESM（仓库 tsconfig 没开 allowJs），
// 本文件按 node:test 跑运行时断言；Cocos 端用动态 import 直接吃 `.ts`（node 24 的 type stripping），
// 故意不走静态 import，免得把 `cocos/assets/scripts/**` 拉进 `game/tsconfig.json` 的 program。
//
// 163 出征關卡：修的是「公孫瓚在 184 劇本永久沒有出征目標」這個卡死玩家勢力的真 bug。
//   - 資料事實：`北平<->易京 78`、`南皮<->易京 112`、`代縣<->易京 85`，而 `北平<->南皮`/`北平<->代縣`
//     都是 30000（斷行哨兵，`neighboursOf` 會跳過）⇒ 北平只有 襄平(自家) 與 易京(關) 兩個鄰城；
//   - 12 座關 `RATE=0 / POPULATION=0 / FLAGS=2`（不是 FLAGS=1，docs/04c §5.2 那條備註是錯的），
//     守軍在 `garrison.json`（12 關實測都是 110，`officers: []`）；
//   - 關卡的 `KING` 是 TIMES.INI 殘留的 **數字** 1..12，不是君主名（`易京.KING === 1`），
//     所以 `deployTargets()` 的 `owner` 對關卡一律歸一成空串，不能顯示「勢力 1」。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Saves from '../web/saves.js';
import * as W from '../web/city_model.js';
import * as AI from '../web/ai_model.js';

const COCO = await import(new URL('../cocos/assets/scripts/CityModel.ts', import.meta.url).href);

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const SCEN = readJson('../data/scenarios.json');
const GENS = readJson('../data/generals.json');
const ITEMS = readJson('../data/items.json');
const WISES = readJson('../data/wises.json');
const GAR = readJson('../data/garrison.json');
const S0 = SCEN[0];

/** docs/04c §2.2：五個劇本同一批 12 座關卡 */
const GATE_NAMES = ['易京', '樂陵', '界橋', '壺關', '定陶', '都陽', '官渡', '筑陽', '長板', '建平', '赤壁', '合肥'];

const cdef = (name, scen = S0) => scen.cities.find((c) => c.NAME === name);
const ctxOf = (scen = S0, scenIdx = 0, extra = {}) => ({
  generals: GENS, scenario: scen, scenIdx, items: ITEMS, wises: WISES, garrison: GAR, ...extra,
});

function fresh(scen = S0) {
  const save = Saves.newCampaign(scen);
  W.ensureExtras(save);
  for (const c of scen.cities) W.ensureCityState(save, c);
  return save;
}

// ---------------------------------------------------------------- 1. 北平 → 易京
test('163 北平的出征目標含關卡易京：troops=110 / gate=true / owner 空', () => {
  const save = fresh();
  const rows = W.deployTargets(save, cdef('北平'), ctxOf());
  assert.equal(rows.length, 1, `北平只有易京一個敵方鄰城（實得 ${rows.map((r) => r.name).join('、')}）`);
  const gate = rows[0];
  assert.deepEqual(
    { name: gate.name, owner: gate.owner, gate: gate.gate, troops: gate.troops, def: gate.def, generals: gate.generals },
    { name: '易京', owner: '', gate: true, troops: 110, def: 100, generals: 0 },
    '北平→易京 的整列（含 owner 歸一成空、守軍 110、gate 徽標欄位）',
  );
  assert.equal(GAR[0].cities['易京'].garrison, 110, 'garrison.json 的易京守軍');
  assert.deepEqual(GAR[0].cities['易京'].officers, [], '關卡沒有守將（battle 走「守備隊」）');
});

// ---------------------------------------------------------------- 2. 守軍來源
test('163 關卡守軍取 garrison.json（改資料就跟著變），缺 ctx.garrison 才回落 110', () => {
  const save = fresh();
  const withGar = ctxOf(S0, 0, { garrison: [{ cities: { 易京: { garrison: 145 } } }] });
  assert.equal(W.deployTargets(save, cdef('北平'), withGar)[0].troops, 145, 'garrison 資料是權威（非寫死 110）');

  const noGar = ctxOf(S0, 0, { garrison: undefined });
  assert.equal(W.deployTargets(save, cdef('北平'), noGar)[0].troops, W.GATE_TROOPS_FALLBACK, '缺表回落 110');
  assert.equal(W.GATE_TROOPS_FALLBACK, 110);

  // 劇本要對得上：ctx.scenIdx 換到別劇本，讀的是那一份 garrison（5 份都 110，但索引不能錯）
  assert.equal(W.gateTroopsOf('易京', cdef('易京'), ctxOf(SCEN[3], 3)), GAR[3].cities['易京'].garrison);
  // 存檔裡的 troops 不是關卡守軍的來源：改掉它，關卡那列不動（舊碼 `num(st.troops) || troopCapOf(0)` 才是巧合 110）
  save.cities['易京'].troops = 7;
  assert.equal(W.deployTargets(save, cdef('北平'), ctxOf())[0].troops, 110, '存檔 troops 改了也不影響關卡守軍');
});

// ---------------------------------------------------------------- 3. 五劇本 × 12 關
test('163 五個劇本 × 12 關：owner 一律空串、gate 一律 true、troops 一律是該劇本 garrison', () => {
  const expectNames = [...GATE_NAMES].sort();
  for (const [i, scen] of SCEN.entries()) {
    const save = fresh(scen);
    const ctx = ctxOf(scen, i);
    const seen = new Map();
    for (const city of scen.cities) {
      for (const row of W.deployTargets(save, city, ctx)) {
        if (!row.gate) continue;
        seen.set(row.name, row);
        assert.equal(row.owner, '', `劇本 ${i + 1} ${row.name} 關卡 owner 必須空`);
        assert.equal(row.troops, GAR[i].cities[row.name].garrison, `劇本 ${i + 1} ${row.name} 守軍`);
      }
    }
    // 反向：12 座關都真的被當成目標出現過（不是只列了其中幾座）
    assert.deepEqual([...seen.keys()].sort(), expectNames, `劇本 ${i + 1} 應能打到全部 12 座關`);
    // 劇本的關 KING 不是君主名：184 是 TIMES.INI 殘留的裸數字 1..12（`String(KING)` 就變成「勢力 3」），
    // 其餘四個劇本是空串。兩種都要歸一成 owner=''，所以這裡釘住「永遠不會是真君主名」。
    for (const name of GATE_NAMES) {
      const king = cdef(name, scen).KING;
      assert.ok(
        typeof king === 'number' || king === '',
        `${name}.KING 只能是數字殘留或空串，實得 ${JSON.stringify(king)}`,
      );
    }
    if (i === 0) assert.equal(cdef('易京', scen).KING, 1, '184 劇本的易京 KING 是數字 1（舊碼會顯示「勢力 1」）');
  }
});

// ---------------------------------------------------------------- 4. 開發仍禁止
test('163 關卡仍然不能開發（reason=gate），而且不因出征清單放寬而鬆掉', () => {
  const save = fresh();
  const r = W.develop(save, cdef('易京'), ctxOf());
  assert.deepEqual(r, { ok: false, reason: 'gate' }, '開發 易京 必須被拒（city_model.js 的 isGate 守衛）');
  // 反向：真城照樣能開發（證明守衛只咬關卡，不是把整個命令弄壞）
  const ok = W.develop(save, cdef('北平'), ctxOf());
  assert.equal(ok.ok, true, `北平 開發應成功，實得 ${JSON.stringify(ok)}`);
});

// ---------------------------------------------------------------- 5. 占關後能往下走
test('163 占易京后：易京不再是北平的目標，從易京可以打南皮（112 路）', () => {
  const save = fresh();
  const ctx = ctxOf();
  assert.deepEqual(W.deployTargets(save, cdef('北平'), ctx).map((r) => r.name), ['易京'], '占之前：北平→易京');

  // 占領：main.js:1009 的寫回是 `save.owned.push(city)`，owner 由 campaign.html 的 refreshForces()
  // → AI.syncOwned() 補成君主（兩者都不在本次可改範圍，這裡按同一口徑模擬）
  save.owned.push('易京');
  AI.syncOwned(save);
  assert.equal(save.cities['易京'].owner, save.king || '公孫瓚', '占領後 owner 歸我方（AI.syncOwned）');

  // 北平的鄰城只剩襄平（自家）⇒ 易京必須從目標裡消失；而南皮/代縣跟北平之間是 30000 斷行，
  // 本來就不該出現在北平的清單（資料決定，不是這次改動的取捨）。
  assert.ok(!W.deployTargets(save, cdef('北平'), ctx).some((r) => r.name === '易京'), '易京已是我方，不得再是目標');
  assert.deepEqual(W.deployTargets(save, cdef('北平'), ctx), [], '北平再也沒有敵方鄰城');

  // 「從它出發去打下一個城」：拿下易京後，易京的目標裡有南皮（而且南皮是活路，不是 30000 哨兵）
  const fromGate = W.deployTargets(save, cdef('易京'), ctx);
  assert.ok(fromGate.some((r) => r.name === '南皮'), `易京→南皮 應可出征，實得 ${fromGate.map((r) => r.name).join('、')}`);
  const nanpi = fromGate.find((r) => r.name === '南皮');
  assert.equal(nanpi.gate, false);
  assert.equal(nanpi.troops, save.cities['南皮'].troops, '真城守軍仍取存檔兵力');
  // 反向：斷行哨兵 30000 的兩條路不得被算成鄰接
  assert.equal(SCEN[0].paths.find((p) => p.Start === '北平' && p.End === '南皮').Length, 30000);
  assert.equal(SCEN[0].paths.find((p) => p.Start === '北平' && p.End === '易京').Length, 78);
});

// ---------------------------------------------------------------- 6. 情報列不動
test('163 情報列維持原樣：關卡 gate=true / owner=「關卡」，城池一覽不顯示數字假勢力', () => {
  const save = fresh();
  const rows = W.intel(save, cdef('北平'), ctxOf()).rows;
  const byName = new Map(rows.map((r) => [r.name, r]));
  assert.equal(byName.get('易京').gate, true);
  assert.equal(byName.get('易京').owner, '關卡', '情報列的關卡標記是既有驗收項，不得改成數字 KING');
  assert.equal(byName.get('易京').troops, 110);
  assert.equal(byName.get('襄平').owner, '我方');
});

// ---------------------------------------------------------------- 7. 两端逐字段一致
test('163 两端一致：web js 与 cocos ts 的 deployTargets 在 5 劇本 × 60 城上逐欄位相同', () => {
  let compared = 0;
  for (const [i, scen] of SCEN.entries()) {
    const save = fresh(scen);
    const ctx = ctxOf(scen, i);
    for (const city of scen.cities) {
      const web = W.deployTargets(save, cdef(city.NAME, scen), ctx);
      const coco = COCO.deployTargets(save, cdef(city.NAME, scen), ctx);
      assert.equal(
        JSON.stringify(coco), JSON.stringify(web),
        `劇本 ${i + 1} ${city.NAME}：web 与 cocos 的出征目標不一致\nweb  ${JSON.stringify(web)}\ncoco ${JSON.stringify(coco)}`,
      );
      compared += 1;
    }
  }
  assert.equal(compared, 300, '5 劇本 × 60 城 = 300 次對拍');
  // gateTroopsOf 這個新入口也要同值（三處呼叫端：campaign.html / city.html / CityPanel）
  for (const name of GATE_NAMES) {
    assert.equal(COCO.gateTroopsOf(name, cdef(name), ctxOf()), W.gateTroopsOf(name, cdef(name), ctxOf()), `${name} gateTroopsOf`);
  }
  assert.equal(COCO.GATE_TROOPS_FALLBACK, W.GATE_TROOPS_FALLBACK);
});

// ---------------------------------------------------------------- 8. 无 garrison 的调用方
test('163 没带 garrison 的调用方（city.html / Cocos CityPanel）也得到 110，不会算出 0 兵', () => {
  const save = fresh();
  const bare = { generals: GENS, scenario: S0, scenIdx: 0, items: ITEMS, wises: WISES };
  assert.deepEqual(
    W.deployTargets(save, cdef('北平'), bare),
    W.deployTargets(save, cdef('北平'), ctxOf()),
    'city.html 的 ctx 没有 garrison，结果必须与带 garrison 时相同',
  );
  assert.deepEqual(
    JSON.stringify(COCO.deployTargets(save, cdef('北平'), bare)),
    JSON.stringify(W.deployTargets(save, cdef('北平'), bare)),
  );
});

// ---------------------------------------------------------------- 9. 出征／戰鬥入口的接線（源碼釘樁）
test('163 出征入口把關卡守軍帶進戰鬥：campaign.html / deploy.html / DeployRoot.ts 接線', () => {
  const campaign = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');
  // 大地圖的敵情：關卡分支在 chief 兜底之前，兵力 = garrison（不是「我軍六成」）
  const gateBranch = campaign.indexOf('if (cd && CM.isGate(cd)) {');
  const chiefFallback = campaign.indexOf('enemyTroops: Math.max(1, Math.round(mine * 0.6))');
  assert.ok(gateBranch > 0, 'campaign.html 的 enemySetup 應有 CM.isGate 分支');
  assert.ok(chiefFallback > gateBranch, '關卡分支必須排在「無守將→我軍六成」之前');
  assert.match(campaign, /enemyTroops: gateTroopsOf\(cityName\)/, '關卡敵軍兵力取 garrison');
  // 出征清單的守軍與徽標
  assert.match(campaign, /troops: gate \? gateTroopsOf\(n\) : troopsOf\(n\)/, '出征清單關卡守軍走 gateTroopsOf');
  assert.match(campaign, /class="gcbadge">關</, '出征清單要有「關」徽標');

  const deploy = readFileSync(new URL('../web/deploy.html', import.meta.url), 'utf8');
  // 上陣兵上限 200（不是 100）：關卡 110 兵要真的進戰場，不能被夾成 100
  assert.match(deploy, /const BS_MAX = 200;/, 'deploy.html 的 bsoldiers 上限應為 200');
  assert.match(deploy, /Math\.min\(BS_MAX, Math\.round\(BS_QUERY\)\)/, 'bsoldiers 用 BS_MAX 夹');
  assert.match(deploy, /import \* as CM from '\.\/city_model\.js';/, 'deploy.html 复用同一份 isGate');

  const root = readFileSync(new URL('../cocos/assets/scripts/DeployRoot.ts', import.meta.url), 'utf8');
  assert.match(root, /import \{ isGate \} from '\.\/CityModel';/, 'DeployRoot 复用 CityModel.isGate');
  assert.match(root, /isGate\(this\.targetCity\)/, 'enemySoldiers 要认關卡');
  assert.match(root, /Math\.min\(200, Math\.round\(this\.garrison\)\)/, '關卡的敵軍兵力 = garrison（110）');
});

// ---------------------------------------------------------------- 10. 出征佇列不受影響
test('163 關卡可以當出征目標，但不進出陣佇列／不改成真城', () => {
  const save = fresh();
  const rows = W.deployTargets(save, cdef('代縣'), ctxOf());
  const names = rows.map((r) => r.name);
  assert.deepEqual(names.slice().sort(), ['晉陽', '易京'].sort(), '代縣→易京＋晉陽 兩項都在');
  // 關卡列不得被升級成真城：POPULATION 仍是 0、DEFENSE 仍是 100、沒有太守
  const gateDef = cdef('易京');
  assert.equal(Number(gateDef.POPULATION), 0);
  assert.equal(Number(gateDef.DEFENSE), 100);
  assert.equal(String(gateDef.MAJOR || ''), '', '關卡沒有太守');
  assert.equal(rows.find((r) => r.name === '易京').gate, true);
});
