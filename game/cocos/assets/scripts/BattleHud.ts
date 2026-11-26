/**
 * 战斗页 HUD + 结算面板（Cocos Creator 3.8，设计分辨率 750×1334）。
 *
 * 视觉基准是 web 版（`game\web\index.html` 的 `#battleui` 九宫叠层 + `game\src\view\battleView.ts`
 * 的 `drawConsole()` / `drawSettle()`），本文件把它们搬进 Cocos：
 *
 *   1. 九宫化：技能格 4 格（`slot.png` / `slot_off.png` 两态）、命令按钮「突擊 / 撤退」
 *      （`cmd_off.png` / `cmd_on.png`）、消息栏（`msg.png`）、上下分隔线（`sep.png`，TILED 平铺，
 *      和 CSS `repeat-x` 一致）、主将头像框（`port.png` 金框 + `res/face/full` 真肖像铺在框下面，
 *      缺图/没映射时退回「將」+ 居中 Lv，见 `ensureFace()`）。
 *   2. 字体层级：`applyTextRole(label, role)` 4 级（+1 级角标），大标题带描边 + 阴影。
 *   3. 结算面板：暗面板 + 金色九宫框 + 大字 + 分隔线 + 6 行数据 + 经验条 + 再战按钮。
 *
 * 边界（必须守住）：
 *   - 这里只 **读** `World` / `SettleResult`，不判定胜负、不结算伤害、不下撤退令；
 *   - 节点/绘制/文案可以改，`world.settled` / `settlement.*` / `requestRetreat()` / `cast()`
 *     的语义一个字都不动（这几个 API 由 `BattleRoot` 持有，本文件根本不调用）。
 *
 * 素材：`res/ui/battle/{slot,slot_off,cmd_on,cmd_off,port,msg,sep}.png`（与 web 侧同 SHA256）。
 * 九宫内缩值来自 `work\battleui\_make.py` 的 `MID = 6`：inset = 原图边宽，运行期写到
 * `SpriteFrame.insetLeft/Right/Top/Bottom`，不依赖 `.meta` 里的 border 字段（仓库里 png 的
 * `.meta` 只有 texture 子资源，没有 spriteFrame 子资源，`loadFrame()` 是手工包的 frame）。
 */
import {
  Color,
  Graphics,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  UIOpacity,
  UITransform,
  Vec2,
} from 'cc';
import { ArtSprite, loadFrame } from './ArtLayer';
import { loadPortrait } from './Portrait';
import {
  AGAIN_BUTTON,
  BTN_ASSAULT,
  BTN_RETREAT,
  DESIGN_H,
  DESIGN_W,
  MESSAGE_BOX,
  PORTRAIT,
  SETTLE_PANEL,
  inset,
  rectCenter,
  skillSlotRect,
  toLocal,
} from './view/layout';
import type { Rect } from './view/layout';
import { MAX_SKILL_SLOTS, learnedSkillSeqs, skillSlotRects } from './BattleInput';
import { COLORS, FONT_FAMILY } from './view/theme';
import {
  BATTLE_TICK_LIMIT,
  expToReach,
  magicBySeq,
  qiCostMul,
  qiCostOf,
  qiPowerPercentOf,
  skillKindOf,
} from './core/battle';
import { actionGaugeOf, generalUnitOf } from './BattleCmdUi';
import type { SettleResult, World } from './core/battle';
import type { BattleLaunch } from './GameState';

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/** hex 色 + alpha → Color（与 BattleRoot 的私有同名函数同一套写法）。 */
function hexColor(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

/**
 * cover 贴合：等比放大到刚好盖满 `rect`（= web `drawConsole()` 的
 * `scale = Math.max(PORTRAIT.w / pr.w, PORTRAIT.h / pr.h)`，`battleView.ts:2172`）。
 *
 * `ArtSprite` 只有 stretch / contain 两种 fit（contain 会留边），所以 cover 得在这里把
 * 算好的显示尺寸直接喂给 `apply(frame, size)`：原作 FACE 是 100×120、框是 86×108，
 * 结果 90×108——高度正好，左右各溢出 2px 压在金框不透明边上。
 */
function coverFit(frame: SpriteFrame, rect: Rect): { w: number; h: number } {
  const s = frame.originalSize;
  if (!(s.width > 0 && s.height > 0)) return { w: rect.w, h: rect.h };
  const scale = Math.max(rect.w / s.width, rect.h / s.height);
  return { w: s.width * scale, h: s.height * scale };
}

/**
 * `兵 480/500` / `體 92/100` / `技 12/20` 这一行——**与 web 逐字同口径**
 * （`game/src/view/battleView.ts:705-709 vitalText()`）：两边都 `Math.ceil` 并夹到 ≥ 0，
 * 所以 Cocos 与 web 的同一场战斗显示同一串数字（ceil 而非 round 是原作口径，改这里要对齐 web）。
 */
function vitalText(label: string, cur: number, max: number): string {
  const c = Math.max(0, Math.ceil(Number.isFinite(cur) ? cur : 0));
  const m = Math.max(0, Math.ceil(Number.isFinite(max) ? max : 0));
  return `${label} ${c}/${m}`;
}

// ---------------------------------------------------------------------------
// 字体层级
// ---------------------------------------------------------------------------

/**
 * 文字角色。4 级主层级（hero/subtitle/body/num）+ 1 级角标（caption，对应 web 的 10~12px）。
 *
 * 描边/阴影用的是 **3.8 的 Label 内建字段**（`enableOutline` / `outlineWidth` /
 * `enableShadow` …），不是 `LabelOutline` / `LabelShadow` 组件：后者自 3.8.2 起 deprecated
 * （引擎 `label-outline.ts` 的注释明写 please use Label.enableOutline / Label.enableShadow），
 * `ArtLayer.addOutline()` 也是同一套写法。
 */
export type TextRole = 'hero' | 'subtitle' | 'body' | 'num' | 'caption' | 'clock' | 'micro' | 'vital' | 'stat';

export interface TextRoleSpec {
  /** 字号（px @750×1334） */
  readonly fontSize: number;
  /** 行高（Cocos Label 的 lineHeight，不是 fontSize×常数，避開不同字體的視覺跳動） */
  readonly lineHeight: number;
  /** 描边宽度；0 = 不描边 */
  readonly outlineWidth: number;
  /** 是否加投影（只有大标题加：深底上的金/红大字要「浮」起来） */
  readonly shadow: boolean;
  readonly bold: boolean;
}

/**
 * 4 级层级（+角标）。数字比正文大一档并带 1px 描边，是为了在深底 + 九宫格上「透得出来」。
 *
 * | role     | 字号 | 描边 | 投影 | 用途 |
 * | hero     | 40   | 2px  | ✓    | 結算「大勝 / 敗走 / 平手」、頭像「將」 |
 * | subtitle | 22   | 1px  |      | 主將名 / 在陣 / 突擊·撤退 / 結算副行 / 再戰 |
 * | body     | 18   | —    |      | 武智行 / 技能名 / 結算 6 行標籤 / 消息首行 |
 * | num      | 20   | 1px  |      | 結算數值 / EXP / 頭像 Lv / 技能序號 / 資源條數值 |
 * | caption  | 12   | —    |      | 技能類別·消耗 / 消息次行 / 角標 / note |
 * | clock    | 26   | —    |      | 頂欄時間牌的中文數字（原作金牌上是 26px 的墨色字） |
 * | micro    | 10   | —    |      | 主將卡名行裡的 `技 x/y`（web 這裡是 10px 小字，project/194） |
 * | vital    | 16   | —    |      | 我方主將卡 `兵 x/y` `體 x/y`（web `numSize = FONT.small = 16`） |
 * | stat     | 13   | —    |      | 敵方主將卡 `兵/體` 與兩卡的四個裸數字（web 這裡逐字是 13px） |
 */
export const TEXT_ROLES: Readonly<Record<TextRole, TextRoleSpec>> = {
  hero: { fontSize: 40, lineHeight: 58, outlineWidth: 2, shadow: true, bold: true },
  subtitle: { fontSize: 22, lineHeight: 32, outlineWidth: 1, shadow: false, bold: true },
  body: { fontSize: 18, lineHeight: 26, outlineWidth: 0, shadow: false, bold: false },
  num: { fontSize: 20, lineHeight: 28, outlineWidth: 1, shadow: false, bold: true },
  caption: { fontSize: 12, lineHeight: 17, outlineWidth: 0, shadow: false, bold: false },
  clock: { fontSize: 26, lineHeight: 36, outlineWidth: 0, shadow: false, bold: true },
  micro: { fontSize: 10, lineHeight: 14, outlineWidth: 0, shadow: false, bold: false },
  vital: { fontSize: 16, lineHeight: 22, outlineWidth: 0, shadow: false, bold: false },
  stat: { fontSize: 13, lineHeight: 18, outlineWidth: 0, shadow: false, bold: false },
};

/** 描边 / 投影色：和 `ArtLayer.addOutline()` 的默认值一致（近黑，不是纯黑，避免发灰）。 */
const OUTLINE_COLOR = new Color(6, 8, 12, 235);
const SHADOW_COLOR = new Color(0, 0, 0, 200);

/**
 * 把某一级角色写到 Label 上（字号/行高/粗体/描边/投影一次到位）。
 *
 * 只改「字」的样式，不碰节点尺寸与颜色：尺寸由调用方按框给，颜色由调用方按语义给
 * （金=收益、绿=經驗、紅=敗走）。这样同一个 role 能在不同底色上复用。
 */
export function applyTextRole(label: Label, role: TextRole): void {
  const spec = TEXT_ROLES[role];
  label.fontSize = spec.fontSize;
  label.lineHeight = spec.lineHeight;
  label.isBold = spec.bold;
  label.enableOutline = spec.outlineWidth > 0;
  label.outlineWidth = spec.outlineWidth;
  label.outlineColor = OUTLINE_COLOR;
  label.enableShadow = spec.shadow;
  if (spec.shadow) {
    label.shadowColor = SHADOW_COLOR;
    label.shadowOffset = new Vec2(2, -2);
    label.shadowBlur = 4;
  }
}

// ---------------------------------------------------------------------------
// 九宫素材
// ---------------------------------------------------------------------------

/** 素材目录（res bundle 内路径，不带扩展名）。 */
export const HUD_UI_DIR = 'ui/battle';

export type HudTex = 'slot' | 'slot_off' | 'cmd_on' | 'cmd_off' | 'port' | 'msg' | 'sep';

/** 开场叫阵台词框：与 web `battleView.ts` 的 `TAUNT_BANNER` 同几何（设计坐标，左上角起） */
export const TAUNT_BANNER = { x: 40, y: 790, w: 670, h: 138 };

/**
 * 每张图的九宫内缩（= 原图边框宽度，见 `work\battleui\_make.py`）。
 *
 * 生成器把 3×3 的角/边/中心分开画，中心是**透明**的，所以 SLICED 之后中间能透出战场/面板；
 * `sep.png` 是整条横杠（11×12），CSS 里是 `repeat-x`，所以内缩 0、用 TILED 平铺。
 */
export const HUD_INSET: Readonly<Record<HudTex, number>> = {
  slot: 14,
  slot_off: 8,
  cmd_on: 16,
  cmd_off: 14,
  port: 14,
  msg: 10,
  sep: 0,
};

/** 需要加载的 7 张图（顺序只影响日志顺序）。 */
export const HUD_TEXES: readonly HudTex[] = ['slot', 'slot_off', 'cmd_on', 'cmd_off', 'port', 'msg', 'sep'];

/** 结算九宫框：面板内缩 8px，正好压住 SETTLE_PANEL 的金边。 */
const SETTLE_FRAME: Rect = inset(SETTLE_PANEL, 8);
/** 结算大字下的分隔线（web `drawSettle()` 画在 120..630 / y=270）。 */
const SETTLE_SEP: Rect = { x: 120, y: 270, w: 510, h: 12 };
/** 控制台上下两条分隔线（web CSS：`.sep.top` 108..732 / y1106，`.sep.bot` 18..732 / y1316）。 */
const SEP_TOP: Rect = { x: 108, y: 1106, w: 624, h: 12 };
const SEP_BOTTOM: Rect = { x: 18, y: 1316, w: 714, h: 12 };

/** 一张九宫/平铺图的挂载描述（`HUD_ART_SPEC` 同时被构建与断言用）。 */
export interface HudArtSpec {
  readonly name: string;
  readonly tex: HudTex;
  /** 屏幕坐标（左上原点） */
  readonly rect: Rect;
  readonly mode: 'sliced' | 'tiled';
}

/**
 * 控制台 + 结算面板里所有九宫图的位置表。
 *
 * 位置全部取自 `view/layout.ts`（web 与 Cocos 共用同一份 layout）：技能格 `skillSlotRect(i)`
 * （88×88，间距 10）、`BTN_ASSAULT` / `BTN_RETREAT`（204×84）、`MESSAGE_BOX`（392×84）、
 * `PORTRAIT`（86×108）。
 */
export const HUD_ART_SPEC: readonly HudArtSpec[] = [
  { name: 'HudPortrait', tex: 'port', rect: PORTRAIT, mode: 'sliced' },
  { name: 'SkillSlot1', tex: 'slot', rect: skillSlotRect(0), mode: 'sliced' },
  { name: 'SkillSlot2', tex: 'slot', rect: skillSlotRect(1), mode: 'sliced' },
  { name: 'SkillSlot3', tex: 'slot', rect: skillSlotRect(2), mode: 'sliced' },
  { name: 'SkillSlot4', tex: 'slot', rect: skillSlotRect(3), mode: 'sliced' },
  { name: 'SepTop', tex: 'sep', rect: SEP_TOP, mode: 'tiled' },
  { name: 'CmdBtnAssault', tex: 'cmd_off', rect: BTN_ASSAULT, mode: 'sliced' },
  { name: 'CmdBtnRetreat', tex: 'cmd_on', rect: BTN_RETREAT, mode: 'sliced' },
  { name: 'MsgBox', tex: 'msg', rect: MESSAGE_BOX, mode: 'sliced' },
  { name: 'SepBottom', tex: 'sep', rect: SEP_BOTTOM, mode: 'tiled' },
  { name: 'SettleFrame', tex: 'msg', rect: SETTLE_FRAME, mode: 'sliced' },
  { name: 'SettleSep', tex: 'sep', rect: SETTLE_SEP, mode: 'tiled' },
];

/** 技能格 4 格的技序：与 web `battleView.ts:299` 的 `DEFAULT_SKILL_SEQ` 一致。 */
export const DEFAULT_SKILL_SEQ: readonly number[] = [1, 50, 2, 104];

/** `skillKindOf()` 的三种类别 → 显示字（web 是「療 / 範圍 / 單體」）。 */
const SKILL_KIND_TEXT: Readonly<Record<'heal' | 'strike' | 'aoe', string>> = {
  heal: '療',
  strike: '單體',
  aoe: '範圍',
};

// ---------------------------------------------------------------------------
// 顶栏时间牌（原作 `[0x4AC35C]` 倒计时）
// ---------------------------------------------------------------------------

/**
 * 倒计时 `[0x4AC35C]` 每计数 120 帧 = 2 秒（`0x78=120`）。
 * 我们 `TICK_HZ=60`（R192 从 30 Hz 提到 60 Hz 对齐原作 66–79 Hz 实测），
 * 一个引擎 tick 就是一帧 ⇒ 1 单位 = 120 tick。
 *
 * 反汇编证据（`project/180_战斗HUD对齐.md` §1）：`[0x4AC35C]` 初值 `0x2E68=11880`，
 * 每帧 −1，到 0 调 `0x443CA8(0x1000)` 置战斗结束位；亮出来的是
 * `0x443F2A()=(0x2E68-[0x4AC35C])/0x78`，`0x78=120` ⇒ 起始 99、0.5/秒、整场 198 秒。
 */
export const CLOCK_UNIT_TICKS = 120;

/** 中文数字（与 web `battleView.ts:1695` 的 `CN_DIGIT` 同一张表，下标即数字）。 */
const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

/**
 * 0..99 → 中文数字（「零」「十」「六十」「九十九」）。
 *
 * 逻辑逐字抄 web `battleView.ts:1698 chineseNumber()`：夹到 0..99、`tens===1` 时省掉「一」、
 * `ones===0` 时只写「X十」。别在这里另编一套（两边的牌面要一模一样）。
 */
export function chineseNumber(n: number): string {
  const v = Math.min(99, Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0)));
  const tens = Math.floor(v / 10);
  const ones = v % 10;
  if (tens === 0) return CN_DIGIT[ones]!;
  const head = tens === 1 ? '' : CN_DIGIT[tens]!;
  return ones === 0 ? `${head}十` : `${head}十${CN_DIGIT[ones]!}`;
}

/**
 * 剩余显示单位 = `99 − floor(tick/120)`，夹到 0..99。
 *
 * 等价于题面要求的 `ceil((11880−tick)/120)`（在 0..11880 区间上逐点相等），
 * 但上限直接读内核的 `BATTLE_TICK_LIMIT`，内核改时限时这里不用跟着改。
 */
export function clockUnitsLeft(tick: number): number {
  const units = Math.max(1, Math.round(BATTLE_TICK_LIMIT / CLOCK_UNIT_TICKS));
  const left = units - Math.floor(Math.max(0, tick) / CLOCK_UNIT_TICKS);
  return Math.min(units, Math.max(0, left));
}

/**
 * 金牌位置。原作是横屏、牌子挂在底部 HUD 带上沿中央；竖版把 HUD 挪到顶部，
 * 牌子就落在顶栏正中、微微探出深色圆角面板的上沿（y=10 < 面板顶 22）。
 *
 * 宽度 154 是顶栏中间那段空档（两条兵力条 16..296 / 454..734）的实际宽度：
 * web 的 214 宽是横着排的，竖版照搬会压住两边的兵力条。
 */
const CLOCK_PLAQUE: Rect = { x: 298, y: 10, w: 154, h: 48 };

/**
 * 牌面色板 —— 逐层抄 web `drawClockPlaque()`（`battleView.ts:1714`）：
 * 深木外框 → 金板 → 米色内芯 → 木纹横线 → 墨字。色值一个不改，两张牌才对得上。
 */
const CLOCK_PLATE_OUTER = '#241610';
const CLOCK_PLATE_GOLD = '#b08a4e';
const CLOCK_PLATE_FACE = '#f2e4bf';
const CLOCK_PLATE_GRAIN = '#8a6f3e';
/** 牌面文字色（web 的 `#2a1c0c`；Cocos 的 hexColor 不分大小写，这里统一大写）。 */
const CLOCK_PLATE_INK = '#2A1C0C';

// ---------------------------------------------------------------------------
// 底部主将卡（原作左右各一块）
// ---------------------------------------------------------------------------

/** 左卡（我方）：`view/layout` 的 `GENERAL_INFO`（116,1012,250,100）。 */
const CARD_A: Rect = { x: 116, y: 1012, w: 250, h: 100 };
/** 右卡（敌方）：web `GENERAL_CARD_B`（366,1012,151,100）——竖版这块位置正好空着。 */
const CARD_B: Rect = { x: 366, y: 1012, w: 151, h: 100 };
/** 内侧列相对卡左边的偏移（web `GENERAL_CARD_COL = 124`）。 */
const CARD_COL = 124;

/**
 * 卡片行位：**逐项对应 web `GENERAL_CARD_Y`**（`game/src/view/layout.ts:115-127`）。
 *
 * | 本文件 | web `GENERAL_CARD_Y` | 内容 |
 * |---|---|---|
 * | `CARD_ROW_NAME` 1025 | `name` 1028 | 名字（22px，web `FONT.h2`） |
 * | `CARD_ROW_MP` 1024 | `mp` 1028 | `技 x/y`（10px，贴名字行内列） |
 * | `CARD_ROW_TROOP` 1040 | `troopText` 1046 | `兵 x/y`（16px，web `numSize = FONT.small`） |
 * | `CARD_ROW_HP` 1056 | `hpText` 1062 | `體 x/y`（16px） |
 * | `CARD_ROW_STAT_A` 1070 | `statA` 1076 | 疲 / 士（13px，web 同号） |
 * | `CARD_ROW_STAT_B` 1084 | `statB` 1090 | 智 / 武 |
 * | `CARD_ROW_ACTION` 1090 | `actionBar` 1094 | 行动条 + 右端「行」字 |
 *
 * **换算说明**：web 的 y 是 canvas `fillText` 的**字母基线**，Cocos `placeOn` 给的是**盒中心**
 * （`verticalAlign = CENTER`）。两边差 ≈ 0.35×字号：正文 18px 是 6px（project/156 §7.1 实测），
 * 名字 22px 沿用已验收的 1025（= 1028 − 3），10~12px 小字 − 4。改这组数要连着看
 * project/156 §7.1、project/180 §2、project/194（本卡版式）。
 */
const CARD_ROW_NAME = 1025;
const CARD_ROW_MP = 1024;
const CARD_ROW_TROOP = 1040;
const CARD_ROW_HP = 1056;
const CARD_ROW_STAT_A = 1070;
const CARD_ROW_STAT_B = 1084;
const CARD_ROW_ACTION = 1090;

/** 兵 / 體 两条横条的**顶边**，与 web `troopBar 1034` / `hpBar 1050` 同值（条高 8）。 */
const CARD_BAR_TOP_TROOP = 1034;
const CARD_BAR_TOP_HP = 1050;
/** 条高 8px（web `GENERAL_CARD_BAR_H`）。 */
const CARD_BAR_H = 8;

/**
 * 数值文本的预留宽：web `GENERAL_CARD_VITAL_W = 88`（我方）/ `_B = 72`（敌方）。
 *
 * **换算**：Cocos 的两块卡框与 web **完全同尺寸**（116/250 与 366/151，同一个 `view/layout`），
 * 所以这两个数不需要按比例缩，直接照抄；条宽 = 卡宽 − 预留宽 − 4（靠画面中心那侧让 4px，
 * 两张卡正好在 x = 366 相接）。Cocos 没有 `measureText`，数值文本的宽只能给常量，
 * 88 宽在 16px 下能放下 `兵 999/999`（9 字 ≈ 81px），72 宽在 13px 下能放下 `兵 999/999`。
 */
const CARD_VITAL_W_A = 88;
const CARD_VITAL_W_B = 72;

/** 一条 兵/體 条的几何与颜色（绘制与断言共用同一份数据）。 */
export interface CardBarRect {
  readonly side: 'A' | 'B';
  readonly kind: 'troop' | 'hp';
  readonly rect: Rect;
  readonly color: string;
}

/**
 * 兵/體 两条 × 两块卡 = 4 条 8px bar，几何与 web `drawGeneralCard()` 逐项同源：
 * `barX = mirror ? card.x + 4 : card.x + vitalW`、`barW = card.w − vitalW − 4`。
 */
export const GENERAL_CARD_BARS: readonly CardBarRect[] = [
  {
    side: 'A', kind: 'troop', color: COLORS.oursLight,
    rect: { x: CARD_A.x + CARD_VITAL_W_A, y: CARD_BAR_TOP_TROOP, w: CARD_A.w - CARD_VITAL_W_A - 4, h: CARD_BAR_H },
  },
  {
    side: 'A', kind: 'hp', color: COLORS.heal,
    rect: { x: CARD_A.x + CARD_VITAL_W_A, y: CARD_BAR_TOP_HP, w: CARD_A.w - CARD_VITAL_W_A - 4, h: CARD_BAR_H },
  },
  {
    side: 'B', kind: 'troop', color: COLORS.enemyLight,
    rect: { x: CARD_B.x + 4, y: CARD_BAR_TOP_TROOP, w: CARD_B.w - CARD_VITAL_W_B - 4, h: CARD_BAR_H },
  },
  {
    side: 'B', kind: 'hp', color: COLORS.heal,
    rect: { x: CARD_B.x + 4, y: CARD_BAR_TOP_HP, w: CARD_B.w - CARD_VITAL_W_B - 4, h: CARD_BAR_H },
  },
];

/** 行动条：原作没有，web 压成块内一条 3px 细 bar（`battleView.ts:2051`），只画我方。 */
const CARD_GAUGE: Rect = { x: CARD_A.x, y: 1094, w: CARD_A.w - 12, h: 3 };
/** 行动条右端那个 9px 的「行」字（web 同一行；Cocos 用 caption 12px 落在 CARD_ROW_ACTION）。 */
const CARD_GAUGE_LABEL_X = CARD_A.x + CARD_A.w;
/** 两卡之间的竖发丝线：x 恒为左卡右沿，只盖两卡的段位行（原作这里是「主將 對 主將」中栏）。 */
const CARD_DIVIDER_X = 366;
const CARD_DIVIDER_BOTTOM = 1106;
const CARD_DIVIDER_H = 92;

/** 结算 6 行的行距 / 首行 y（web `drawSettle()`：316 + i*42）。 */
const ROW_Y0 = 316;
const ROW_GAP = 42;
/** 再战按钮（金底）上的副标题色：比主字淡一档的深棕，压得住又不像纯黑。 */
const AGAIN_SUB_COLOR = '#4A4232';

type Align = 'left' | 'center' | 'right';

function makeNode(name: string, parent: Node): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  node.parent = parent;
  node.addComponent(UITransform);
  return node;
}

function transformOf(node: Node): UITransform {
  const transform = node.getComponent(UITransform);
  if (transform) return transform;
  return node.addComponent(UITransform);
}

/** 屏幕坐标（左上原点）→ 相对某个父节点的局部坐标。 */
function placeOn(node: Node, parent: Node, screenX: number, screenY: number): void {
  const world = toLocal(screenX, screenY);
  const base = parent.position;
  node.setPosition(world.x - base.x, world.y - base.y, 0);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

/**
 * 战斗页 HUD：控制台（头像框 / 主将信息 / 3 条资源条 / 4 技能格 / 突擊·撤退 / 消息栏 /
 * 上下分隔线）+ 结算面板。由 `BattleRoot.buildUi()` 创建一次，之后每帧 `refresh()` 只改字。
 */
export class BattleHud {
  /** 根节点（`BattleHud`），在 `BattleRoot` 里位于单位/天气之上、`ScreenTint` 之下。 */
  readonly root: Node;
  /** 控制台组（`HudConsole`）：结算时整组压到 16% 不透明度，和 web `#battleui` 一致。 */
  private readonly consoleRoot: Node;
  private readonly consoleOpacity: UIOpacity;
  /** 结算层（`SettleLayer`）：整组隐藏，结算后显示。 */
  private readonly settleRoot: Node;

  /** 已加载的九宫图（缺图时保持 null，对应 sprite 就是隐形的，行为与 web 缺图一致）。 */
  private readonly frames: Partial<Record<HudTex, SpriteFrame | null>> = {};
  /** 各九宫 sprite 的当前状态（决定挂 slot/slot_off、cmd_on/cmd_off）。 */
  private readonly slotOn: boolean[] = [true, true, true, true, true, true, true, true];
  private retreatOn = false;
  /** 突擊态：按钮换 cmd_on 底图（文字由 refreshConsole 改「突擊中」） */
  private assaultOn = false;
  /** 结算美术只画一次（Graphics 清空重画 ~30 个 op，没必要每帧来一遍）。 */
  private settlementPainted = false;

  private readonly portraitSprite: Sprite;
  /**
   * 真肖像（`face/full/<編號>`，100×120）：放在 `consoleRoot` 的 0 号子节点。
   *
   * web `drawConsole()` 的顺序是「先铺脸、再把金框九宫压上去」（`battleView.ts:2170-2187`），
   * 而 Cocos 的子节点顺序就是渲染顺序，所以脸必须是第一个子节点，`HudPortrait` 盖在它前面；
   * cover 铺满时多出来的左右各 2px 正好被框的不透明边吃掉，不需要 Mask。
   */
  private readonly face: ArtSprite;
  /** 这张脸是给谁载的（换将才重载；载失败也记名字，免得每帧重试同一套降级链）。 */
  private faceName = '';
  /** `none` = 没脸（走「將」占位版式）/ `loading` / `ready` = 有真图（走徽章版式）。 */
  private faceState: 'none' | 'loading' | 'ready' = 'none';
  /** 有肖像时右下角的 Lv 小徽章：深色底板（Graphics）+ 12px 金字（`caption` 角色）。 */
  private readonly faceBadgeGfx: Graphics;
  private faceBadge!: Label;
  /** 开场叫阵台词框（常驻节点、默认隐藏；叫阵期间由 BattleRoot 驱动） */
  private readonly tauntRoot: Node;
  private readonly tauntWho: Label;
  private readonly tauntTag: Label;
  private readonly tauntLine: Label;
  private readonly slotSprites: Sprite[] = [];
  private readonly assaultSprite: Sprite;
  private readonly retreatSprite: Sprite;
  private readonly msgSprite: Sprite;
  private readonly sepSprites: Sprite[] = [];
  private readonly settleFrameSprite: Sprite;
  private readonly settleSepSprite: Sprite;
  /** 三种九宫图（port / msg / sep）共用的 sprite 一律记在这里，`applyFrames()` 直接铺。 */
  private readonly artByName = new Map<string, Sprite>();

  private readonly barGfx: Graphics;
  private readonly settleArt: Graphics;

  // ---- 控制台文字 ----
  private glyph!: Label;
  private portraitLevel!: Label;
  private generalName!: Label;
  private generalState!: Label;
  // ---- 底部主将卡（原作左右各一块；版式见 project/194 与 web `drawGeneralCard()`）----
  /**
   * 4 条 8px 兵/體 条的几何（**公开**：给 `work/cocos_hud2/hud_assert.mjs` 在页面里
   * 直接比对「画出来的 bar 与 web 同一组矩形」，不用反推 Graphics 的绘制指令）。
   */
  readonly cardBars: readonly CardBarRect[] = GENERAL_CARD_BARS;
  /** 「行」3px 行动条的几何（**公开**：同 `cardBars`，给页面内断言读「高度 ≤ 4」）。 */
  readonly cardActionBar: Rect = CARD_GAUGE;
  /** 左卡「兵 x/y」 */
  private cardTroopA!: Label;
  /** 左卡「體 x/y」 */
  private cardHpA!: Label;
  /** 左卡「技 x/y」（10px 小字，贴名字行内列） */
  private cardSkillA!: Label;
  /** 左卡四个裸数字：[疲, 士, 智, 武]（左/右列，不占行位） */
  private readonly cardNumA: Label[] = [];
  /** 右卡名（敵將）与状态字 */
  private cardNameB!: Label;
  private cardStateB!: Label;
  private cardTroopB!: Label;
  /** 右卡「體 x/y」 */
  private cardHpB!: Label;
  private cardSkillB!: Label;
  /** 右卡四个裸数字（整块镜像：[疲, 士, 智, 武]，x/对齐都翻过来） */
  private readonly cardNumB: Label[] = [];
  /** 「行」字（行动条右端） */
  private cardGaugeLabel!: Label;
  // ---- 顶栏时间牌 ----
  private readonly clockRoot: Node;
  private readonly clockGfx: Graphics;
  private clockLabel!: Label;
  /** 牌面是静态的（木纹/金框），只画一次；每帧只改字 */
  private clockPainted = false;
  private readonly skillIndex: Label[] = [];
  private readonly skillName: Label[] = [];
  private readonly skillKind: Label[] = [];
  private readonly skillCost: Label[] = [];
  private assaultLabel!: Label;
  private assaultSub!: Label;
  private retreatLabel!: Label;
  private retreatSub!: Label;
  private msgLine1!: Label;
  private msgLine2!: Label;
  private msgHint!: Label;
  private metaLine!: Label;

  // ---- 结算文字 ----
  private settleTitle!: Label;
  private settleSub!: Label;
  private readonly settleKey: Label[] = [];
  private readonly settleVal: Label[] = [];
  private settleExp!: Label;
  private settleExpNext!: Label;
  private settleMeta!: Label;
  /** 战报短句（守城戰 · 城池失守 / 大勝 · 我軍大獲全勝…），胜负色，单独一行。 */
  private settleReport!: Label;
  private settleNote!: Label;
  private settleAgainLabel!: Label;
  private settleAgainSub!: Label;

  constructor(parent: Node) {
    this.root = makeNode('BattleHud', parent);
    transformOf(this.root).setContentSize(DESIGN_W, DESIGN_H);

    this.consoleRoot = makeNode('HudConsole', this.root);
    transformOf(this.consoleRoot).setContentSize(DESIGN_W, DESIGN_H);
    this.consoleOpacity = this.consoleRoot.addComponent(UIOpacity);
    this.consoleRoot.active = false; // 没开战（加载 data）时和以前一样只有一行状态字

    // ---- 九宫图：先铺图，再铺字（子节点顺序 = 渲染顺序） ----
    for (const spec of HUD_ART_SPEC) {
      if (spec.name === 'SettleFrame' || spec.name === 'SettleSep') continue; // 结算层单独建
      this.artByName.set(spec.name, this.createArt(spec, this.consoleRoot));
    }
    this.portraitSprite = this.artByName.get('HudPortrait') as Sprite;
    // ---- 头像真肖像：金框已经在上面了，脸放 0 号子节点（先渲染 = 压在框下面）----
    this.face = new ArtSprite(this.consoleRoot, 'HudFace', PORTRAIT, 'stretch');
    this.face.node.setSiblingIndex(0);
    this.face.setVisible(true); // 只记「想显示」；图没到之前节点是关的，由 apply() 打开
    this.assaultSprite = this.artByName.get('CmdBtnAssault') as Sprite;
    this.retreatSprite = this.artByName.get('CmdBtnRetreat') as Sprite;
    this.msgSprite = this.artByName.get('MsgBox') as Sprite;
    this.sepSprites.push(this.artByName.get('SepTop') as Sprite, this.artByName.get('SepBottom') as Sprite);
    // 4 格用 HUD_ART_SPEC 的老版式；5~8 格在下面补建（初始放在两行版式的坐标上，显示时再按实际条数排）
    const slotRects = skillSlotRects(MAX_SKILL_SLOTS);
    for (let i = 4; i < MAX_SKILL_SLOTS; i += 1) {
      const spec: HudArtSpec = { name: `SkillSlot${i + 1}`, tex: 'slot', rect: slotRects[i], mode: 'sliced' };
      this.artByName.set(spec.name, this.createArt(spec, this.consoleRoot));
    }
    for (let i = 0; i < MAX_SKILL_SLOTS; i += 1) {
      this.slotSprites.push(this.artByName.get(`SkillSlot${i + 1}`) as Sprite);
    }

    // 资源条：Graphics 画在九宫图之上、文字之下
    this.barGfx = makeNode('HudBars', this.consoleRoot).addComponent(Graphics);
    transformOf(this.barGfx.node).setContentSize(DESIGN_W, DESIGN_H);

    // ---- 头像框里的字 ----
    this.glyph = this.makeLabel(this.consoleRoot, 'PortraitGlyph', 'hero', 61, 1062, 70, 'center', COLORS.goldLight);
    this.glyph.string = '將';
    this.portraitLevel = this.makeLabel(this.consoleRoot, 'PortraitLevel', 'num', 61, 1102, 76, 'center', COLORS.textDim);
    // 有肖像时 Lv 不压在人脸上，改成右下角 40×20 徽章（与 web `battleView.ts:2195-2202` 同几何）
    const badgeNode = makeNode('PortraitBadge', this.consoleRoot);
    this.faceBadgeGfx = badgeNode.addComponent(Graphics);
    transformOf(badgeNode).setContentSize(DESIGN_W, DESIGN_H);
    this.faceBadgeGfx.fillColor = hexColor('#0A0C10', 199); // web: rgba(10,12,16,.78)
    this.faceBadgeGfx.roundRect(
      PORTRAIT.x + PORTRAIT.w - 40 - HALF_W, HALF_H - (PORTRAIT.y + PORTRAIT.h), 40, 20, 4,
    );
    this.faceBadgeGfx.fill();
    // web 这行字是 12px、基线 1104（`T` 默认 textBaseline='alphabetic'）；Cocos 的 `placeOn`
    // 给的是盒中心，这里取徽章几何中心（1100..1120 → 1110），字整行落在深底内更好读。
    this.faceBadge = this.makeLabel(
      this.consoleRoot, 'PortraitBadgeLv', 'caption',
      PORTRAIT.x + PORTRAIT.w - 20, PORTRAIT.y + PORTRAIT.h - 10, 40, 'center', COLORS.gold,
    );
    badgeNode.active = false;
    this.faceBadge.node.active = false;

    // ---- 开场叫阵台词框（几何照 web `TAUNT_BANNER`；只在叫阵期间显示）----
    this.tauntRoot = makeNode('TauntBanner', this.consoleRoot);
    const tauntGfx = this.tauntRoot.addComponent(Graphics);
    transformOf(this.tauntRoot).setContentSize(DESIGN_W, DESIGN_H);
    tauntGfx.fillColor = hexColor('#06080E', 219);          // web: rgba(6,8,14,.86)
    tauntGfx.strokeColor = hexColor(COLORS.gold, 235);
    tauntGfx.lineWidth = 2;
    tauntGfx.roundRect(
      TAUNT_BANNER.x - HALF_W, HALF_H - (TAUNT_BANNER.y + TAUNT_BANNER.h),
      TAUNT_BANNER.w, TAUNT_BANNER.h, 8,
    );
    tauntGfx.fill();
    tauntGfx.stroke();
    this.tauntWho = this.makeLabel(
      this.consoleRoot, 'TauntWho', 'subtitle',
      TAUNT_BANNER.x + 18, TAUNT_BANNER.y + 26, 220, 'left', COLORS.goldLight,
    );
    this.tauntTag = this.makeLabel(
      this.consoleRoot, 'TauntTag', 'caption',
      TAUNT_BANNER.x + TAUNT_BANNER.w - 18, TAUNT_BANNER.y + 26, 90, 'right', COLORS.gold,
    );
    this.tauntTag.string = '叫 陣';
    this.tauntLine = this.makeLabel(
      this.consoleRoot, 'TauntLine', 'subtitle',
      TAUNT_BANNER.x + TAUNT_BANNER.w / 2, TAUNT_BANNER.y + TAUNT_BANNER.h / 2 + 16,
      TAUNT_BANNER.w - 56, 'center', COLORS.text,
    );
    this.tauntRoot.active = false;
    // 三个 Label 挂在 consoleRoot 上（不在 tauntRoot 里，避免摆位受父节点缩放影响），
    // 所以收起时必须逐个关——R212 首验只关了底板，播完还剩「關羽 / 叫 陣 / 台词」浮在阵上。
    this.setTauntLabels(false);

    // ---- 主将信息块（web drawConsole：名字 116,1036 / 武智 1052 / 在陣右對齊 366,1036）----
    // 坐标对齐说明：web 的 `fillText` 给的是**基线**，Cocos 的 `placeOn` 给的是**盒中心**
    // （`verticalAlign = CENTER`）。同一字号下基线与中心的差约 11px，所以这里统一 −11 才是
    // 与 web 同一条视觉基线（h3 在 `project\156` §7.1 量出的差值）；改这三个数要连着改。
    // ---- 底部主将卡（原作左右各一块；竖版放在控制台上沿 1012..1112）----
    // 四字段 = 疲勞 / 士氣 / 武力 / 智力（project/180 §2 的反汇编+截帧证据）。左卡外侧列
    // x=116（疲/智）、内侧列 x=240（= 116 + GENERAL_CARD_COL 124，士/武）；右卡整块镜像：
    // 外侧列贴右边缘 517、内侧列 x=370，读出来的顺序与原作右块「78 | 20 / 100 | 66」一致。
    // y 口径见 project/156 §7.1：web `fillText` 给基线、Cocos `placeOn` 给盒中心，
    // 所以行中心 = web 基线 − 字号/2（三张表里 1028/1048/1068/1086 的折算值见 CARD_ROW_*）。
    this.generalName = this.makeLabel(
      this.consoleRoot, 'GeneralName', 'subtitle', CARD_A.x, CARD_ROW_NAME, 170, 'left', COLORS.text,
    );
    this.generalState = this.makeLabel(
      this.consoleRoot, 'GeneralState', 'body', CARD_A.x + CARD_COL + 100, CARD_ROW_NAME, 110, 'right', COLORS.ok,
    );
    // ---- 主将卡版式（照抄 web `battleView.ts:1970-2054 drawGeneralCard()`，project/194）----
    // 每块卡从上到下三件东西：
    //   1) 名字行：名字（左卡 22px / 右卡 18px）+ 状态字 + 内列的 `技 x/y`（10px 小字，不占行位）；
    //   2) 兵 / 體 各一条 8px 横条，**条压在数值同一行外侧**（web 注释：86px 高的卡放不下
    //      「条在数值上方」的原作布局），数值在里、条在靠近画面中心那侧，敌方整块镜像；
    //   3) 四个裸数字：疲 士 / 智 武（外侧列 疲/智、内侧列 士/武），13px（`stat` 角色，
    //      与 web `T(..., 13, textDim)` 同号）；web 注释说 16px 会叠字，收到 13 才刚好。
    // 竖版把这块放在控制台上沿 1012..1112，卡框与 web 完全同尺寸（见 CARD_A / CARD_B）。
    this.cardTroopA = this.makeLabel(
      this.consoleRoot, 'CardTroopA', 'vital', CARD_A.x, CARD_ROW_TROOP, CARD_VITAL_W_A, 'left', COLORS.oursLight,
    );
    this.cardHpA = this.makeLabel(
      this.consoleRoot, 'CardHpA', 'vital', CARD_A.x, CARD_ROW_HP, CARD_VITAL_W_A, 'left', COLORS.heal,
    );
    // `技` 在名字行里：web 是 10px（`T(mpX, 1028, vitalText('技',...), 10, textDim)`），
    // 位置 x = CARD_A.x + GENERAL_CARD_COL（左卡）/ CARD_B.x + 48（右卡镜像）。
    this.cardSkillA = this.makeLabel(
      this.consoleRoot, 'CardSkillA', 'micro', CARD_A.x + CARD_COL, CARD_ROW_MP, 90, 'left', COLORS.textDim,
    );
    // 四个裸数字：0=疲 1=士（上排）/ 2=智 3=武（下排）；偶数是外侧列、奇数是内侧列。
    for (let i = 0; i < 4; i += 1) {
      const y = i < 2 ? CARD_ROW_STAT_A : CARD_ROW_STAT_B;
      const x = i % 2 === 0 ? CARD_A.x : CARD_A.x + CARD_COL;
      this.cardNumA.push(
        this.makeLabel(this.consoleRoot, `CardNumA${i}`, 'stat', x, y, 110, 'left', COLORS.textDim),
      );
    }
    // 右卡（敌方）：151 宽，整块镜像——名字靠屏边（右对齐 517）、状态字朝画面中心（x=370 左对齐），
    // 兵/體 与四个裸数字都换成 `stat` 13px（web `numSize = mirror ? 13 : 16` 逐字同号）。
    this.cardNameB = this.makeLabel(
      this.consoleRoot, 'CardNameB', 'body', CARD_B.x + CARD_B.w, CARD_ROW_NAME, 96, 'right', COLORS.enemyLight,
    );
    this.cardStateB = this.makeLabel(
      this.consoleRoot, 'CardStateB', 'caption', CARD_B.x + 4, CARD_ROW_NAME, 48, 'left', COLORS.ok,
    );
    this.cardTroopB = this.makeLabel(
      this.consoleRoot, 'CardTroopB', 'stat', CARD_B.x + CARD_B.w, CARD_ROW_TROOP, CARD_VITAL_W_B, 'right', COLORS.enemyLight,
    );
    this.cardHpB = this.makeLabel(
      this.consoleRoot, 'CardHpB', 'stat', CARD_B.x + CARD_B.w, CARD_ROW_HP, CARD_VITAL_W_B, 'right', COLORS.heal,
    );
    this.cardSkillB = this.makeLabel(
      this.consoleRoot, 'CardSkillB', 'micro', CARD_B.x + 48, CARD_ROW_MP, 60, 'left', COLORS.textDim,
    );
    for (let i = 0; i < 4; i += 1) {
      const y = i < 2 ? CARD_ROW_STAT_A : CARD_ROW_STAT_B;
      const outer = i % 2 === 0;
      this.cardNumB.push(
        this.makeLabel(
          this.consoleRoot,
          `CardNumB${i}`,
          'stat',
          outer ? CARD_B.x + CARD_B.w : CARD_B.x + 4,
          y,
          76,
          outer ? 'right' : 'left',
          COLORS.textDim,
        ),
      );
    }
    // 行动条右端那个 9px 的「行」（web `battleView.ts:2052` 同一行；Cocos 用 caption 12px）。
    this.cardGaugeLabel = this.makeLabel(
      this.consoleRoot, 'CardGaugeLabel', 'caption', CARD_GAUGE_LABEL_X, CARD_ROW_ACTION, 24, 'right', COLORS.textFaint,
    );
    this.cardGaugeLabel.string = '行';

    // ---- 技能格（最多 8；真实条数由某将的习得技决定，见 refreshConsole） ----
    for (let i = 0; i < MAX_SKILL_SLOTS; i += 1) {
      const slot = slotRects[i];
      const cx = slot.x + slot.w / 2;
      const parent = (this.artByName.get(`SkillSlot${i + 1}`) as Sprite).node;
      this.skillIndex.push(this.makeLabel(parent, `SkillIndex${i + 1}`, 'num', slot.x + 8, slot.y + 14, 36, 'left', COLORS.textFaint));
      this.skillName.push(this.makeLabel(parent, `SkillName${i + 1}`, 'body', cx, slot.y + 36, slot.w - 10, 'center', COLORS.text));
      this.skillKind.push(this.makeLabel(parent, `SkillKind${i + 1}`, 'caption', cx, slot.y + 57, slot.w - 10, 'center', COLORS.textDim));
      this.skillCost.push(this.makeLabel(parent, `SkillCost${i + 1}`, 'caption', cx, slot.y + 78, slot.w - 8, 'center', COLORS.goldDim));
    }

    // ---- 命令按钮 ----
    this.assaultLabel = this.makeLabel(this.consoleRoot, 'CmdLabelAssault', 'subtitle', 630, 1158, BTN_ASSAULT.w - 20, 'center', COLORS.textDim);
    this.assaultSub = this.makeLabel(this.consoleRoot, 'CmdSubAssault', 'caption', 630, 1186, BTN_ASSAULT.w - 20, 'center', COLORS.textFaint);
    this.retreatLabel = this.makeLabel(this.consoleRoot, 'CmdLabelRetreat', 'subtitle', 630, 1254, BTN_RETREAT.w - 20, 'center', COLORS.text);
    this.retreatSub = this.makeLabel(this.consoleRoot, 'CmdSubRetreat', 'caption', 630, 1282, BTN_RETREAT.w - 20, 'center', COLORS.textDim);

    // ---- 消息栏 ----
    this.msgLine1 = this.makeLabel(this.consoleRoot, 'MsgLine1', 'body', 128, 1250, MESSAGE_BOX.w - 24, 'left', COLORS.text);
    this.msgLine2 = this.makeLabel(this.consoleRoot, 'MsgLine2', 'caption', 128, 1272, MESSAGE_BOX.w - 24, 'left', COLORS.textDim);
    this.msgHint = this.makeLabel(this.consoleRoot, 'MsgHint', 'caption', 496, 1296, 60, 'right', COLORS.textFaint);
    this.msgHint.string = '1-8 / R';

    // ---- 控制台右上的元信息（出征/守城 + 连胜），替代原来压在控制台里的两行 General 文本 ----
    this.metaLine = this.makeLabel(this.consoleRoot, 'HudMeta', 'caption', 734, 1006, 340, 'right', COLORS.textDim);

    // =====================================================================
    // 结算层
    // =====================================================================
    this.settleRoot = makeNode('SettleLayer', this.root);
    transformOf(this.settleRoot).setContentSize(DESIGN_W, DESIGN_H);
    this.settleRoot.active = false;

    // 遮罩只盖战场带（100..1000）：顶栏要看得到兵力，控制台自己压暗（和 web 的 .16 一致）
    const shade = makeNode('SettleShade', this.settleRoot).addComponent(Graphics);
    transformOf(shade.node).setContentSize(DESIGN_W, DESIGN_H);
    shade.fillColor = hexColor('#06080C', 199);
    shade.rect(0, HALF_H - 100 - 900, DESIGN_W, 900);
    shade.fill();

    this.settleArt = makeNode('SettleArt', this.settleRoot).addComponent(Graphics);
    transformOf(this.settleArt.node).setContentSize(DESIGN_W, DESIGN_H);

    for (const spec of HUD_ART_SPEC) {
      if (spec.name !== 'SettleFrame' && spec.name !== 'SettleSep') continue;
      this.artByName.set(spec.name, this.createArt(spec, this.settleRoot));
    }
    this.settleFrameSprite = this.artByName.get('SettleFrame') as Sprite;
    this.settleSepSprite = this.artByName.get('SettleSep') as Sprite;

    this.settleTitle = this.makeLabel(this.settleRoot, 'SettleTitle', 'hero', 375, 198, 500, 'center', COLORS.gold);
    this.settleSub = this.makeLabel(this.settleRoot, 'SettleSub', 'subtitle', 375, 238, 540, 'center', COLORS.textDim);
    for (let i = 0; i < 6; i += 1) {
      const y = ROW_Y0 + i * ROW_GAP;
      this.settleKey.push(this.makeLabel(this.settleRoot, `SettleKey${i + 1}`, 'body', 132, y, 220, 'left', COLORS.textDim));
      this.settleVal.push(this.makeLabel(this.settleRoot, `SettleVal${i + 1}`, 'num', 618, y, 260, 'right', COLORS.text));
    }
    this.settleExp = this.makeLabel(this.settleRoot, 'SettleExp', 'num', 132, 630, 300, 'left', COLORS.goldLight);
    this.settleExpNext = this.makeLabel(this.settleRoot, 'SettleExpNext', 'num', 618, 630, 260, 'right', COLORS.textDim);
    this.settleMeta = this.makeLabel(this.settleRoot, 'SettleMeta', 'caption', 375, 660, 560, 'center', COLORS.textFaint);
    this.settleReport = this.makeLabel(this.settleRoot, 'SettleReport', 'caption', 375, 688, 560, 'center', COLORS.gold);
    this.settleNote = this.makeLabel(this.settleRoot, 'SettleNote', 'caption', 375, 714, 560, 'center', COLORS.textFaint);
    this.settleAgainLabel = this.makeLabel(this.settleRoot, 'SettleAgainLabel', 'subtitle', 375, 864, AGAIN_BUTTON.w - 20, 'center', COLORS.bgDeep);
    this.settleAgainSub = this.makeLabel(this.settleRoot, 'SettleAgainSub', 'caption', 375, 890, AGAIN_BUTTON.w - 20, 'center', AGAIN_SUB_COLOR);

    // =====================================================================
    // 顶栏时间牌（最后建 ⇒ 压在我軍/敵軍 标签与指令台之上）
    // =====================================================================
    this.clockRoot = makeNode('HudClock', this.root);
    transformOf(this.clockRoot).setContentSize(DESIGN_W, DESIGN_H);
    this.clockRoot.active = false; // 还没开战（加载 data）时不显示，和 consoleRoot 同一条规矩
    this.clockGfx = makeNode('ClockPlaque', this.clockRoot).addComponent(Graphics);
    transformOf(this.clockGfx.node).setContentSize(DESIGN_W, DESIGN_H);
    this.clockLabel = this.makeLabel(
      this.clockRoot,
      'ClockText',
      'clock',
      CLOCK_PLAQUE.x + CLOCK_PLAQUE.w / 2,
      CLOCK_PLAQUE.y + CLOCK_PLAQUE.h / 2,
      CLOCK_PLAQUE.w - 20,
      'center',
      CLOCK_PLATE_INK,
    );
  }

  // -------------------------------------------------------------------------
  // 资源
  // -------------------------------------------------------------------------

  /**
   * 加载 7 张九宫图。失败就保持 null（对应 sprite 隐形），不阻塞战斗。
   *
   * `onReady` 在全部 7 张都处理完（成功或失败）后回调一次，用于「图到齐后重画」。
   */
  load(onReady?: () => void): void {
    let pending = HUD_TEXES.length;
    const done = (): void => {
      pending -= 1;
      if (pending === 0) onReady?.();
    };
    for (const tex of HUD_TEXES) {
      loadFrame(`${HUD_UI_DIR}/${tex}`, (frame) => {
        this.applyFrames({ [tex]: frame });
        done();
      });
    }
  }

  /**
   * 注入九宫图（`load()` 内部用，断言脚本也直接调它注入假 frame）。
   *
   * 每张图写入 `HUD_INSET[tex]` 的四个内缩值，然后按当前状态铺到对应 sprite 上。
   */
  applyFrames(frames: Partial<Record<HudTex, SpriteFrame | null>>): void {
    for (const key of Object.keys(frames) as HudTex[]) {
      const frame = frames[key] ?? null;
      this.frames[key] = frame;
      if (!frame) continue;
      const n = HUD_INSET[key];
      frame.insetLeft = n;
      frame.insetRight = n;
      frame.insetTop = n;
      frame.insetBottom = n;
    }
    this.syncArt();
  }

  /** 按当前状态把 frame 铺到 sprite 上（技能格两态、撤退按钮两态）。 */
  private syncArt(): void {
    this.portraitSprite.spriteFrame = this.frames.port ?? null;
    this.msgSprite.spriteFrame = this.frames.msg ?? null;
    this.assaultSprite.spriteFrame = (this.assaultOn ? this.frames.cmd_on : this.frames.cmd_off) ?? null;
    this.retreatSprite.spriteFrame = (this.retreatOn ? this.frames.cmd_on : this.frames.cmd_off) ?? null;
    for (const sep of this.sepSprites) sep.spriteFrame = this.frames.sep ?? null;
    this.settleFrameSprite.spriteFrame = this.frames.msg ?? null;
    this.settleSepSprite.spriteFrame = this.frames.sep ?? null;
    for (let i = 0; i < this.slotSprites.length; i += 1) {
      this.slotSprites[i].spriteFrame = (this.slotOn[i] ? this.frames.slot : this.frames.slot_off) ?? null;
    }
  }

  private createArt(spec: HudArtSpec, parent: Node): Sprite {
    const node = makeNode(spec.name, parent);
    const transform = transformOf(node);
    const center = rectCenter(spec.rect);
    const p = toLocal(center.x, center.y);
    const base = parent.position;
    node.setPosition(p.x - base.x, p.y - base.y, 0);
    transform.setContentSize(spec.rect.w, spec.rect.h);
    transform.setAnchorPoint(0.5, 0.5);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = spec.mode === 'tiled' ? Sprite.Type.TILED : Sprite.Type.SLICED;
    sprite.spriteFrame = null;
    return sprite;
  }

  /**
   * 建一个 Label。
   *
   * 统一用 `Overflow.SHRINK` + 关换行：Cocos 的 `NONE` 会把节点撑成文字实际宽度并按中心重排，
   * 右对齐/定宽框就失效了（BattleRoot 的 makeLabel 注释里踩过这个坑）。SHRINK 只缩小渲染尺寸，
   * 不改 `fontSize` 属性，所以字号层级仍然是 40/22/18/20/12/10。
   */
  private makeLabel(
    parent: Node,
    name: string,
    role: TextRole,
    screenX: number,
    screenY: number,
    width: number,
    align: Align,
    color: string,
  ): Label {
    const node = makeNode(name, parent);
    const spec = TEXT_ROLES[role];
    transformOf(node).setContentSize(width, Math.round(spec.lineHeight * 1.15));
    // 左/右对齐给的是「框的边」，不是框的中心：锚点固定 0.5，所以要把中心换算过去，
    // 否则 160~560 宽的框会以边为轴两边各伸一半（消息栏会被推到屏幕外、右上元信息会溢出）。
    const centerX = align === 'left' ? screenX + width / 2 : align === 'right' ? screenX - width / 2 : screenX;
    placeOn(node, parent, centerX, screenY);
    const label = node.addComponent(Label);
    label.fontFamily = FONT_FAMILY;
    label.string = '';
    label.color = hexColor(color);
    label.horizontalAlign =
      align === 'left' ? Label.HorizontalAlign.LEFT : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    applyTextRole(label, role);
    return label;
  }

  // -------------------------------------------------------------------------
  // 每帧刷新（只读 World / SettleResult）
  // -------------------------------------------------------------------------

  /**
   * 刷新整块 HUD。
   *
   * @param world      当前世界（null = 还在加载 data，控制台整组隐藏）
   * @param settlement 结算结果（null = 战斗中）；非 null 时显示结算层并把控制台压到 16%
   * @param launch     本局入口信息（出征/守城、从大地图进来的回程文案）
   * @param wiseNote   本局军师技说明（可空），拼进控制台右上的元信息
   */
  refresh(world: World | null, settlement: SettleResult | null, launch: BattleLaunch | null, wiseNote = ''): void {
    const settled = settlement !== null;
    this.consoleRoot.active = world !== null;
    this.consoleOpacity.opacity = settled ? 41 : 255;
    this.settleRoot.active = settlement !== null;
    // 时间牌与战场带上的结算遮罩不重叠（牌在 10..58，遮罩从 100 起），结算后继续显示「零」
    this.clockRoot.active = world !== null;
    if (settlement) this.refreshSettlement(settlement, launch);
    else this.settlementPainted = false; // 重开一局：下一场的面板要重画
    if (!world) return;
    this.refreshConsole(world, launch, wiseNote);
    this.syncArt();
  }

  // -------------------------------------------------------------------------
  // 顶栏时间牌
  // -------------------------------------------------------------------------

  /**
   * 刷新金牌上的中文数字。
   *
   * 语义全部来自内核（`world.tick` + `BATTLE_TICK_LIMIT`），视图不自己推时间：
   * `ceil((11880 − tick)/120)` 与 `clockUnitsLeft()` 等价（见该函数的注释），
   * 起始「九十九」、每 120 tick（2 秒）掉一个字、到「零」时正好是 `endReason = 'time'`。
   */
  private updateClock(tick: number): void {
    if (!this.clockPainted) {
      this.paintClockPlaque();
      this.clockPainted = true;
    }
    this.clockLabel.string = chineseNumber(clockUnitsLeft(tick));
  }

  /**
   * 画牌面（静态，只画一次）。五层与 web `drawClockPlaque()` 一一对应：
   * 深木外框+金边 / 金板 / 米色内芯 / 三条木纹 / 字（字是独立 Label，见 `clockLabel`）。
   */
  private paintClockPlaque(): void {
    const g = this.clockGfx;
    g.clear();
    const p = CLOCK_PLAQUE;
    // Graphics 的本地坐标是「中心原点」，屏幕坐标（左上原点）要换算一次
    const x0 = p.x - HALF_W;
    const y0 = HALF_H - p.y - p.h; // 屏幕矩形下沿的本地 y
    // 1) 外框：深木底 + 金描边，比牌面各向外扩 4px
    g.fillColor = hexColor(CLOCK_PLATE_OUTER);
    g.roundRect(x0 - 4, y0 - 4, p.w + 8, p.h + 8, 6);
    g.fill();
    g.strokeColor = hexColor(COLORS.gold, 217);
    g.lineWidth = 2;
    g.roundRect(x0 - 4, y0 - 4, p.w + 8, p.h + 8, 6);
    g.stroke();
    // 2) 金板
    g.fillColor = hexColor(CLOCK_PLATE_GOLD);
    g.roundRect(x0, y0, p.w, p.h, 4);
    g.fill();
    // 3) 米色内芯
    g.fillColor = hexColor(CLOCK_PLATE_FACE);
    g.roundRect(x0 + 3, y0 + 3, p.w - 6, p.h - 6, 3);
    g.fill();
    // 4) 木纹：三条极淡的横线（web 用 i=0..2 落在 p.h/4 的整数倍上，最上面那条压在边框上，
    //    这里取 1..3 让三条都落在米色内芯里）
    g.strokeColor = hexColor(CLOCK_PLATE_GRAIN, 46);
    g.lineWidth = 1;
    for (let i = 1; i <= 3; i += 1) {
      const y = y0 + (p.h / 4) * i;
      g.moveTo(x0 + 8, y);
      g.lineTo(x0 + p.w - 8, y);
    }
    g.stroke();
  }

  /**
   * 按本局真实技能条数排格子（绘制与命中区同源：`BattleInput.skillSlotRects`）。
   *
   * - `count <= 4`：单行 88×88（老版式，一格不动）；
   * - `5..8`：4×2 两行 88×56，字号层级不变、靠 SHRINK 收，kind 那行在紧凑版式里隐藏。
   */
  private layoutSlots(count: number): void {
    const rects = skillSlotRects(count);
    for (let i = 0; i < MAX_SKILL_SLOTS; i += 1) {
      const node = this.slotSprites[i]?.node;
      if (!node) continue;
      const r = rects[i];
      node.active = r !== undefined;
      if (!r) continue;
      transformOf(node).setContentSize(r.w, r.h);
      placeOn(node, this.consoleRoot, r.x + r.w / 2, r.y + r.h / 2);
      const compact = r.h < 70;
      const cx = r.x + r.w / 2;
      this.placeLabel(this.skillIndex[i], node, r.x + 26, r.y + (compact ? 12 : 14), 36);
      this.placeLabel(this.skillName[i], node, cx, r.y + (compact ? 26 : 36), r.w - 10);
      this.skillKind[i].node.active = !compact;
      this.placeLabel(this.skillKind[i], node, cx, r.y + 57, r.w - 10);
      this.placeLabel(this.skillCost[i], node, cx, r.y + (compact ? 42 : 78), r.w - 8);
    }
  }

  /** 只移动/改宽一个 Label（高度沿用 TextRole 的行高，不重算）。 */
  private placeLabel(label: Label, parent: Node, screenX: number, screenY: number, width: number): void {
    const t = transformOf(label.node);
    t.setContentSize(width, t.height);
    placeOn(label.node, parent, screenX, screenY);
  }

  /**
   * 给当前主将载一次真肖像。
   *
   * 降级链（`face/full → face/thumb → hero/<名> → 隐藏`）全在 `Portrait.ts` 里，这里只管
   * 「谁的脸、载没载过」：`faceName` 记住名字（换将才重载）、`faceState` 记住结果
   * （载失败也记名字，免得每帧把整条降级链重跑一遍——那会刷出成片的 404 警告）。
   */
  private ensureFace(name: string): void {
    if (this.faceName === name) return;
    this.faceName = name;
    this.faceState = 'loading';
    this.face.node.active = false; // 换将：先把上一张脸收掉，等新图到了再亮
    loadPortrait(
      { apply: (frame, size) => this.applyFace(frame, size) },
      name,
      'full',
      loadFrame,
      (result) => {
        this.faceState = result.via === 'none' ? 'none' : 'ready';
        this.face.setVisible(result.via !== 'none');
      },
    );
  }

  /**
   * 把 `Portrait.ts` 递过来的 frame 铺进头像框：cover 尺寸 + web 的「头顶 16%」裁切偏置。
   *
   * web 是画的时候直接取源矩形（`sy = (pr.h - sh) * 0.16`，`battleView.ts:2179`：立绘人物
   * 通常从 15% 处开始，居中裁会切到额头）。Cocos 没有源矩形这一层，只能「整张放大再挪」：
   * 图像比框高 `H - 108` 时，把节点往下挪 `(H - 108) * (0.5 - 0.16)` 就等价于取偏上的那条窗口。
   */
  private applyFace(frame: SpriteFrame | null, size?: { w: number; h: number }): boolean {
    if (!frame) return this.face.apply(null);
    const fitted = size ?? coverFit(frame, PORTRAIT);
    const ok = this.face.apply(frame, fitted);
    const dy = Math.max(0, (fitted.h - PORTRAIT.h) * 0.34);
    if (dy > 0) this.face.setPosition(PORTRAIT.x, PORTRAIT.y + dy);
    return ok;
  }

  private refreshConsole(world: World, launch: BattleLaunch | null, wiseNote: string): void {
    const a = world.sides.A;
    const b = world.sides.B;
    const gen = a.general;
    const foe = b.general;
    const modeName = launch?.defend ? '守城戰' : '出征';

    // 头像：web `drawConsole()` 两支——有真肖像（cover 铺满 + 右下角 Lv 徽章）／没有（「將」+ 居中 Lv）。
    // 载图是异步的：`faceState` 到 ready 之前继续用占位那套（web 图没 decode 完时也是这么显示的）。
    this.ensureFace(gen.name);
    const hasFace = this.faceState === 'ready';
    this.glyph.node.active = !hasFace;
    this.portraitLevel.node.active = !hasFace;
    this.faceBadgeGfx.node.active = hasFace;
    this.faceBadge.node.active = hasFace;
    this.glyph.color = hexColor(gen.alive ? COLORS.goldLight : COLORS.textFaint);
    this.portraitLevel.string = `Lv.${gen.level}`;
    this.portraitLevel.color = hexColor(gen.alive ? COLORS.text : COLORS.textFaint);
    this.faceBadge.string = `Lv.${gen.level}`;
    this.faceBadge.color = hexColor(gen.alive ? COLORS.gold : COLORS.textFaint);

    this.generalName.string = gen.name;
    this.generalName.color = hexColor(gen.alive ? COLORS.text : COLORS.textFaint);
    const state =
      world.status.A === 3 ? '被俘' : world.fled.A ? '撤退' : gen.alive ? '在陣' : '陣亡';
    this.generalState.string = state;
    this.generalState.color = hexColor(
      state === '在陣' ? COLORS.ok : state === '撤退' ? COLORS.gold : COLORS.enemy,
    );

    // ---- 顶栏时间牌：只看内核 tick（`endReason='time'` 时正好走到「零」） ----
    this.updateClock(world.tick);

    // ---- 底部两块主将卡（web `battleView.ts:1970-2054 drawGeneralCard()` 同口径）----
    // 数值走 `vitalText()`：与 web 逐字一致（`Math.ceil` + 夹 0），所以同一场战斗两边显示同一串。
    // 左卡：名字行内列是 `技`（10px）；兵 / 體 各一行、条在数值外侧；四个裸数字（疲/士、智/武）。
    this.cardTroopA.string = vitalText('兵', a.aliveCount, a.start);
    this.cardHpA.string = vitalText('體', gen.hp, gen.maxHp);
    this.cardSkillA.string = vitalText('技', gen.mp, gen.mpMax);
    const tireA = Math.max(0, Math.round(gen.tire ?? 0));
    const moraleA = Math.max(0, Math.round(gen.morale ?? a.morale));
    this.cardNumA[0]!.string = `疲 ${tireA}`;
    this.cardNumA[1]!.string = `士 ${moraleA}`;
    this.cardNumA[2]!.string = `智 ${gen.int}`;
    this.cardNumA[3]!.string = `武 ${gen.str}`;
    // 右卡（整块镜像）：名字靠屏边、状态字朝画面中心；兵/體 右对齐、条从文本左沿起画。
    this.cardNameB.string = foe.name;
    this.cardNameB.color = hexColor(foe.alive ? COLORS.enemyLight : COLORS.textFaint);
    this.cardStateB.string = foe.alive ? '敵將' : '陣亡';
    this.cardStateB.color = hexColor(foe.alive ? COLORS.ok : COLORS.danger);
    this.cardTroopB.string = vitalText('兵', b.aliveCount, b.start);
    this.cardHpB.string = vitalText('體', foe.hp, foe.maxHp);
    this.cardSkillB.string = vitalText('技', foe.mp, foe.mpMax);
    const tireB = Math.max(0, Math.round(foe.tire ?? 0));
    const moraleB = Math.max(0, Math.round(foe.morale ?? b.morale));
    this.cardNumB[0]!.string = `疲 ${tireB}`;
    this.cardNumB[1]!.string = `士 ${moraleB}`;
    this.cardNumB[2]!.string = `智 ${foe.int}`;
    this.cardNumB[3]!.string = `武 ${foe.str}`;

    // 4 条 8px 兵/體 条（几何来自 GENERAL_CARD_BARS，与 web 同源）+ 3px 行动条。
    // 敌方那条 `mirror=true`：填充从右端往左长（web `bar(..., {mirror:true})`）。
    const g = this.barGfx;
    g.clear();
    // 两块卡之间一条竖发丝线：原作中栏是「主將 對 主將」的立绘区，竖版压到 366 只剩一条缝，
    // 不给线的话两卡的内侧列会连成一片（`士 60 | 士 60` 读起来像四个字段）。
    g.fillColor = hexColor(COLORS.gold, 90);
    g.rect(CARD_DIVIDER_X - HALF_W, HALF_H - CARD_DIVIDER_BOTTOM, 1, CARD_DIVIDER_H);
    g.fill();
    for (const bar of GENERAL_CARD_BARS) {
      const side = bar.side === 'A' ? a : b;
      const general = bar.side === 'A' ? gen : foe;
      const ratio = bar.kind === 'troop'
        ? (side.start > 0 ? side.aliveCount / side.start : 0)
        : (general.maxHp > 0 ? general.hp / general.maxHp : 0);
      this.paintMeter(g, bar.rect, ratio, bar.color, bar.side === 'B');
    }
    // 行动条（「行 a/b」压成卡内一条 3px 细 bar，只画我方）：进度只读内核 `u.cd`
    const gu = generalUnitOf(world, 'A');
    const gauge = gu && gu.alive ? actionGaugeOf(gu) : null;
    if (gauge) this.paintMeter(g, CARD_GAUGE, gauge.ratio, COLORS.gold);

    // 技能格：按该将到该等级已习得的技列表（最多 8 条，与 web `learnedSkillSeqs()` 同口径），
    // 可用 = slot.png / 不可用 = slot_off.png
    const mul = qiCostMul(world, 'A');
    const data = world.data;
    const seqs = learnedSkillSeqs(data, gen.name, gen.level);
    const slotCount = Math.min(seqs.length, MAX_SKILL_SLOTS);
    this.layoutSlots(slotCount);
    for (let i = 0; i < slotCount; i += 1) {
      const seq = seqs[i];
      const magic = magicBySeq(data, seq);
      const mp = Number(magic?.MP ?? 0) || 0;
      const qiPercent = magic ? qiPowerPercentOf(magic) : 0;
      const qiCost = qiCostOf(data, seq) * mul;
      const usable = !world.over && gen.alive && gen.mp >= mp && gen.qi >= qiCost;
      const kind = skillKindOf(data, seq);
      this.slotOn[i] = usable;
      this.skillIndex[i].string = `${i + 1}`;
      this.skillName[i].string = magic?.NAME ?? `技 ${seq}`;
      this.skillName[i].color = hexColor(usable ? COLORS.text : COLORS.textFaint);
      this.skillKind[i].string = kind ? SKILL_KIND_TEXT[kind] : '—';
      this.skillCost[i].string = magic ? `技${mp} · 氣${Math.round(qiPercent)}%` : '—';
      this.skillCost[i].color = hexColor(usable ? COLORS.goldLight : COLORS.textFaint);
    }
    for (let i = slotCount; i < MAX_SKILL_SLOTS; i += 1) this.slotOn[i] = false;

    // 命令按钮：突擊走内核 `AllRush`（宿主通道），常态「全軍突擊」，已在突擊态显示「突擊中」；
    // 撤退按能不能下撤退令两态
    const rushing = world.rush?.A === true;
    this.assaultOn = rushing;
    this.assaultLabel.string = '突 擊';
    this.assaultLabel.color = hexColor(rushing ? COLORS.gold : COLORS.text);
    this.assaultSub.string = rushing ? '突擊中' : '全軍突擊';
    this.assaultSub.color = hexColor(rushing ? COLORS.gold : COLORS.textDim);
    const canRetreat = !world.over && !world.fled.A && gen.alive;
    this.retreatOn = canRetreat;
    this.retreatLabel.string = '撤 退';
    this.retreatLabel.color = hexColor(canRetreat ? COLORS.text : COLORS.textDim);
    this.retreatSub.string = world.fled.A ? '撤退中' : world.over ? '已結束' : '全軍離場';
    this.retreatSub.color = hexColor(canRetreat ? COLORS.textDim : COLORS.textFaint);

    // 消息栏：首行=战场最后一条消息（core 的 world.log），次行=敌方主将明细（原来那两行
    // General 文本里最不可替代的部分：打完能对出对面守将是谁、武/智/HP 对不对）
    const lastLog = world.log.length > 0 ? world.log[world.log.length - 1] : null;
    this.msgLine1.string = lastLog ? lastLog.text : `雙方接戰中 · ${modeName}`;
    this.msgLine1.color = hexColor(lastLog ? COLORS.text : COLORS.textDim);
    this.msgLine2.string =
      `敵 ${foe.name} Lv.${foe.level}  武 ${foe.str} · 智 ${foe.int} · HP ${Math.ceil(foe.hp)}/${foe.maxHp}` +
      (world.over ? ' · 戰鬥結束' : '');

    // 右上元信息：出征/守城 + 连胜 + 军师技（这些原来挤在 labelGeneral 的同一行里）
    const streak = `連勝 ${world.record.streak}（最高 ${world.record.bestStreak}）`;
    this.metaLine.string = `${modeName} · ${streak}${wiseNote ? ` · 軍師技 ${wiseNote}` : ''}`;
  }

  /**
   * 开场叫阵的台词框：战场最底部通栏（web `battleView.ts` 的 `TAUNT_BANNER`
   * x40 y790 w670 h138 同几何），左上角说话方名牌 + 右侧「叫陣」小字。
   * 只在叫阵期间显示，播完由 `hideTaunt()` 收掉——战斗控制台不受影响。
   */
  showTaunt(who: string, line: string): void {
    this.tauntWho.string = who || '';
    this.tauntLine.string = line || '';
    this.tauntRoot.active = true;
    this.setTauntLabels(true);
  }

  /** 底板与三个 Label 一起开关（Label 不在 tauntRoot 下，单独摆位） */
  private setTauntLabels(on: boolean): void {
    this.tauntWho.node.active = on;
    this.tauntTag.node.active = on;
    this.tauntLine.node.active = on;
  }

  hideTaunt(): void {
    this.tauntRoot.active = false;
    this.setTauntLabels(false);
  }

  /**
   * 一条 meter（兵 / 體 / 行动条）：浅白轨道 + 按比例填色 + 1px 白描边，**圆角 h/2** ——
   * 与 web `battleView.ts:952-974 bar()` 逐项同构（`bg = rgba(255,255,255,.10)`、
   * `radius = h/2`、描边 `rgba(255,255,255,.14)`）。
   *
   * `mirror = true` 时填充从右端往左长（web `bar(..., {mirror:true})`，敌方整块镜像）。
   * 圆角半径在填充宽度不足时收到 `fw/2`，否则小 fraction 的条会画出负半径。
   */
  private paintMeter(g: Graphics, rect: Rect, ratio: number, color: string, mirror = false): void {
    const x0 = rect.x - HALF_W;
    const y0 = HALF_H - rect.y - rect.h;
    const radius = rect.h / 2;
    g.fillColor = hexColor(COLORS.white, 26);
    g.roundRect(x0, y0, rect.w, rect.h, radius);
    g.fill();
    const filled = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    const fw = rect.w * filled;
    if (fw > 0.5) {
      g.fillColor = hexColor(color);
      g.roundRect(mirror ? x0 + rect.w - fw : x0, y0, fw, rect.h, Math.min(radius, fw / 2));
      g.fill();
    }
    g.strokeColor = hexColor(COLORS.white, 36);
    g.lineWidth = 1;
    g.roundRect(x0, y0, rect.w, rect.h, radius);
    g.stroke();
  }

  // -------------------------------------------------------------------------
  // 结算面板
  // -------------------------------------------------------------------------

  private refreshSettlement(s: SettleResult, launch: BattleLaunch | null): void {
    const won = s.winner === 'A';
    this.settleTitle.string = won ? '大 勝' : s.winner === 'B' ? '敗 走' : '平 手';
    this.settleTitle.color = hexColor(won ? COLORS.gold : s.winner === 'B' ? COLORS.enemy : COLORS.text);
    this.settleSub.string = `${s.modeName} · 用時 ${s.durationSec} 秒 · ${s.kills} 擊殺`;

    // 6 行和 web `drawSettle()` 一一对应：敵將等級 / 戰功 / 經驗 / 功勳 / 等級 / 戰績
    const rows: readonly (readonly [string, string, string])[] = [
      ['敵將等級', `Lv.${s.enemyLevel}`, COLORS.text],
      ['戰功', `+${s.score}`, COLORS.gold],
      ['經驗', `+${s.expGain}`, COLORS.heal],
      ['功勳', `+${s.meritGain}`, COLORS.goldLight],
      ['等級', `Lv.${s.level}${s.levelUp > 0 ? `  (+${s.levelUp})` : ''}`, s.levelUp > 0 ? COLORS.gold : COLORS.text],
      ['戰績', `${s.record.wins} 勝 / ${s.record.losses} 負`, COLORS.textDim],
    ];
    for (let i = 0; i < rows.length && i < this.settleKey.length; i += 1) {
      const row = rows[i];
      this.settleKey[i].string = row[0];
      this.settleVal[i].string = row[1];
      this.settleVal[i].color = hexColor(row[2]);
    }

    const floor = expToReach(s.level);
    const next = Math.max(floor + 1, s.nextLevelAt);
    const ratio = (s.exp - floor) / (next - floor);
    this.settleExp.string = `EXP ${s.exp} / ${s.nextLevelAt}`;
    this.settleExpNext.string = `距下一級 ${Math.max(0, s.nextLevelAt - s.exp)}`;
    // 法术击杀/连胜不在 6 行里（web 也没有），单独一行小字，别让这两个数从 HUD 上消失
    this.settleMeta.string = `法術擊殺 ${s.spellKills} · 連勝 ${s.record.streak}（最高 ${s.record.bestStreak}）`;
    // 战报短句原来在 `labelStatus` 那一行里，现在由面板承担（守城失败时它写「城池失守」）
    this.settleReport.string = s.report;
    this.settleReport.color = hexColor(won ? COLORS.gold : s.winner === 'B' ? COLORS.enemy : COLORS.textDim);
    this.settleNote.string = '本局結果只存在內存，不寫存檔（預覽版）';
    this.settleAgainLabel.string = '再 戰';
    this.settleAgainSub.string = launch?.from === 'campaign' ? '點擊畫面返回大地圖' : '點擊畫面重開';

    this.paintSettlementArt(s, ratio);
  }

  /** 面板底 / 金色九宫边 / 斑马行 / 经验条 / 再战按钮：一次画完，结算后不再变。 */
  private paintSettlementArt(s: SettleResult, expRatio: number): void {
    if (this.settlementPainted) return;
    this.settlementPainted = true;
    const g = this.settleArt;
    g.clear();

    // 面板：暗底 + 金边（web：panelAlpha 底 + gold .72 描边 + 16 圆角）
    g.fillColor = hexColor(COLORS.panel, 245);
    g.roundRect(SETTLE_PANEL.x - HALF_W, HALF_H - SETTLE_PANEL.y - SETTLE_PANEL.h, SETTLE_PANEL.w, SETTLE_PANEL.h, 16);
    g.fill();
    g.strokeColor = hexColor(COLORS.gold, 184);
    g.lineWidth = 2;
    g.roundRect(SETTLE_PANEL.x - HALF_W, HALF_H - SETTLE_PANEL.y - SETTLE_PANEL.h, SETTLE_PANEL.w, SETTLE_PANEL.h, 16);
    g.stroke();

    // 6 行斑马底（web：偶数行 white .022；这里 8/255 略强一点，深底上才看得见）
    for (let i = 0; i < 6; i += 1) {
      if (i % 2 !== 0) continue;
      const y = ROW_Y0 + i * ROW_GAP;
      g.fillColor = hexColor(COLORS.white, 8);
      g.rect(118 - HALF_W, HALF_H - (y - 20) - 34, 514, 34);
      g.fill();
    }

    // 经验条（web：132,600,486,12 轨道 + 金色填充）
    g.fillColor = hexColor(COLORS.line);
    g.rect(132 - HALF_W, HALF_H - 600 - 12, 486, 12);
    g.fill();
    const filled = Math.max(0, Math.min(1, Number.isFinite(expRatio) ? expRatio : 0));
    if (filled > 0) {
      g.fillColor = hexColor(COLORS.gold);
      g.rect(132 - HALF_W, HALF_H - 600 - 12, 486 * filled, 12);
      g.fill();
    }

    // 再战按钮（web：gold 底 + goldLight 2px 边 + 深底字）
    g.fillColor = hexColor(COLORS.gold);
    g.roundRect(AGAIN_BUTTON.x - HALF_W, HALF_H - AGAIN_BUTTON.y - AGAIN_BUTTON.h, AGAIN_BUTTON.w, AGAIN_BUTTON.h, 10);
    g.fill();
    g.strokeColor = hexColor(COLORS.goldLight);
    g.lineWidth = 2;
    g.roundRect(AGAIN_BUTTON.x - HALF_W, HALF_H - AGAIN_BUTTON.y - AGAIN_BUTTON.h, AGAIN_BUTTON.w, AGAIN_BUTTON.h, 10);
    g.stroke();

    // 标题下的分隔线由 SettleSep（TILED sep.png）负责；这里只按胜负给面板上沿补一条细金线，
    // 让「大勝/敗走」和暗底之间有层次（纯 Graphics，不额外占素材）
    g.strokeColor = hexColor(s.winner === 'B' ? COLORS.enemy : COLORS.gold, 90);
    g.lineWidth = 1;
    g.moveTo(SETTLE_PANEL.x + 28 - HALF_W, HALF_H - SETTLE_PANEL.y - 66);
    g.lineTo(SETTLE_PANEL.x + SETTLE_PANEL.w - 28 - HALF_W, HALF_H - SETTLE_PANEL.y - 66);
    g.stroke();
  }
}
