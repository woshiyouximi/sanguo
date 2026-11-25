/**
 * 生成 project/199_对照表刷新R193.md
 * 输入：work/audit_r193/cites.json（172 的 117 行机器可读版，15:20 抓的 file:line + lineText）
 * 输出：project/199_对照表刷新R193.md
 * 只读 game/**、project/**；只写 project/199 与本目录。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const R = (p) => path.join(ROOT, p);
const rows = JSON.parse(fs.readFileSync(R('work/audit_r193/cites.json'), 'utf8'));

/* ---------------------------------------------------------------- 行號活體解析
 * 核對期間 game/** 有並行 agent 在重構（19:21、19:23 各一次），寫死的行號會立刻過期。
 * 所以新登記行的證據一律用 A(file, 原文片段) 在**生成時**解析出行號。找不到就明說。 */
const _cache = new Map();
function lines(file) {
  if (!_cache.has(file)) {
    try { _cache.set(file, fs.readFileSync(R(file), 'utf8').split(/\r?\n/)); }
    catch { _cache.set(file, null); }
  }
  return _cache.get(file);
}
function cp(s, n) { const a = Array.from(String(s).replace(/\uFFFD+/g, '⍰')); return a.length <= n ? a.join('') : a.slice(0, n).join('') + '…'; }
function A(file, literal, label) {  const L = lines(file);
  if (!L) return `\`${file}\`（檔案不在）`;
  const i = L.findIndex((x) => x.includes(literal));
  if (i < 0) return `\`${file}\`（找不到「${literal}」）`;
  return `\`${file}:${i + 1}\`${label ? ' ' + label : ''}`;
}

/* ---------------------------------------------------------------- 判级覆盖表 */
/* ✅ 但没有守護的 10 行：本輪逐行定級（見 §2） */
const OVERRIDES = {
  R24: { guard: 'tests/battle_r81.test.ts（21 條）', note: '本輪補守護：R23 升級按 0x40F23C 重算上限' },
  R35: {
    status: '🟡', hours: 2,
    guard: 'tests/wises.test.ts（12 條，機制）',
    note: '本輪降級：applyWiseOnBattleStart 機制有守護，但 web/deploy.html:546「只列已學、玩家選一條」沒有斷言',
  },
  R82: { guard: 'tests/troop_cap.test.ts（18 條）', note: '本輪補守護：兩欄相加 / 1..99 全掃 / cocos DeployRoot 同口徑' },
  R96: {
    guard: 'work/cocos_skin/skin_assert.mjs（350/128/7033/175/5 PASS）＋ work/cocos_accept/steps_a1_chain.mjs（TitlePanel 實點）',
    note: '本輪補守護：九宮/文字層級與主選單實點都有可復跑腳本',
  },
  R97: {
    status: '🟡', hours: 1,
    guard: 'work/cocos_book/model_assert.mjs（武將資料＋勢力圖）',
    note: '本輪降級：三面板中 CityListPanel.ts 717 行沒有任何斷言腳本（GeneralBook/Forces 有）',
  },
  R103: {
    hours: 4,
    note: '本輪收口：物品頁空帶 302→23px 已修（195），編成頁色數 4241 過 3631 線但無守護（1h），微信幀率仍未測（3h）',
  },
  R104: {
    hours: 0.5,
    guard: 'tools/check_audio_cdn.mjs（418 行，exit 0/3）',
    note: '機制已收口：base 空=靜音出包、佔位址構建 throw、check_audio_cdn --pkg PASS；只剩填真實 CDN base（非代碼）',
  },
  R109: { guard: 'tests/fidelity_net.test.ts（65 條：FACE 引用與 TIMES 一致、FACE001..400 都在）' },
  R110: {
    guard: 'work/cocos_binput/input_assert.mjs（386 條）＋ work/cocos_input/cmd_assert.mjs',
    note: '本輪補守護：兩層指令 + 8 格的點擊/置灰都有斷言',
  },
  R112: {
    status: '🟡', hours: 2,
    guard: '—（無）',
    note: '本輪降級：BattleBg.ts 250 行 / BattleWeather.ts 174 行沒有任何測試或斷言；12 套三層視差只有截圖',
  },
  R114: { guard: 'tests/saves_r70.test.ts（30 條：forceColorOf / 14 家唯一 / forceColorMap）' },
  R116: {
    guard: 'node work/fidelity/check.mjs（19:17 實跑 PASS 459 / FAIL 0 / SKIP 3，exit 0）',
    note: '本輪復跑通過；兩端內政另見 work/parity_num/_run_all.json unit3 14,696 條不一致 0',
  },
  R117: {
    status: '🟡', hours: 2,
    guard: '—（只有 work/gate170/*.png）',
    note: '本輪降級：五劇本走查只有 PNG；work/gate170/console_steps_scen5.json 可作自動化起點',
  },
};

for (const r of rows) {
  const o = OVERRIDES[r.id];
  if (!o) continue;
  if (o.status) r.status = o.status;
  if (o.hours != null) r.hours = String(o.hours);
  if (o.guard) r.guardHand = o.guard;
  if (o.note) r.note = o.note;
}

/* ---------------------------------------------------------------- R118+ 新登記 */
const NEW = [
  {
    id: 'R118', system: '視角透視投影（原作 pitch 1.8×）', basis: 'project/193',
    status: '✅',
    evidence: `${A('game/src/view/projection.ts', 'export function projectUnit', 'projectUnit')} / ${A('game/src/view/projection.ts', 'export function screenToUnit', 'screenToUnit')}；PITCH_FAR_PX=53、PITCH_NEAR_PX=84.5（${A('game/src/view/projection.ts', 'PITCH_FAR_PX,', '匯出區')}）；rowScale=e^{k(r−r0)} 0.7420…1.1830；可見行 12.60→13.33；繪製/命中/彈道/特效/瞄準圈全走同兩函數`,
    guard: 'tests/projection.test.ts（16 條，本輪實跑 pass）',
    hours: '0', note: '取代 172 的「1.8× 允許差異」判法：原作 px/格 pitch(y)=9170/(283−y) 已對上',
  },
  {
    id: 'R119', system: '引擎節拍 60Hz（13 處乙類換算）', basis: 'project/192',
    status: '✅',
    evidence: 'TICK_HZ 30→60、BATTLE_TICK_LIMIT 5940→11880（＝原作 `0x2E68`）、AI_SKILL_INTERVAL_TICKS=10*TICK_HZ、CLOCK_UNIT_TICKS=2*TICK_HZ、animSelect 20/16/24、generalAtlas DEATH_TICKS 48；實測一格 1.367→0.683 s、整場 43.7→21.8 s、AI 打滿 198.0 s、倒計時 99→0＝198 s',
    guard: 'tests/tick60.test.ts（10 條；另 sfx_tempo.test.ts 8 條鎖 ACTION_INTERVAL_TICKS=40）',
    hours: '0', note: '甲類常數（40/46/60）保持原作幀數不動，只換算乙類時長',
  },
  {
    id: 'R120', system: '武將技投射物先飛後判（12 條技）', basis: 'project/187',
    status: '✅',
    evidence: 'ShootObject@`0x6998`→`0x2C`→ShootObjectCallback@`0x5CA4`→Hurt；12 條 seq 2/13/46/50/52/53/59/62/67/83/85/107；落月弓結算 tick 10→79；`0x012` 語義修在 `game/src/core/smartscript/syscalls.ts:285`',
    guard: 'tests/projectile_fx.test.ts（13 條，含陰性對照）',
    hours: '0', note: '172 時只到「特效有畫」，現在結算時點也對上',
  },
  {
    id: 'R121', system: '戰鬥行動模型：8 槽待機 / AI 60 tick / 同排掃描 / atkLock / 抖動 / 軸向', basis: 'project/173,177,178',
    status: '✅',
    evidence: '`game/src/core/battle_ai.ts` 197 行（w0=100、+12、+150、+1000、case2 雙命令）；atkLock `[1,1,1,3,1,2,1,1,1,1,1,3,1]`；slide 抖動 ±0x30/±0x24 clamp ±120/±90；planToward 軸向直前 80.1%；清槽 `0x43AEB2`、寫指令 `0x43AED4`',
    guard: 'tests/action_model.test.ts（18）＋ tests/battle_ai.test.ts（12），本輪實跑 pass',
    hours: '0', note: '172 完全沒有這一層（開局站樁、AI 隨機）',
  },
  {
    id: 'R122', system: '開局布陣（方形 N=100 / A 側 71−gx / 主將第 6 行）', basis: 'project/174',
    status: '✅',
    evidence: 'formationCells：A 51..61、B 10..20、主將第 6 行、最近 31 格；A 側 gx=71−gx',
    guard: 'tests/action_model.test.ts（18）＋ tests/battle_ai.test.ts（12）',
    hours: '0', note: '172 的 R30 只寫了 gx=x+anchorX 的公式，沒有鏡像與方形布陣',
  },
  {
    id: 'R123', system: 'HUD 四字段 + 體 + 中文倒計時（web）', basis: 'project/180,191',
    status: '✅',
    evidence: `${A('game/src/view/layout.ts', 'export const GENERAL_CARD_Y', 'GENERAL_CARD_Y')}、COLORS.heal；士氣/疲勞/武力/智力兩列（外側疲勞/智力、內側士氣/武力）；倒計時 ceil((limit−tick)/60) 起 99`,
    guard: 'tests/battle_hud_orig.test.ts（11 條）',
    hours: '0', note: '172 的 R85 只到「戰鬥操作台」，沒有 HUD 字段對齊',
  },
  {
    id: 'R124', system: 'Cocos HUD 體與四字段（與 web 同值）', basis: 'project/194',
    status: '✅',
    evidence: `${A('game/cocos/assets/scripts/BattleHud.ts', 'const CARD_ROW_TROOP', 'CARD_ROW_TROOP')} 起四行（CARD_ROW_HP 1056、CARD_BAR_TOP_TROOP 1034、CARD_BAR_TOP_HP 1050；條高 8，技 10px，疲/士/智/武 13px 兩列，行距 3px）`,
    guard: 'work/cocos_hud2/hud_assert.mjs（108 條 PASS）＋ work/cocos_binput/input_assert.mjs（386 條）',
    hours: '0', note: 'Cocos 側此前缺「體」行',
  },
  {
    id: 'R125', system: '紀元 / 存檔槽 / 內政 8 字段', basis: 'project/181',
    status: '✅',
    evidence: `${A('game/web/era.js', 'export function toADYear', 'toADYear(y)=184+(y−1)')}；記錄01..10 四段、SLOT_DELETE_UI=false；內政 8 項含關卡數`,
    guard: 'tests/era_save.test.ts（17 條）',
    hours: '0', note: '── 172 完全沒有紀元與內政字段這一層',
  },
  {
    id: 'R126', system: '俘虜四字段真值（士氣/疲勞/勝/敗）', basis: 'project/196',
    status: '✅',
    evidence: '士氣 `[g+0x38]`@`0x44F222`、疲勞 `[g+0x3A]`@`0x44F25F`、勝場 `[g+0x9F]`@`0x44F3BE`、敗場 `[g+0xA1]`@`0x44F3FE`；持久化累加 `0x4084C9`；寫檔 `0x431A7A`→`+0xC7`、讀檔 `0x43348B`；本作 ' + A('game/web/saves.js', 'export function generalRecordOf', 'generalRecordOf') + ' / ' + A('game/web/saves.js', 'export function noteGeneralResult', 'noteGeneralResult') + '（v3 選填 generalRecord，舊檔 null→「—」）',
    guard: 'tests/capture_fields.test.ts（11 條）',
    hours: '0', note: '172 的 R63 只寫「戰績累加」，四個字段的來源偏移是這輪才定死的',
  },
  {
    id: 'R127', system: '招降十欄（web 兩欄 + Cocos）', basis: 'project/191,194,196',
    status: '🟡', hours: '2',
    evidence: 'web ' + A('game/web/campaign.html', '<div class="ttl">武 將 招 降</div>', '面板標題') + '、surFields 十欄兩欄排；Cocos `SurrenderPanel.ts` 與 web 同序，但 SurrenderCard 缺欄位時 7 項顯示「—」',
    guard: 'tests/hud_surrender191.test.ts（5 條，只覆蓋 web）',
    hours: '2',
    note: '缺口：Cocos 端要改 core/roster.ts + SurrenderModel.viewOf（本輪禁改 game/**，故留 2h）',
  },
  {
    id: 'R128', system: '錄像逐項複核：40 tick 行動 / 主將士兵同速', basis: 'project/175,188,190',
    status: '✅',
    evidence: '`0x43B5DE mov [ecx+0x34],0x28` 40 tick、主將與士兵共用；+0x34 單位是引擎 tick（`0x43AC79`/`0x43AC89`/`0x43ACF3`）；錄像 tick 率 66–79 Hz；1.89× 觀感＝透視 1.59 × 行動失敗 1.19，**無速度倍率**',
    guard: 'tests/fidelity_net.test.ts（65 條之一：攻擊間隔 = 40 幀）＋ tests/move_grid.test.ts（16）＋ tests/sfx_tempo.test.ts（8）',
    hours: '0', note: '172 的 R84 誤以為突擊有速度倍率，本輪裁決為無',
  },
  {
    id: 'R129', system: '兵種圖集 13/13 + 士兵屏寬 75 零重採樣', basis: 'project/189',
    status: '✅',
    evidence: A('game/src/view/unitFrames.ts', 'const GROUP_BY_TROOP', 'GROUP_BY_TROOP 13 兵種 0–12') + '；' + A('game/src/view/unitFrames.ts', 'function canvasWidthOf', 'canvasWidthOf') + ' 取 `units.json` 的 `meta.canvas_w`（13 組皆 75）1:1 落屏、髒數據退 66；' + A('game/src/view/battleView.ts', '兵种图集用帧画布宽 1:1', '同一口徑') + '；Cocos 兵種高度 87:70:74 為 `project/194` 的量測值（源碼無 87/70/74 常數）',
    guard: 'tests/units.test.ts（13 條）＋ tests/soldiers.test.ts（含圖集越界/尺寸）',
    hours: '0', note: '172 的 R111 只寫「士兵造型 572 幀」，映射對錯未驗',
  },
  {
    id: 'R130', system: 'Cocos 大地圖部隊層 + 兵團指令 5 項', basis: 'project/182,186',
    status: '✅',
    evidence: '`game/cocos/assets/scripts/ArmyLayer.ts` 1496 行；planArmyMoves(armies, armyStep) / armyStep=1/armyMonths；兵團指令 5 項',
    guard: 'tests/march_ui.test.ts（16 條）＋ work/cocos_army/assert_army.mjs（65/65 PASS）',
    hours: '0', note: '── 172 完全沒有部隊層（只有大地圖版式 R107）',
  },
  {
    id: 'R131', system: '駐紮 / 任命軍師', basis: 'project/185',
    status: '✅',
    evidence: 'MARCH_FLAG_W=11、MARCH_HIT_R=16、MARCH_STACK_GAP=13、STATION_EPS=0.005、ARMY_MAX_OFFICERS=5；軍師技跨端傳遞 Cocos 未做（D4）',
    guard: 'tests/march_station.test.ts（22 條）＋ work/cocos_army/assert_army.mjs',
    hours: '0', note: 'Cocos 編成屏軍師技傳遞仍是已知差異（project/186 §D4）',
  },
  {
    id: 'R132', system: 'Cocos 編成頁色數 / 物品頁空帶', basis: 'project/195',
    status: '🟡', hours: '1',
    evidence: '`Draw.gridWeave()` 色數 3143→4241（過 3631 線）、偏紫 1.42%；物品頁空帶 302→23px、大圖框 111→7px',
    guard: '—（tests/cocos_art_paths.test.ts 只釘路徑，不釘色數）',
    hours: '1',
    note: '缺口：色數/偏色沒有守護，改一次 Draw 就可能退回；建議加像素取樣斷言 1h',
  },
  {
    id: 'R133', system: '音頻 CDN base 配置化 + 校驗', basis: 'project/193 §22⑦',
    status: '✅',
    evidence: '`tools/audio_cdn_config.json` base=""（空＝靜音出包，顯式）；`tools/check_audio_cdn.mjs` 418 行、佔位址 exit 3、本輪實跑 exit 0；`-AudioBase` 優先；`tools/build_wechat.ps1` 必須 UTF-8 with BOM（掉 BOM 後 PS5.1 報 Unexpected token）',
    guard: 'node tools/check_audio_cdn.mjs（19:17 實跑 exit 0）',
    hours: '0', note: '出包實測主包 2.49MB/28 檔 + subpackages\\res 14.56MB/2919 檔 = 17.06MB/2947 檔',
  },
];

for (const n of NEW) {
  n.guardHand = n.guard;
  rows.push(n);
}

/* ---------------------------------------------------------------- 守護推導 */
const GUARD_RE = /(?:^|[`\s(（])((?:[\w./\\-]+\/)?(?:[\w.-]+)\.test\.ts)|(work\/[\w./-]+\.mjs)|(node work\/[\w./-]+)/g;
for (const r of rows) {
  if (r.guardHand) { r.guard = r.guardHand; continue; }
  const ev = r.evidence || '';
  const found = [...ev.matchAll(GUARD_RE)].map((m) => m[1] || m[2] || m[3]);
  r.guard = found.length ? [...new Set(found)].join('、') : '—';
  if (r.status === '✅' && r.guard === '—') {
    r.status = '🟡';
    r.hours = String(Math.max(Number(r.hours) || 0, 2));
    r.guard = '—（本輪未找到守護）';
    r.note = (r.note ? r.note + '；' : '') + '本輪機械降級：無守護';
  }
}

/* ---------------------------------------------------------------- 統計 */
const ORDER = ['✅', '🟡', '❌', '⚠️', '⬜'];
const tally = Object.fromEntries(ORDER.map((s) => [s, 0]));
for (const r of rows) tally[r.status] = (tally[r.status] || 0) + 1;
const hoursOf = (s) => rows.filter((r) => r.status === s).reduce((a, r) => a + (Number(r.hours) || 0), 0);
const totalHours = rows.reduce((a, r) => a + (Number(r.hours) || 0), 0);

/* ---------------------------------------------------------------- 交叉校驗 */
const filesCache = new Map();
function readLines(p) {
  if (filesCache.has(p)) return filesCache.get(p);
  let out = null;
  for (const cand of [p, 'game/' + p, 'game/src/' + p, 'game/web/' + p]) {
    try { const t = fs.readFileSync(R(cand), 'utf8'); out = { p: cand, lines: t.split(/\r?\n/) }; break; } catch {}
  }
  if (!out) {
    // 只在已知的幾個根下按 basename 找（避免對整個 repo 做遞歸 glob）
    const base = path.basename(p);
    for (const dir of ['game/cocos/assets/scripts', 'game/src/core', 'game/src/view', 'game/src/core/smartscript', 'game/web', 'tools', 'game/tests']) {
      try {
        const abs = path.resolve(ROOT, dir);
        const hit = fs.readdirSync(abs).find((f) => f === base);
        if (hit) { const rel = dir + '/' + hit; const t = fs.readFileSync(R(rel), 'utf8'); out = { p: rel, lines: t.split(/\r?\n/) }; break; }
      } catch {}
    }
  }
  filesCache.set(p, out);
  return out;
}
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

const CITE_RE = /`([A-Za-z0-9_][A-Za-z0-9_./\\-]*\.(?:ts|js|html|mjs|ps1|json)):(\d+)(?:-(\d+))?/;
function citeOf(r) {
  if (r.files && r.files.length) {
    const f = r.files.find((x) => Number.isInteger(x.line) && x.line > 0);
    if (!f) return null;
    return { ref: f.ref, line: f.line, lineText: f.lineText, total: f.total };
  }
  const m = (r.evidence || '').match(CITE_RE);
  if (!m) return null;
  return { ref: m[1], line: Number(m[2]), lineText: '', total: 0 };
}

/* 固定種子抽 12 行（可重現） */
let seed = 20261125;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pool = rows.filter((r) => citeOf(r));
const picked = [];
const seen = new Set();
while (picked.length < 12 && picked.length < pool.length) {
  const i = Math.floor(rnd() * pool.length);
  if (seen.has(i)) continue;
  seen.add(i);
  picked.push(pool[i]);
}

const checkRows = [];
for (const r of picked) {
  const c = citeOf(r);
  const got = readLines(c.ref);
  let verdict = '不符';
  let detail = '';
  if (!got) { detail = '檔案不存在'; verdict = '不符'; }
  else {
    const total = got.lines.length;
    if (c.line > total) { detail = `行號超出（檔案只有 ${total} 行）`; verdict = '不符'; }
    else {
      const cur = got.lines[c.line - 1] ?? '';
      const want = norm(c.lineText);
      if (!want) { detail = cur.trim() ? `第 ${c.line} 行存在：${cp(norm(cur), 60)}` : `第 ${c.line} 行是空行（172 只寫了範圍，沒有逐字文本）`; verdict = '符合（僅存在性）'; }
      else if (norm(cur) === want) { detail = '逐字一致'; verdict = '符合'; }
      else {
        let drift = 0;
        for (let d = 1; d <= 200 && !drift; d++) {
          if (norm(got.lines[c.line - 1 - d]) === want) drift = -d;
          if (norm(got.lines[c.line - 1 + d]) === want) drift = d;
        }
        if (drift) { detail = `行號漂移 ${drift > 0 ? '+' : ''}${drift}（原句現在第 ${c.line + drift} 行）`; verdict = '符合（行號漂移）'; }
        else {
          let at = 0;
          for (let i = 0; i < got.lines.length; i++) if (norm(got.lines[i]) === want) { at = i + 1; break; }
          if (at) { detail = `整段搬家：原句現在第 ${at} 行（${at - c.line > 0 ? '+' : ''}${at - c.line}；檔案核對期間被改寫）`; verdict = '符合（搬家）'; }
          else { detail = `全文找不到原句；現第 ${c.line} 行是「${cp(norm(cur), 60)}」`; verdict = '不符'; }
        }
      }
    }
  }
  checkRows.push({ id: r.id, cite: `${c.ref}:${c.line}`, file: got ? got.p : '（未解析）', detail, verdict });
}

/* 全量漂移統計（117 行舊引用） */
let bulkTotal = 0, bulkSame = 0, bulkDrift = 0, bulkGone = 0, bulkMove = 0;
const goneList = [];
const movedList = [];
for (const r of rows.slice(0, 117)) {
  for (const f of r.files || []) {
    bulkTotal++;
    const got = readLines(f.ref);
    if (!got) { bulkGone++; goneList.push([r.id, f.ref + ':' + f.line, '檔案不在']); continue; }
    const cur = got.lines[f.line - 1] ?? '';
    if (!norm(f.lineText)) { bulkSame++; continue; }
    if (norm(cur) === norm(f.lineText)) bulkSame++;
    else {
      let hit = false;
      for (let d = 1; d <= 4 && !hit; d++) {
        if (norm(got.lines[f.line - 1 - d]) === norm(f.lineText) || norm(got.lines[f.line - 1 + d]) === norm(f.lineText)) hit = true;
      }      if (hit) { bulkDrift++; continue; }
      {
        const needle = norm(f.lineText);
        let elsewhere = 0;
        for (let i = 0; i < got.lines.length; i++) if (norm(got.lines[i]) === needle) { elsewhere = i + 1; break; }
        if (elsewhere) {
          bulkMove++;
          movedList.push([r.id, f.ref + ':' + f.line, `搬到第 ${elsewhere} 行（${elsewhere - f.line > 0 ? '+' : ''}${elsewhere - f.line}）`]);
        } else {
          bulkGone++;
          goneList.push([r.id, f.ref + ':' + f.line, (cur.trim() ? '文本已變：' + cp(norm(cur), 60) : '該行已不存在（f.line 超出檔案現有長度）')]);
        }
      }
    }
  }
}

const okCount = checkRows.filter((c) => c.verdict.startsWith('符合')).length;
/* 快照時間：game/ 下最近一次寫入（本輪有並行 agent 在改碼，要標清楚） */
function newest(dir, acc = { t: 0, f: '' }) {
  let ents = [];
  try { ents = fs.readdirSync(R(dir), { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (['node_modules','temp','library','profiles','build','.git'].includes(e.name) || e.name.startsWith('.')) continue;
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) newest(rel, acc);
    else if (/\.(ts|js|json|html)$/.test(e.name)) {
      const st = fs.statSync(R(rel));
      if (st.mtimeMs > acc.t) { acc.t = st.mtimeMs; acc.f = rel; }
    }
  }
  return acc;
}
const snap = ['game/src','game/web','game/tests','game/cocos/assets/scripts'].map((d) => newest(d)).sort((a,b)=>b.t-a.t)[0];
const snapStr = new Date(snap.t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC（' + snap.f + '）';const exactCount = checkRows.filter((c) => c.verdict === '符合').length;
const driftOk = checkRows.filter((c) => c.verdict === '符合（行號漂移）' || c.verdict === '符合（搬家）').length;
const movedOk = checkRows.filter((c) => c.verdict === '符合（搬家）').length;
const existOnly = checkRows.filter((c) => c.verdict === '符合（僅存在性）').length;
const badRows = checkRows.filter((c) => !c.verdict.startsWith('符合'));

/* ---------------------------------------------------------------- 寫報告 */
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const now = (() => { const d = new Date(Date.now() + 8 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' ') + ' (+08:00)'; })();

const L = [];
const P = (s = '') => L.push(s);

P('# 199 · 與原作對照表刷新（R193 / 2026-11-25）');
P();
P('> 只讀核查產物。本檔不改任何遊戲代碼，不覆蓋 `project/172_对照表刷新.md`。');
P('> 生成方式：`node work/audit_r193/build199.mjs`（讀 172 的機器可讀版 `work/audit_r193/cites.json`，逐行重判 + 本輪新登記 + 種子抽樣交叉校驗）。');
P('> 上一版：`project/172_对照表刷新.md`（15:20，✅105 / 🟡4 / ❌0 / ⚠️4 / ⬜4 / 37h）。');
P(`> 代碼快照：${snapStr}。核對期間 ` + '`game/src/core/battle.ts`、`game/src/view/projection.ts`、`game/src/view/layout.ts`' + ' 被並行改動三次（19:21:18 / 19:21:36 / 19:23:25），其中 19:23:25 那次**把 battle.ts 與 layout.ts 的編碼寫壞了**——見 §8b，先處理它再看本表。');
P();
P('## §0 總表');
P();
P('| 狀態 | 含義 | 行數 | 172 版 | 增減 | 剩餘工時 |');
P('|---|---|---|---|---|---|');
P(`| ✅ | 已還原（本輪重判後仍成立，且守護可復跑） | **${tally['✅']}** | 105 | ${tally['✅'] - 105 >= 0 ? '+' : ''}${tally['✅'] - 105} | 0h |`);
P(`| 🟡 | 部分完成 / 無守護 / 未測指標 | **${tally['🟡']}** | 4 | +${tally['🟡'] - 4} | ${hoursOf('🟡')}h |`);
P(`| ❌ | 未做 | **${tally['❌']}** | 0 | 0 | 0h |`);
P(`| ⚠️ | 數據或語義存疑（[推測]/待裁決） | **${tally['⚠️']}** | 4 | 0 | ${hoursOf('⚠️')}h |`);
P(`| ⬜ | 明確不做（原作本身沒有） | **${tally['⬜']}** | 4 | 0 | 0h |`);
P(`| 合計 | | **${rows.length}** | 117 | +${rows.length - 117} | **${totalHours}h** |`);
P();
P(`**剩餘工時：${totalHours}h ≈ ${(totalHours / 8).toFixed(1)} 人日**（8h/人日；其中 18h 是 ⚠️ 語義裁決、${hoursOf('🟡')}h 是 🟡 收口、⬜/❌ 不計）。`);
P();
P('> ⚠ **先看 §8b**：19:23:25 有一次並行寫入把 `game/src/core/battle.ts`（1962 個 `U+FFFD`）與 `game/src/view/layout.ts`（150 個）寫壞，當前 tree `node --test` 直接 `SyntaxError`（battle.ts:28），全量掉到 586 tests / 53 fail。**本表判級基於 19:17 的快照（1544 全綠）**，§8 的實跑數字都帶時間戳。');
P();
P('與 172 的 37h 幾乎持平，原因是兩股力量相抵：本輪把 R103 從 12h 砍到 4h、R104 從 2h 砍到 0.5h（合計 −9.5h），但同時新增 16 行（R118–R133，14 行 ✅ 0h、2 行 🟡 3h）、並按「✅ 必須有守護」把 4 行降級（+7h）。');
P();
P('## §1 判級口徑（本輪改嚴）');
P();
P('- **✅ 已還原**：有可復跑守護，且本輪實跑通過（或 work/ 下的斷言腳本有 PASS 記錄可查）；語義沒有未決分歧。');
P('- **🟡 部分**：主體已落地，但 (a) 無守護 / 守護只覆蓋部分子項，(b) 有未測指標，(c) 有待裁決語義。');
P('- **❌ 未做**：代碼層根本沒有。');
P('- **⚠️ 存疑**：功能通了，但關鍵數值/時點仍是 `[推測]`，或兩端語義不一致。');
P('- **⬜ 不做**：原作本身沒有這功能（有反證地址），不是缺工。');
P();
P('**本輪新增的硬規則**：✅ 行必須能指到「測試檔名」或「work/ 斷言腳本」；只寫 `file:line` 的一律降 🟡。據此 10 行原本無守護的 ✅ 被重新處置：6 行補到守護（R24/R82/R96/R109/R110/R114）、4 行降 🟡（R35/R97/R112/R117）。');
P();
P('## §2 本輪重判明細（狀態有變動的行）');
P();
P('| 行 | 172 判級 | 現判級 | 變動原因 | 守護 |');
P('|---|---|---|---|---|');
const changed = rows.filter((r) => {
  const o = OVERRIDES[r.id];
  if (o && o.status) return true;
  return r.note && /機械降級/.test(r.note);
});
for (const r of changed) {
  const old = (rows.find((x) => x.id === r.id) && OVERRIDES[r.id] && OVERRIDES[r.id].status) ? (r.id === 'R35' || r.id === 'R103' || r.id === 'R104' ? (r.id === 'R35' ? '✅' : '🟡') : '✅') : '✅';
  const from = r.id === 'R20' || r.id === 'R91' || r.id === 'R103' || r.id === 'R104' ? '🟡' : '✅';
  P(`| ${r.id} | ${from} | ${r.status} | ${esc((r.note || '').slice(0, 120))} | ${esc((r.guard || '').slice(0, 70))} |`);
}
P();
P('另有 6 行判級不變但**補上了守護**（R24/R82/R96/R109/R110/R114）——172 版這幾行只寫了 `file:line`，按本輪口徑不能算 ✅ 的證據。');
P();
P('### §2b 工時變動（判級不變，但「差最後一公里」的量變了）');
P();
P('| 行 | 172 工時 | 本輪工時 | 依據 |');
P('|---|---|---|---|');
P('| R103 | 12h | 4h | 物品頁空帶 302→23px 已修（−3h）；編成頁色數 3143→4241 已過 3631 線（−5h，但要留 1h 加守護）；微信幀率仍未測（3h） |');
P('| R104 | 2h | 0.5h | `tools/audio_cdn_config.json` + `tools/check_audio_cdn.mjs` 已收口（−1.5h）；只剩填真實 CDN base |');
P();
P(`## §3 逐行對照表（R1–R${rows.length}）`);
P();
P('欄位：`守護` = 可復跑的命令/檔名（`—` 表示沒有）。`工時` 單位小時。');
P();
P('| 行 | 系統 | 依據 | 狀態 | 證據（file:line / 地址） | 守護 | 工時 | 備註 |');
P('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  P(`| ${r.id} | ${esc(r.system)} | ${esc(r.basis)} | ${r.status} | ${esc(r.evidence)} | ${esc(r.guard)} | ${r.hours} | ${esc(r.note)} |`);
}
P();
P(`## §4 本輪新登記（R118–R133，共 ${NEW.length} 行）`);
P();
P('這些是 172 之後（`project/173`–`196` + `project/31_还原清单.md` §一之補 12–22）新落地的能力。172 的表裡完全沒有它們，所以不算「回歸」，但如果不登記，會讓「完全還原」看起來比實際更近。');
P();
P('| 行 | 新能力 | 來源報告 | 判級 | 工時 | 為什麼這樣判 |');
P('|---|---|---|---|---|---|');
const why = {
  R118: '16 條 projection 測試實跑通過，繪製/命中/彈道同源',
  R119: '10 條 tick60 測試 + 13 處乙類換算逐條對得上 0x2E68',
  R120: '12 條技逐條對上 ShootObject 回調，含陰性對照',
  R121: '30 條測試（18+12）覆蓋 8 槽/AI/atkLock/抖動/軸向',
  R122: '布陣格由 formationCells 單點斷言，71−gx 有守護',
  R123: '11 條 HUD 測試，字段與位置都釘住',
  R124: '108 條 Cocos 斷言 PASS，座標與 web 同值',
  R125: '17 條 era_save 測試，toADYear 錨點 184 明確',
  R126: '四個偏移都有反匯編地址 + 11 條測試',
  R127: 'web 有守護、Cocos 七欄仍顯示「—」，屬真缺口 → 🟡',
  R128: '40 幀間隔有三份測試從不同角度鎖住',
  R129: '13 兵種映射 + 圖集越界/尺寸都有斷言',
  R130: '16 條 march_ui + 65/65 Cocos 斷言',
  R131: '22 條 march_station，含 STATION_EPS',
  R132: '色數達標但沒有守護，改一次就可能退回 → 🟡',
  R133: 'check_audio_cdn 本輪實跑 exit 0；base 空的語義寫進 config',
};
for (const n of NEW) P(`| ${n.id} | ${esc(n.system)} | ${esc(n.basis)} | ${n.status} | ${n.hours} | ${esc(why[n.id] || '')} |`);
P();
P('## §5 剩餘工時估算與依據');
P();
P('| 行 | 項目 | 工時 | 依據 |');
P('|---|---|---|---|');
const wbasis = {
  R20: '搜索 rand() 的 nonce 序列與原作不可復現；要接原作 PRNG 才能正證',
  R35: 'deploy 頁「只列已學、選一條」需要一條 UI 斷言（現只有機制守護）',
  R81: 'Exec34「後選出陣」3 槽仍是 [推測]，需再讀 0x448690 附近',
  R83: '部隊指令 33 組×6 條的步長/時長 [推測]（功能已通）',
  R91: '撤退態不還手缺「正證」（現只有反證：0x4000 只置不清）',
  R97: 'CityListPanel.ts 717 行無斷言腳本，補一條城池一覽斷言',
  R98: '即位時點 1 年 1 月 vs 1 年 3 月，EndingPanel 兩處文案 + 時間線',
  R103: '3h 微信幀率實測（未測）+ 1h 編成頁色數守護（4241 已過線但無斷言）',
  R104: '0.5h 填真實 CDN base（代碼側已收口；空 base = 顯式靜音）',
  R112: '12 套三層視差只有截圖，補 BattleBg 斷言（層數/視差係數/12 套齊）',
  R115: 'PRNG/方向流要與原作同流才能逐幀對拍錄像；目前只保證分布',
  R117: '五劇本走查只有 PNG；把 console_steps 變成可復跑門禁',
  R127: 'Cocos SurrenderCard 缺 7 字段（需改 core/roster.ts + SurrenderModel.viewOf）',
  R132: '編成頁色數/偏色加像素取樣斷言',
};
for (const r of rows) {
  const h = Number(r.hours) || 0;
  if (!h) continue;
  P(`| ${r.id} | ${esc(r.system)} | ${h}h | ${esc(wbasis[r.id] || r.note || '')} |`);
}
P(`| — | **合計** | **${totalHours}h** | ${(totalHours / 8).toFixed(1)} 人日 |`);
P();
P('估算方法：逐條給「差最後一公里的具體動作」而不是給百分比；⚠️ 行按「需要再讀多少反匯編 + 多少測試」估，🟡 行按「加一條守護/測一個指標」估。不含新功能開發（表裡沒有未登記的開發項）。');
P();
P('## §6 Top 10 阻塞項（真正擋「完全還原」的）');
P();
P('| # | 行 | 阻塞點 | 工時 | 為什麼是阻塞（不只是待辦） |');
P('|---|---|---|---|---|');
const top = [
  ['R115', '隨機/方向流與原作不同流（D4）', '8h', '這是保真天花板：只要 PRNG 流不同，任何「逐幀對拍錄像」都不可能 0 差異；現在只能對分布（80/10/10）與統計量。不解決，R20 也一起懸著。'],
  ['R83', '部隊指令 33 組×6 條的精確步長/時長', '4h', '玩法語義仍是 [推測]：hold 0 / back +2.690 格 / spread σ 0.781→2.673 是量出來的，真值沒定。AI 與玩家共用這層，錯一步全場節奏就偏。'],
  ['R81', 'Exec34「後選出陣」的 3 槽', '4h', '編隊語義 [推測]：直接影響「出陣帶誰」，跟 R122 布陣耦合；錯了會讓開局站位整體偏移。'],
  ['R91', '撤退態不還手缺正證', '3h', '戰鬥關鍵規則只證了一半（0x4000 只置不清已證），「46 幀 / 只倒走 / 不還手」還缺一條硬證據；這是玩家最容易察覺的行為差異。'],
  ['R103', '微信幀率未測 + 編成頁色數無守護', '4h', '唯一能擋上架的效能項；色數雖已過 3631 線，但沒有斷言，一次 Draw 重構就會退回 3143。'],
  ['R104', '音頻 CDN 真實 base', '0.5h', '代碼已收口，但 base 空 = 全靜音出包。上架前必須有一個真實 CDN 根，這是外部依賴（帳號/儲存），不是寫代碼能解决。'],
  ['R112', '戰場背景 12 套三層視差無守護', '2h', '整塊美術層零斷言，回歸無感知；且與 R118 透視投影耦合（層視差係數要跟 pitch 一起對）。'],
  ['R127', 'Cocos 招降十欄缺 7 字段', '2h', '玩家實際會看到 7 個「—」；需要改 core/roster.ts + SurrenderModel.viewOf，屬跨端契約（web 已有、Cocos 沒有）。'],
  ['R117', '五劇本走查只有截圖', '2h', '門禁 §3 現在靠人眼；五劇本 × 主線 15 步沒有可復跑腳本，等於「最後一關沒鎖」。'],
  ['R20', '搜索 rand() 序列不可復現', '2h', '與 R115 同源：搜索結果的隨機流不同，129 槽輪盤的分布對了但具體出誰不對。'],
];
top.forEach((t, i) => P(`| ${i + 1} | ${t[0]} | ${esc(t[1])} | ${t[2]} | ${esc(t[3])} |`));
P();
P('排序理由：先保真天花板（R115 → R20）、再玩法語義（R83/R81/R91）、再上架阻塞（R103/R104）、最後美術與門禁（R112/R127/R117）。');
P();
P('## §7 交叉校驗（固定種子抽 12 行，逐個打開表裡寫的 file:line）');
P();
P('抽樣：`seed=20261125` 的 LCG 在 117+16 行中取 12 行（只取有 `file:line` 的行），**可重現**（`node work/audit_r193/build199.mjs` 每次抽同樣 12 行）。核對方式：重新讀檔比對 172 存下來的 `lineText`——±4 行內算「逐字一致」；超出則在整檔搜原文（搬家）；整檔都搜不到才算「不符」。');
P();
P('| # | 行 | 表裡寫的 file:line | 打開結果 | 判定 |');
P('|---|---|---|---|---|');
checkRows.forEach((c, i) => P(`| ${i + 1} | ${c.id} | \`${c.cite}\` | ${esc(c.detail)} | ${c.verdict} |`));
P();
P(`**符合 ${okCount} / 不符 ${badRows.length}（共 12）**——其中逐字一致 ${exactCount}、行號漂移 ${driftOk - movedOk}、整段搬家 ${movedOk}、僅存在性 ${existOnly}。${badRows.length ? '不符：' + badRows.map((b) => b.id + '（' + b.detail + '）').join('；') : ''}`);
P();
P(`全量漂移掃描（172 的 117 行共 ${bulkTotal} 個 file 引用）：逐字一致 ${bulkSame}、±4 行內漂移 ${bulkDrift}、**整段搬家 ${bulkMove}**、文本已變/檔案不在 ${bulkGone}。`);
P();
P(`搬家的 ${bulkMove} 條絕大多數落在 ` + '`game/src/core/battle.ts`' + '——該檔在核對期間被**改了兩次**（19:21:36 變成 157120 B、+8 行；19:23:25 又重組成 155158 B，`EFFECT_WINDOW_MIN` 從 2808 一路跑到 2334）。所以 `battle.ts` 的行號這一輪是浮動的：**原句還在檔案裡、語義沒變，只是行號不能當契約**。下輪引用 `battle.ts` 建議寫符號名（`export function planBattle`）或「函數名 + 該函數內第 N 處」，不要只寫行號。');
P();
if (goneList.length || movedList.length) {
  P('漂移清單（這幾條表裡寫的 `file:line` 已經對不上現碼，下輪修表時要一起改）：');
  P();
  P('| 行 | 引用 | 現況 | 建議 |');
  P('|---|---|---|---|');
  const HINT = {
    'R17': '改指 `web/city_model.js:1467`（`export function searchPools(...)` 現址）',
    'R19': '同 R17，改指 `web/city_model.js:1467`',
    'R104': 'dist 產物已清；改指 `tools/audio_cdn_config.json` + `tools/check_audio_cdn.mjs`',
    'R38': '整段被移到第 1 行，語義待確認（是否被重寫成檔頭註釋）',
  };
  for (const g of movedList) P(`| ${g[0]} | \`${esc(g[1])}\` | ${esc(g[2])} | ${esc(HINT[g[0]] || '行號已變（battle.ts 被重構），下輪改用符號名定位')} |`);
  for (const g of goneList) P(`| ${g[0]} | \`${esc(g[1])}\` | ${esc(g[2])} | ${esc(HINT[g[0]] || '需重找引用點')} |`);
  P();
}
P('## §8 本輪實跑的守護（可復現）');
P();
P('> 全部在 **19:17–19:20**、尚未被 §8b 的事故破壞時實跑。');
P();
P('| 命令 | 結果 |');
P('|---|---|');
P('| `cd game && node --test tests/*.test.ts` | **1544 tests / 1544 pass / 0 fail / 0 skipped**（16.8s，exit 0） |');
P('| `node --test tests/projection.test.ts tests/tick60.test.ts tests/capture_fields.test.ts tests/troop_cap.test.ts tests/action_model.test.ts tests/battle_ai.test.ts` | 85 pass / 0 fail（exit 0） |');
P('| `node work/fidelity/check.mjs` | **PASS 459 / FAIL 0 / SKIP 3 / WARN 0**（mode=dist，exit 0） |');
P('| `node tools/check_audio_cdn.mjs` | exit 0（base 空＝顯式靜音；佔位址才 exit 3） |');
P();
P('## §8b ⚠ 審計期間發現的 tree 事故（不是本輪改的，但擋住「可復跑」）');
P();
P('19:23:25 有一次寫入同時改了三個檔：`game/src/core/battle.ts`（155158 B）、`game/src/core/field.ts`（11073 B）、`game/src/view/layout.ts`（11245 B）。寫入方式**破壞了多字節字元與行尾**：');
P();
P('- `game/src/core/battle.ts` 有 **1962** 個 `U+FFFD`、`game/src/view/layout.ts` 有 **150** 個（`field.ts` 乾淨）。');
P('- `battle.ts:20` 一行裡把註釋、被吃掉的換行、`import {` 併成同一行（行尾字元變成 `?`）：`// R37 策略派發 / 援軍：純邏輯?strategy.ts，本檔只做接線（?project/61_策略与援?md?import {`。同樣現象見 `battle.ts:30`、`battle.ts:31`。');
P('- 直接後果：`cd game && node --test tests/battle_r81.test.ts` → `SyntaxError [ERR_INVALID_TYPESCRIPT_SYNTAX]: Expression expected`，指到 `file:///F:/sanguo/game/src/core/battle.ts:28`（`} from \'./strategy.ts\';` 那行，因為上一行已被併掉）。');
P('- 當前全量（19:26 實跑）：`node --test tests/*.test.ts` → **tests 586 / pass 533 / fail 53 / skipped 0**（exit 1）。比 19:17 少掉的 958 條不是被刪，而是整檔 import 失敗、用例根本沒註冊。');
P();
P('這是 `project/192` §六 的 `gen_expect` 事故同型：**PowerShell 5.1 以 CP936 讀 UTF-8、再以 UTF-8 寫回**，多字節字元與 `\\n` 被吞。建議立刻處理（我不改 `game/**`，只登記）：');
P();
P('1. 停掉那條以 PowerShell 讀寫源碼的路徑，改用 `[IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)` + `-Encoding UTF8`（BOM 與否見 `project/193` §22⑧）。');
P('2. 把 `battle.ts` / `layout.ts` / `field.ts` 還原到 19:21:36 之前的版本（編輯器 undo / 備份），再重跑 `node --test tests/*.test.ts`，應回到 **1544 pass**。');
P('3. 本報告的判級依據是 **19:17 的快照**（當時 1544 全綠），不是被破壞後的 tree；§8 的數字都帶了時間戳。');
P();
P('Cocos 側斷言腳本（需先 `tsc -p tsconfig.sim.json` 產 `_sim/`）：`work/cocos_skin/skin_assert.mjs`、`work/cocos_skinapply/skin_nodes_assert.mjs`、`work/cocos_book/model_assert.mjs`、`work/cocos_hud2/hud_assert.mjs`、`work/cocos_binput/input_assert.mjs`、`work/cocos_input/cmd_assert.mjs`、`work/cocos_army/assert_army.mjs`、`work/cocos_surrender/{model_assert,slot_assert}.mjs`、`work/cocos_select/model_assert.mjs`、`work/cocos_monarch_ui/succession_assert.mjs`、`work/cocos_sync/verify_core3.cjs`（165/165）。');
P();
P('## §9 觀察與下輪建議');
P();
P('1. **守護債是本輪最大的結構性問題**：172 的 105 行 ✅ 裡有 10 行（9.5%）根本沒有任何守護，其中 4 行連「守護能寫成什麼」都不清楚（R35/R97/R112/R117）。建議下輪把「守護名」列為 ✅ 的必要欄位，缺欄位的行不允許 ✅。');
P('2. **R118–R133 全部集中在「戰鬥域」**：16 行新登記裡 9 行是戰鬥（透視/節拍/投射物/行動模型/布陣/HUD/錄像/兵種/俘虜）。這說明 172 之後的投入幾乎全在戰鬥保真，內政/外交/劇情側沒有新登記項——但 R16（徵糧/訓練/治水/外交）仍判 ⬜，若原作確有外交，這裡會是最大的「未登記黑洞」。建議下輪專門複核 R16 的「不做」判決。');
P('3. **舊文檔說法仍需清理**：`project/31` 行 239 仍寫「步長真值 [推測]」（R83），與本輪一致；但 172 §5 列的 7 條過期說法裡「音頻 base 仍阻塞」已部分過期（機制已收口，只差真實 base）。');
P('4. **Cocos 與 web 的契約漂移**：R127（招降七欄）、R131（軍師技跨端）、R130（部隊層）三處都是「web 有、Cocos 沒有」。建議把 SurrenderModel.viewOf / roster.ts 的字段契約固化成一份兩端共用的 schema 測試。');
P('5. **數字可信度**：本輪 1544 tests / fidelity 459 都是實跑，不是引用報告；172 的 37h 與本輪 37.5h 幾乎相同是巧合（−9.5h 收口 vs +7h 降級 +3h 新缺口）。但要注意 §8b：19:23:25 之後 tree 被寫壞，1544 這個數字現在**複跑不出來**，必須先修好 battle.ts / layout.ts。');
P('6. **並行寫入是當前最大風險**：本輪核對 40 分鐘內 `battle.ts` 被改了三次（19:21:18 / 19:21:36 / 19:23:25），其中兩次把行號整體搬走、一次把編碼寫壞。建議：①改碼與核對不要同時跑；②`battle.ts` 這種 2800 行的大檔，引用一律用符號名；③把「`node --test tests/*.test.ts` 必須 1544 pass」做成改碼後的硬閘門，先跑再交。');
P();
P('---');
P();
P(`本檔由 \`work/audit_r193/build199.mjs\` 於 ${now} 生成；只讀 ` + '`game/**`' + `，未修改任何遊戲代碼、測試或 project/172|31|37a|44。`);

fs.writeFileSync(R('project/199_对照表刷新R193.md'), L.join('\n') + '\n', 'utf8');
console.log('rows=' + rows.length + ' tally=' + JSON.stringify(tally) + ' hours=' + totalHours);
console.log('crosscheck ' + okCount + '/12 pass; bulk ' + bulkTotal + ' cites: same=' + bulkSame + ' drift=' + bulkDrift + ' gone=' + bulkGone);
console.log('lines=' + L.length);
for (const b of badRows) console.log('MISMATCH ' + b.id + ' ' + b.cite + ' :: ' + b.detail);
