/**
 * 无编辑器预览入口（ESM）。
 *
 * 数据流：data/*.json → GameData → core.createWorld → core.step（固定 60Hz，见 core 的 TICK_HZ）
 *        → view.buildFrame/render（Canvas2D）→ <canvas>。
 *
 * 这里只做"浏览器壳"：加载数据、驱动循环、把指针/键盘事件翻译成 core 调用。
 * 战斗规则一行都不在这里实现。
 */
import { camera, cast, createWorld, defaultAim, fxTtlOf, QI_MAX, allRush, isRushing, requestRetreat, settle, step, TICK_HZ } from '../dist/core/battle.js';
import { knownMagicOf } from '../dist/core/capture.js';
import { applyWise, applyWiseOnBattleStart } from '../dist/core/wises.js';
import { ARMY_BTN, applyArmyCmd, applyArmyCmdKind, armyCmdDefOf, armyCmdsOf, armyOrderOf, installArmyOrders } from '../dist/core/army_cmd.js';
// [[AUDIO]] R52/R80：脚本音效与特效事件总线（规则全在 core，这里只做 sink 接线）
import { audioBusStats, battleAudioEvents, battleAudioMark, emitMagic, setAudioSink } from '../dist/core/audio_bus.js';
import { createBattleSysoHost, initMagicProgram, projectilesOf } from '../dist/core/smartscript/runtime.js';
import {
  castBlockReason,
  cmd6Rects,
  hitTest,
  learnedSkillSeqs,
  makeSkillBar,
  pushFloater,
  render,
  tickFloaters,
} from '../dist/view/battleView.js';
import { DESIGN_H, DESIGN_W, FIELD, screenToCell } from '../dist/view/layout.js';
import { COLORS } from '../dist/view/theme.js';

// [115_release] 调试口统一开关（见 web/devflags.js）：下面所有调试参数只有 ?dev=1 时才认。
// devflags.js 没加载成功时退化成"全关"——缺省安全，宁可少一个调试功能也不让调试口裸奔。
// 业务协议参数（from/a/city/troop/defend/blevel…）仍走 QUERY，不动，否则 campaign→battle 会断。
const SGDEV = window.SGDev || { DEV: false, val: () => null, on: () => false, num: (_k, d) => d };
const devVal = (name) => SGDEV.val(name);
const devNum = (name, dflt) => SGDEV.num(name, dflt);

const DATA_FILES = [
  'troops',
  'formations',
  'magics',
  'wises',
  'generals',
  'terrains',
  'items',
  'scenarios',
];

const $ = (id) => document.getElementById(id);
const QUERY = new URLSearchParams(location.search);
/** ?defend=1：守城战。A 方永远是我方（玩家、背视），只是这一局"我方是守方"。 */
const DEFEND = QUERY.get('defend') === '1';
const canvas = $('stage');
// [115_release] 画布可能不在（#stage 被裁剪、或浏览器不支持 Canvas2D）：这里不抛栈，
// 由文件末尾的入口判断统一走 index.html 的兜底面板。
let ctx = null;
try {
  ctx = canvas ? canvas.getContext('2d') : null;
} catch (err) {
  console.warn('Canvas2D 不可用', err);
  ctx = null;
}
const el = {
  troopA: $('troopA'),
  formA: $('formA'),
  troopB: $('troopB'),
  formB: $('formB'),
  seed: $('seed'),
  start: $('start'),
  stat: $('stat'),
  error: $('error'),
  errorMsg: $('error-msg'),
};

const state = {
  data: null,
  world: null,
  skills: [],
  mode: 'ready', // ready | fighting | settled
  settlement: null,
  seed: 7,
  camX: 35,
  time: 0,
  selectedSkill: null,
  aim: null,
  floaters: [],
  message: null,
  labels: { a: '', b: '' },
  // 序列帧图集：atlas（朴刀那套 walk_back/walk_front）与 units（兵种图集，弓/弩拉弓）
  // 两套并存，都异步加载；缺一套时视图层自己降级，不挡战斗。
  atlas: null,
  units: null,
  // 武将技特效素材（assets/fx/index.json + 按需加载的图集）
  fxMeta: null,
  fxAtlas: null,
  // 施法运镜：core 一放技就把 fx 推进 world.fx，这里跟着它把镜头摇过去（原作放技后镜头会跟）
  fxFocus: null,      // 要跟的战场 x（格）
  fxFocusT: 0,        // 剩余跟随秒数
  fxSeen: new WeakSet(), // 已经处理过的 fx（core 复用对象，只改 ttl）
};

let viewScale = 1;
let accumulator = 0;
let lastTs = 0;
let lastStat = '';
let raf = 0;
let frozen = false;   // ?freeze=1：截图用，冻结逻辑与镜头
// 放技后镜头跟随特效的时长（秒，**真实秒**，与 TICK_HZ 无关）：core 的 Fx.ttl 缺省 = 1 秒 = 60 tick @60Hz
const FX_FOCUS_SEC = 1.0;
// ?dev=1&follow=0：关掉施法运镜（对照截图用）。[115_release] 调试口，需 ?dev=1
const FOLLOW_ON = devVal('follow') !== '0';
// ?dev=1&aim=gx,gy：**仅调试**。把武将技的落点钉死在这个格子，用于复现"落点敏感"的
// 技能（如 104 神鬼亂舞）与核对 old cast(tx,ty) 路径。正常玩法**不读它**：点技能格直接施放，
// 落点由内核 `defaultAim()` 自动选（R139，见 core/battle.ts 的 defaultAim 注释）。
const DEV_AIM = (() => {
  const raw = devVal('aim');
  if (!raw) return null;
  const [gxS, gyS] = String(raw).split(',');
  const gx = Number.parseFloat(gxS);
  const gy = Number.parseFloat(gyS);
  return Number.isFinite(gx) && Number.isFinite(gy) ? { gx, gy } : null;
})();
// ?dev=1&fxrot=：全局覆盖特效朝向（度）；null = 用 index.json 里每目录的 rot
let fxRotOverride = null;

// ---------------------------------------------------------------------------
// [[AUDIO]] 战斗音效接线（本轮新增；规则一行都不在这里实现，只读 core 的统计）
//
// 原作时机（project/37c §4）：
//   普攻命中  = EXE 0x43E07C `push "HIT01"`（函数 0x43DDBF）
//   单位受击  = THINGS.INI Pain 序列里的 `$Hit01`（120 处）
//   格挡/防御 = THINGS.INI Defense 序列里的 `$Defense`（120 处）
// core 暴露 stats.hitsA/B（命中数）与 stats.blocks（近战兵对兵砍空 = 格挡数，R22 轮新增），
// 所以"格挡"直接读 blocks 增量，不再用 attacks - hits 当代理（那会把射空/被闪开也混进来）。
// 节流（100 人混战每 tick 有几十次命中，不节流就是噪音）：
//   ① 同一逻辑 tick 最多 2 声；② 同名音效 60 ms 内不重叠。
// [115_release] ?dev=1&terrain=N：战场地形 id 0..11（与 terrains.json / 原作 [0x4A6694] 同号）。
// 注意名字里的 AUDIO_ 是历史原因：同一个值既喂 world.terrain（第 630 行）、又选地形 BGM/底噪。
const AUDIO_TERRAIN = devNum('terrain', 0);
const SFX_TICK_MAX = 2;
const SFX_GAP_MS = 60;
const sfxLast = Object.create(null);
let sfxTickUsed = 0;
const statMark = { hitsA: 0, hitsB: 0, blocks: 0 };
/** [[AUDIO]] R80：战场六类事件的增量游标（`battleAudioMark` 的返回值）。 */
let audioMark = null;

/** 把节流游标对齐到当前世界（开新局时调一次）。 */
function resetBattleAudio() {
  sfxTickUsed = 0;
  for (const k of Object.keys(sfxLast)) delete sfxLast[k];
  const s = state.world && state.world.stats;
  statMark.hitsA = s ? s.hitsA : 0;
  statMark.hitsB = s ? s.hitsB : 0;
  statMark.blocks = s ? s.blocks || 0 : 0;
  // [[AUDIO]] R80：六类触发的增量游标（规则在 core/audio_bus.ts，这里只管重置）
  audioMark = state.world ? battleAudioMark(state.world) : null;
}

/** 受节流约束的战斗音效：返回 true 表示真的放了。 */
function battleSfx(name, opts, gapMs) {
  const audio = window.SG && window.SG.audio;
  if (!audio) return false;
  if (sfxTickUsed >= SFX_TICK_MAX) return false;
  const t = (window.performance && performance.now) ? performance.now() : Date.now();
  const gap = gapMs == null ? SFX_GAP_MS : gapMs;
  if (sfxLast[name] !== undefined && t - sfxLast[name] < gap) return false;
  sfxLast[name] = t;
  sfxTickUsed += 1;
  audio.sfx(name, opts);
  return true;
}

/** 每个逻辑 tick 之后调一次：把 core 算好的战场音效事件转给节流器。
 *
 *  R80 的六类（命中/受击/格挡/阵亡/撤退/撤离）判定全在 `core/audio_bus.ts` 里
 *  （纯函数、有测试），这里只做两件事：① 事件 → `battleSfx()` 节流；② 什么都不算。
 *  gapMs 只在无头 ?sim= 同步跑时传 0（几毫秒跑完 200 tick，真节流会把音全吃掉）。 */
function tickBattleSfx(gapMs) {
  if (!state.world) return;
  // ?sim= / ?auto=1 这些无头路径可能没走 startBattle()，这里补一次基线
  if (!audioMark) audioMark = battleAudioMark(state.world);
  for (const ev of battleAudioEvents(state.world, audioMark)) {
    if (ev.kind === 'sfx') battleSfx(ev.name, { volume: ev.volume }, gapMs);
  }
}

/** [[AUDIO]] R52/R80 的唯一出口：core 的 audio_bus → web/audio.js。
 *  这里是"接线"，不含任何判定规则。`SG.audio` 可能还没加载完，所以每次调用时再取。 */
function installAudioSink() {
  setAudioSink({
    sfx: (name, opts) => battleSfx(name, { volume: opts && opts.volume }, 0),
    magic: (dir, opts) => {
      const a = window.SG && window.SG.audio;
      if (a) a.magic(dir, { volume: opts && opts.volume });
    },
    flash: (on) => {
      const a = window.SG && window.SG.audio;
      if (a && a.flashScreen) a.flashScreen(on);
    },
    brightness: (level) => {
      const a = window.SG && window.SG.audio;
      if (a && a.dimScreen) a.dimScreen(level);
    },
  });
  // ?sfxdbg=1 的 HUD 从这里取"脚本到底发了多少事件"（audio.js 是普通 script，看不到 core）
  if (window.SG) window.SG.audioBusStats = audioBusStats;
}
installAudioSink();

/**
 * 技能音：按**技能编号**查具体音效串（`audio.js` 的 MAGIC_SFX 110 条，见 project/96）。
 *
 * 为什么不再按 `fx_dir_primary` 查目录名：110 个技能的真播放点分散在三层证据里
 * （MAGIC.SO 的 `SYSCALL 0x301` 直接调用 70 个、depth≤4 间接 13 个、THINGS.INI 物件
 * 动画里的 `$mNNNsndNN` 24 个），按目录拼 `m<dir>snd01` 有 28 个错号、6 组整组静默。
 * 例：雷擊系 5 个应是 `m005snd02`、連弩 dir009 应是 `m019snd01`。
 */
function skillSfx(seq, volume) {
  const id = String(Number(seq) || 0).padStart(3, '0');
  if (!id || id === '000') return;
  // [[AUDIO]] 技能起手也进总线（进日志、可被 ?sfxdbg=1 数到），由 sink 转给 audio.magic
  emitMagic(id, volume == null ? 0.7 : volume, 'skill:cast');
}


// [[FATIGUE_CORE]] 疲勞（原作 general+0x3A）：不進攻力/命中，只做戰後累加、每月衰減與士氣間接影響。
// 這段必須在 main.js 與 campaign.html 各存一份（純函數、無 DOM）；tests/fatigue.test.ts 會從
// 兩個檔案抽出本段直接執行，並比對兩份行為一致，避免頁面與測試各寫一套。
const TIRE_MAX = 100;
const TIRE_HIGH = 60; // 原作 0x41B34E cmp 0x3c
function tireClamp(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(TIRE_MAX, Math.max(0, Math.trunc(v))) : 0;
}
function tireAdd(cur, gain) {
  const add = Number(gain);
  return Math.min(TIRE_MAX, tireClamp(cur) + (Number.isFinite(add) ? Math.max(0, Math.trunc(add)) : 0));
}
// 戰後增量：原作 0x41048D 有秒數 idiv 10 + 15；沒有秒數 15 + rand()%8。
function tireGain(sec, rng) {
  const s = Number(sec);
  if (Number.isFinite(s) && s >= 0) return 15 + Math.trunc(s / 10);
  const r = typeof rng === 'function' ? Number(rng()) : 0;
  const k = Number.isFinite(r) ? Math.min(7, Math.max(0, Math.floor(r * 8))) : 0;
  return 15 + k;
}
function tireNormalize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (typeof name !== 'string' || !name) continue;
    const v = Number(value);
    if (Number.isFinite(v)) out[name] = Math.min(TIRE_MAX, Math.max(0, Math.trunc(v)));
  }
  return out;
}
function tireOf(save, name) {
  const map = tireNormalize(save && save.tire);
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : 0;
}
// 戰後：雙方主將各抽一次（秒數已知時兩次相同；未知時是兩個 rand()%8，和原作兩次取样一致）。
function tireBattle(save, aName, bName, sec, rng) {
  const tire = tireNormalize(save && save.tire);
  const gainA = tireGain(sec, rng);
  const gainB = tireGain(sec, rng);
  const beforeA = tire[aName] ?? 0;
  const beforeB = tire[bName] ?? 0;
  const afterA = tireAdd(beforeA, gainA);
  tire[aName] = afterA;
  const afterB = bName === aName ? afterA : tireAdd(beforeB, gainB);
  if (bName !== aName) tire[bName] = afterB;
  if (save && typeof save === 'object') save.tire = tire;
  return { gainA, gainB, beforeA, beforeB, afterA, afterB };
}
// 每月：原作 0x41B1BF 先 -1，再用減後的值判 ≥60 → 士氣 -1（所以 60→59 不觸發、61→60 觸發）。
// officersByCity 是本勢力各城在職武將；save.tire 裡殘留的名字（敵將/已離隊）也一併衰減。
function tireMonthly(save, officersByCity) {
  const tire = tireNormalize(save && save.tire);
  const cities = (save && save.cities) || {};
  const lists = officersByCity && typeof officersByCity === 'object' ? officersByCity : {};
  const names = new Set();
  const employed = new Set();
  for (const list of Object.values(lists)) {
    if (!Array.isArray(list)) continue;
    for (const name of list) {
      if (typeof name !== 'string' || !name) continue;
      names.add(name);
      employed.add(name);
    }
  }
  for (const name of Object.keys(tire)) names.add(name);
  let decayed = 0;
  let high = 0;
  for (const name of names) {
    const cur = tire[name] ?? 0;
    if (cur > 0) { tire[name] = cur - 1; decayed += 1; }
    if (employed.has(name) && tire[name] >= TIRE_HIGH) high += 1;
  }
  let moraleLoss = 0;
  let moraleSkipped = 0;
  for (const [city, list] of Object.entries(lists)) {
    if (!Array.isArray(list)) continue;
    let hits = 0;
    for (const name of list) if (typeof name === 'string' && tire[name] >= TIRE_HIGH) hits += 1;
    if (!hits) continue;
    const st = cities[city];
    if (st && typeof st === 'object' && Number.isFinite(Number(st.morale))) {
      st.morale = Math.max(0, Math.trunc(Number(st.morale)) - hits);
      moraleLoss += hits;
    } else {
      moraleSkipped += hits;
    }
  }
  if (save && typeof save === 'object') save.tire = tire;
  return { decayed, high, moraleLoss, moraleSkipped };
}
// [[/FATIGUE_CORE]]

// [[MORALE_CORE]] 士氣（原作 general+0x38，0..100）：**武將級**，不是城池級。
// 這一段必須在 main.js 與 campaign.html 各存一份（純函數、無 DOM）；tests/morale.test.ts 會從
// 兩個檔案抽出本段直接執行並比對兩份行為一致，避免頁面與測試各寫一套。
// 出處：docs/04b5 §Q2（新將 0x42D468 mov word [..+0x38],0x50 = 80；每月 0x41B1BF 的士氣分支）
// 與 docs/04b §2.5（戰力第 5 段 (士氣−50)/5，idiv 向零截斷）。
const MORALE_MAX = 100;
const MORALE_DEFAULT = 60;   // 本作存檔缺省（原作新將是 80；沿用 60 是為了不讓老檔一讀檔就變強/變弱）
// 與 FATIGUE_CORE 的 TIRE_HIGH 同值；MORALE_CORE 可能被單獨抽出執行，所以不引用外部常數。
const MORALE_TIRE_HIGH = 60;
// [新設計] 低迷自然恢復門檻：原作 0x41B1BF 是「疲勞 <60 且士氣 <70 → 士氣 +1」，
// 本作改成士氣 <30 才 +1，讓「疲勞高 → 士氣掉 → 打不動 → 休整幾個月才回」形成真閉環。
// 原作未確認，標 [新設計]。
const MORALE_LOW = 30;
// [新設計] 戰敗懲罰：原作 0x447520 只對 status=3（被俘）的武將扣 0x14=20 點士氣；
// 「戰敗方主將一律 −10」是本作簡化，不是原作數值，標 [新設計]。
const MORALE_DEFEAT_LOSS = 10;
function moraleClamp(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(MORALE_MAX, Math.max(0, Math.trunc(v))) : MORALE_DEFAULT;
}
function moraleNormalize(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (typeof name !== 'string' || !name) continue;
    if (value === null || typeof value === 'boolean' || value === '') continue;
    const v = Number(value);
    if (Number.isFinite(v)) out[name] = Math.min(MORALE_MAX, Math.max(0, Math.trunc(v)));
  }
  return out;
}
function moraleOf(save, name) {
  const map = moraleNormalize(save && save.morale);
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : MORALE_DEFAULT;
}
// 寫單個武將士氣：回傳夾取後的值；save 壞掉時只回值、不寫（純函數更好測）。
function moraleSet(save, name, value) {
  const v = moraleClamp(value);
  if (!save || typeof save !== 'object' || typeof name !== 'string' || !name) return v;
  const map = moraleNormalize(save.morale);
  map[name] = v;
  save.morale = map;
  return v;
}
// 出戰：core 的 powerOf 讀 world.sides[side].morale（battle.ts:381），而 createWorld 會重建
// GeneralState，只認 cfg 裡的幾個字段；所以兩處都要在 createWorld 之後寫一次：
//   rt.morale        → 戰力第 5 段
//   rt.general.morale → HUD/戰報（純顯示，core 不讀）
function moraleApply(world, side, value) {
  const v = moraleClamp(value);
  const rt = world && world.sides ? world.sides[side] : null;
  if (!rt) return v;
  rt.morale = v;
  if (rt.general) rt.general.morale = v;
  return v;
}
// 每月：疲勞（已由 tireMonthly 先 -1）≥60 → 該武將士氣 -1（下限 0）；否則士氣 <30 → +1。
// 只動「在職武將」（officersByCity）；save.tire 裡殘留的敵將/離隊名字不碰士氣。
function moraleMonthly(save, officersByCity) {
  const lists = officersByCity && typeof officersByCity === 'object' ? officersByCity : {};
  // 不依賴 FATIGUE_CORE 的 tireNormalize：兩段在測試裡是各自獨立抽取執行的
  // （tests/morale.test.ts 只抽 MORALE_CORE），所以這裡自己容錯一次。
  const rawTire = save && save.tire && typeof save.tire === 'object' ? save.tire : {};
  const tireAt = (name) => {
    const v = Number(rawTire[name]);
    return Number.isFinite(v) ? Math.min(MORALE_MAX, Math.max(0, Math.trunc(v))) : 0;
  };
  const names = new Set();
  for (const list of Object.values(lists)) {
    if (!Array.isArray(list)) continue;
    for (const name of list) if (typeof name === 'string' && name) names.add(name);
  }
  let high = 0;
  let loss = 0;
  let recovered = 0;
  for (const name of names) {
    const cur = moraleOf(save, name);
    if (tireAt(name) >= MORALE_TIRE_HIGH) {
      high += 1;
      const after = moraleSet(save, name, cur - 1);
      if (after < cur) loss += cur - after;
    } else if (cur < MORALE_LOW) {
      const after = moraleSet(save, name, cur + 1);
      if (after > cur) recovered += 1;
    }
  }
  return { high, loss, recovered };
}
// 戰敗：主將士氣 -10（下限 0）。回傳實際扣了幾點（士氣已 0 時回 0），供戰報/測試。
function moraleDefeat(save, names) {
  const list = Array.isArray(names) ? names : [names];
  let changed = 0;
  for (const name of list) {
    if (typeof name !== 'string' || !name) continue;
    const cur = moraleOf(save, name);
    const after = moraleSet(save, name, cur - MORALE_DEFEAT_LOSS);
    if (after < cur) changed += cur - after;
  }
  return changed;
}
// 遷移：舊近似把士氣記在「城池」上（怪怪的，且 saves.js 的 cityState 根本沒這欄位）。
// 這裡只把 `cities[*].morale` 改名成 `cityMorale` 保留數值，**絕不**搬成武將士氣
// （兩者同名會打架：武將級才是真的）。回傳搬了幾座城，供啟動提示/測試。
function moraleMigrateCities(save) {
  const cities = save && save.cities;
  if (!cities || typeof cities !== 'object') return 0;
  let moved = 0;
  for (const st of Object.values(cities)) {
    if (!st || typeof st !== 'object' || Array.isArray(st)) continue;
    if (!Object.prototype.hasOwnProperty.call(st, 'morale')) continue;
    const v = Number(st.morale);
    if (!Object.prototype.hasOwnProperty.call(st, 'cityMorale')) {
      st.cityMorale = Number.isFinite(v)
        ? Math.min(MORALE_MAX, Math.max(0, Math.trunc(v)))
        : MORALE_DEFAULT;
    }
    delete st.morale;
    moved += 1;
  }
  return moved;
}
// [[/MORALE_CORE]]

// ---------------------------------------------------------------------------
// 数据 / 世界
// ---------------------------------------------------------------------------

async function loadData() {
  const pairs = await Promise.all(
    DATA_FILES.map(async (name) => {
      const res = await fetch(`../data/${name}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`載入 data/${name}.json 失敗：HTTP ${res.status}`);
      return [name, await res.json()];
    }),
  );
  return Object.fromEntries(pairs);
}

function nameIndex(names, name, fallback) {
  const i = names.indexOf(name);
  return i >= 0 ? i : fallback;
}

// 主將名字的唯一來源：出征令的 ?a=（deploy.html 出征時寫的就是它）。舊連結只有 ?gen=，仍然認，
// 但兩者都只是同一個名字的不同寫法 —— 別再從別的地方派生第二個名字（project/93 §2）。
// 都沒有就**不給名字**（battleView 會顯示「我軍主將」），不再憑空造一個「關羽」。
function generalFromQuery() {
  const params = new URLSearchParams(location.search);
  const q = (params.get('a') || params.get('gen') || '').trim();
  // R86 S2-2：大地圖把「裝備後」的武力/智力放在出征令的 astr/aint 上（campaign.html:3161/3200/3388）。
  // 裝備在快照裡是一張名字表，只有大地圖能查得到加成，所以戰鬥頁只負責「收下結果」。
  // 不帶 astr/aint 時行為與以前完全一致（負數/非數字都當沒帶）。
  const override = (k) => {
    const n = Number.parseInt(params.get(k) ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const aStr = override('astr');
  const aInt = override('aint');
  const withEquip = (g) => ({
    ...g,
    str: aStr === null ? g.str : aStr,
    int: aInt === null ? g.int : aInt,
  });
  if (!q) return { name: '', str: 0, int: 0, level: 6 };
  const g = state.data && state.data.generals;
  const rows = Array.isArray(g) ? g : (g && g.rows) || [];
  const hit = rows.find((r) => r.NAME === q);
  if (!hit) return withEquip({ name: q, str: 97, int: 75, level: 6 });
  return withEquip({ name: hit.NAME, str: hit.STR, int: hit.INT, level: 6 });
}

function readConfig() {
  // 大地图带过来的参数（campaign.html → index.html?city=…&soldiers=…&bstr=…）
  const q = new URLSearchParams(location.search);
  const num = (k, dflt) => {
    const v = Number.parseInt(q.get(k) ?? '', 10);
    return Number.isFinite(v) ? v : dflt;
  };
  return {
    seed: Math.max(1, Number.parseInt(el.seed.value, 10) || 1),
    aTroop: num('troop', Number(el.troopA.value)),
    aForm: num('form', Number(el.formA.value)),
    bTroop: num('btroop', Number(el.troopB.value)),
    bForm: num('bform', Number(el.formB.value)),
    city: q.get('city') || null,
    bGen: q.get('bgen') || null,
    aSoldiers: num('soldiers', 100),
    bSoldiers: num('bsoldiers', 100),
    bStr: num('bstr', 70),
    bInt: num('bint', 88),
    // 出征頁（deploy.html）選的軍師技 seq；0 / 缺省 = 不發動
    wise: num('wise', 0),
    // 敵方軍師技 seq（守將/來犯將）；`?bwise=` 可指定，缺省 0 = 只靠 applyWiseOnBattleStart 自動補
    bWise: num('bwise', 0),
    // 援軍（R37 之援軍，原作只有「第二支軍隊」的數據位、無行軍規則 → 全 [推測]，見 core/strategy.ts）
    //  `?rfrom=<城名>&rcity=<本方城名>&rr=0.5&rd=<tick>`：rfrom 一給就排一支 B 側援軍。
    rFrom: q.get('rfrom') || '',
    rCity: q.get('rcity') || '',
    rSide: q.get('rside') === 'A' ? 'A' : 'B',
    rRatio: num('rr', 0.5),
    rDelay: num('rd', 0),
    rScenario: num('rscen', 0),
    // 出征頁帶來的疲勞（只做顯示；原作疲勞不進攻力/命中，見 docs/04b5）
    atire: num('atire', 0),
    // 士氣（武將級，原作 general+0x38）：出征頁從存檔帶 amorale，守將側帶 bmorale；
    // 沒帶（老連結/直接開 index.html）就默認 60，絕不再寫死 60 進世界。
    amorale: num('amorale', MORALE_DEFAULT),
    bmorale: num('bmorale', MORALE_DEFAULT),
    // 調試參數（截圖/复現用，不影響正常流程）：
    // ?level=5&exp=1900 直接給我方等級/經驗（升級補學 R25 的入口）
    // ?bloyal=95&bconstancy=6 給敵將忠誠/節操（招降三條硬門 R53 的入口）
    aLevel: num('level', 0),
    aExp: num('exp', -1),
    bLevel: num('blevel', 0),
    bLoyal: num('bloyal', -1),
    bConstancy: num('bconstancy', -1),
    aGeneral: generalFromQuery(),
  };
}

function makeWorld() {
  const cfg = readConfig();
  const d = state.data;
  // 序列帧图集（可选）：game/web/anim/atlas.json + atlas_00.png。
// 有就画真兵，没有（file:// 下 fetch 被拦、或图集未生成）就自动退回色块。
(function loadAtlas() {
  if (typeof fetch !== 'function') return;
  fetch('anim/atlas.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no atlas'))))
    .then((j) => {
      const img = new Image();
      img.onload = () => {
        const frames = {};
        const back = [];
        const front = [];
        const attack = [];
        for (const sp of j.pages[0].sprites) {
          frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
          if (sp.name.startsWith('walk_back')) back.push(sp.name);
          if (sp.name.startsWith('walk_front')) front.push(sp.name);
          if (sp.name.startsWith('attack_front')) attack.push(sp.name);
        }
        back.sort();
        front.sort();
        attack.sort();
        // 敌方染成赤色（原作：两军只差甲色，形态一致）。做法是把整页图集按
        // 'source-atop' 刷一层红，保持完全相同的帧矩形，零额外素材。
        let imgEnemy = img;
        try {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth || img.width;
          cv.height = img.naturalHeight || img.height;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          cx.globalCompositeOperation = 'source-atop';
          cx.fillStyle = 'rgba(206, 52, 40, 0.46)';
          cx.fillRect(0, 0, cv.width, cv.height);
          imgEnemy = cv;
        } catch (err) { /* 染色失败就用原图 */ }
        state.atlas = { img, imgEnemy, frames, back, front, attack, hold: 5 };
        draw();
      };
      img.src = 'anim/atlas_00.png';
    })
    .catch(() => {});
})();

  // 兵種動作圖集（可選）：game/web/anim/units.json + units_00.png。
  // 這是「兵種級」的第二套圖集（弓/弩的拉弓，今後還有騎乘），與上面的 atlas.json
  // **並存**：兩套都載，畫哪套由視圖層 pickUnitFrames() 按兵種決定（兵種 3/11 → archer）。
  // 與 loadAtlas 一樣只做「載入 + 建幀表」，不做 startsWith 分桶 —— units.json 的
  // groups 已經是分好組的（archer.back / archer.front / archer.attack / attackEnemy）。
  // 拉不到 / 圖沒 onload / 組缺失：只 warn 然後退回 atlas.json，絕不擋戰鬥、不白屏
  // （同 project/24 的「失敗就 warn 然後退」寫法）。
  (function loadUnits() {
    if (typeof fetch !== 'function') return;
    fetch('anim/units.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`units.json HTTP ${r.status}`))))
      .then((j) => {
        const page = Array.isArray(j.pages) ? j.pages[0] : null;
        if (!page || !Array.isArray(page.sprites)) throw new Error('units.json 缺 pages[0].sprites');
        const frames = {};
        for (const sp of page.sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
        // groups：對象組（archer/ride）拷貝幀名數組 + hold；walk_side 這種純數組原樣保留
        const groups = {};
        for (const [name, g] of Object.entries(j.groups || {})) {
          if (Array.isArray(g)) { groups[name] = g.slice(); continue; }
          if (!g || typeof g !== 'object') continue;
          const out = {};
          for (const k of ['back', 'front', 'attack', 'attackEnemy']) {
            if (Array.isArray(g[k])) out[k] = g[k].slice();
          }
          if (typeof g.hold === 'number') out.hold = g.hold;
          groups[name] = out;
        }
        const img = new Image();
        img.onload = () => {
          // 敵方不再染色：新圖集（原作 FORCE 素材）每兵種都帶兩套幀 —— 我方 `back/attack`（M 藍軍）
          // 與敵方 `front/attackEnemy`（N 紅軍），紅藍已在素材裡分好。再疊一層 rgba(206,52,40,.46)
          // 會把黃巾之類的淺色兵種推成肉粉色（見 project/63_士兵造型.md §6.3）。
          // 舊 atlas.json 那條路仍保留染色，不受影響。
          const imgEnemy = img;

          state.units = { img, imgEnemy, frames, groups };
          draw();
        };
        img.onerror = () => console.warn('兵種圖集未載入（改用 atlas.json）：units_00.png');
        img.src = 'anim/units_00.png';
      })
      .catch((err) => console.warn('兵種圖集未載入（改用 atlas.json）：', err));
  })();

const world = createWorld({
    data: d,
    seed: cfg.seed,
    a: {
      troop: cfg.aTroop,
      formation: cfg.aForm,
      soldiers: cfg.aSoldiers,
      morale: moraleClamp(cfg.amorale),
      general: cfg.aGeneral,
      // R37：出戰時派發的軍師技/策略 seq（core/strategy.ts 的 67 條原作條目）。
      // 出征頁選的 `?wise=` 既是「開戰前生效」（wises.ts）也是「戰中派發」（strategy.ts 的 seq）。
      strategy: cfg.wise || null,
    },
    b: {
      troop: cfg.bTroop,
      formation: cfg.bForm,
      soldiers: cfg.bSoldiers,
      morale: moraleClamp(cfg.bmorale),
      // 守城战时 B 方是"来犯之军"，攻城的才是敌人；有 bgen 就用真守将名（无则兜底）
      // TODO(口径未统一)：level:5 是 [新设计]。原作等级来自存档（SSAV），data/generals.json 没有
      // LEVEL 字段、BaseEXP 全是 200（levelFromExp(200)=2，见 core/battle.ts:1325 与
      // project/53_数据与配额.md）。?blevel=N 可覆盖（见下方 cfg.bLevel）。统一口径要等
      // campaign/deploy 两页的武将等级存档落地，不要在这里单点改 2。
      // 空城（沒有守將）時**不給名字**：以前兜底成「守將」，戰鬥 HUD / 戰報就會出現
      // 「守將（武0/智0）」這種一看就假的東西（project/93 §1）。battleView:734 會把空名字
      // 顯示成「敵軍主將」，招降/斬首名單也會把空名與「守將」濾掉（見 endBattle）。
      general: { name: DEFEND ? (cfg.bGen || '來犯之將') : (cfg.bGen || (cfg.city ? '' : '張角')), str: cfg.bStr, int: cfg.bInt, level: 5 },
      strategy: cfg.bWise || null,
    },
    // 援軍：`?rfrom=北平&rcity=襄平` 才排；兵數/城距由 core/strategy.ts 從 scenarios.json 算
    // （basis 會寫明「鄰城預備兵 ×25%」之類，杜絕寫死 100）。
    reinforce: cfg.rFrom
      ? [{
          side: cfg.rSide,
          from: cfg.rFrom,
          city: cfg.rCity || cfg.city || undefined,
          scenario: cfg.rScenario || undefined,
          triggerRatio: cfg.rRatio,
          ...(cfg.rDelay > 0 ? { delayTicks: cfg.rDelay } : {}),
        }]
      : undefined,
    // 战场地形 id 0..11（`?terrain=N`，与 terrains.json / 原作 [0x4A6694] 同号）：
    // core 用它查 `vs` 战力修正，view 用它选地面贴图与三层背景（`world.terrain`）。
    terrain: AUDIO_TERRAIN,
    // 敌方 AI 放技是显式 opt-in；不给 A 侧 AI，玩家自己操作
    aiSides: { B: true },
  });

  // 疲勞只掛在 general 上做顯示：createWorld 逐字段新建 GeneralState，cfg.general.tire 不會被帶進來，
  // 必須在 createWorld 之後補。原作這個值不參與 powerOf / 命中（0x442EFA/0x443498/0x43D400 零命中）。
  world.sides.A.general.tire = tireClamp(cfg.atire);
  world.sides.B.general.tire = 0;

  // 調試參數：等級/經驗（升級補學 R25 的复現入口）與敵將忠誠/節操（招降硬門 R53 的复現入口）。
  // createWorld 只認 str/int/level，這些欄位一律在建局後補。
  if (cfg.aLevel > 0) world.sides.A.general.level = cfg.aLevel;
  if (cfg.aExp >= 0) world.sides.A.general.exp = cfg.aExp;
  if (cfg.bLevel > 0) world.sides.B.general.level = cfg.bLevel;
  if (cfg.bLoyal >= 0) world.sides.B.general.loyal = cfg.bLoyal;
  if (cfg.bConstancy >= 0) world.sides.B.general.constancy = cfg.bConstancy;

  // 士氣（武將級）：side.morale 給 powerOf 第 5 段，general.morale 給 HUD/戰報。
  // cfg 已經帶了 amorale/bmorale，這裡再寫一次是為了 general.morale（createWorld 不建這個欄位）。
  moraleApply(world, 'A', cfg.amorale);
  moraleApply(world, 'B', cfg.bmorale);

  // R84：技力上限**不再**在這裡覆寫。
  // createWorld 已用 mpCapOf(BaseMP, STR, INT, level) = BaseMP + level*2*t/100
  // （docs/04b:231-234、0x40A098；見 core/battle.ts:603）。舊碼把 mpMax 直接蓋成
  // BaseMP，把等級成長抹掉：張角 Lv2 内核 47 → 44，於是 47 費的神鬼亂舞恒不可放
  // （project/105 §3.2）。要調技力就改等級，不要改上限。

  // 軍師技：出征頁帶來的 &wise=<seq>，在兩軍接觸前改一次數值（core/wises.ts）。
  // 未實作/未知的 seq 回 ok:false，這裡靜默跳過，戰鬥照常開。
  const wise = cfg.wise ? applyWise(world, 'A', cfg.wise) : null;
  const wiseName = wise?.ok ? (d.wises.find((w) => w.SEQUENCE === cfg.wise)?.NAME ?? '') : '';
  // 軍師技：我方由出征頁挑（上面 applyWise），AI/守方那一側一直是空的（main.js 從沒替它發動）。
  // applyWiseOnBattleStart 只補「不是玩家自己挑」的側，按該將 WISESKILL+等級取最新一條；同 world 冪等。
  const autoWise = applyWiseOnBattleStart(world, d);
  const bWise = autoWise.find((w) => w.side === 'B');
  // R147/R158 部队指令：装钩子后 `step()` 的移动由 `army_cmd.armyStepPlan()` 接管
// （R158 起移动是「40 帧行动闸门 → 按权重抽一格 → 逻辑瞬移 + 40 帧滑过去」，
//   原来的 `armyAdjustMove()` 连续位移补丁已随 `MOVE_PER_TICK` 一起删除，见 project/158）
  // （全軍待機/前進/後退/分散/集中）。没下过令时它返回 false、位移原样，等于零影响。
  installArmyOrders(world);
  return {
    world,
    seed: cfg.seed,
    wiseName,
    wiseNote: wise?.ok ? (wise.note ?? '') : '',
    bWiseName: bWise?.name ?? '',
    // R84：技位按「該將到該等級已習得」取（battleView.learnedSkillSeqs），
    // 不再寫死 DEFAULT_SKILL_SEQ=[1,50,2,104]——104 神鬼亂舞對多數武將根本沒習得，
    // 寫死會讓技能格顯示放不出的技（project/105 §3.2）。
    skills: makeSkillBar(d, learnedSkillSeqs(d, cfg.aGeneral?.name, cfg.aLevel || 1)),
    labels: {
      a: `我軍${DEFEND ? '（守）' : ''} · ${d.troops.names[cfg.aTroop] ?? '?'} · ${d.formations.names[cfg.aForm] ?? '?'}`,
      b: `敵軍${DEFEND ? '（攻）' : ''} · ${d.troops.names[cfg.bTroop] ?? '?'} · ${d.formations.names[cfg.bForm] ?? '?'}`,
    },
  };
}

function buildPreview() {
  const built = makeWorld();
  state.world = built.world;
  state.skills = built.skills;
  state.labels = built.labels;
  state.seed = built.seed;
  state.camX = camera(built.world);
  state.mode = 'ready';
  state.settlement = null;
  state.selectedSkill = null;
  state.aim = null;
  state.floaters.length = 0;
  state.message = null;
}

async function startBattle() {
  // 首战前把 MAGIC.SO 拉进来：技能不再是"猜的三类"，而是真跑原作字节码
  try { await initMagicProgram('../data/'); } catch (e) { console.warn('[battle] MAGIC.SO 预加载失败，技能将退化为占位特效', e); }
  const built = makeWorld();
  state.world = built.world;
  state.skills = built.skills;
  state.labels = built.labels;
  state.seed = built.seed;
  state.camX = camera(built.world);
  state.mode = 'fighting';
  state.settlement = null;
  state.selectedSkill = null;
  state.aim = null;
  state.floaters.length = 0;
  // 軍師技在開戰前已生效（makeWorld 裡 applyWise），這裡只把它打進消息欄。
  // 消息框只畫 2 行 × 22 字（view/battleView.ts wrapCJK），所以整句壓在 44 字以內：
  // 有軍師技時把技能提示縮成短句，否則沿用原文。
  // R139：原作点技能格就直接放，不再有"点战场选目标"这一步，开战提示也别再教那套。
  state.message = built.wiseName
    ? `軍師技：${built.wiseName} ${built.wiseNote}；點技能格即施放。`
    : built.bWiseName
      ? `敵軍技 ${built.bWiseName}；點技能格即施放。`
      : '點技能格即施放，不用選目標。';
  accumulator = 0;
  lastTs = performance.now();
  el.start.disabled = false;
  el.start.textContent = '戰鬥中';
  setSelectsDisabled(true);
  window.SG?.audio?.bgm('terrain');   // [audio] 开战播地形 BGM（?terrain=N，缺省 0=城）
  window.SG?.audio?.battleAmbience(AUDIO_TERRAIN);   // [audio] 战场底噪 BG03A/04A/08A/09A
  resetBattleAudio();
  // ?dev=1&rush=1：开战后自动下一次全軍突擊（只为截图/联调；非 ?dev=1 时 SGDEV.on 恒 false）
  if (SGDEV.on('rush')) rushCommand();
}

/**
 * 全軍突擊（R137）：跑原作 `SYSTEM.SO#22 AllRush`。
 *
 * 原作的突击不是「选一个目标冲锋」，而是把**全体部队的命令位**改成 `0x10000`：
 * `export\script\system_so.dis.txt:1536-1585` 第 9 条 `LDG 2; PUSHI 65536; SYSCALL 0x120, 0x2`。
 * 之后所有单位自行前压，伤害/攻击力都不变（内核 `battle.ts allRush()` 只置布尔态）。
 *
 * 这里走**宿主通道** `createBattleSysoHost(...)`：它按 22 条指令的顺序重放
 * （压暗 → 镜头推主将 → Rush01 → 「全軍突擊!」→ 复亮），是纯 TS，不依赖浏览器里有没有
 * SYSTEM.SO 字节码；宿主没接线/抛异常时退化成就地调内核 `allRush()`（玩法一致，少一段演出）。
 *
 * @returns {boolean} true = 这一下真的把 A 侧切进了突击态；已在突击态（幂等）返回 false。
 */
function rushCommand() {
  const world = state.world;
  if (!world) {
    state.message = '還沒有戰鬥。';
    return false;
  }
  if (world.over) {
    state.message = '戰鬥已結束。';
    return false;
  }
  if (isRushing(world, 'A')) {
    state.message = '全軍已在突擊中。';
    return false;
  }
  if (!state.rushLog) state.rushLog = [];
  let applied = false;
  try {
    const host = createBattleSysoHost(world, 'A', { log: state.rushLog });
    const res = host.call('AllRush', []);
    applied = isRushing(world, 'A');
    if (!res || res.handled !== true) applied = allRush(world, 'A') || applied;
  } catch (err) {
    console.warn('[battle] AllRush 宿主通道失败，退化为直接置态', err);
    applied = allRush(world, 'A') || applied;
  }
  state.message = applied ? '全軍突擊！' : '全軍已在突擊中。';
  return applied;
}

function endBattle() {
  if (!state.world || state.mode === 'settled') return;
  state.mode = 'settled';
  state.settlement = settle(state.world);
  state.selectedSkill = null;
  state.aim = null;
  const won = state.settlement.winner === 'A';
  const drew = state.settlement.winner === 'draw';
  window.SG?.audio?.sfx(won ? 'victory' : drew ? 'success' : 'defeat');   // [audio] 胜利 / 平手 / 失败
  window.SG?.audio?.stopAmbience(1500);   // [audio] 战斗结束：底噪 1.5 s 淡出（BGM 留着）
  // 结算语义：攻城战看"打没打下来"，守城战看"守没守住"
  state.message = DEFEND
    ? drew
      ? '戰鬥結束：守住了（平手）。'
      : won
        ? '戰鬥結束：城守住了。'
        : '戰鬥結束：城池失守。'
    : drew
      ? '戰鬥結束：平手。'
      : won
        ? '戰鬥結束：我軍勝利。'
        : '戰鬥結束：我軍敗退。';
  el.start.disabled = false;
  el.start.textContent = '再 戰';
  setSelectsDisabled(false);

  // 战报（R60）：`0x447037` 的四档模式 + 对应文案，`settle()` 已拼好
  const s = state.settlement;
  state.message += ` ${s.modeName}：${s.report}`;
  // R38 撤退收尾：撤退不是"打输了"，要在结算里说清原因（endReason 由 core `finish()` 写）
  if (state.world.endReason === 'retreat') {
    state.message += state.world.fled.A ? ' 我軍撤退。' : ' 敵軍撤退。';
  }
  // 升級補學（R25，`0x40A183` / `0x40A227`）：這局跨過的武將技/軍師技，順手接進技能欄
  if (s.learned.length > 0) {
    state.message += ` 學會：${s.learned.map((k) => k.name).join('、')}。`;
    const seqs = knownMagicOf(state.data, state.world.sides.A.general.name, s.level);
    // R143：原作技能栏是 `general+0x54` 的 byte[8]（`project/140` §3.2），本作已把上限放到 8；
    // 这里原来 `slice(0, 4)` 会把第 5~8 格吃掉，升级补学时就会漏掉新学会的技。
    if (seqs.length > 0) state.skills = makeSkillBar(state.data, seqs);
  }

  const note = writeBackCampaign();
  // 寫回大地圖的結果改走底部提示條（6s 自動消失、點一下可關）；canvas 消息欄只有兩行，
  // 這句話串在裡面會被結算面板蓋掉，而且留到下個月還在（project/93 §4）。
  if (note) notice(note);

  // 战后处置：把"招降到谁"打进消息栏（斩首 / 缴获各补一句）
  // 空城没有守将 → 名单里可能混进空名字或旧版占位的「守將」，先滤掉再拼，别让假名进战报。
  const post = state.settlement.post;
  const realName = (n) => {
    const v = String(n || '').trim();
    return v && v !== '守將' ? v : '';
  };
  if (post) {
    const joined = post.captures.filter((c) => c.recruited && realName(c.name));
    if (joined.length > 0) {
      state.message += ` 招降：${joined.map((c) => realName(c.name)).join('、')}。`;
      // [audio] 招降成功 = 原作 YieldGeneral->SUCCESS；错开胜利音，别叠在一起
      setTimeout(() => window.SG?.audio?.sfx('success', { volume: 0.75 }), 700);
    } else if (post.captures.length > 0) {
      // R53：忠诚 >50 的三档根本招不动 —— 被拒也要说清楚，否则玩家以为是没触发
      const c = post.captures.find((x) => realName(x.name)) || post.captures[0];
      if (realName(c.name)) state.message += ` 招降失敗：${c.name}（忠誠 ${c.loyal}，拒降）。`;
    }
    const executed = post.executed.filter((c) => realName(c.name));
    if (executed.length > 0) state.message += ` 斬首：${executed.map((c) => realName(c.name)).join('、')}。`;
    // 战斗掉落已按原作删除（docs/04b2 §5.1 负证据，R57）：`post.drops` 恒空，这里不再拼「繳獲」。
  }

  const g = state.world.sides.A.general;
  pushFloater(
    state.floaters,
    g.x,
    g.y,
    won ? '勝' : drew ? '和' : '敗',
    won ? COLORS.gold : COLORS.danger,
    70,
    30,
  );
}

/** 把战果写回大地图存档（localStorage['sanguo_campaign_v1']）。返回给玩家的一句提示。 */
function writeBackCampaign() {
  const city = QUERY.get('city');
  if (!city) return '';
  try {
    const key = 'sanguo_campaign_v1';
    const save = JSON.parse(localStorage.getItem(key) || '{"owned":[],"wins":0,"losses":0}');
    save.owned = save.owned || [];
    save.cities = save.cities || {};
    save.wins = save.wins || 0;
    save.losses = save.losses || 0;
    // `save.last` 的语义是「玩家上一座自家城」（回大地图后自动存档、内政入口都看它）。
    // 原来无条件写战场城 → 打下一座敌城后 last 指向敌城/已失守城（r86 演练实测 `last="汝南"`
    // 而 owned 里没有汝南，招降池就跟着写进那座城）。只在我方城时才更新。
    if (save.owned.includes(city)) save.last = city;
    save.ts = Date.now();
    // 战后处置的结果落到存档：只加字段，不动已有字段
    const post = state.settlement && state.settlement.post;
    if (post) {
      const joined = post.captures.filter((c) => c.recruited).map((c) => c.name);
      if (joined.length > 0) save.captured = [...new Set([...(save.captured || []), ...joined])];
      // 斩首名单也要落档：`campaign.html` 的战后处置（R56）拿它把武将真从池里移除。
      // 之前只写进战斗页消息栏，存档里没有 → `applyPostBattle` 永远拿不到 executed。
      const killed = post.executed.map((c) => c.name);
      if (killed.length > 0) save.executed = [...new Set([...(save.executed || []), ...killed])];
    }
    // 疲勞（原作 `0x41048D` ④：`15+秒/10`，双方+，cap 100）：`settle()` 已经算好并写进双方主将，
    // 这里只落存档。旧版在这再调一次 tireBattle() 从 durationSec 重算，同一條規則算了兩遍。
    // 必须在 DEFEND 的提前 return 之前写，否则守城战永远不加疲劳。
    const settleRes = state.settlement;
    const win = !!settleRes && settleRes.winner === 'A';
    // R63 战绩累加（`0x4084C9`）：core 的 `updateRecord()` 已经给出「连/断/最高连续胜场」，
    // 旧实现每局从 0 重算（存档里只有一个 1/0），这里把连续胜场落盘。
    // wins/losses 仍由下面各分支自己 +=，避免和保存时序打架；streak 只在这一处同步。
    const rec = settleRes?.record;
    if (rec) {
      save.streak = rec.streak;
      save.bestStreak = Math.max(save.bestStreak || 0, rec.bestStreak || 0);
    }
    const aGeneral = state.world.sides.A.general;
    const bGeneral = state.world.sides.B.general;
    // 敵方沒有武將（空城）時 B 方 general.name 是空字串：别拿它当键写存档，
    // 否则存档里会多一条 `tire[""]`，提示条也会出现「疲勞 甲 0→15、 0→15」这种断句（project/93 §1/§2）。
    const bName = bGeneral.name && bGeneral.name !== '守將' ? bGeneral.name : '';
    const tireA = settleRes ? settleRes.tire.A : { before: tireOf(save, aGeneral.name), after: aGeneral.tire };
    const tireB = settleRes ? settleRes.tire.B : { before: tireOf(save, bName), after: bGeneral.tire };
    save.tire = tireNormalize(save.tire);
    save.tire[aGeneral.name] = tireClamp(tireA.after);
    if (bName) save.tire[bName] = tireClamp(tireB.after);
    aGeneral.tire = save.tire[aGeneral.name];
    if (bName) bGeneral.tire = save.tire[bName];
    const tireGain = settleRes ? settleRes.tireGain : 0;
    const tireNote = `疲勞 ${aGeneral.name} ${tireA.before}→${aGeneral.tire}`
      + (bName ? `、${bName} ${tireB.before}→${bGeneral.tire}` : '')
      + `（+${tireGain}）。`;
    logTo(
      save,
      `戰 後 疲 勞：${aGeneral.name} ${tireA.before}→${aGeneral.tire}`
        + (bName ? ` · ${bName} ${tireB.before}→${bGeneral.tire}` : ''),
      'info',
    );
    // 士氣（R62，`0x447520`：`g->+0x38 -= 0x14`）：settle() 已按"雙方存活武將"扣 20，這裡落存档。
    // 原作這段只遍歷 status=3（被俘）的將；docs/04b §9.4 的口径是"全員 −20"，两者差 1 记录在 project/38。
    const moraleA = settleRes ? settleRes.morale.A : { before: moraleOf(save, aGeneral.name), after: aGeneral.morale };
    const moraleB = settleRes ? settleRes.morale.B : { before: moraleOf(save, bName), after: bGeneral.morale };
    moraleSet(save, aGeneral.name, moraleA.after);
    if (bName) moraleSet(save, bName, moraleB.after);
    aGeneral.morale = moraleOf(save, aGeneral.name);
    if (bName) bGeneral.morale = moraleOf(save, bName);
    const moraleLost = Math.max(0, moraleA.before - moraleA.after);
    const moraleNote = `士氣 ${aGeneral.name} ${moraleA.before}→${aGeneral.morale}`
      + (bName ? ` / ${bName} ${moraleB.before}→${bGeneral.morale}` : '')
      + (moraleLost > 0 ? `（戰後 -${moraleLost}）` : '') + '。';
    if (moraleLost > 0) {
      logTo(save, `戰 後 士 氣：${aGeneral.name} ${moraleA.before}→${aGeneral.morale}（-${moraleLost}）`, 'lost');
    }
    const st = save.cities[city] || (save.cities[city] = { troops: 0, pop: 0, money: 0 });
    if (DEFEND) {
      // 守城战：A 方 = 我方守军。赢 → 城保住（按上场比例扣守军）；输 → 城从版图抹掉。
      const startFielded = Math.max(1, state.world.sides.A.start);
      const lostFielded = Math.max(0, startFielded - state.world.sides.A.aliveCount);
      if (win) {
        save.wins += 1;
        save.defWins = (save.defWins || 0) + 1;
        // 守军 178 只上场 100：按上场比例折算真实损失，避免"打一场掉 100 兵"
        const ratio = Math.max(1, st.troops) / startFielded;
        const loss = Math.max(1, Math.round(lostFielded * ratio));
        st.troops = Math.max(10, st.troops - loss);
        logTo(save, `守 住 ${city}（損 ${loss} 兵，餘 ${st.troops}）`, 'hold');
        localStorage.setItem(key, JSON.stringify(save));
        return `守城成功：${city} 餘 ${st.troops} 兵。 ${tireNote} ${moraleNote}`;
      }
      save.losses += 1;
      save.owned = save.owned.filter((n) => n !== city);
      st.troops = Math.max(30, Math.round(Math.max(1, state.world.sides.B.start) * 0.6));
      logTo(save, `${city} 失 守`, 'lost');
      localStorage.setItem(key, JSON.stringify(save));
      return `守城失敗：${city} 已失守（剩 ${save.owned.length} 城）。 ${tireNote} ${moraleNote}`;
    }
    // 攻城战（原流程）
    if (win) {
      save.wins += 1;
      if (!save.owned.includes(city)) save.owned.push(city);
    } else {
      save.losses += 1;
    }
    localStorage.setItem(key, JSON.stringify(save));
    return `戰果已寫回大地圖（${save.owned.length} 城）。 ${tireNote} ${moraleNote}`;
  } catch (err) {
    /* 隐私模式下 localStorage 可能不可用，静默 */
    return '';
  }
}

/** 与 campaign.html 同一格式的战报条目（最近 8 条，新的在上） */
function logTo(save, text, kind) {
  save.log = save.log || [];
  const m = save.month || 1;
  const t = `${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
  save.log.push({ t, s: text, k: kind || 'info' });
  if (save.log.length > 8) save.log = save.log.slice(-8);
}

function setSelectsDisabled(disabled) {
  for (const node of [el.troopA, el.formA, el.troopB, el.formB, el.seed]) node.disabled = disabled;
}

// ---------------------------------------------------------------------------
// 交互
// ---------------------------------------------------------------------------

function reasonText(reason) {
  switch (reason) {
    case 'over':
      return '戰鬥已結束。';
    case 'dead':
      return '主將已陣亡，無法施放。';
    case 'mp':
      return '技力不足。';
    case 'qi':
      return '氣力不足（每 tick 回复，等一會）。';
    default:
      return '無法施放。';
  }
}

function loadPortrait() {
  const name = (state.world && state.world.sides.A.general.name) || '';
  if (!name) return null;
  if (state.portraitName === name) return state.portrait;
  state.portraitName = name;
  state.portrait = null;
  const img = new Image();
  img.onload = () => {
    if (state.portraitName === name) {
      state.portrait = { img, w: img.naturalWidth, h: img.naturalHeight };
      draw();
    }
  };
  // [face] 优先用原作 FACE（100×120，face_map.js 提供 name → 编号，映射覆盖 400/400）；
  // 没映射时才回落 AI 立绘。HUD 立绘框是 86×108，原作图不需要额外缩放逻辑。
  img.src = window.SG?.portraitUrl
    ? window.SG.portraitUrl(name, 'full')
    : 'assets/hero/' + encodeURIComponent(name) + '.webp';
  return null;
}

// ---------------------------------------------------------------------------
// 武将技特效素材：assets/fx/index.json 描述 40 个 MAGIC 目录 → 每目录一张横向图集
// + 每帧矩形/热点。图集按需加载（一次只下用得上的目录），加载失败就当没素材，
// 视图层会退回原来的虚线圈，不会报错。
// ---------------------------------------------------------------------------

function loadFxIndex() {
  if (typeof fetch !== 'function') return;
  fetch('assets/fx/index.json', { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((json) => {
      if (!json || json.mode !== 'atlas') return;   // 只认图集形态；PNG 逐帧形态不接
      state.fxMeta = json.dirs || {};
      state.fxAtlas = {
        map: json.map || {},
        dirs: {},
        // 多目录技的分段表：{ "<seq>": [{dir, from, to}] }，视图按 elapsed/life 选段
        seqDirs: json.seqDirs || {},
        life: json.tickLife || 30,
        scale: json.fxScale || 0.8,
      };
      // ?dev=1&fxrot=0|90：全局覆盖每目录的朝向修正（调试/对照用；默认用 index.json 的 dirs[*].rot）
      const rotOverride = devVal('fxrot');
      if (rotOverride !== null && rotOverride !== '') {
        const deg = Number.parseFloat(rotOverride);
        if (Number.isFinite(deg)) fxRotOverride = deg;
      }
      draw();
    })
    .catch((err) => console.warn('特效素材未載入（改用虛線圈）：', err));
}

function ensureFxDir(dirId) {
  const atlas = state.fxAtlas;
  const meta = state.fxMeta && state.fxMeta[dirId];
  if (!atlas || !meta || atlas.dirs[dirId] || meta._state) return;
  meta._state = 'loading';
  const img = new Image();
  img.onload = () => {
    meta._state = 'ok';
    const rot = fxRotOverride ?? meta.rot ?? 0;
    atlas.dirs[dirId] = {
      img,
      rot,
      frames: meta.list.map(([x, y, w, h, ax, ay]) => ({ x, y, w, h, ax, ay })),
    };
    draw();
  };
  img.onerror = () => {
    meta._state = 'fail';
    console.warn(`特效圖集 atlas_${dirId}.png 載入失敗，該技退回虛線圈`);
  };
  img.src = `assets/fx/${meta.sheet}`;
}

/** 每帧调用一次：把场上正在播的 fx 对应目录拉起来（已在缓存里就是空操作） */
function ensureFxForWorld(world) {
  const atlas = state.fxAtlas;
  if (!atlas || !world) return;
  for (const fx of world.fx) {
    const seq = String(fx.seq);
    const dirId = atlas.map[seq];
    if (dirId) ensureFxDir(dirId);
    // 多目录技：这一招用到的每个目录都要预载，否则切段时会有半秒空窗
    const segs = atlas.seqDirs && atlas.seqDirs[seq];
    if (segs) for (const seg of segs) if (seg && seg.dir) ensureFxDir(seg.dir);
  }
  // R187：投射物用的是同一套图集，飞行中那几帧还没被 world.fx 引用，得单独预载
  for (const flight of projectilesOf(world)) {
    if (flight.dir) ensureFxDir(flight.dir);
    else if (atlas.map[String(flight.seq)]) ensureFxDir(atlas.map[String(flight.seq)]);
  }
}

function viewOptions() {
  ensureFxForWorld(state.world);
  return {
    atlas: state.atlas,
    units: state.units,
    fx: state.fxAtlas,
    portrait: loadPortrait(),
    camX: state.camX,
    time: state.time,
    skills: state.skills,
    selectedSkill: state.selectedSkill,
    aim: state.aim,
    floaters: state.floaters,
    message: state.message,
    mode: state.mode,
    settlement: state.settlement,
    seed: state.seed,
    aLabel: state.labels.a,
    bLabel: state.labels.b,
  };
}

/**
 * 点技能格 → 直接放。
 *
 * R139：原作点武将技格就直接施放，**不需要先在战场上点一个目标格**。考古结论（见
 * `project/139_武将技自动目标.md`）：110 条 MAGIC.SO 脚本每条都至少写一次 `SYSCALL 0x100`
 * 覆盖引擎传入的落点，落点只用于选 g3（离它最近的敌单位），伤害范围由脚本自己算。
 * 所以这里不再进"瞄准态"，落点交给内核 `defaultAim()`。
 */
function pickSkill(index) {
  const world = state.world;
  if (!world || state.mode !== 'fighting') return;
  const slot = state.skills[index];
  if (!slot) return;
  const reason = castBlockReason(world, slot);
  if (reason) {
    state.message = `${slot.name}：${reasonText(reason)}`;
    return;
  }
  doCast(index);
}

/**
 * 第一层六颗按钮（`battleView.cmd6Rects()`，`project/151`）。
 *
 * `guardLord / sortie / lordOrder / retreat` 走 `applyArmyCmdKind()`（第一层按钮语义）；
 * `armyMenu`（部隊指令）由调用方处理开合，`skillPage`（武將技）只是切焦点，都不在这里下命令。
 */
function cmd6Act(hit) {
  if (hit.kind === 'armyMenu' || hit.kind === 'skillPage') {
    state.message = hit.label;
    return;
  }
  // 第 5 颗在画面上是**一颗**「主將後退／待機」（原作 `0x445282` 就是同一个入口、
  // `[0x4a8ae0]` 的 `0x10` 位记得住上次方向），所以这里按当前位做翻转：
  // 已置 `ARMY_BTN.lordOrder`（= 正在后撤）就下发「待機」，否则下发「後退」。
  let kind = hit.kind;
  let label = hit.label;
  if (kind === 'lordOrder') {
    const back = state.world
      ? ((armyOrderOf(state.world, 'A').buttons & ARMY_BTN.lordOrder) !== 0)
      : false;
    kind = back ? 'lordWait' : 'lordBack';
    label = back ? '主將待機' : '主將後退';
  }
  const ok = state.world ? applyArmyCmdKind(state.world, 'A', kind) : false;
  state.message = ok ? label : `${hit.label}：現在下不了。`;
}

/**
 * R147 部队指令子菜单（原作 33 组 × 6 条，`0x48F94C–0x490294`，见 `project/147`）。
 *
 * 这里同样只下命令、不立刻动单位：`army_cmd.applyArmyCmd()` 只写 `world.armyOrder`，
 * 真正生效在 `step()` 的位移结算里（`installArmyOrders()` 装的钩子）。
 *
 * 槽位按当前阵形取（`armyCmdsOf(world.sides.A.formation)`），所以同一个 Shift+5
 * 在鱼鳞阵和锋矢阵下是不同命令 —— 这点和原作一致，别写死成「第 5 条 = 全軍突擊」。
 */
/**
 * R151 第一层六大按钮（原作描述符表 `0x48F2A8`，stride `0x38`，见 `project/140`/`151`）。
 *
 * `kind` 必须与 `battleView.ts` 的 `cmd6Rects()` 顺序一致；`label` 只用于提示栏文案，
 * 画面上的字仍由视图层画（`battleView.ts:1128-1152`）。
 * 键位 A/S/D/F/G/H 是自定的（原作没有键盘），所以走这张表而不是 `hitTest`：
 * 子菜单展开时第二层会盖住右列下两行，`hitTest` 拿不到 `cmd6`。
 */
const CMD6_BUTTONS = [
  { key: 'A', kind: 'guardLord', label: '保護主將' },
  { key: 'S', kind: 'armyMenu', label: '部隊指令' },
  { key: 'D', kind: 'skillPage', label: '武將技' },
  { key: 'F', kind: 'sortie', label: '武將出擊' },
  { key: 'G', kind: 'lordOrder', label: '主將後退／待機' },
  { key: 'H', kind: 'retreat', label: '全軍撤退' },
];

function armyCommand(slot) {
  const world = state.world;
  if (!world || state.mode !== 'fighting') return;
  if (world.over) {
    state.message = '戰鬥已結束。';
    return;
  }
  // 字段名是 `label`（`ArmyCmdDef.label`），不是 `name` —— 写成 `name` 会永远落到兜底文案。
  const def = armyCmdDefOf(world.sides.A.formation, slot) ?? armyCmdsOf(world.sides.A.formation)[slot];
  const name = def?.label ?? `第 ${slot + 1} 條`;
  if (applyArmyCmd(world, 'A', slot)) {
    state.message = `全軍令：${name}`;
  } else {
    state.message = `${name}：現在下不了。`;
  }
}


function doCast(index, tx, ty) {
  const world = state.world;
  if (!world || state.mode !== 'fighting') return;
  const slot = state.skills[index];
  if (!slot) return;
  const ttl = fxTtlOf(state.data, slot.seq);
  // 显式落点：调用方传了坐标就用它；否则只有 ?dev=1&aim=gx,gy 才钉死；都没有就自动选。
  const fixed = tx === undefined || ty === undefined ? DEV_AIM : { x: tx, y: ty };
  // 飘字/提示要落在特效实际出现的位置，所以自动选点时先问一次 defaultAim（与 cast 内部同一份）
  const aim = fixed ?? defaultAim(world, 'A', slot.seq);
  const result = fixed
    ? cast(world, 'A', slot.seq, fixed.x, fixed.y, ttl)
    : cast(world, 'A', slot.seq, undefined, undefined, ttl);
  if (!result.ok) {
    state.message = `${slot.name}：${reasonText(result.reason)}`;
    return;
  }
  // [audio] 技能音：按 magics.json 的 fx_dir_primary 放 mNNNsnd01；该目录没有 wav 就静默
  // （006 火箭/飛矢 与 024 後伏 两族原作音效本就不在包里，11 条技能静音；见 project/41）
  skillSfx(slot.seq, 0.7);
  if (slot.kind === 'heal') {
    const g = world.sides.A.general;
    pushFloater(state.floaters, g.x, g.y, `+${result.healed}`, COLORS.heal);
    state.message = `${slot.name}：回復 ${result.healed} 點體力。`;
  } else {
    // R84：命中判據是 result.hit（第 0 幀是否生效）/ result.hits（腳本命中數），
    // 不是 result.killed（打死敵兵數——打在主將身上恒 0，於是恒飄 MISS）。
    // 多幀技的戰果由內核 skillMarks 逐幀記帳，視圖層 drawFloaters/battleMessage 兜住。
    const damage = result.damage ?? 0;
    const hit = result.hit === true || (result.hits ?? 0) > 0;
    // R139：多幀技第 0 幀幾乎必然"還沒生效"（神鬼亂舞要到第 6~7 幀才掉血），此時說「未命中」
    // 就是騙人。有會話在跑時寫成 battleView.battleMessage() 認得的固定句形「XX：擊殺 0 名敵兵。」，
    // 由它用 world.skillMarks 改寫成真實戰果；沒會話（真打空）才說「未命中」。
    const pending = world.sessions.length > 0;
    const txt = result.killed > 0 ? `-${result.killed}` : damage > 0 ? `-${damage}` : hit ? '命中' : 'MISS';
    pushFloater(state.floaters, aim.x, aim.y, txt, hit ? COLORS.enemyLight : COLORS.textDim);
    state.message = `${slot.name}：${
      result.killed > 0 ? `擊殺 ${result.killed} 名敵兵` : damage > 0 ? `命中敵將，敵將 −${damage} 點體力` : hit ? '命中敵將' : pending ? '擊殺 0 名敵兵' : '未命中'
    }。`;
  }
  // 瞄准态已取消：这两项恒为 null（视图层据此不画瞄准格，见 battleView.ts 的 drawAim）
  state.selectedSkill = null;
  state.aim = null;
  canvas.style.cursor = 'default';
  if (world.over) endBattle();
}

function onPointerDown(ev) {
  if (ev.button !== undefined && ev.button !== 0) {
    state.selectedSkill = null;
    state.aim = null;
    canvas.style.cursor = 'default';
    return;
  }
  // 大地图进来的：结算后点任意处回大地图（竖屏里少一个按钮，直接全屏点击返回）
  const q = new URLSearchParams(location.search);
  if (state.mode === 'settled' && (q.get('from') === 'campaign' || DEFEND)) {
    location.href = './campaign.html';
    return;
  }
  const p = toDesign(ev);
  if (!state.world) return;
  const hit = hitTest(state.world, viewOptions(), p.x, p.y);
  if (!hit) return;
  if (hit.type === 'start') {
    startBattle();
  } else if (hit.type === 'restart') {
    startBattle();
  } else if (hit.type === 'skill') {
    pickSkill(hit.index);
  } else if (hit.type === 'field') {
    // R139：已不需要点战场选目标（点技能格即施放）。这里只提示，免得玩家以为点坏了。
    state.message = DEV_AIM
      ? `調試落點 ${DEV_AIM.gx},${DEV_AIM.gy}：點下方技能格施放。`
      : '點下方技能格即可施放，不用選目標。';
  } else if (hit.type === 'assault') {
    // R137 全軍突擊：跑原作 AllRush（走宿主通道，细节见 rushCommand 的注释）。
    // 按钮置灰由视图层判（battleView.ts 的 canAssault），这里再判一次是因为
    // 命中框和"能不能点"是两件事：置灰状态照样会命中，必须自己拒。
    rushCommand();
  } else if (hit.type === 'retreat') {
    // R38 撤退（原作 ACT=2 / BattleYield）：交给 core，AI 侧由 maybeRetreat 自动判定。
    // 注意 `world.status` 是 `Record<Side, 0|2|3>`（战果状态码，battle.ts:272），**不是**状态机字符串；
    // 这里只能判 `world.over`（`requestRetreat` 内部已判 `over || fled[side]`）。
    if (!state.world || state.world.over) {
      state.message = '戰鬥已結束。';
    } else if (requestRetreat(state.world, 'A')) {
      state.message = '全軍撤退。';
    } else {
      state.message = '撤退失敗。';
    }
  } else if (hit.type === 'cmd6') {
    // R151 第一层六颗按钮（保護主將 / 部隊指令 / 武將技 / 武將出擊 / 主將後退·待機 / 全軍撤退）
    cmd6Act(hit);
  } else if (hit.type === 'armyCmd') {
    // R147 第二层子菜单的某一条：`armyCommand` 内部会再判一次 canUse
    armyCommand(hit.slot);
  } else if (hit.type === 'armyMenu') {
    // 点面板空白：吞掉，别落到战场上当成"点战场"
    state.message = '部隊指令：點一條下令，或再點「部隊指令」收起。';
  }
}

function onPointerMove(ev) {
  // R139：目标由内核自动选，没有"瞄准格"要跟踪了（原来的 state.aim 只喂 battleView.drawAim）。
  // 保留空实现是因为注册点还在这里，删掉反而容易在后续合并里漏改。
  void ev;
}

function onKeyDown(ev) {
  if (ev.repeat) return;
  const key = ev.key;
  if (key === ' ' || key === 'Spacebar') {
    if (state.mode !== 'fighting') {
      ev.preventDefault();
      startBattle();
    }
    return;
  }
  if (key === 'Escape') {
    state.selectedSkill = null;
    state.aim = null;
    canvas.style.cursor = 'default';
    return;
  }
  if (key === 'r' || key === 'R') {
    if (state.mode === 'settled') startBattle();
    return;
  }
  // R147 部队指令子菜单（原作 33 组 × 6 条，`0x48F94C–0x490294`）：Shift+1..6 直接下第 N 条。
  // 必须排在技能格判定之前，否则 Shift+1 会被当成「放第 1 个技」。
  // 视图层的六个按钮由 battleView 画（g19 在改），键盘先通是为了能立刻在真机上验证语义。
  if (ev.shiftKey && key >= '1' && key <= '6') {
    armyCommand(Number(key) - 1);
    return;
  }
  // R143：技能格 4 → 8（原作 `general+0x54` 是 byte[8]，`project/140` §3.2）。
  if (key >= '1' && key <= '8') {
    pickSkill(Number(key) - 1);
    return;
  }
  // R151 第一层六颗按钮的键位 A/S/D/F/G/H（自定，`project/151` §6）。
  // 注意**不能**走 hitTest：面板展开时第二层盖住右列下两行，hitTest 会返回 `armyCmd`，
  // 键盘就永远点不到 F/G/H（实测 F/G/H 全被面板吞掉）。键盘直接按 kind 派发，
  // 可用性仍由 `applyArmyCmdKind()` 判（置灰原因也照样写进提示栏）。
  const k6 = 'asdfgh'.indexOf(key.toLowerCase());
  if (k6 >= 0 && state.world) {
    const btn = CMD6_BUTTONS[k6];
    if (btn) cmd6Act({ kind: btn.kind, label: btn.label });
  }
}

function toDesign(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / Math.max(1, rect.width)) * DESIGN_W,
    y: ((ev.clientY - rect.top) / Math.max(1, rect.height)) * DESIGN_H,
  };
}

function contains(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ---------------------------------------------------------------------------
// 渲染循环
// ---------------------------------------------------------------------------

function resize() {
  const header = document.querySelector('header');
  const headerH = header ? header.getBoundingClientRect().height : 60;
  const availW = Math.max(320, window.innerWidth - 32);
  const availH = Math.max(320, window.innerHeight - headerH - 32);
  const fit = Math.min(availW / DESIGN_W, availH / DESIGN_H);
  const cssW = Math.max(240, Math.floor(DESIGN_W * fit));
  const cssH = Math.max(427, Math.floor(DESIGN_H * fit));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  viewScale = canvas.width / DESIGN_W;
}

function draw() {
  if (!state.world || !ctx) return;
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  render(ctx, state.world, viewOptions());

  // 守城战的结算横幅：core 的胜负只有 A/B，攻城/守城的语义由这里补
  if (DEFEND && state.mode === 'settled' && state.settlement) {
    const s = state.settlement;
    const text = s.winner === 'A' ? '守 城 戰 · 城 池 保 住'
      : s.winner === 'B' ? '守 城 戰 · 城 池 失 守'
        : '守 城 戰 · 平 手';
    ctx.save();
    ctx.font = '700 20px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = s.winner === 'A' ? '#D8B36A' : s.winner === 'B' ? '#E2604A' : '#E9E4D6';
    // 面板固定布局（battleView.ts）：标题 198 / 行 316..526 / 经验条 600 / 注 690 / 按钮 838
    // 740..800 是唯一稳定空档，横幅放这里不与任何行叠字
    ctx.fillText(text, DESIGN_W / 2, 762);
    ctx.restore();
  }

  const world = state.world;
  const a = world.sides.A;
  const b = world.sides.B;
  const total = Math.floor(world.tick / TICK_HZ);
  const aTire = tireClamp(a.general.tire);
  // 士氣（武將級）：side.morale 是 powerOf 第 5 段的來源；general.morale 只是同一值的鏡像。
  const aMorale = moraleClamp(a.morale);
  const label =
    (state.mode === 'ready'
      ? `待戰 · 我方 ${a.start} vs 敵方 ${b.start} · 種子 ${state.seed}`
      : state.mode === 'settled'
        ? `結算 · ${DEFEND ? '守城戰 · ' : ''}${state.settlement?.modeName ?? ''} · ${state.settlement?.kills ?? 0} 擊殺`
          + ` · 戰功 ${state.settlement?.score ?? 0}（額外經驗 ${state.settlement?.expGain ?? 0}）`
          + ` · 戰績 ${state.settlement?.record?.wins ?? 0} 勝 ${state.settlement?.record?.losses ?? 0} 敗`
          + `（連勝 ${state.settlement?.record?.streak ?? 0}）`
        : `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')} · 我方 ${a.aliveCount} / ${a.start} · 敵方 ${b.aliveCount} / ${b.start} · ${TICK_HZ}Hz`)
    + ` · 疲勞 ${aTire} · 士氣 ${aMorale}`;
  // ?debug=1：把镜头/运镜状态写进状态条（Edge headless --dump-dom 可以直接读到数字）
  const shown = QUERY.has('debug')
    ? `${label} · camX=${state.camX.toFixed(2)} focus=${state.fxFocus === null ? '-' : state.fxFocus.toFixed(1)} t=${state.fxFocusT.toFixed(2)}`
    : label;
  if (shown !== lastStat) {
    el.stat.textContent = shown;
    lastStat = shown;
  }
}

function frame(now) {
  const dt = Math.min(0.08, Math.max(0, (now - lastTs) / 1000));
  lastTs = now;
  state.time += dt;

  if (frozen) {          // ?freeze=1：冻结画面（截图可复现）
    draw();
    raf = requestAnimationFrame(frame);
    return;
  }

  if (state.mode === 'fighting' && state.world) {
    accumulator += dt;
    const stepDt = 1 / TICK_HZ;
    let steps = 0;
    while (accumulator >= stepDt && steps < 5) {
      sfxTickUsed = 0;              // [audio] 每逻辑 tick 重置节流预算（≤2 声 / tick）
      step(state.world);
      tickBattleSfx();              // [audio] 按 stats 增量放 命中 / 格挡
      tickFloaters(state.floaters);
      accumulator -= stepDt;
      steps += 1;
      if (state.world.over) break;
    }
    // 掉帧时不追命：宁可慢放，也不让逻辑在一帧里跳几十 tick
    if (steps === 5) accumulator = 0;
    if (state.world.over) endBattle();
  }

  if (state.world) {
    // 施法运镜：有新特效就把镜头摇到特效那一格，跟够 fx 的存活时长（30 tick ≈ 1s）再交还自动跟随。
    // 只有「离当前画面较远」才摇，避免每下普攻式的抖动。
    for (const fx of state.world.fx) {
      if (state.fxSeen.has(fx)) continue;
      state.fxSeen.add(fx);
      if (!FOLLOW_ON) continue;
      if (fx.kind === 'heal') continue;           // heal 的 fx.x 被 core 填成了 HP，不是坐标
      if (Math.abs(fx.x - state.camX) < 1.2) continue; // 本来就在画面中段，不动镜头
      state.fxFocus = fx.x;
      state.fxFocusT = FX_FOCUS_SEC;
    }
    if (state.fxFocusT > 0) state.fxFocusT = Math.max(0, state.fxFocusT - dt);

    const following = state.fxFocusT > 0 && state.fxFocus !== null;
    const target = following ? state.fxFocus : camera(state.world);
    const k = Math.min(1, dt * (following ? 7 : 5));
    state.camX += (target - state.camX) * k;
    if (Math.abs(target - state.camX) < 0.01) state.camX = target;
  }

  draw();
  raf = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

function fillSelect(select, names, selected) {
  select.innerHTML = '';
  names.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = name;
    if (i === selected) opt.selected = true;
    select.appendChild(opt);
  });
}

function onConfigChange() {
  if (state.mode === 'fighting') {
    state.message = '戰鬥中不改配置；下一局生效。';
    return;
  }
  buildPreview();
  el.start.textContent = '開 戰';
}

/** ?end=<kind>：把世界摆成某个终局（不跑 step），只为截图/验收 R60/R53/R25 用。 */
function forceEnd(kind) {
  const w = state.world;
  if (!w) return;
  const A = w.sides.A;
  const B = w.sides.B;
  const wipe = (rt) => {
    rt.aliveCount = 0;
    for (const u of w.units) if (u.side === rt.general.side && !u.isGeneral) u.alive = false;
  };
  // 把我方打掉一部分（大胜/歼灭的判定差别就在"我方还剩多少"）
  const thin = (rt, keep) => {
    const want = Math.max(0, Math.min(rt.start, Math.round(rt.start * keep)));
    let left = rt.aliveCount;
    for (const u of w.units) {
      if (u.side !== rt.general.side || u.isGeneral || !u.alive) continue;
      if (left <= want) break;
      u.alive = false;
      left -= 1;
    }
    rt.aliveCount = Math.min(rt.aliveCount, want);
  };
  // 序列 rng：settle 里"是否被俘 → 招降 → 斩首/释放 → 掉落"都会取随机数，
  // 前两次给死值才能稳定复现"被俘但拒降"（0.0 = 必被俘，0.9 = 走释放分支）
  const seq = (vals) => {
    let i = 0;
    return () => (i < vals.length ? vals[i++] : 0.5);
  };
  switch (kind) {
    case 'draw':   // 双方兵尽、主将都活 → mode 3 平手
      wipe(A);
      wipe(B);
      w.winner = 'draw';
      w.endReason = 'troops';
      break;
    case 'great':  // 歼敌且我方可战兵 >= 70% → mode 4 大胜
      wipe(B);
      w.winner = 'A';
      w.endReason = 'troops';
      break;
    case 'wipe':   // 歼敌但自损过半、敌将阵亡 → mode 1 歼灭
      wipe(B);
      B.general.alive = false;
      thin(A, 0.5);
      w.winner = 'A';
      w.endReason = 'general';
      break;
    case 'win':    // 敌军溃退（兵尽、主将活着、我方可战兵不足七成）→ mode 2 击退
      wipe(B);
      thin(A, 0.5);
      w.winner = 'A';
      w.endReason = 'troops';
      break;
    case 'lose':   // 我方全灭 → 战败文案
      wipe(A);
      A.general.alive = false;
      w.winner = 'B';
      w.endReason = 'general';
      break;
    case 'recruit': // 敌将被俘但拒降（配 ?bloyal=95 走 R53 硬门）
      wipe(B);
      w.winner = 'A';
      w.endReason = 'troops';
      w.rng = seq([0.0, 0.9, 0.9]);
      break;
    default:
      return;
  }
  w.over = true;
}

function showError(err) {
  // [115_release] 玩家看到的是 index.html 那句人话 + 「重試」；技术细节只进右下角诊断面板。
  const text = diagPush('boot', err);
  el.stat.textContent = '啟動失敗';
  if (typeof window.__sgBootFail === 'function') {
    window.__sgBootFail('crashed', text);
    return;
  }
  // 兜底：index.html 的守卫脚本没跑（被裁剪的老页面）时才退回旧对话框
  el.error.style.display = 'grid';
  el.errorMsg.textContent = err instanceof Error ? err.message : String(err);
  console.error(err);
}

// ---------------------------------------------------------------- 发布兜底：诊断面板（project/115）
// 目标：玩家不该看到 stack；开发者又要能拿到现场。
// 所以异常先进这个环形缓冲，再画在右下角一个 <details> 里 —— 只有 ?dev=1 时默认展开。
// main.js 是 ESM，模块本身加载/语法失败这里 catch 不到（那一段由 index.html 的
// <script> error 监听与看门狗兜），这里管的是"已经跑起来之后"的运行期异常。
const DIAG_MAX = 12;
const diagLog = [];
let diagEl = null;

function diagPush(where, err) {
  const text = err instanceof Error
    ? `${err.name || 'Error'}: ${err.message}\n${String(err.stack || '').split('\n').slice(0, 6).join('\n')}`
    : String(err);
  diagLog.push({ where, text, at: new Date().toISOString().slice(11, 19) });
  if (diagLog.length > DIAG_MAX) diagLog.shift();
  diagRender();
  return `${where}: ${text}`;
}

function diagRender() {
  if (!diagLog.length || typeof document === 'undefined' || !document.body) return;
  if (!diagEl) {
    diagEl = document.createElement('details');
    diagEl.id = 'sg-diag';
    diagEl.style.cssText = [
      'position:fixed', 'left:8px', 'bottom:8px', 'z-index:60',
      'max-width:min(560px,calc(100vw - 16px))', 'max-height:45vh', 'overflow:auto',
      'background:rgba(10,12,16,.94)', 'color:#c9d1d9', 'border:1px solid #444c56',
      'border-radius:8px', 'padding:6px 9px', 'white-space:pre-wrap',
      'font:11px/1.45 ui-monospace,Consolas,monospace', 'cursor:pointer',
    ].join(';');
    diagEl.open = SGDEV.DEV;   // 仅 ?dev=1 时展开；发布形态下收起，玩家看不见
    document.body.appendChild(diagEl);
  }
  const pre = document.createElement('pre');
  pre.style.margin = '6px 0 0';
  pre.textContent = diagLog.map((e) => `[${e.at}] ${e.where}\n${e.text}`).join('\n\n');
  diagEl.textContent = '';
  const summary = document.createElement('summary');
  summary.textContent = `🛠 診斷 ${diagLog.length} 條`;
  diagEl.append(summary, pre);
}

// window.onerror / unhandledrejection：不吞异常（控制台照旧），只是多记一份到面板。
window.addEventListener('error', (ev) => {
  if (ev.target && ev.target !== window && ev.target.tagName === 'SCRIPT') {
    diagPush('script', `載入失敗: ${ev.target.src || '(inline)'}`);
    return;
  }
  if (ev.message) diagPush('error', ev.error || `${ev.message} @ ${ev.filename}:${ev.lineno}`);
}, true);
window.addEventListener('unhandledrejection', (ev) => {
  diagPush('promise', ev.reason || 'unhandledrejection');
});


// ---------------------------------------------------------------- 底部提示條（project/93 §4）
// 統一規矩：預設 6s 自動消失、重要提示傳 12000、點一下立刻關。
// 以前「戰果已寫回大地圖」是串進 canvas 消息欄（只有兩行，會被結算面板蓋住），
// 而且沒人清它 —— 現在走這層，消失時間明確。
let toastEl = null;
let toastTimer = 0;
function hideNotice() {
  clearTimeout(toastTimer);
  if (!toastEl) return;
  toastEl.style.opacity = '0';
  toastEl.style.transform = 'translateY(8px)';
  toastEl.style.pointerEvents = 'none';
}
function toastNode() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.id = 'notice-toast';
  toastEl.style.cssText = [
    'position:fixed', 'left:16px', 'right:16px', 'bottom:26px', 'z-index:40',
    'padding:12px 16px', 'border-radius:12px', 'background:rgba(22,18,12,.94)',
    'color:#E8CE8A', 'font:16px/1.5 system-ui,"Microsoft YaHei",sans-serif',
    'text-align:center', 'cursor:pointer', 'opacity:0', 'transform:translateY(8px)',
    'transition:opacity .18s,transform .18s', 'pointer-events:none',
    'box-shadow:inset 0 0 0 1px rgba(216,179,106,.45),0 8px 24px rgba(0,0,0,.55)',
  ].join(';');
  toastEl.addEventListener('click', hideNotice);
  document.body.appendChild(toastEl);
  return toastEl;
}
/** @param {string} msg @param {number} [ms] 預設 6000；重要提示傳 12000 */
function notice(msg, ms = 6000) {
  if (!msg) return;
  const node = toastNode();
  node.textContent = msg;
  node.style.opacity = '1';
  node.style.transform = 'none';
  node.style.pointerEvents = 'auto';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideNotice, Math.max(1200, ms));
}

async function boot() {
  state.data = await loadData();
  const d = state.data;
  fillSelect(el.troopA, d.troops.names, nameIndex(d.troops.names, '大刀', 2));
  fillSelect(el.formA, d.formations.names.slice(0, 9), nameIndex(d.formations.names, '方形', 0));
  fillSelect(el.troopB, d.troops.names, nameIndex(d.troops.names, '黃巾', 10));
  fillSelect(el.formB, d.formations.names.slice(0, 9), nameIndex(d.formations.names, '雁形', 3));

  // 开发用：?dev=1&auto=1 自动开战（方便无头截图/录屏），?dev=1&seed=123 指定种子
  // [115_release] 这些调试口统一走 SGDEV，不带 ?dev=1 时 read 到的是 undefined/默认值。
  const seedParam = devNum('seed', 0);
  if (Number.isFinite(seedParam) && seedParam > 0) el.seed.value = String(seedParam);

  buildPreview();
  resize();
  draw();
  window.SG?.audio?.bgm('menu');   // [audio] 战前（菜单/布阵）放 03 主菜单曲；startBattle 会换成地形曲
  loadFxIndex();
  // 注意：startBattle 是 async（先 await MAGIC.SO），必须 await 再往下走，
  // 否则下面的 ?sim= 同步步进跑在「预览世界」上、随后被新世界覆盖，截图就永远停在 00:00。
  if (SGDEV.on('auto')) await startBattle();

  // ?dev=1&sim=N：先同步跑 N 个逻辑 tick 再画（无头截图/验收用；headless 模式 rAF 可能不触发，
  // 只靠 auto=1 会一直停在 00:00）
  // ?dev=1&freeze=1：跑完 sim 之后停住，不再自动步进（截图要可复现就必须有这个）
  const simParam = devNum('sim', 0);
  frozen = SGDEV.on('freeze');
  if (Number.isFinite(simParam) && simParam > 0) {
    if (state.mode !== 'fighting') await startBattle();
    let guard = 0;
    while (state.world && !state.world.over && guard++ < simParam) {
      sfxTickUsed = 0;
      step(state.world);
      tickBattleSfx(0);   // [audio] 同步跑 200 tick 也要能数出音效（gap=0，只保留"≤2 声/ tick"）
    }
    // 冻结截图时镜头必须硬切到位：正常帧循环里 camX 是平滑跟随，
    // freeze 会跳过 frame()，镜头会停在开局位置，画面就"空"了。
    state.camX = camera(state.world);
    // ?dev=1&end[=<kind>]：調試用，直接造一個終局再結算（驗證四檔戰報 / 招降硬門 / 升級補學）
    const endKind = devVal('end');
    if (endKind !== null) {
      forceEnd(endKind);
      endBattle();
    }
    draw();
  }

  // ?dev=1&cast=<技能seq>,<x>,<y>[,<age>]：截图/验收用，自动施放一次。
  // 走的是真实 core.cast，只是先把主将氣力/技力补满（技能条里没带的技否则放不出来）。
  // age = 把这条 fx 的 ttl 往回拨几个 tick，用来把画面定在动画中段而不是第 0 帧。
  const castParam = devVal('cast');
  if (castParam) { try { await initMagicProgram('../data/'); } catch (e) { console.warn(e); } }
  if (castParam && state.world && state.mode === 'fighting') {
    const [seqS, xS, yS, ageS] = castParam.split(',');
    const seq = Number.parseInt(seqS, 10);
    const cx = Number.parseFloat(xS);
    const cy = Number.parseFloat(yS);
    const age = Math.max(0, Number.parseInt(ageS ?? '', 10) || 0);
    const magic = state.data.magics.find((m) => m.SEQUENCE === seq);
    const g = state.world.sides.A.general;
    g.mp = g.mpMax;
    g.qi = QI_MAX;
    const r = cast(state.world, 'A', seq, cx, cy, fxTtlOf(state.data, seq));
    const shown = magic ? magic.NAME : String(seq);
    if (r.ok) {
      skillSfx(seq, 0.7);   // [audio] ?cast= 也走技能音，方便单独验某条技的目录音
      const fx = state.world.fx[state.world.fx.length - 1];
      // age 只往回拨剩余 ttl，不动 life —— 帧号按 elapsed/life 算，所以这仍然落在中段
      if (fx) fx.ttl = Math.max(1, fx.ttl - age);
      state.message = `${shown}：${
        r.killed > 0 ? `擊殺 ${r.killed} 名敵兵` : (r.damage ?? 0) > 0 ? `命中敵將 −${r.damage}` : (r.hit ? '命中' : '未命中')
      }。`;
      pushFloater(state.floaters, cx, cy,
        r.killed > 0 ? `-${r.killed}` : (r.damage ?? 0) > 0 ? `-${r.damage}` : 'MISS',
        r.killed > 0 || (r.damage ?? 0) > 0 || r.hit ? COLORS.enemyLight : COLORS.textDim);
    } else {
      state.message = `${shown}：施放失敗（${reasonText(r.reason)}）`;
    }
    // 取景对准特效：project 的 sy = 550 + (x - camX) * ROW_PX，camX = cx 就落在画面正中。
    // 只有冻结截图才硬切镜头；正常播放时交给上面的施法运镜（fxFocus）平滑摇过去。
    if (frozen) state.camX = cx;
    draw();
  }

  el.start.addEventListener('click', () => {
    if (state.mode === 'fighting') return;
    startBattle();
  });
  for (const node of [el.troopA, el.formA, el.troopB, el.formB]) {
    node.addEventListener('change', onConfigChange);
  }
  el.seed.addEventListener('change', onConfigChange);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', resize);

  lastTs = performance.now();
  raf = requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => cancelAnimationFrame(raf));

// [216_apk] HUD 叠层（index.html 的 #battleui）每 200ms 只读两个字段：mode 与技能格数。
// 发布形态只留这个只读快照，不留任何能「驱动游戏」的脚本口。
window.SG_HUD = function () {
  return { mode: state.mode, slots: state.skills ? state.skills.length : 0 };
};

// 方便在 DevTools / 无头脚本里驱动：不参与正常渲染。
// [216_apk] 发布形态（APK 壳 / ?rel=1）下不挂：玩家不该拿到 startBattle / armyCommand 这类口子。
if (!window.__RELEASE__) {
  window.__sanguo = {
    state,
    startBattle,
    endBattle,
    pickSkill,
    doCast,
    buildPreview,
    rushCommand, // R137 全軍突擊：和点「突 擊」按钮走同一条路径
    armyCommand, // R147 部队指令：armyCommand(n) 等价于 Shift+(n+1)
  };
}

// [115_release] 顶层兜底：入口包一层 try/catch。
// ① 画布都建不出来时不进 rAF（否则每帧刷一次同样的栈，控制台直接刷屏）；
// ② boot() 的同步抛错与 Promise 拒绝都收敛到 showError（它会写诊断面板 + 通知 index.html 的兜底框）；
// ③ 成功就把 booted 置位，index.html 的看门狗据此不再误报"载入逾时"。
if (!canvas || !ctx) {
  diagPush('canvas', 'canvas/2d context 不可用：#stage 缺失或 getContext("2d") 返回 null');
  if (typeof window.__sgBootFail === 'function') window.__sgBootFail('canvas', 'canvas.getContext("2d") 不可用');
} else {
  try {
    boot()
      .then(() => {
        if (window.__sanguo) window.__sanguo.booted = true;
        if (typeof window.__sgBootOk === 'function') window.__sgBootOk();
      })
      .catch(showError);
  } catch (err) {
    showError(err);
  }
}
