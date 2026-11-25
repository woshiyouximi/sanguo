// 只读核查脚本：逐行在源码里找证据行 + 在 game/tests 里找守护测试
// 用法: node work/orig_gap/_check_rows.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; } };
const lines = (p) => (read(p) || '').split(/\r?\n/);

// 测试全量语料
const testDir = path.join(ROOT, 'game/tests');
const testFiles = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter(f => f.endsWith('.test.ts')) : [];
const testCorpus = testFiles.map(f => ({ f, t: fs.readFileSync(path.join(testDir, f), 'utf8') }));

/** 在文件里找第一个匹配行 */
function find(file, re) {
  const ls = lines(file);
  const rx = re instanceof RegExp ? re : new RegExp(re);
  for (let i = 0; i < ls.length; i++) if (rx.test(ls[i])) return { line: i + 1, text: ls[i].trim().slice(0, 160) };
  return null;
}
function findAll(file, re) {
  const ls = lines(file); const rx = re instanceof RegExp ? re : new RegExp(re); const out = [];
  for (let i = 0; i < ls.length; i++) if (rx.test(ls[i])) out.push(i + 1);
  return out;
}
/** 测试守护：哪些测试文件提到该符号 */
function guards(re) {
  const rx = re instanceof RegExp ? re : new RegExp(re);
  return testCorpus.filter(x => rx.test(x.t)).map(x => x.f);
}

const ROWS = [
  ['R1', '60城/12关', [['game/web/city_model.js', /export function isGate/], ['game/web/city_model.js', /RATE\) === 0/]], /isGate|is_gate/i],
  ['R2', '116 PATH 哨兵', [['game/src/core/march.ts', /SENTINEL_LENGTH/], ['game/src/core/march.ts', /pathBetween/]], /pathBetween|SENTINEL|march/i],
  ['R3', '5 剧本', [['game/web/campaign.html', /scenarios\.json/]], /scenarios|scenario/i],
  ['R4', '君主', [['game/web/monarch_model.js', /function monarchOf|export function monarchOf/], ['game/web/monarch_model.js', /function setMonarch|export function setMonarch/], ['game/web/campaign.html', /ensureKing/]], /monarch|kingDeath|inheritForce/i],
  ['R5', '月内倒计时', [['game/web/campaign.html', /function advanceMonth/], ['game/web/saves.js', /function monthLabel|monthLabel/]], /advanceMonth|monthLabel|isYearStart/i],
  ['R6', '城规模 RATE', [['game/web/city_model.js', /hallIndexOf/], ['game/web/city_model.js', /clamp\(RATE|RATE, 1, 5/]], /hallIndexOf|RATE\b/i],
  ['R7', '年度结算', [['game/web/saves.js', /YEAR_MONTHS/], ['game/web/saves.js', /function annualSettle/], ['game/web/campaign.html', /annualSettle|annualYearRollover/]], /annualSettle|年度|isYearStart/i],
  ['R8', '一月一令', [['game/web/city_model.js', /function markMonthActed|markMonthActed/], ['game/web/city.html', /monthLocked/]], /monthLocked|markMonthActed|monthlyAction/i],
  ['R9', '開發增量', [['game/web/city_model.js', /function develop/], ['game/web/city_model.js', /\bDEV\b/]], /develop|saturated|開發/i],
  ['R10', '自治施行', [['game/web/city_model.js', /AUTONOMY/], ['game/web/city_model.js', /function runAutonomy/]], /autonom/i],
  ['R11', '搜索二选一', [['game/web/city_model.js', /SEARCH\s*=/], ['game/web/city_model.js', /function searchPools|searchPools/]], /searchPools|SEARCH|搜索/i],
  ['R12', '预备兵/步骑', [['game/web/city_model.js', /function prepCapOf|prepCapOf/], ['game/web/city_model.js', /function refillPrep|refillPrep/], ['game/web/city_model.js', /function cavalryCapOf|cavalryCapOf/]], /prepCapOf|refillPrep|cavalryCap/i],
  ['R13', '内政三命令', [['game/web/campaign.html', /武將資料|武将资料/], ['game/web/campaign.html', /勢力地圖|势力地图/], ['game/web/campaign.html', /內政終了|内政终了/]], /武將資料|勢力地圖|內政終了/i],
  ['R14', '移动', [['game/web/city_model.js', /MOVE\s*=/], ['game/web/city_model.js', /function neighboursOf/]], /neighboursOf|MOVE\b/i],
  ['R15', '金钱', [['game/web/saves.js', /function annualSettle/], ['game/web/saves.js', /pop\s*\*|\* ?75/]], /annualSettle|金|tax/i],
  ['R16', '徵糧/訓練/外交 负证据', [['docs/04c_世界与内政.md', /徵糧|訓練|治水|外交/]], /徵糧|訓練|外交/i],
  ['R17', '128槽轮盘', [['game/web/city_model.js', /searchPools|128/], ['game/web/city_model.js', /SearchType|searchType/]], /128|searchPools|SearchType/i],
  ['R18', 'ONLYONE', [['game/web/city_model.js', /ONLYONE|onlyone/], ['game/web/city_model.js', /ownedItemSeqs/]], /onlyone|ownedItemSeq/i],
  ['R19', 'Rate=0 剔除', [['game/web/city_model.js', /rate <= 0|Rate <= 0/]], /rate <= 0|R19/i],
  ['R20', '搜索种子', [['game/web/city_model.js', /searchNonce|hashSeed/]], /searchNonce|searchSeed|hashSeed/i],
  ['R21', '带兵上限', [['game/web/deploy.html', /SOLDIER_CAP/], ['game/src/core/levels.ts', /troopCapOf/]], /troopCapOf|SOLDIER_CAP|带兵/i],
  ['R22', '骑兵上限', [['game/src/core/levels.ts', /cavalryCapOf/], ['game/src/core/battle.ts', /isCavalryBit/]], /cavalryCapOf|isCavalryBit|cavalry/i],
  ['R23', 'HP/MP 上限', [['game/src/core/battle.ts', /hpCapOf/], ['game/src/core/battle.ts', /mpCapOf/]], /hpCapOf|mpCapOf/i],
  ['R24', '升级重算/溢出', [['game/src/core/battle.ts', /function levelUp|levelUp\(/], ['game/src/core/battle.ts', /ovHP|overflow/i]], /levelUp|溢出|ovHP/i],
  ['R25', '升级补学', [['game/src/core/capture.ts', /learnedAtLevelUp/], ['game/src/core/battle.ts', /learnedAtLevelUp/]], /learnedAtLevelUp|knownMagicOf/i],
  ['R26', '经验阈值', [['game/src/core/battle.ts', /function expToReach|expToReach/]], /expToReach|levelFromExp/i],
  ['R27', '兵种白名单', [['game/src/core/unlock.ts', /export function troopsOf/], ['game/src/core/unlock.ts', /isTroopUnlocked/]], /troopsOf|isTroopUnlocked|useForce/i],
  ['R28', '阵形11x11', [['data/formations.json', /"matrix"/]], /formation|matrix|亂陣|乱阵/i],
  ['R29', '兵力档位', [['game/web/deploy.html', /\[50, ?80, ?100\]|50,80,100/]], /50, ?80, ?100|SOLDIER_CAP|兵力/i],
  ['R30', '站位 slot_rule', [['game/src/core/battle.ts', /formationCells/], ['data/formations.json', /slot_rule/]], /formationCells|slot_rule/i],
  ['R31', '军师技表', [['game/src/core/wises.ts', /const SPECS/]], /wises|SPECS|WISE/i],
  ['R32', '军师在城才提供', [['game/src/core/wises.ts', /applyWiseOnBattleStart/], ['game/web/main.js', /applyWise/]], /applyWise/i],
  ['R33', '军师技纯加法', [['game/src/core/battle.ts', /增强攻擊|增強攻擊|wiseBonus/], ['game/src/core/wises.ts', /add.*0xA|delta/]], /r33add|wiseBonus|加法/i],
  ['R34', '一次一条', [['game/src/core/wises.ts', /export function applyWise/]], /applyWise/i],
  ['R35', '出征选军师技', [['game/web/deploy.html', /wisepick/]], /wisepick|listWisdomChoices/i],
  ['R36', '战斗主循环', [['game/src/core/battle.ts', /export function createWorld/], ['game/src/core/battle.ts', /export function step/], ['game/src/core/battle.ts', /export function settle/]], /createWorld|settle\(/i],
  ['R37', '策略/援军', [['game/src/core/strategy.ts', /STRATEGY_TABLE/], ['game/src/core/strategy.ts', /spawnReinforce/]], /strategy|reinforce/i],
  ['R38', '撤退', [['game/src/core/battle.ts', /function requestRetreat|requestRetreat/], ['game/src/core/battle.ts', /cullFled/]], /retreat/i],
  ['R39', '天气', [['game/src/core/weather.ts', /export function/], ['game/src/core/battle.ts', /weatherHitMod/]], /weather/i],
  ['R40', '单挑 负证据', [['docs/04b3_单挑流程.md', /单挑|單挑/]], /單挑|单挑|duel/i],
  ['R41', '士气项', [['game/src/core/battle.ts', /MORALE_DAMP/]], /morale/i],
  ['R42', '四条命中式', [['game/src/core/battle.ts', /function hitChance|hitChance/]], /hitChance/i],
  ['R43', '2/3 补判', [['game/src/core/battle.ts', /\* 2 \/ 3|\* 2 \/ 3|2 \/ 3/]], /2 ?\/ ?3|twoThirds/i],
  ['R44', '骑兵位再判', [['game/src/core/battle.ts', /isCavalryBit/], ['game/src/core/battle.ts', /0x78/]], /isCavalryBit|0x2C|r50_r67/i],
  ['R45', '地形加成', [['game/src/core/battle.ts', /function terrainBonus|terrainBonus/], ['data/terrains.json', /vs/]], /terrain/i],
  ['R46', '主将扣血', [['game/src/core/battle.ts', /function basicDamage|basicDamage/]], /basicDamage|damage/i],
  ['R47', '气力', [['game/src/core/battle.ts', /QI_MAX/], ['game/src/core/battle.ts', /QI_START/], ['game/src/core/battle.ts', /QI_COST_SCALE/]], /QI_MAX|qiCost|气力/i],
  ['R48', '脚本 WAIT', [['game/src/core/smartscript/vm.ts', /wait\(/]], /smartscript|wait/i],
  ['R49', '武将技运行器', [['game/src/core/smartscript/runtime.ts', /function runSkill|runSkill/]], /runSkill/i],
  ['R50', 'ACTIVE 位掩码', [['game/src/core/battle.ts', /ACTIVE_BIT/], ['game/src/core/battle.ts', /activeMaskOf/]], /ACTIVE_BIT|activeMaskOf|activeHits/i],
  ['R51', '全局 Attack', [['game/src/core/smartscript/runtime.ts', /setEngineValue/]], /setEngineValue|engineValue/i],
  ['R52', '特效/音效脚本', [['game/src/core/audio_bus.ts', /function emitSfx|emitSfx/], ['game/src/core/audio_bus.ts', /setAudioSink/]], /audio_bus|emitSfx|emitMagic/i],
  ['R53', '招降三硬门', [['game/src/core/capture.ts', /function recruitChanceOf|recruitChanceOf/], ['game/src/core/capture.ts', /90|70|50/]], /recruitChanceOf|canRecruit/i],
  ['R54', '败方全员处置', [['game/src/core/capture.ts', /function resolvePostBattle|resolvePostBattle/]], /resolvePostBattle|postBattle/i],
  ['R55', '君主不可俘', [['game/src/core/capture.ts', /isKingOf/]], /isKingOf|isKing/i],
  ['R56', '斩首出池/战后处置', [['game/src/core/roster.ts', /function applyPostBattle|applyPostBattle/], ['game/src/core/roster.ts', /removeFromPools/]], /applyPostBattle|removeFromPools|surrender/i],
  ['R57', '战斗不掉宝', [['game/src/core/capture.ts', /drops/]], /drops|rollDrop/i],
  ['R58', '节操招降', [['game/src/core/capture.ts', /constancy/]], /constancy|节操/i],
  ['R59', '战功带兵差', [['game/src/core/battle.ts', /warMeritOf/]], /warMeritOf|warMerit/i],
  ['R60', '四种 mode', [['game/src/core/battle.ts', /MODE_NAME/], ['game/src/core/battle.ts', /settleMode/]], /settleMode|MODE_NAME|settleReport/i],
  ['R61', '功勋/疲劳', [['game/src/core/battle.ts', /tireGain/]], /tireGain|tire/i],
  ['R62', '战后士气/忠诚', [['game/src/core/battle.ts', /MORALE_BATTLE_LOSS/], ['game/src/core/battle.ts', /loyaltyLossOf/]], /MORALE_BATTLE_LOSS|loyaltyLossOf/i],
  ['R63', '战绩', [['game/src/core/battle.ts', /updateRecord/]], /updateRecord|record/i],
  ['R64', '额外经验', [['game/src/core/battle.ts', /extraExpOf/]], /extraExpOf|extraExp/i],
  ['R65', '月度漂移', [['game/web/ai_model.js', /monthlyDrift/]], /monthlyDrift|漂移|drift/i],
  ['R66', '110 武将技', [['data/magics.json', /"POWER"/]], /magics|runSkill/i],
  ['R67', '伤害走脚本', [['game/src/core/battle.ts', /damageViaScript/], ['game/src/core/syso_host.ts', /DamageHost/]], /damageViaScript|DamageHost/i],
  ['R68', '武将技学习', [['game/src/core/unlock.ts', /function learnable|learnable/], ['game/src/core/unlock.ts', /monthlyLearnCheck/]], /learnable|monthlyLearnCheck|skills_r68/i],
  ['R69', '军师技 67', [['game/src/core/wises.ts', /WISE_UNIMPLEMENTED/], ['game/src/core/wises_effects.ts', /WISE_EXTRA_SPECS/]], /WISE_UNIMPLEMENTED|WISE_EXTRA_SPECS|wises_r84/i],
  ['R70', '存档 SSAV', [['game/web/saves.js', /SLOT_COUNT/], ['game/web/saves.js', /SNAPSHOT_VERSION/], ['game/web/saves.js', /SSAV/]], /saves_r70|snapshot|SSAV/i],
  ['R71', '槽描述', [['game/web/saves.js', /function slotParts|slotParts/]], /slotParts/i],
  ['R72', '旧档迁移', [['game/web/saves.js', /function migrateLegacy|migrateLegacy/]], /migrateLegacy|upgradeSnapshot/i],
  ['R73', 'AI 月循环', [['game/web/ai_model.js', /function planMonth|planMonth/], ['game/web/campaign.html', /AI\.planMonth/]], /planMonth|planForceMonth/i],
  ['R74', 'ACT 九项', [['game/web/ai_model.js', /ALL_ACTS/], ['game/web/ai_model.js', /ACT_KIND|ACT_NAMES/]], /ACT|ai_act/i],
  ['R75', '出兵数', [['game/web/ai_model.js', /dispatchTroops/], ['game/web/monarch_model.js', /troopCapOf/]], /dispatchTroops|troopCapOf/i],
  ['R76', 'Rate 权重', [['game/web/ai_model.js', /RATE_BAND|RATE\s*=/]], /RATE|rateBand/i],
  ['R77', '剧本势力将数', [['data/scenarios.json', /"KING"|KING/], ['data/generals.json', /"STR"/]], /scenario|generals/i],
  ['R78', '君主灭亡/继承', [['game/web/monarch_model.js', /successionScore/], ['game/web/monarch_model.js', /function kingDeath|kingDeath/]], /succession|kingDeath|forceExtinct/i],
  ['R79', 'SYSTEM.SO 39', [['game/src/core/syso_host.ts', /SYSTEM_SO_FUNCTIONS/], ['game/src/core/syso_host.ts', /SYSO_UNSUPPORTED/]], /syso|SYSTEM_SO/i],
  ['R80', '音效触发', [['game/src/core/audio_bus.ts', /battleAudioEvents/], ['game/web/main.js', /tickBattleSfx/]], /battleAudioEvents|tickBattleSfx|sfx/i],
];

const out = [];
for (const [id, name, checks, testRe] of ROWS) {
  const ev = checks.map(([f, re]) => ({ f, ...(find(f, re) || { line: 0, text: '<<MISSING>>' }) }));
  const g = guards(testRe);
  out.push({ id, name, ev, guards: g });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 1));
} else {
  for (const r of out) {
    const ok = r.ev.every(e => e.line > 0);
    console.log(`${r.id} ${ok ? 'OK ' : 'MISS'} ${r.name}`);
    for (const e of r.ev) console.log(`    ${e.line ? e.line : '---'} ${e.f} :: ${e.text.slice(0, 110)}`);
    console.log(`    tests: ${r.guards.length ? r.guards.join(',') : 'NONE'}`);
  }
}
