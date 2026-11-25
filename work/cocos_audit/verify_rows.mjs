// Evidence collector for 37a 80-row re-verification. Read-only: greps files, never writes game code.
// usage: node work/cocos_audit/verify_rows.mjs > work/cocos_audit/rows_evidence.txt
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo/game';
const CHECKS = [
  // [row, file, regex, note]
  ['R1', 'web/city_model.js', 'function isGate|isGate\\s*=', ''],
  ['R2', 'src/core/march.ts', 'pathBetween|SENTINEL|30000', ''],
  ['R3', 'web/campaign.html', 'scenario\\.cities|SCENARIOS|scenarios\\b', ''],
  ['R4', 'web/ai_model.js', 'extinguishForce|successorOf|checkForceDeaths', ''],
  ['R5', 'web/campaign.html', 'function advanceMonth', ''],
  ['R6', 'web/city_model.js', 'RATE|rate', ''],
  ['R7', 'web/campaign.html', 'year|年度|yearEnd', ''],
  ['R8', 'web/city_model.js', 'markMonthActed|monthActed|acted', ''],
  ['R9', 'web/city_model.js', 'function develop|saturated', ''],
  ['R10', 'web/city_model.js', 'AUTONOMY|setAuto|runAutonomy|autonomyTick', ''],
  ['R11', 'web/city_model.js', 'SEARCH|WEIGHTS|talent|treasure', ''],
  ['R12', 'web/city_model.js', 'prepStateOf|refillPrep|cavalryCapOf', ''],
  ['R13', 'web/city.html', '武將資料|勢力地圖|內政終了|武将资料|势力地图', ''],
  ['R14', 'web/city_model.js', 'function move|MOVE', ''],
  ['R15', 'web/campaign.html', 'function monthlyIncome|money \\* 1\\.01|俸祿|俸禄', ''],
  ['R16', 'web/city_model.js', '徵糧|训练|治水|外交|徵粮', ''],
  ['R17', 'web/city_model.js', 'searchPools|SearchType|Rate', ''],
  ['R18', 'web/city_model.js', 'ONLYONE|onlyone', ''],
  ['R19', 'web/city_model.js', 'Rate ?<= ?0|rate ?<= ?0', ''],
  ['R20', 'web/city_model.js', 'seed|hash', ''],
  ['R21', 'web/deploy.html', 'SOLDIER_CAP|soldierCap', ''],
  ['R22', 'src/core/battle.ts', 'cavalryCapOf|killsCav|kind', ''],
  ['R23', 'src/core/battle.ts', 'hpCapOf|mpCapOf', ''],
  ['R24', 'src/core/battle.ts', 'function levelUp|levelUp\\(', ''],
  ['R25', 'src/core/capture.ts', 'learnedAtLevelUp|knownMagicOf', ''],
  ['R26', 'src/core/battle.ts', 'expToReach', ''],
  ['R27', 'src/core/unlock.ts', 'troopsOf|isTroopUnlocked', ''],
  ['R28', 'data/formations.json', '"matrix"|亂陣|乱阵', ''],
  ['R29', 'web/deploy.html', '兵|range|slider', ''],
  ['R30', 'src/core/battle.ts', 'formationCells|slot_rule', ''],
  ['R31', 'src/core/wises.ts', 'SPECS|unimplemented', ''],
  ['R32', 'web/main.js', 'wise|applyWise', ''],
  ['R33', 'src/core/battle.ts', 'bonus / 100|1 \\+ ', ''],
  ['R34', 'src/core/wises.ts', 'function applyWise', ''],
  ['R35', 'web/deploy.html', '軍師技|军师技', ''],
  ['R36', 'src/core/battle.ts', 'function createWorld|function settle', ''],
  ['R37', 'src/core/battle.ts', 'strategy|策略|reinforce|援軍|援军', ''],
  ['R38', 'src/core/battle.ts', 'requestRetreat|cullFled', ''],
  ['R39', 'src/core/weather.ts', 'PRODUCE|rain|snow|fog', ''],
  ['R40', 'src/core/battle.ts', 'duel|單挑|单挑', ''],
  ['R41', 'src/core/battle.ts', 'MORALE_DAMP', ''],
  ['R42', 'src/core/battle.ts', 'function hitChance', ''],
  ['R43', 'src/core/battle.ts', '2 / 3|moveScale|movingTarget', ''],
  ['R44', 'src/core/battle.ts', 'isCavalryBit', ''],
  ['R45', 'data/terrains.json', '"vs"', ''],
  ['R46', 'src/core/battle.ts', 'function basicDamage', ''],
  ['R47', 'src/core/battle.ts', 'QI_MAX|QI_START|POWER', ''],
  ['R48', 'src/core/smartscript/vm.ts', 'WAIT|opcode', ''],
  ['R49', 'src/core/wises.ts', '109|110', ''],
  ['R50', 'src/core/smartscript/syscalls.ts', 'ATTRIB|ACTIVE|isHeal|isWide', ''],
  ['R51', 'src/core/smartscript/runtime.ts', 'ATTACK|g4|valueFor', ''],
  ['R52', 'src/core/audio_bus.ts', 'function |export ', ''],
  ['R53', 'src/core/capture.ts', 'recruitChanceOf|canRecruit', ''],
  ['R54', 'src/core/capture.ts', 'resolvePostBattle', ''],
  ['R55', 'src/core/capture.ts', 'isKing', ''],
  ['R56', 'src/core/roster.ts', '陣亡|阵亡|removeOfficer|kill', ''],
  ['R57', 'src/core/battle.ts', 'drop|loot|掉落', ''],
  ['R58', 'src/core/capture.ts', 'loyal|節操|节操', ''],
  ['R59', 'src/core/battle.ts', 'feature|戰功|战功|merit', ''],
  ['R60', 'src/core/battle.ts', 'settleMode|settleReport|modeName', ''],
  ['R61', 'src/core/battle.ts', 'tireGain|tire', ''],
  ['R62', 'src/core/battle.ts', 'morale - 20|morale -= 20', ''],
  ['R63', 'web/ai_model.js', 'updateRecord|streak|bestStreak', ''],
  ['R64', 'src/core/battle.ts', 'expBase|expFrom|\\* 32', ''],
  ['R65', 'web/ai_model.js', 'function monthlyDrift', ''],
  ['R66', 'data/magics.json', '"seq"', ''],
  ['R67', 'src/core/battle.ts', 'rate = 0\\.15|atk \\* 0\\.01', ''],
  ['R68', 'src/core/unlock.ts', 'learnable|applyLearn|monthlyLearnCheck', ''],
  ['R69', 'src/core/wises.ts', 'applyWiseOnBattleStart', ''],
  ['R70', 'web/saves.js', 'localStorage|SSAV|SLOT', ''],
  ['R71', 'web/saves.js', 'slotSummary|ownedCount', ''],
  ['R72', 'web/campaign.html', 'sanguo_campaign_v1|migrat', ''],
  ['R73', 'web/ai_model.js', 'planForceMonth|argMaxRate', ''],
  ['R74', 'web/ai_model.js', 'ALL_ACTS|executeCandidate', ''],
  ['R75', 'web/ai_model.js', 'function dispatchTroops', ''],
  ['R76', 'web/ai_model.js', 'function scoreTarget|RATE', ''],
  ['R77', 'data/scenarios.json', '"kings"', ''],
  ['R78', 'web/ai_model.js', 'captureKingIn|applyKingDeaths', ''],
  ['R79', 'web/campaign.html', 'SYSTEM\\.SO|StartBattle|EnterWar', ''],
  ['R80', 'web/main.js', 'audio\\.|sfx|playSfx', ''],
];

function grep(file, re) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return { missing: true, hits: [] };
  const src = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const rx = new RegExp(re, 'i');
  const hits = [];
  for (let i = 0; i < src.length; i++) if (rx.test(src[i])) hits.push([i + 1, src[i].trim().slice(0, 110)]);
  return { missing: false, total: src.length, hits };
}

const out = [];
for (const [row, file, re, note] of CHECKS) {
  const r = grep(file, re);
  out.push(`### ${row}  ${file}  /${re}/`);
  if (r.missing) out.push('  FILE MISSING');
  else {
    out.push(`  lines=${r.total}  hits=${r.hits.length}`);
    for (const [ln, txt] of r.hits.slice(0, 6)) out.push(`  :${ln}  ${txt}`);
    if (r.hits.length > 6) out.push(`  ... +${r.hits.length - 6} more`);
  }
}
fs.writeFileSync('F:/sanguo/work/cocos_audit/rows_evidence_raw.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
