// R84 逐行探针 v2：纯字面量子串匹配（不用正则，避免转义问题）。
// 用法: node work/audit84/probe_rows84.mjs > work/audit84/probe_rows84.txt
import fs from 'node:fs';
import path from 'node:path';

// 输出同时写 UTF-8 文件（PowerShell 的 > 会写 UTF-16，read 工具读不了）
const OUT = 'F:/sanguo/work/audit84/probe_rows84.txt';
const _buf = [];
const _orig = console.log.bind(console);
console.log = (...a) => { const s = a.map(String).join(' '); _buf.push(s); _orig(s); };
process.on('exit', () => { try { fs.writeFileSync(OUT, _buf.join('\n') + '\n', 'utf8'); } catch (e) { _orig('WRITE-FAIL ' + e.message); } });

const ROOT = 'F:/sanguo/game';
const cache = new Map();
function linesOf(rel) {
  if (cache.has(rel)) return cache.get(rel);
  let arr = null;
  try { arr = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/); } catch { arr = null; }
  cache.set(rel, arr);
  return arr;
}
const hitsOf = (rel, sub, maxHits) => {
  const ls = linesOf(rel);
  if (ls === null) return null;
  const needle = sub.toLowerCase();
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    if (ls[i].toLowerCase().includes(needle)) {
      out.push({ n: i + 1, t: ls[i].trim().slice(0, 160) });
      if (out.length >= maxHits) break;
    }
  }
  return out;
};
const countOf = (rel, sub) => {
  const ls = linesOf(rel);
  if (ls === null) return null;
  const needle = sub.toLowerCase();
  let n = 0;
  for (const l of ls) if (l.toLowerCase().includes(needle)) n++;
  return n;
};
function row(id, checks) {
  console.log(`\n### ${id}`);
  for (const c of checks) {
    if (c.k === 'has') {
      const subs = Array.isArray(c.s) ? c.s : [c.s];
      for (const sub of subs) {
        const h = hitsOf(c.f, sub, c.max || 3);
        if (h === null) { console.log(`  MISS-FILE  ${c.f}`); break; }
        if (h.length === 0) { console.log(`  miss  ${c.f}  "${sub}"`); continue; }
        console.log(`  HIT   ${c.f}  "${sub}"  x${countOf(c.f, sub)}`);
        for (const x of h) console.log(`        ${String(x.n).padStart(5)}: ${x.t}`);
      }
    } else if (c.k === 'cnt') {
      const n = countOf(c.f, c.s);
      console.log(`  COUNT ${n === null ? 'NOFILE' : n}  ${c.f}  "${c.s}"`);
    } else if (c.k === 'neg') {
      let total = 0; const bad = [];
      for (const f of c.files) {
        const n = countOf(f, c.s);
        if (n) { total += n; bad.push(`${f}(${n})`); }
      }
      console.log(`  NEG "${c.s}"  total=${total} over ${c.files.length} files  ${total ? 'HIT>>> ' + bad.join(', ') : 'clean(符合负证据)'}`);
    }
  }
}

const CORE = fs.readdirSync(path.join(ROOT, 'src/core')).filter((f) => f.endsWith('.ts')).map((f) => 'src/core/' + f)
  .concat(fs.readdirSync(path.join(ROOT, 'src/core/smartscript')).filter((f) => f.endsWith('.ts')).map((f) => 'src/core/smartscript/' + f));
const WEB = fs.readdirSync(path.join(ROOT, 'web')).filter((f) => /\.(js|html)$/.test(f)).map((f) => 'web/' + f);

console.log('===== R84 逐行探针 v2 =====  采样 ' + new Date().toISOString());
console.log('语料: CORE ' + CORE.length + ' 档 / WEB ' + WEB.length + ' 档');

row('R1 60城/12关隘(RATE=0)', [
  { k: 'has', f: 'web/city_model.js', s: ['isGate', 'RATE === 0'] },
]);
row('R2 116 PATH / 哨兵 30000', [
  { k: 'has', f: 'src/core/march.ts', s: ['SENTINEL_LENGTH', 'pathBetween', 'Length'] },
]);
row('R3 5剧本 scenarios.json', [{ k: 'has', f: 'web/campaign.html', s: 'scenarios.json' }]);
row('R4 君主', [
  { k: 'has', f: 'web/monarch_model.js', s: ['monarchOf', 'setMonarch', 'kingDeath', 'inheritForce'] },
  { k: 'has', f: 'web/campaign.html', s: ['ensureKing', 'renderKingBar', 'doAbdicate', 'forceExtinct'] },
]);
row('R5 月推进/倒计时/年度进位', [
  { k: 'has', f: 'web/campaign.html', s: ['advanceMonth', 'save.month += 1'] },
  { k: 'has', f: 'web/saves.js', s: 'monthLabel' },
  { k: 'cnt', f: 'web/campaign.html', s: 'countdown' },
  { k: 'cnt', f: 'web/campaign.html', s: '倒計時' },
  { k: 'cnt', f: 'web/campaign.html', s: '倒计时' },
]);
row('R6 城规模 RATE 语义', [
  { k: 'has', f: 'web/city_model.js', s: 'hallIndexOf' },
  { k: 'cnt', f: 'web/city_model.js', s: 'RATE' },
  { k: 'cnt', f: 'web/campaign.html', s: 'RATE' },
]);
row('R7 年度结算', [
  { k: 'has', f: 'web/saves.js', s: ['YEAR_MONTHS', 'isYearStart', 'ensureYear', 'YEAR_STAGES', 'annualSettle', 'annualText', 'ledgerOf'] },
  { k: 'has', f: 'web/campaign.html', s: ['annualSettle', 'YEAR_STAGES', 'isYearStart'] },
]);
row('R8 本月已下令', [
  { k: 'has', f: 'web/city.html', s: 'monthLocked' },
  { k: 'has', f: 'web/city_model.js', s: ['markMonthActed', 'lastActionMonth'] },
]);
row('R9 開發/饱和', [
  { k: 'has', f: 'web/city_model.js', s: ['develop', 'saturated', '新設計'] },
]);
row('R10 自治', [
  { k: 'has', f: 'web/city_model.js', s: ['AUTONOMY', 'setAuto', 'runAutonomy'] },
  { k: 'has', f: 'web/campaign.html', s: 'autonomyTick' },
]);
row('R11 搜索二选一', [{ k: 'has', f: 'web/city_model.js', s: ['searchPools', 'SEARCH'] }]);
row('R12 徵兵预备兵/双滑杆', [
  { k: 'has', f: 'web/city_model.js', s: ['prepCapOf', 'cavalryCapOf', 'refillPrep'] },
  { k: 'has', f: 'web/city.html', s: 'vPrep' },
]);
row('R13 三条独立命令', [
  { k: 'has', f: 'web/city_model.js', s: ['CMD_ORDER', 'CMD_EXTRA'] },
  { k: 'cnt', f: 'web/city_model.js', s: '武將資料' },
  { k: 'cnt', f: 'web/city_model.js', s: '勢力地圖' },
  { k: 'cnt', f: 'web/city_model.js', s: '內政終了' },
]);
row('R14 移動 Rate=80/(L+1)', [
  { k: 'has', f: 'web/city_model.js', s: ['neighboursOf', 'MOVE'] },
  { k: 'cnt', f: 'web/city_model.js', s: 'Length + 1' },
  { k: 'cnt', f: 'web/city_model.js', s: '(Length' },
]);
row('R15 金钱公式', [
  { k: 'has', f: 'web/campaign.html', s: ['/5000', '1.01'] },
  { k: 'has', f: 'web/campaign.html', s: '俸祿' },
]);
row('R16 负证据: 徵糧/訓練/治水/外交', [
  { k: 'neg', files: [...CORE, ...WEB], s: '徵糧' },
  { k: 'neg', files: [...CORE, ...WEB], s: '訓練' },
  { k: 'neg', files: [...CORE, ...WEB], s: '治水' },
  { k: 'neg', files: [...CORE, ...WEB], s: '外交' },
]);
row('R17 128槽轮盘/SearchType', [
  { k: 'cnt', f: 'web/city_model.js', s: '128' },
  { k: 'has', f: 'web/city_model.js', s: ['SearchType', 'Rate <= 0'] },
]);
row('R18 ONLYONE', [
  { k: 'has', f: 'web/city_model.js', s: ['ONLYONE', 'ownedItemSeqs', 'rememberFound'] },
]);
row('R19 Rate<=0 剔除', [{ k: 'has', f: 'web/city_model.js', s: '<= 0' }]);
row('R20 搜索确定性种子', [{ k: 'has', f: 'web/city_model.js', s: ['mulberry32', 'hashSeed', 'searchSeed'] }]);
row('R21 带兵上限', [{ k: 'has', f: 'web/deploy.html', s: 'SOLDIER_CAP' }]);
row('R22 骑兵上限', [{ k: 'has', f: 'src/core/battle.ts', s: ['cavalryCapOf', 'isCavalryBit'] }]);
row('R23 最大体力/技力', [{ k: 'has', f: 'src/core/battle.ts', s: ['hpCapOf', 'mpCapOf'] }]);
row('R24 升级', [{ k: 'has', f: 'src/core/battle.ts', s: ['ovHp', 'ovMp', 'levelUp'] }]);
row('R25 升级补学', [
  { k: 'has', f: 'src/core/battle.ts', s: 'learnedAtLevelUp' },
  { k: 'has', f: 'src/core/capture.ts', s: ['learnedAtLevelUp', 'knownMagicOf'] },
]);
row('R26 经验阈值', [{ k: 'has', f: 'src/core/battle.ts', s: 'expToReach' }]);
row('R27 兵种+兵符', [{ k: 'has', f: 'src/core/unlock.ts', s: ['troopsOf', 'learnable'] }]);
row('R28 阵形相克', [{ k: 'has', f: 'src/core/battle.ts', s: 'formationBonus' }]);
row('R29 兵力档位', [{ k: 'has', f: 'web/deploy.html', s: ['50, 80, 100', '80, 100'] }]);
row('R30 站位公式', [{ k: 'has', f: 'src/core/battle.ts', s: 'formationCells' }]);
row('R31 67条军师技', [{ k: 'has', f: 'src/core/wises.ts', s: ['WISE_SPECS', 'SPECS'] }]);
row('R32 军师在城内才给', [
  { k: 'has', f: 'src/core/wises.ts', s: 'applyWiseOnBattleStart' },
  { k: 'has', f: 'web/main.js', s: 'applyWise' },
]);
row('R33 纯加法?', [
  { k: 'cnt', f: 'src/core/battle.ts', s: '/ 100' },
  { k: 'has', f: 'src/core/battle.ts', s: ['strategyAtk', '1 +'] },
]);
row('R34 一次一条', [{ k: 'has', f: 'src/core/wises.ts', s: 'export function applyWise' }]);
row('R35 出阵前选一条', [{ k: 'has', f: 'web/deploy.html', s: ['wisepick', 'listWisdomChoices'] }]);
row('R36 战斗主流程', [{ k: 'has', f: 'src/core/battle.ts', s: ['createWorld', 'function step', 'function settle'] }]);
row('R37 策略/援军', [
  { k: 'has', f: 'src/core/strategy.ts', s: ['STRATEGY_TABLE', 'planStrategy', 'runStrategy', 'tickStrategy', 'reinforce'] },
  { k: 'has', f: 'src/core/battle.ts', s: ['requestRetreat', 'strategy'] },
]);
row('R38 撤退/逃跑', [{ k: 'has', f: 'src/core/battle.ts', s: ['requestRetreat', 'RETREAT_SPEED', 'cullFled', 'maybeRetreat'] }]);
row('R39 天气', [
  { k: 'has', f: 'src/core/weather.ts', s: ['Rain', 'Snow', 'Fog'] },
  { k: 'has', f: 'src/core/battle.ts', s: 'weatherHitMod' },
]);
row('R40 无单挑子系统', [
  { k: 'neg', files: [...CORE, ...WEB], s: '單挑' },
  { k: 'neg', files: [...CORE, ...WEB], s: '单挑' },
  { k: 'neg', files: [...CORE, ...WEB], s: 'duel' },
  { k: 'cnt', f: 'src/core/syso_host.ts', s: '43ED96' },
]);
row('R41 战力五项/士气', [{ k: 'has', f: 'src/core/battle.ts', s: ['MORALE_DAMP', 'morale - 50'] }]);
row('R42 四条命中式', [{ k: 'has', f: 'src/core/battle.ts', s: 'hitChance' }]);
row('R43 移动目标 2/3', [{ k: 'cnt', f: 'src/core/battle.ts', s: '* 2 / 3' }]);
row('R44 +0x2C&4 补判', [{ k: 'has', f: 'src/core/battle.ts', s: 'isCavalryBit' }]);
row('R45 地形 12x13', [{ k: 'has', f: 'src/core/battle.ts', s: 'terrainBonus' }]);
row('R46 士兵即死/主将扣血', [{ k: 'has', f: 'src/core/battle.ts', s: ['basicDamage', 'legacyDamage'] }]);
row('R47 气力', [{ k: 'has', f: 'src/core/battle.ts', s: ['QI_MAX', 'QI_START', 'QI_COST_SCALE', 'qiCostMul', 'qiPowerPercentOf'] }]);
row('R48 90 opcode/逐帧 WAIT', [{ k: 'has', f: 'src/core/smartscript/vm.ts', s: ['WAIT', 'SkillSession'] }]);
row('R49 110技入口', [{ k: 'has', f: 'src/core/smartscript/runtime.ts', s: 'runSkill' }]);
row('R50 ACTIVE 位掩码', [{ k: 'has', f: 'src/core/battle.ts', s: ['ACTIVE_BIT', 'activeMaskOf', 'activeHits', 'statusBitOf'] }]);
row('R51 Attack 全局', [{ k: 'has', f: 'src/core/smartscript/runtime.ts', s: ['setEngineValue', 'ATTACK'] }]);
row('R52 特效/音效 syscall', [
  { k: 'has', f: 'src/core/audio_bus.ts', s: ['setAudioSink', 'emitSfx', 'emitMagic', 'battleAudioEvents'] },
  { k: 'has', f: 'web/main.js', s: ['installAudioSink', 'tickBattleSfx'] },
]);
row('R53 招降硬门', [{ k: 'has', f: 'src/core/capture.ts', s: ['recruitChanceOf', 'canRecruit'] }]);
row('R54 逐个处置', [{ k: 'has', f: 'src/core/capture.ts', s: 'resolvePostBattle' }]);
row('R55 君主不可俘', [{ k: 'has', f: 'src/core/capture.ts', s: ['isKingOf', 'isKing'] }]);
row('R56 斩首落池/接线', [
  { k: 'has', f: 'src/core/roster.ts', s: ['applyPostBattle', 'removeFromPools'] },
  { k: 'has', f: 'web/campaign.html', s: 'applyPostBattle' },
  { k: 'has', f: 'web/main.js', s: 'executed' },
]);
row('R57 战斗掉落', [{ k: 'has', f: 'src/core/capture.ts', s: 'drop' }]);
row('R58 招降落地', [{ k: 'has', f: 'src/core/capture.ts', s: ['2 / 3', 'constancy'] }]);
row('R59 战功带兵差', [{ k: 'has', f: 'src/core/battle.ts', s: 'warMeritOf' }]);
row('R60 四种 mode', [{ k: 'has', f: 'src/core/battle.ts', s: ['settleMode', 'settleReport', 'MODE_NAME'] }]);
row('R61 疲劳/功勋', [{ k: 'has', f: 'src/core/battle.ts', s: ['tireGain', 'meritGain'] }]);
row('R62 战后士气/忠诚', [{ k: 'has', f: 'src/core/battle.ts', s: ['MORALE_BATTLE_LOSS', 'loyaltyLossOf'] }]);
row('R63 战绩', [{ k: 'has', f: 'src/core/battle.ts', s: 'updateRecord' }]);
row('R64 额外经验', [{ k: 'has', f: 'src/core/battle.ts', s: 'extraExpOf' }]);
row('R65 每月漂移', [{ k: 'has', f: 'web/ai_model.js', s: ['monthlyDrift', 'DRIFT'] }]);
row('R66 110条数据', [{ k: 'has', f: 'web/city_model.js', s: 'magics' }]);
row('R67 脚本伤害 0x125', [
  { k: 'has', f: 'src/core/battle.ts', s: ['damageViaScript', 'applyDamage', 'legacyDamage'] },
  { k: 'has', f: 'src/core/syso_host.ts', s: ['DamageHost', 'damageHostApply', 'hurt'] },
]);
row('R68 学习门槛/月度补学', [
  { k: 'has', f: 'src/core/unlock.ts', s: ['learnable', 'monthlyLearnCheck'] },
  { k: 'has', f: 'web/campaign.html', s: 'monthlyLearnCheck' },
]);
row('R69 67条实作', [{ k: 'has', f: 'src/core/wises.ts', s: ['WISE_UNIMPLEMENTED', 'WISE_SPECS'] }]);
row('R70 SSAV', [
  { k: 'neg', files: WEB, s: 'SSAV' },
  { k: 'has', f: 'web/saves.js', s: ['SLOT_COUNT', 'SNAPSHOT_VERSION'] },
]);
row('R71 槽描述串', [{ k: 'has', f: 'web/saves.js', s: 'slotParts' }]);
row('R72 旧档迁移', [{ k: 'has', f: 'web/saves.js', s: 'migrateLegacy' }]);
row('R73 AI 四段', [
  { k: 'has', f: 'web/campaign.html', s: ['AI.planMonth', 'AI.executeMonth'] },
  { k: 'has', f: 'web/ai_model.js', s: ['planForceMonth', 'argMaxRate', 'runMonth'] },
]);
row('R74 ACT 9项', [{ k: 'has', f: 'web/ai_model.js', s: ['ALL_ACTS', 'const ACT'] }]);
row('R75 出兵数', [{ k: 'has', f: 'web/ai_model.js', s: 'dispatchTroops' }]);
row('R76 Rate 表', [{ k: 'has', f: 'web/ai_model.js', s: ['RATE_BAND', 'const RATE'] }]);
row('R77 5剧本/401将', [{ k: 'has', f: 'web/campaign.html', s: 'generals.json' }]);
row('R78 君主阵亡→灭亡/继承', [{ k: 'has', f: 'web/monarch_model.js', s: ['kingDeath', 'inheritForce', 'successionScore'] }]);
row('R79 SYSTEM.SO 39', [
  { k: 'has', f: 'src/core/syso_host.ts', s: ['SYSTEM_SO_FUNCTIONS', 'SYSO_UNSUPPORTED'] },
  { k: 'has', f: 'src/core/audio_bus.ts', s: ['SYSTEM_SO_HOST_IMPLEMENTED', 'ALL_IMPLEMENTED', 'SYSTEM_SO_IMPLEMENTED'] },
]);
row('R80 0x300/0x301 SFX', [
  { k: 'has', f: 'src/core/audio_bus.ts', s: 'battleAudioEvents' },
  { k: 'has', f: 'web/main.js', s: 'tickBattleSfx' },
]);
console.log('\n===== end =====');
