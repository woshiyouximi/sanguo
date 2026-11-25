// R83 审计探针：只读，逐行抓证据（file:line + 内容）
// 用法: node work/audit83/probe_rows.mjs > work/audit83/probe_rows.txt
import fs from 'node:fs';

const ROOT = 'F:/sanguo/';
const cache = new Map();
function lines(rel) {
  if (!cache.has(rel)) {
    let s = '';
    try { s = fs.readFileSync(ROOT + rel, 'utf8'); } catch (e) { cache.set(rel, null); return null; }
    cache.set(rel, s.split('\n'));
  }
  return cache.get(rel);
}

// [row, [ [file, regex, note], ... ] ]
const PROBES = [
  ['R1', [['game/web/city_model.js', /export function isGate/, 'isGate'],
          ['game/web/city_model.js', /RATE\s*===\s*0/, 'RATE===0'],
          ['data/cities.json', /"RATE"\s*:\s*0/, 'cities.json RATE:0 出现']]],
  ['R2', [['game/src/core/march.ts', /SENTINEL_LENGTH/, 'SENTINEL'],
          ['game/src/core/march.ts', /export function pathBetween/, 'pathBetween']]],
  ['R3', [['game/web/campaign.html', /scenarios\.json/, 'fetch scenarios'],
          ['game/web/campaign.html', /scenario\.cities/, 'cities 取用']]],
  ['R4', [['game/web/monarch_model.js', /export function (monarchOf|forceIdOf|setMonarch|kingDeath)/, 'monarch 导出'],
          ['game/web/campaign.html', /renderKingBar|ensureKing|kingbar/, 'kingbar'],
          ['game/web/campaign.html', /doAbdicate/, 'doAbdicate'],
          ['game/web/saves.js', /monarch\s*:/, 'save.monarch']]],
  ['R5', [['game/web/campaign.html', /function advanceMonth/, 'advanceMonth'],
          ['game/web/campaign.html', /year\s*\+\+|year\+\+/, 'year++'],
          ['game/web/campaign.html', /month\s*>\s*12|month\s*===\s*12|month\s*%\s*12/, 'month 进位']]],
  ['R6', [['game/web/city_model.js', /rate\s*=\s*clamp\(.*RATE|clamp\(cityDef\.RATE/, 'rate'],
          ['game/web/city_model.js', /hallIndexOf/, 'hallIndexOf 唯一消费点']]],
  ['R7', [['game/web/campaign.html', /annual|yearly|年度/, '年度结算']]],
  ['R8', [['game/web/city_model.js', /markMonthActed|lastActionMonth|canActThisMonth/, '月令闸门'],
          ['game/web/city.html', /markMonthActed|canAct|已下令/, 'city.html 调用']]],
  ['R9', [['game/web/city_model.js', /export function develop/, 'develop'],
          ['game/web/city_model.js', /saturated/, 'saturated']]],
  ['R10', [['game/web/city_model.js', /AUTONOMY|setAuto|runAutonomy|autonomyTick/, '自治'],
          ['game/web/city.html', /自治/, 'city.html 按钮']]],
  ['R11', [['game/web/city_model.js', /talent|treasure|talisman/, '三路'],
          ['game/web/city_model.js', /WEIGHTS|searchWeights/, '权重']]],
  ['R12', [['game/web/city_model.js', /prepStateOf|refillPrep|cavalryCapOf|PREP/, '预备兵'],
          ['game/web/city_model.js', /RECRUIT/, 'RECRUIT'],
          ['game/web/city.html', /預備|预备|prep/, 'city.html 预备兵 UI']]],
  ['R13', [['game/web/city.html', /武將資料|勢力地圖|內政終了|武将资料|势力地图|内政终了/, '三命令']]],
  ['R14', [['game/web/city_model.js', /export const MOVE/, 'MOVE'],
          ['game/web/city_model.js', /Rate\s*=\s*80|80\s*\/\s*\(/, 'Rate 80/(L+1)']]],
  ['R15', [['game/web/campaign.html', /money\s*=\s*Math\.floor\(.*1\.01\)/, '金钱公式'],
          ['game/web/campaign.html', /俸祿|俸禄/, '俸禄']]],
  ['R16', [['game/web/city_model.js', /徵糧|征粮|訓練|训练|治水|外交/, '负证据']]],
  ['R17', [['game/web/city_model.js', /function searchPools|searchPools/, 'searchPools'],
          ['game/web/city_model.js', /SearchType/, 'SearchType'],
          ['game/web/city_model.js', /rate\s*<=\s*0/, 'rate<=0 skip']]],
  ['R18', [['game/web/city_model.js', /ONLYONE/, 'ONLYONE']]],
  ['R19', [['game/web/city_model.js', /rate\s*<=\s*0/, 'Rate<=0']]],
  ['R20', [['game/web/city_model.js', /hashSeed|mulberry32|searchSeed/, '确定性种子']]],
  ['R21', [['game/web/deploy.html', /SOLDIER_CAP/, 'SOLDIER_CAP']]],
  ['R22', [['game/src/core/battle.ts', /isCavalryBit|cavalryCapOf|kind\?:\s*'infantry'/, '骑兵'],
          ['game/src/core/battle.ts', /killsInf|killsCav/, '击杀分类']]],
  ['R23', [['game/src/core/battle.ts', /export function hpCapOf|export function mpCapOf|function hpCapOf/, 'hpCapOf/mpCapOf']]],
  ['R24', [['game/src/core/battle.ts', /lv\+\+|level\s*\+=\s*1|for\s*\(.*<.*levelUp/, '升级'],
          ['game/src/core/battle.ts', /ovHp|overflow/, '溢出']]],
  ['R25', [['game/src/core/capture.ts', /learnedAtLevelUp|knownMagicOf/, '补学'],
          ['game/src/core/battle.ts', /learnedAtLevelUp|knownMagicOf/, 'battle 调用']]],
  ['R26', [['game/src/core/battle.ts', /expToReach/, 'expToReach']]],
  ['R27', [['game/src/core/unlock.ts', /export function troopsOf|isTroopUnlocked/, '兵种'],
          ['game/web/deploy.html', /troopSet|troopsOf/, 'deploy']]],
  ['R28', [['data/formations.json', /"matrix"/, 'matrix'],
          ['game/src/core/battle.ts', /formationCells/, 'formationCells']]],
  ['R29', [['game/web/deploy.html', /兵力|soldier/i, '兵力档']]],
  ['R30', [['game/src/core/battle.ts', /formationCells/, 'formationCells'],
          ['data/formations.json', /slot_rule/, 'slot_rule']]],
  ['R31', [['game/src/core/wises.ts', /WISE_UNIMPLEMENTED|WISE_SPECS|SPECS/, 'SPECS']]],
  ['R32', [['game/web/main.js', /applyWise|applyWiseOnBattleStart/, 'applyWise'],
          ['game/src/core/wises.ts', /export function applyWise/, 'applyWise 定义']]],
  ['R33', [['game/src/core/battle.ts', /wiseBonus|wise_bonus|qi_cost|qi_regen|exp_bonus/, '4 通道'],
          ['game/src/core/battle.ts', /1\s*\+\s*\w+\s*\/\s*100/, '乘算']]],
  ['R34', [['game/src/core/wises.ts', /export function applyWise/, '一次一边']]],
  ['R35', [['game/web/deploy.html', /wisepick|listWisdomChoices/, '选择界面']]],
  ['R36', [['game/src/core/battle.ts', /export function createWorld|export function settle|function settleMode/, 'world/settle']]],
  ['R37', [['game/src/core/strategy.ts', /STRATEGY_TABLE|runStrategy|planStrategy|tickStrategy|Reinforce|reinforce/, 'strategy'],
          ['game/src/core/battle.ts', /strategy|reinforce/, 'battle 接线']]],
  ['R38', [['game/src/core/battle.ts', /requestRetreat|cullFled|RETREAT_SPEED/, '撤退']]],
  ['R39', [['game/src/core/weather.ts', /ProduceRain|ProduceSnow|ProduceFog/, '天气'],
          ['game/src/core/battle.ts', /weather|Weather/, 'battle 天气']]],
  ['R40', [['game/src/core/battle.ts', /duel|單挑|单挑/, '负证据']]],
  ['R41', [['game/src/core/battle.ts', /MORALE_DAMP|MORALE_DIV|powerOf/, '士气']]],
  ['R42', [['game/src/core/battle.ts', /export function hitChance|function hitChance/, 'hitChance']]],
  ['R43', [['game/src/core/battle.ts', /prevX|prevY/, '移动目标']]],
  ['R44', [['game/src/core/battle.ts', /isCavalryBit|0x2C|& 4/, '位掩码']]],
  ['R45', [['game/src/core/battle.ts', /terrainBonus|terrains/, '地形'],
          ['data/terrains.json', /"vs"/, 'terrains vs']]],
  ['R46', [['game/src/core/battle.ts', /export function basicDamage/, 'basicDamage']]],
  ['R47', [['game/src/core/battle.ts', /QI_MAX|QI_START|QI_COST_SCALE/, '气力常量']]],
  ['R48', [['game/src/core/smartscript/vm.ts', /class .*Session|WAIT|wait/, 'vm 逐帧']]],
  ['R49', [['data/magics.json', /"SEQUENCE"/, 'magics 条数']]],
  ['R50', [['game/src/core/smartscript/runtime.ts', /isHeal|isSummon|isWide/, '中文猜'],
          ['game/src/core/smartscript/runtime.ts', /ACTIVE/, 'ACTIVE 位掩码']]],
  ['R51', [['game/src/core/smartscript/runtime.ts', /setEngineValue\(4|g4/, 'g4']]],
  ['R52', [['game/src/core/audio_bus.ts', /AudioSink|SfxEvent|callSystemSo/, 'audio_bus']]],
  ['R53', [['game/src/core/capture.ts', /export function recruitChanceOf|export function canRecruit/, '招降']]],
  ['R54', [['game/src/core/capture.ts', /export function resolvePostBattle/, 'resolvePostBattle']]],
  ['R55', [['game/src/core/capture.ts', /isKing/, 'isKing']]],
  ['R56', [['game/src/core/roster.ts', /DEAD|陣亡/, 'roster 阵亡'],
          ['game/src/core/capture.ts', /roster|execute/, 'capture 调 roster']]],
  ['R57', [['game/src/core/battle.ts', /掉落|loot|drop/i, '战后掉落']]],
  ['R58', [['game/src/core/capture.ts', /constancy|節操|节操/, '节操']]],
  ['R59', [['game/src/core/battle.ts', /warMeritOf/, 'warMerit']]],
  ['R60', [['game/src/core/battle.ts', /settleMode|settleReport|modeName/, 'mode']]],
  ['R61', [['game/src/core/battle.ts', /tireGain|tire\b/, '疲劳']]],
  ['R62', [['game/src/core/battle.ts', /MORALE_BATTLE_LOSS|loyaltyLossOf/, '战后增减']]],
  ['R63', [['game/src/core/battle.ts', /updateRecord/, 'record'],
          ['game/web/saves.js', /updateRecord|streak/, 'saves record']]],
  ['R64', [['game/src/core/battle.ts', /extraExpOf/, 'extraExp']]],
  ['R65', [['game/web/ai_model.js', /monthlyDrift|DRIFT/, '月漂移'],
          ['game/web/campaign.html', /recordDrift|monthlyDrift/, 'campaign 调用']]],
  ['R66', [['data/magics.json', /"MP"/, 'magics']]],
  ['R67', [['game/src/core/smartscript/runtime.ts', /0\.15\s*\+|applyHpDelta|125/, '伤害']]],
  ['R68', [['game/src/core/unlock.ts', /learnable|applyLearn|monthlyLearnCheck/, '学习门槛'],
          ['game/web/campaign.html', /monthlyLearnCheck/, '月末补学']]],
  ['R69', [['game/src/core/wises.ts', /WISE_SPECS|WISE_UNIMPLEMENTED/, 'wises']]],
  ['R70', [['game/web/saves.js', /SLOT_COUNT|sanguo_saves/, '存档槽'],
          ['game/web/saves.js', /SSAV/, 'SSAV']]],
  ['R71', [['game/web/saves.js', /slotSummary/, 'slotSummary']]],
  ['R72', [['game/web/campaign.html', /migrateLegacy/, '迁移']]],
  ['R73', [['game/web/ai_model.js', /planForceMonth|runMonth|argMaxRate/, 'AI 月计划'],
          ['game/web/campaign.html', /AI\.runMonth|runMonth/, 'campaign 调用']]],
  ['R74', [['game/web/ai_model.js', /\bACT\b|ACT_KIND|executeCandidate|executeAction/, 'ACT']]],
  ['R75', [['game/web/ai_model.js', /dispatchTroops|dispatchCapOf/, '出兵数'],
          ['game/web/campaign.html', /dispatchCapOf/, 'campaign']]],
  ['R76', [['game/web/ai_model.js', /scoreTarget|KIND_RATE|RATE/, 'Rate']]],
  ['R77', [['data/scenarios.json', /"kings"/, 'kings'],
          ['data/generals.json', /"SEQUENCE"|"NAME"/, 'generals']]],
  ['R78', [['game/web/monarch_model.js', /forceExtinct|checkForceDeath|inherit/, '势力灭亡'],
          ['game/web/campaign.html', /forceExtinct/, 'campaign']]],
  ['R79', [['game/src/core/syso_host.ts', /SYSTEM_SO_FUNCTIONS|SYSO_UNSUPPORTED/, 'syso'],
          ['game/src/core/smartscript/runtime.ts', /callSystemSo|syso/, 'runtime 分派']]],
  ['R80', [['game/src/core/audio_bus.ts', /sink|play/, 'sink'],
          ['game/web/main.js', /sfx|Sfx/, 'main sfx']]],
];

const out = [];
for (const [row, probes] of PROBES) {
  out.push(`\n===== ${row} =====`);
  for (const [rel, re, note] of probes) {
    const L = lines(rel);
    if (!L) { out.push(`  MISS-FILE ${rel}`); continue; }
    const hits = [];
    for (let i = 0; i < L.length; i++) if (re.test(L[i])) hits.push(i + 1);
    if (!hits.length) { out.push(`  MISS ${rel}  ${note}  /${re.source}/`); continue; }
    const show = hits.slice(0, 8).map(n => `${n}:${L[n - 1].trim().slice(0, 150)}`);
    out.push(`  HIT ${rel} x${hits.length}  [${note}]`);
    for (const s of show) out.push(`      ${s}`);
    if (hits.length > 8) out.push(`      ... +${hits.length - 8} more`);
  }
}
console.log(out.join('\n'));
