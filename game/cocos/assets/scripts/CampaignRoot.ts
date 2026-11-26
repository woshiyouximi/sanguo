/**
 * 大地图屏（Cocos Creator 3.8）。
 *
 * 对应 web/campaign.html：
 *   - 60 城、116 条路径，`Length >= 30000` 的哨兵路径画细/淡；
 *   - 点城选中；自己的城可徵兵/開發，敌城接壤可出征；
 *   - 推进一月（税收、人口/金钱增长、敌城增兵）；
 *   - 存档走 GameState → `sys.localStorage`。
 *
 * 全部节点由代码创建，不依赖预制体/场景文件。坐标口径：
 * 设计坐标 750×1334、左上原点；落到 Cocos UI 时统一 `x-375 / 667-y`。
 */
import {
  _decorator,
  Color,
  Component,
  director,
  EventTouch,
  Graphics,
  input,
  Input,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  sys,
  UITransform,
  Vec3,
} from 'cc';
import { addOutline, addVeil, ArtBg, loadFrame } from './ArtLayer';
// 漸層近似（w5-render）：Cocos 沒有 CSS gradient，用多段色帶逼近
import { Band, doubleEdge, edgeBands, hBands, innerEdge, lightGrid, topSheen, vBands, WARM, wash } from './Draw';
import { CityPanel, CITY_EXTRAS_KEY } from './CityPanel';
import { latchTap, tapLatched } from './InputLatch';
import { guardTouch, installInputResilience } from './InputGuard';
import { loadGameData } from './DataLoader';
import { resolveEnemyIntel } from './EnemyIntel';
import type { EnemyIntel } from './EnemyIntel';
import { defendersOf, garrisonOf } from './core/garrison';
import type { GarrisonData } from './core/garrison';
import { pathBetween, posOf } from './core/march';
import type { Army } from './core/march';
// 上陣總兵力 = 步兵欄 + 騎兵欄（原作 unit+0x58 / +0x5C，project/170）
import { troopCapSumOf } from './core/levels';
// 部隊的完整欄位（officers/advisor/stationed）在 GameState 的 CampaignArmy 上
import type { CampaignArmy } from './GameState';
import * as GameState from './GameState';
import { healStaleQueue } from './core/run_scoped';
import * as SurrenderModel from './SurrenderModel';
import { ItemsPanel } from './ItemsPanel';
// 城市駐將的唯一入口（純邏輯、零 cc 依賴）：存檔運行時人事優先，劇本表只作播種。
import * as O from './OfficersOfCity';
import * as M from './MonarchModel';
import { MonarchPanel } from './MonarchPanel';
import { SurrenderPanel } from './SurrenderPanel';
import { CityListPanel } from './CityListPanel';
import type { CityListPanelOptions } from './CityListPanel';
import { EndingPanel } from './EndingPanel';
import { GeneralBookPanel } from './GeneralBookPanel';
import type { GeneralBookPanelOptions } from './GeneralBookPanel';
import { SaveSlotsPanel, adYearOfMonth, ADVANCE_NOTICE, AD_ANCHOR } from './SaveSlots';
import type { LoadSlotResult } from './SaveSlots';
import { ForcesPanel } from './ForcesPanel';
import { MONARCH_EXTRAS_KEY } from './MonarchPanel';
// 文字层级（w5-cocos-skin）：页标题 / 正文 / 数值的描边与字号统一走 role 表
import { applyTextRole, applyTextRoles } from './TextRole';
// 九宫皮肤（w5-cocos-skin）：透空中心的框/牌叠在 Graphics 填充之上、Label 之下
import { makeNineSlice, placeDesign } from './UiSkin';
// [R102] 大地圖部隊層 + 兵團指令（project/186）。純邏輯（座標/命中/駐紮/軍師）在 ArmyLayer 的
// ARMY_CORE 段，繪製是 drawArmyMark()，面板是 ArmyMenu。列表只算一次、畫與點吃同一份。
import {
  armyAtCity,
  armyCanEnterCity,
  armyFlagInk,
  armyHitIndex,
  armyMonths,
  armyOfficerList,
  armyRemain,
  armyRetargetCheck,
  armyRosterPick,
  armyScreenList,
  armySetAdvisor,
  armyStep,
  ArmyMenu,
  drawArmyMark,
  planArmyMoves,
  resolveMapHit,
  stationPairKey,
  stationStandoff,
} from './ArmyLayer';
import type { ArmyCmdAct, PlacedArmy } from './ArmyLayer';
// 軍師技（`?wise=<seq>` 的來源）：與 DeployRoot 編成屏同一組純函式
import { generalLevel, listWisdomChoices, wiseHintOf } from './core/wises';
// [AI] 大地圖 AI 編排層（見 project/102_Cocos_AI移植.md §5.3 的宿主補丁）
import { PLAYER_FORCE, runMonth as runAiMonth } from './AiRunner';
import { consumeFreshStart, playerForce as runPlayerForce, scenarioIndex as runScenarioIndex } from './RunSetup';
// [Bug B] 分劇本起始等級（R85 唯一口徑）：generals.json 沒有 level 欄位，帶兵上限不能靠它反推
import { scenarioLevelOf } from './ScenarioLevels';
import type { AiMonthOutcome, AiRunnerGarrison } from './AiRunner';
// `AiSave` 不必再 import：`CityRuntime.officers` 升成物件陣列後，`CampaignSave` 可直接賦給它。
import type {
  CampaignCity,
  CampaignGeneral,
  CampaignPath,
  CampaignSave,
  CampaignScenario,
} from './GameState';
import type { GameData } from './types';
// [P0-2] 內政面板要吃「當前劇本號」與可選的 garrison 表（DataLoader 把它塞在 GameData 的同名 key 上）
import type { GarrisonScenario } from './CityModel';
import { DESIGN_H, DESIGN_W } from './view/layout';
import { COLORS, FONT_FAMILY } from './view/theme';

const { ccclass } = _decorator;

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/**
 * 地圖區（含上下裝裱帶）。v18-cocos-layout 重排，對齊 web/campaign.html 的 750×1334 縱向分層：
 *
 *   頁頭 0–124 ─ 地圖區 130–830 ─ 戰報 842–1140 ─ 月令按鈕 1152–1248 ─ 提示 1265–1331
 *
 * 舊值是 `{x:20, y:130, w:710, h:900}`，配 `min(sx,sy)*0.94` 統一縮放把 1280×960 的底圖
 * 縮成 813.6×610.2 並居中 → 左右各溢出 14.63 / 48.96 px（project/101 自承「未做」），
 * 上下各留 156/190 px 空帶（截圖裡那片「大塊空黑」）。現在改成**按 750 設計寬等比鋪滿**：
 * 寬恆等於 750、高 562.5，左右溢出 0；上下留白交給裝裱帶（與 web `.bgmap` 的 0,332 750×563 同構）。
 */
const MAP_VIEW = { x: 0, y: 130, w: 750, h: 700 };
/** 地圖區底邊 = 控制台（戰報/按鈕/提示）頂邊；`buildArt()` 用它當 planBaseMap 的 panel 底。 */
const CONSOLE_TOP = 830;
/**
 * 60 城的 `pos_xy` 是原作整幅地图（1280×960）的像素坐标（依据 web/campaign.html：
 * `MAP = { x0:0, y0:0, x1: IMG.w, y1: IMG.h }`）。`assets/bundles/res/map/chinamap.webp`
 * 就是这幅 1280×960 的原图，所以底图必须按 **同一套 world→screen 变换** 摆放，
 * 否则城点会跟地图形错位。`ArtBg` 的 cover=false 会把图直接拉伸到 `mapImageRect()`
 * （1280×960 世界 → 750×562.5 屏幕），与 `toScreen` 同源。
 */
const MAP_IMAGE_W = 1280;
const MAP_IMAGE_H = 960;
/** 三個月令按鈕：web `#actions` 的 86px 高 + 12px 間距（這裡 96，因為中文標題帶一行說明）。 */
const BUTTON_Y = 1152;
const BUTTON_H = 96;
const BUTTON_GAP = 12;
/**
 * 物品頁入口（大地圖頭部右側）。w4-cocos-items 加；詳見 work/cocos_items/entry_registry.md
 *
 * v16-cocos-monarch 把它從 y=64（第二列）提到 y=14（標題列）：君主/勢力/城/戰績這串
 * 統計比舊的「金 … 城 … 戰績 …」長，留在第二列會壓到按鈕底下（見 refresh() 的排版註釋）。
 */
const ITEMS_BUTTON = { x: 560, y: 14, w: 176, h: 52 };
/**
 * 勢力一覽入口（頁頭，物品按鈕左側）。v16-cocos-monarch 加。
 * 兩顆按鈕之間留 16px，跟 ITEMS_BUTTON 到右邊界的 14px 視距一致。
 */
const FORCES_BUTTON = { x: 384, y: 14, w: 160, h: 52 };
/** 頁頭「君主 X」的命中區（比 Label 本身高一點，方便拇指點） */
const MONARCH_HIT = { x: 18, y: 78, w: 200, h: 34 };
/**
 * 「列表」入口（d4-ending-list）：放在地圖下裝裱帶右端（圖例文字右側的空位）。
 * web 版是頁頭 地圖/列表 兩個 tab；Cocos 頁頭已被 標題/勢力/物品/君主 佔滿，
 * 所以把列表做成裝裱帶上的窄按鈕，位置在 596..732 × 776..812，不與圖例(268..482) 重疊。
 */
const LIST_BUTTON = { x: 596, y: 776, w: 136, h: 36 };
/**
 * 「存檔」入口（r86 的 P2）：裝裱帶左端 16..136 × 776..812，圖例從 268 起、不重疊。
 *
 * 為什麼要一個入口：`SaveSlotsPanel.show()` 在 UI 側原本 0 個呼叫點，
 * `saveToSlot()` 只有自己內部呼叫 ⇒ 10 個槽位永遠是空的，玩家沒有手動存檔手段
 * （Cocos 只有 `persistSave()` 的單檔自動存檔）。
 */
const SAVE_HIT = { x: 16, y: 776, w: 120, h: 36 };
/**
 * 「名冊」入口（d3-general-book）。
 *
 * 原本在頁頭第二列（226..402），那裡壓著「· 勢力 公孫瓚」那行字（截圖可見「名冊」蓋住
 * 「公孫瓚」），所以移到地圖下裝裱帶：存檔(16..136) 右邊、圖例(268 起) 左邊，正好 146..266。
 */
const BOOK_HIT = { x: 146, y: 776, w: 120, h: 36 };
/**
 * 君主補丁鍵要落盤的十個欄位（`sanguo_monarch_v1`）。
 *
 * 只列**君主模組自己擁有**的鍵：`month/owned/cities/gold/wins/losses` 以
 * `GameState` 主檔為準，不重複寫（見 `syncMonarchState()`）。
 */
const MONARCH_SAVE_KEYS = [
  'king',
  'monarch',
  'force',
  'monarchSince',
  'forces',
  'fate',
  'drift',
  'loyal',
  'morale',
  'tire',
] as const;

type ActionKind = 'interior' | 'recruit' | 'develop' | 'march' | 'advance' | 'defend';

interface Action {
  kind: ActionKind;
  title: string;
  caption: string;
  primary: boolean;
  enabled: boolean;
}

interface ActionRect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ActionKind;
}

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

/**
 * 把顏色朝白色混 `k`（0..1）。勢力色板是「壓在淺色底圖上也認得出」的暗色，
 * 直接拿去畫 14px 城名會糊成一團，所以城名用提亮版、城點用原色。
 * v16-cocos-monarch 加（不在版式純函數區內，探針不受影響）。
 */
function lighten(hex: string, k: number): string {
  // 實作搬到下面的純邏輯 region（`tintLighten`），探針才compile得動；這裡只留名字給舊呼叫點。
  return tintLighten(hex, k);
}

// #region 版式纯函数
// work/cocos_map84/probe.mjs 会逐字节抽取本段（去类型后在 node 里 import 断言），
// 所以这一段**不许 import 'cc'、不许碰 Node/Component**。改结构请同步跑探针。
/** 城点图元缩放：对齐 web campaign.html 的 `CITY_ICON_K = 0.65`（49×35 最大档 → 32×23）。 */
export const CITY_ICON_K = 0.65;
/** 图元最短边：图集页切坏时也不至于变成 0×0 的隐形城点。 */
export const CITY_ICON_MIN = 10;
/** 图元最长边：即使拿到的是整页图集（2048），也绝不能铺满屏——兜底。 */
export const CITY_ICON_MAX = 64;

export interface SpriteRectLike {
  width: number;
  height: number;
}

/** `cc.SpriteFrame` 里真正用到的两个字段（结构兼容，单测可传假对象）。 */
export interface SpriteFrameLike {
  rect: SpriteRectLike;
  originalSize: SpriteRectLike;
}

export interface IconSize {
  width: number;
  height: number;
}

/**
 * 城点图元尺寸：**只认 spriteFrame 自己的 rect / originalSize**。
 * `spriteFrame.texture.width` 是图集页宽（实测 2048×2048），拿它当 contentSize 会把城点
 * 画成整屏（project/98 对照复查 §5乙②）。
 */
export function cityIconSize(frame: SpriteFrameLike | null | undefined, k: number = CITY_ICON_K): IconSize {
  const ow = frame ? Number(frame.originalSize.width) || Number(frame.rect.width) || 0 : 0;
  const oh = frame ? Number(frame.originalSize.height) || Number(frame.rect.height) || 0 : 0;
  const clamp = (v: number): number => Math.min(CITY_ICON_MAX, Math.max(CITY_ICON_MIN, Math.round(v * k)));
  return { width: clamp(ow), height: clamp(oh) };
}

/** 标签字号 / 与城点的最小间距（与 start() 里 makeLabel(..., 14, ...) 一致）。 */
export const CITY_LABEL_FONT = 14;
export const CITY_LABEL_GAP = 3;

export interface CityLabelItem {
  name: string;
  /** 城点的屏幕坐标（设计坐标，左上原点） */
  x: number;
  y: number;
  /** 城点图元高度（标签默认摆图元上方；0 = 没图元，退回 Graphics 圆点） */
  iconH: number;
}

export interface CityLabelOptions {
  fontSize: number;
  gap: number;
  /** 允许摆标签的设计坐标区间（上下都不许出界） */
  top: number;
  bottom: number;
  screenW: number;
  /** 同方向最多让位几次（每次一行高） */
  steps?: number;
}

export interface CityLabelBox {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** true = 在图元上方 */
  up: boolean;
  /** 按屏幕 y 排序后的名次（0 = 最北），决定默认朝上还是朝下 */
  rank: number;
}

/** Label 是 overflow=NONE，视觉宽度就是字宽；110 的排版框不参与避让。 */
export function cityLabelWidth(name: string, fontSize: number): number {
  return Math.max(18, Array.from(name).length * fontSize + 2);
}

function labelOverlapArea(box: CityLabelBox, placed: CityLabelBox[]): number {
  let total = 0;
  for (const other of placed) {
    const ox =
      Math.min(box.x + box.w / 2, other.x + other.w / 2) - Math.max(box.x - box.w / 2, other.x - other.w / 2);
    const oy =
      Math.min(box.y + box.h / 2, other.y + other.h / 2) - Math.max(box.y - box.h / 2, other.y - other.h / 2);
    if (ox > 0 && oy > 0) total += ox * oy;
  }
  return total;
}

/**
 * 城名标签错开：按屏幕 y 从北到南排序，名次奇偶决定默认朝上/朝下（web `li % 2` 的同款思路），
 * 撞到已摆好的标签就沿同方向再让一行，让不出来再换方向。返回与 `items` 同序的框。
 * 旧实现把 y 夹到 `MAP_VIEW.y + 14`，60 城全叠在 y=144（project/98 对照复查 §5乙③）。
 */
export function layoutCityLabels(items: CityLabelItem[], opts: CityLabelOptions): CityLabelBox[] {
  const h = Math.max(14, Math.round(opts.fontSize * 1.5));
  const steps = opts.steps ?? 14;
  const order = items
    .map((_, index) => index)
    .sort((a, b) => items[a].y - items[b].y || items[a].x - items[b].x || (items[a].name < items[b].name ? -1 : 1));
  const out: CityLabelBox[] = new Array(items.length);
  const placed: CityLabelBox[] = [];
  order.forEach((index, rank) => {
    const item = items[index];
    const w = cityLabelWidth(item.name, opts.fontSize);
    const x = Math.min(Math.max(item.x, w / 2 + 3), opts.screenW - w / 2 - 3);
    const dirs = rank % 2 === 0 ? [-1, 1] : [1, -1];
    let best: CityLabelBox | null = null;
    let bestOverlap = Number.POSITIVE_INFINITY;
    for (const dir of dirs) {
      for (let k = 0; k < steps; k += 1) {
        const y =
          dir < 0
            ? item.y - item.iconH - opts.gap - h / 2 - k * (h + 2)
            : item.y + opts.gap + h / 2 + k * (h + 2);
        if (y - h / 2 < opts.top || y + h / 2 > opts.bottom) continue;
        const candidate: CityLabelBox = { name: item.name, x, y, w, h, up: dir < 0, rank };
        const overlap = labelOverlapArea(candidate, placed);
        if (overlap === 0) {
          best = candidate;
          bestOverlap = 0;
          break;
        }
        if (overlap < bestOverlap) {
          best = candidate;
          bestOverlap = overlap;
        }
      }
      if (bestOverlap === 0) break;
    }
    // 60 城在 900 高的视口里总有空位；真找不到就贴在上边界，宁可压一行也不出界。
    const box = best ?? { name: item.name, x, y: opts.top + h / 2, w, h, up: true, rank };
    out[index] = box;
    placed.push(box);
  });
  return out;
}

/** 装饰带渐变：web `drawBands` 的 #1D1710 →(0.55) #15110C → #100D09。 */
export const BAND_STOPS: { t: number; r: number; g: number; b: number }[] = [
  { t: 0, r: 29, g: 23, b: 16 },
  { t: 0.55, r: 21, g: 17, b: 12 },
  { t: 1, r: 16, g: 13, b: 9 },
];

/** 按 t∈[0,1] 在装饰带渐变上取色（返回分量，不依赖 cc.Color，方便单测）。 */
export function bandColorAt(t: number): { r: number; g: number; b: number } {
  const clamped = Math.min(1, Math.max(0, t));
  let lo = BAND_STOPS[0];
  let hi = BAND_STOPS[BAND_STOPS.length - 1];
  for (let i = 0; i < BAND_STOPS.length - 1; i += 1) {
    if (clamped >= BAND_STOPS[i].t && clamped <= BAND_STOPS[i + 1].t) {
      lo = BAND_STOPS[i];
      hi = BAND_STOPS[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  const k = (clamped - lo.t) / span;
  return {
    r: Math.round(lo.r + (hi.r - lo.r) * k),
    g: Math.round(lo.g + (hi.g - lo.g) * k),
    b: Math.round(lo.b + (hi.b - lo.b) * k),
  };
}

export interface MapBand {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** HUD 上下压条高度：装饰带的外侧金线要落在压条内侧，否则会被压掉。 */
export const HUD_TOP = 124;
export const HUD_BOTTOM = 1080;

export interface BaseMapPlan {
  /** 需要加载的贴图层。**恒为 1 张**：原作 CHINAMAP；`bg/map_bg` 已停用（project/98 §5乙①）。 */
  images: { path: string; rect: MapBand }[];
  /** 地图矩形 + 上下装饰带的几何（设计坐标） */
  bands: { map: MapBand; top: MapBand; bottom: MapBand };
  /** 上下各两条金线的 y：内线贴图边、外线贴 HUD 压条 */
  rails: { top: number[]; bottom: number[] };
}

/**
 * 底圖縮放係數：**只按寬度**等比（web `.bgmap` 是 750 頂寬貼圖，750/1280 = 0.5859375）。
 * v18-cocos-layout 新增；常數寫死在區內（本段要能被探針整段抽出去單獨編譯，
 * 不能引用區外的 `MAP_IMAGE_W`）。
 */
export function baseMapScale(viewW: number, imageW: number = 1280): number {
  return viewW / imageW;
}

/**
 * 底圖矩形（設計座標）：寬度鋪滿 `view` 寬、按 1280×960 等比得高、在 `view` 內**垂直居中**，
 * 上下剩餘空間就是裝裱帶。回傳的 x 恆等於 view.x、w 恆等於 view.w
 * → 左右溢出恆為 0（舊版 813.6 寬居中，兩側各溢出 14.63 / 48.96 px）。
 *
 * 對齊 web（`campaign.html` 的 `#mapwrap` 695 高、`.bgmap` 0,332 750×562.5）：
 * 底圖不裁、不拉伸、不 cover，留白由 `.bgveil` / 裝裱帶負責。
 */
export function baseMapRect(
  view: MapBand,
  imageW: number = 1280,
  imageH: number = 960,
): MapBand {
  const k = baseMapScale(view.w, imageW);
  const h = imageH * k;
  return { x: view.x, y: view.y + (view.h - h) / 2, w: view.w, h };
}

/**
 * 底图版式：一张 1280×960 的 CHINAMAP 等比铺满 view 宽（`baseMapRect()`，750×562.5，
 * 左右溢出 0），上下剩余空间交给装饰带。
 *
 * `designH` 是**面板底邊**而不是畫布高：v18 起 buildArt 傳 `CONSOLE_TOP=830`，
 * 這樣下帶只到控制台頂邊，不會在戰報下面再鋪一層漸變。
 * 預設 `hudTop/hudBottom` 仍錨在 124/1080（`layout_guard.mjs` 會驗這兩個值）。
 */
export function planBaseMap(
  rect: MapBand,
  designW: number,
  designH: number,
  hudTop: number = HUD_TOP,
  hudBottom: number = HUD_BOTTOM,
): BaseMapPlan {
  // 上带 ceil、下带 floor：图幅 y 是 279.99…这种小数，带子要**盖住**图边而不是留 1px 缝
  const topEdge = Math.max(0, Math.ceil(rect.y));
  const bottomEdge = Math.min(designH, Math.floor(rect.y + rect.h));
  const map: MapBand = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  return {
    images: [{ path: 'map/chinamap', rect: map }],
    bands: {
      map,
      top: { x: 0, y: 0, w: designW, h: topEdge },
      bottom: { x: 0, y: bottomEdge, w: designW, h: Math.max(0, designH - bottomEdge) },
    },
    rails: {
      top: [topEdge - 4, hudTop + 2],
      bottom: [Math.min(designH - 2, bottomEdge + 1), hudBottom - 8],
    },
  };
}
// #endregion

// #region 戰報 / 君主繼承 / 城點取色（純邏輯）
// 這一段刻意不 import 'cc'：work/cocos_monarch85/probe.mjs 會按 region 標記逐字抽出去，
// 用 ts.transpileModule 編成 ESM 再 import 跑斷言。改動前先看 probe。
//
//   battleLog*    AI 逐條戰報的環形緩衝（web 是 save.log 只留 8 條：campaign.html:2574 / :1934）
//   succession*   君主陣亡 → 選繼承人的彈窗狀態機（web 玩家側不彈窗，這裡是 [新設計]）
//   cityTintOf    城點按勢力取色（色板直接用 MonarchModel 的 FORCE_*，不複製）

/** 戰報類別；顏色對齊 web 的 `.logrow.*`（`game/web/campaign.html:96-103`）。 */
export type BattleLogKind = 'info' | 'atk' | 'hold' | 'lost' | 'win' | 'year';

export interface BattleLogLine {
  /** 年月標記（web `stamp()`，campaign.html:2569） */
  t: string;
  /** 正文（web `pushLog(text)`） */
  s: string;
  k: BattleLogKind;
}

/** 保留最近 N 條：web 是 8 條（campaign.html:2574 `if(len>8) slice(-8)`）。 */
export const BATTLE_LOG_MAX = 8;

/** 戰報落盤鍵（GameState 是白名單存檔，加不了欄位；換場景後戰報要還在） */
export const BATTLE_LOG_KEY = 'sanguo_battlelog_v1';

/**
 * [R227] 這些面板一開，大地圖時鐘必須停（玩家在用界面，不能被時間偷走內政機會）。
 * 名字取自各面板的 `*_NODE_NAME` 常量：ForcesPanel / GeneralBookPanel / ItemsPanel /
 * MonarchPanel / CityListPanel / SaveSlotsPanel / EndingPanel。
 */
export const UI_PANEL_NODES = new Set<string>([
  'ForcesPanel',
  'GeneralBookPanel',
  'ItemsPanel',
  'MonarchPanel',
  'CityListPanel',
  'SaveSlotsPanel',
  'EndingPanel',
]);

/** 我方城名兜底（兵團的 `from` 可能已易手，落到第一個自有城）。 */
export function saveOwnedOr(save: { owned: string[] }, from: string): string {
  return save.owned.includes(from) ? from : (save.owned[0] ?? from);
}
/** 君主座位（garrison.json 的 major === 君主那座城） */
export const MONARCH_SEAT_KEY = 'sanguo_monarch_seat_v1';
/** 玩家勢力已滅亡（1 = 死了；新開局清掉） */
export const MONARCH_EXTINCT_KEY = 'sanguo_monarch_extinct_v1';

/** 從存檔字串還原時把 `k` 收斂回合法值 */
export function logKindOf(value: unknown): BattleLogKind {
  if (value === 'atk' || value === 'hold' || value === 'lost' || value === 'win' || value === 'year') return value;
  return 'info';
}

/**
 * 戰報面板（設計座標 750×1334，左上原點）：v18-cocos-layout 從「浮在地圖右下角」搬到
 * **地圖下方的獨立區域**（對齊 web 的 `#logbox` 0,961 750×196）：
 *
 *   地圖區底邊 830 → 戰報 842–1140（718×298）→ 月令按鈕 1152–1248
 *
 * 舊值是 `{x:392, y:786, w:336, h:234}`，浮在地圖右下角、壓住桂陽/廬陵/義州三座城。
 * 標題列仍可點折疊（`logHit()` 不變），但折疊只收起行、面板高度不變 → 不會在控制台挖洞。
 */
export const LOG_VIEW = { x: 16, y: 842, w: 718, h: 298 };
/** 折疊後的高度（保留給 `logHit()`；v18 起面板恆為 LOG_VIEW.h，折疊只收行） */
export const LOG_BAR_H = 62;
/** 標題列高度（含金線）。**必須是 28**：`cocos_monarch85/probe.mjs` 用 L.y+28 → header、
 * L.y+29 → body 兩條斷言把這個值釘死了（改它會讓探針紅）。 */
export const LOG_HEAD_H = 28;
/** 行高（8 行 × 30 = 240，加 28 標題列 = 268 < 298 面板高） */
export const LOG_ROW_H = 30;
/** 第一行的中心 y（標題列之下；標題列 28，行高 30 → 中心 48 時行頂 33，留 5px 縫） */
export const LOG_ROW_TOP = 48;

/** 戰報浮層命中：`header`（折疊鈕）/ `body`（吃點擊，避免點到浮層下面的城）/ ''。 */
export function logHit(x: number, y: number, collapsed: boolean): 'header' | 'body' | '' {
  if (x < LOG_VIEW.x || x > LOG_VIEW.x + LOG_VIEW.w) return '';
  const h = collapsed ? LOG_BAR_H : LOG_VIEW.h;
  if (y < LOG_VIEW.y || y > LOG_VIEW.y + h) return '';
  return y <= LOG_VIEW.y + LOG_HEAD_H ? 'header' : 'body';
}

/** `stamp(month)`：`${年}年${月}月`，month 從 1 起算（web campaign.html:2569）。 */
export function monthStamp(month: number): string {
  const raw = Math.trunc(Number(month));
  const m = Number.isFinite(raw) && raw > 0 ? raw : 1;
  return `${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}

/**
 * 戰報文字顏色（web `.logrow.atk/.hold/.lost/.year`）。
 * `win`/`info` 在 web 沒有專屬色，這裡回 ''，呼叫方用主題的 `COLORS.text`。
 */
export function logColor(kind: BattleLogKind): string {
  if (kind === 'atk') return '#E8A08C';
  if (kind === 'hold') return '#7FD1A8';
  if (kind === 'lost') return '#E08A7A';
  if (kind === 'year') return '#F0D48A';
  return '';
}

function logStr(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function logNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logCap(max: number): number {
  const n = Math.trunc(Number(max));
  return Number.isFinite(n) && n > 0 ? n : BATTLE_LOG_MAX;
}

/** 環形緩衝：追加一條並裁到最近 `max` 條。回傳新陣列，不改入參。 */
export function battleLogPush(buf: readonly BattleLogLine[], line: BattleLogLine, max: number = BATTLE_LOG_MAX): BattleLogLine[] {
  const cap = logCap(max);
  const size = buf.length + 1;
  const from = size > cap ? size - cap : 0;
  const next: BattleLogLine[] = [];
  for (let i = from; i < buf.length; i += 1) {
    const item = buf[i];
    if (item) next.push(item);
  }
  next.push(line);
  return next;
}

/** 取最近 `max` 條，**最新在前**（web `renderLog()` 是 `slice(-8).reverse()`）。 */
export function battleLogTail(buf: readonly BattleLogLine[], max: number = BATTLE_LOG_MAX): BattleLogLine[] {
  const cap = logCap(max);
  const from = Math.max(0, buf.length - cap);
  const out: BattleLogLine[] = [];
  for (let i = buf.length - 1; i >= from; i -= 1) {
    const item = buf[i];
    if (item) out.push(item);
  }
  return out;
}

export function battleLogAppend(buf: readonly BattleLogLine[], lines: readonly BattleLogLine[], max: number = BATTLE_LOG_MAX): BattleLogLine[] {
  let next: BattleLogLine[] = buf.slice();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line) next = battleLogPush(next, line, max);
  }
  return next;
}

export function battleLogLine(month: number, s: string, k: BattleLogKind): BattleLogLine {
  return { t: monthStamp(month), s: s, k: k };
}

/**
 * `runMapAi()` 的結果 → 戰報行（三類，全部來自 AiRunner 的回報）：
 *   ① 出兵：`out.incoming`（AiRunner.ts:102-112）→「某勢力 出兵 某城」
 *   ② 易手：`out.battles[].captured`（AiRunner.ts:115-127）→「某城 易手」
 *   ③ 陣亡：`out.log` 裡的「陣亡 / 滅亡」行（AiRunner.ts:519-522、:541-545）+ `out.gone`
 * `out.log[0]` 的月報頭已經在頁面提示條，這裡跳過。
 */
export function battleLogFromAi(out: AiMonthOutcome | null | undefined, max: number = BATTLE_LOG_MAX): BattleLogLine[] {
  const lines: BattleLogLine[] = [];
  if (!out) return lines;
  const t = monthStamp(out.month);

  const incoming = Array.isArray(out.incoming) ? out.incoming : [];
  for (let i = 0; i < incoming.length; i += 1) {
    const row = incoming[i];
    if (!row) continue;
    const to = logStr(row.to);
    if (!to) continue;
    const force = logStr(row.force) || '敵軍';
    const from = logStr(row.from);
    const troops = Math.max(0, Math.trunc(logNum(row.troops)));
    const tail = from ? `（自 ${from} · ${troops} 兵）` : `（${troops} 兵）`;
    lines.push({ t: t, k: 'atk', s: `${force} 出兵 ${to}${tail}` });
  }

  const battles = Array.isArray(out.battles) ? out.battles : [];
  for (let i = 0; i < battles.length; i += 1) {
    const bt = battles[i];
    if (!bt || bt.skipped) continue;
    const to = logStr(bt.to);
    if (!to) continue;
    const def = Math.max(0, Math.trunc(logNum(bt.defenders)));
    if (bt.captured) {
      const who = logStr(bt.attacker) || logStr(bt.force) || '敵軍';
      lines.push({ t: t, k: 'win', s: `${to} 易手：${who} 破城（守 ${def} 兵）` });
    } else {
      const from = logStr(bt.from);
      lines.push({ t: t, k: 'lost', s: `${from || logStr(bt.force)} 攻 ${to} 敗退（守 ${def} 兵）` });
    }
  }

  const log = Array.isArray(out.log) ? out.log : [];
  for (let i = 0; i < log.length; i += 1) {
    const text = logStr(log[i]);
    if (!text) continue;
    if (text.indexOf('月 報') >= 0) continue;
    if (text.indexOf('陣亡') >= 0 || text.indexOf('滅亡') >= 0) lines.push({ t: t, k: 'lost', s: text });
  }

  const gone = Array.isArray(out.gone) ? out.gone : [];
  for (let i = 0; i < gone.length; i += 1) {
    const id = logStr(gone[i]);
    if (!id) continue;
    let dup = false;
    for (let j = 0; j < lines.length; j += 1) {
      const s = lines[j] ? lines[j].s : '';
      if (s.indexOf(id) >= 0 && s.indexOf('滅亡') >= 0) {
        dup = true;
        break;
      }
    }
    if (!dup) lines.push({ t: t, k: 'lost', s: `${id} 勢力滅亡：名下已無城池` });
  }

  const cap = logCap(max);
  return lines.length > cap ? lines.slice(lines.length - cap) : lines;
}

/**
 * 戰報緩衝上限（**不是**面板一頁的行數）。[新設計]
 *
 * web 的 `save.log` 只留 8 條（campaign.html:2574 `if(len>8) slice(-8)`），更早的月份
 * 直接丟掉，所以既沒有「本月」分組也翻不了頁。Cocos 這裡把緩衝放寬到 40 條（= 5 頁），
 * 面板仍舊 8 行一頁（`BATTLE_LOG_MAX` 不動：它是面板行數，也是探針斷言），多出來的
 * 部分靠 `battleLogPage()` 翻。落盤鍵與 `battleLogTail()` 預設上限都不受影響。
 */
export const BATTLE_LOG_KEEP = 40;

/** 面板上的一列：正文行，或「本月」分組標題列 */
export interface BattleLogRow {
  /** 年月標記（分組標題列留空 —— 標題自帶年月，再寫一遍會重複） */
  t: string;
  /** 正文（分組標題列 = 組頭文字） */
  s: string;
  k: BattleLogKind;
  /** true = 分組標題列（`▼ 本月 · 3年4月`），由 `drawBattleLog()` 疊淡金底 */
  month: boolean;
}

export interface BattleLogPage {
  rows: BattleLogRow[];
  /** 目前頁（0 起算，已夾在 [0, pages-1]） */
  page: number;
  /** 總頁數（空戰報也算 1 頁） */
  pages: number;
  /** 本頁第一列是整份紀錄的第幾列（0 起算，**含**組頭列） */
  from: number;
}

/** 組頭文字：最新一組標「本月」，更早的只寫年月 */
export function battleLogMonthTitle(stamp: string, newest: boolean): string {
  const t = logStr(stamp) || '未記年月';
  return newest ? `▼ 本月 · ${t}` : `▼ ${t}`;
}

/**
 * 把整份緩衝編排成「月份分組 + 分頁」的列。[新設計]（web 只有 `slice(-8).reverse()`）
 *
 *   ① 同一個 `t`（`monthStamp()` 的年月標記）的**連續**幾條歸一組，組頭佔一列；
 *   ② 每頁 `per` 列（預設 `BATTLE_LOG_MAX` = 8），翻頁按列走、不按組走 —— 一組比一頁
 *      還長就從中間斷頁，下一頁續排（組頭只出現在「組的第一列」所在那頁）；
 *   ③ `page` 夾在 `[0, pages-1]`（負數 → 0，超出 → 最後一頁）；
 *   ④ 最新的一組排最前（與 `battleLogTail()` 的「最新在上」一致）。
 *
 * `currentMonth` 是「現在幾月」：最新一組正好是這個月才標「本月」，否則（跨月了但本月
 * 還沒打仗）只寫年月 —— 不然會把上個月的戰事說成本月。
 */
export function battleLogPage(
  buf: readonly BattleLogLine[],
  page: number,
  per: number = BATTLE_LOG_MAX,
  currentMonth: number = 0,
): BattleLogPage {
  const size = logCap(per);
  const total = buf.length;
  const now = Math.trunc(logNum(currentMonth));
  const curStamp = now > 0 ? monthStamp(now) : '';
  // 先按「連續同 t」切組。倒著走 → 最新的一組在最前，組內 start/end 仍是 buf 的正序
  const groups: Array<{ t: string; start: number; end: number }> = [];
  for (let i = total - 1; i >= 0; i -= 1) {
    const line = buf[i];
    if (!line) continue;
    const last = groups.length > 0 ? groups[groups.length - 1] : null;
    if (last && last.start === i + 1 && last.t === line.t) last.start = i;
    else groups.push({ t: line.t, start: i, end: i + 1 });
  }
  const all: BattleLogRow[] = [];
  for (let gi = 0; gi < groups.length; gi += 1) {
    const g = groups[gi];
    if (!g) continue;
    const newest = gi === 0 && (!curStamp || curStamp === g.t);
    all.push({ t: '', s: battleLogMonthTitle(g.t, newest), k: 'year', month: true });
    for (let i = g.end - 1; i >= g.start; i -= 1) {
      const line = buf[i];
      if (!line) continue;
      all.push({ t: line.t, s: line.s, k: line.k, month: false });
    }
  }
  const pages = Math.max(1, Math.ceil(all.length / size));
  const want = Math.trunc(logNum(page));
  const at = want < 0 ? 0 : want >= pages ? pages - 1 : want;
  const from = at * size;
  return { rows: all.slice(from, from + size), page: at, pages: pages, from: from };
}

/**
 * 戰報翻頁鈕（畫在標題列右側；`drawBattleLog()` 的底板與 `logPrev`/`logNext` 兩個 Label
 * 共用同一份矩形）。標題列高 28（`LOG_HEAD_H`），鈕高 22 居中 → y 起點 4；兩顆不重疊，
 * 也不壓到左邊的標題字（標題最長「戰 報 · 共 40 條 · 5/5 頁 ▾」約 430px < 596）。
 */
export const LOG_PAGE_PREV = { x: LOG_VIEW.x + LOG_VIEW.w - 112, y: LOG_VIEW.y + 4, w: 44, h: 22 };
export const LOG_PAGE_NEXT = { x: LOG_VIEW.x + LOG_VIEW.w - 52, y: LOG_VIEW.y + 4, w: 44, h: 22 };

/** 翻頁鈕命中：-1 = 上一頁、1 = 下一頁、0 = 沒中（折疊時沒有行，不給翻） */
export function logPageHit(x: number, y: number, collapsed: boolean): -1 | 0 | 1 {
  if (collapsed) return 0;
  const inRect = (r: { x: number; y: number; w: number; h: number }): boolean =>
    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inRect(LOG_PAGE_PREV)) return -1;
  if (inRect(LOG_PAGE_NEXT)) return 1;
  return 0;
}

/** 君主陣亡的處置分派：'none' 不動作 / 'ending' 城已丟光、交給結局面板 / 'prompt' 彈繼承窗 */
export type MonarchDeathPlanKind = 'none' | 'ending' | 'prompt';

export interface MonarchDeathPlan {
  kind: MonarchDeathPlanKind;
  /** 判定出來的死者（`alive` 時為 ''） */
  dead: string;
  /** 還剩幾城 */
  remaining: number;
  reason: 'pending' | 'extinct' | 'alive' | 'no-city' | 'king-dead';
}

/**
 * 君主陣亡要怎麼辦（純判斷，不碰存檔）。[新設計]
 *
 * web 沒有這一步：`kingFell()`（campaign.html:3247-3286）對 AI 與玩家用同一支，直接
 * 自動繼承（`MM.kingDeath`）。Cocos 的玩家側要「先彈窗、玩家點完再落地」，所以把判斷
 * 抽成純函數，`checkMonarchDeath()` 只負責照 `kind` 做副作用 —— 這樣
 * `work/cocos_monarch_ui/succession_assert.mjs` 能直接測，不必起 cc。
 *
 *   pending   → 已經有一個繼承窗在等玩家（`successionState !== null`）→ 不要再彈
 *   extinct   → 玩家勢力上一輪已滅亡 → 永久不再判（否則刷一次頁面就復活一個君主）
 *   no-city   → 0 城：繼承沒有意義（`M.kingDeath` 的 `remaining===0` 也是直接滅亡），
 *               而且 `EndingPanel.showIfEnded()` 會彈滿屏結局，再彈繼承窗是兩個窗疊著
 *   alive     → 君主座位沒丟（`detectMonarchDeath()` 回 ''）→ 什麼都不做
 *   king-dead → 有城、君主死了 → 彈「選繼承人」（有沒有候選由 `successionStart()` 判）
 */
export function planMonarchDeath(dead: string, remaining: number, pending: boolean, extinct: boolean): MonarchDeathPlan {
  const name = logStr(dead);
  const left = Math.max(0, Math.trunc(logNum(remaining)));
  if (pending) return { kind: 'none', dead: name, remaining: left, reason: 'pending' };
  if (extinct) return { kind: 'none', dead: name, remaining: left, reason: 'extinct' };
  if (left === 0) return { kind: 'ending', dead: name, remaining: 0, reason: 'no-city' };
  if (!name) return { kind: 'none', dead: '', remaining: left, reason: 'alive' };
  return { kind: 'prompt', dead: name, remaining: left, reason: 'king-dead' };
}

/**
 * 與檔案上方的 `lighten()` 同一份算法；放進 region 是為了讓探針能單獨編譯
 * （region 不引用 region 之外的東西）。`lighten()` 已經改成呼叫它，避免兩份實作漂移。
 */
export function tintLighten(hex: string, k: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const to = (c: number): number => Math.round(c + (255 - c) * k);
  const r = to((n >> 16) & 0xff);
  const g = to((n >> 8) & 0xff);
  const b = to(n & 0xff);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** 城點取色結果（drawMap / placeCityLabels 共用；`MonarchModel` 的色板是唯一來源）。 */
export interface CityTint {
  /** 城點主色＝`M.forceColorOf(owner)`（無主 → 中性灰 FORCE_COLOR_NEUTRAL） */
  color: string;
  /** 外環色暈 alpha：我方 120，其他 78 */
  glowAlpha: number;
  /** 玩家金環；`ringAlpha=0` 表示不畫 */
  ringColor: string;
  ringAlpha: number;
  ringWidth: number;
  /** 城名顏色；'' = 用主題的 `COLORS.textDim`（無主城） */
  labelColor: string;
  isPlayer: boolean;
}

export function cityTintOf(owner: string, playerForce: string): CityTint {
  const force = logStr(owner);
  const isPlayer = Boolean(force) && force === logStr(playerForce);
  const color = M.forceColorOf(force);
  return {
    color: color,
    glowAlpha: isPlayer ? 120 : 78,
    ringColor: M.FORCE_GOLD,
    ringAlpha: isPlayer ? 235 : 0,
    ringWidth: 2,
    labelColor: isPlayer ? M.FORCE_GOLD : force ? tintLighten(color, 0.42) : '',
    isPlayer: isPlayer,
  };
}

/** 繼承候選用的武將行：`M.Officer` + 所在城（web 的讓位候選靠 officersByCity 補城名）。 */
export interface SuccessionOfficer {
  name: string;
  city: string;
  str: number;
  int: number;
  loyal: number | null;
  loyalKing: string;
  status: string;
  constancy: number;
}

/** 從「城 → 守將」攤平出某勢力的在職武將（含城名）。`force` 傳 '' 表示不過濾。 */
export function successionOfficers(
  cities: readonly string[],
  ownerOf: (city: string) => string,
  officersByCity: (city: string) => readonly unknown[],
  force: string,
): SuccessionOfficer[] {
  const want = logStr(force);
  const out: SuccessionOfficer[] = [];
  for (let i = 0; i < cities.length; i += 1) {
    const city = logStr(cities[i]);
    if (!city) continue;
    if (want && logStr(ownerOf(city)) !== want) continue;
    const raw = officersByCity(city);
    if (!Array.isArray(raw)) continue;
    for (let j = 0; j < raw.length; j += 1) {
      const o = M.normOfficer(raw[j]);
      if (!o) continue;
      out.push({
        name: o.name,
        city: city,
        str: o.str,
        int: o.int,
        loyal: o.loyal,
        loyalKing: o.loyalKing,
        status: o.status,
        constancy: o.constancy,
      });
    }
  }
  return out;
}

export interface SuccessionCandidate {
  name: string;
  city: string;
  str: number;
  int: number;
  loyal: number;
  clan: boolean;
  score: number;
}

/** 候選＝`M.successionList`（同族 > 忠誠 > 武智）＋所在城。 */
export function successionCandidates(
  force: string,
  officers: readonly SuccessionOfficer[],
  dead: string,
  king: string,
): SuccessionCandidate[] {
  const list = M.successionList(force, officers, { dead: dead, king: king });
  const cityOf: Record<string, string> = {};
  for (let i = 0; i < officers.length; i += 1) {
    const o = officers[i];
    if (!o || cityOf[o.name]) continue;
    cityOf[o.name] = o.city;
  }
  const out: SuccessionCandidate[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e) continue;
    out.push({
      name: e.name,
      city: cityOf[e.name] || '',
      str: e.str,
      int: e.int,
      loyal: e.loyal,
      clan: Boolean(e.clan),
      score: e.score,
    });
  }
  return out;
}

export interface SuccessionState {
  /** prompt = 有候選、等玩家點；extinct = 沒候選（或城已丟光）→ 勢力滅亡 */
  phase: 'prompt' | 'extinct';
  force: string;
  dead: string;
  month: number;
  /** 判定時還剩幾座城（0 → 直接滅亡，對齊 `M.kingDeath` 的 `remaining===0`） */
  remaining: number;
  candidates: SuccessionCandidate[];
  /** 結算殘將用（`M.extinguish` 要吃在職武將） */
  officers: SuccessionOfficer[];
  selected: number;
}

export interface SuccessionStartArgs {
  force: string;
  dead: string;
  month: number;
  remaining: number;
  officers: readonly SuccessionOfficer[];
  /** 現任君主（預設＝死者）；`M.successionList` 會把他排掉 */
  king?: string;
}

/** 開彈窗前的純計算：有候選 → prompt，否則 extinct。不改存檔。 */
export function successionStart(args: SuccessionStartArgs): SuccessionState {
  const force = logStr(args.force);
  const dead = logStr(args.dead);
  const rawMonth = Math.trunc(logNum(args.month));
  const month = rawMonth > 0 ? rawMonth : 1;
  const remaining = Math.max(0, Math.trunc(logNum(args.remaining)));
  const king = logStr(args.king) || dead;
  const officers = args.officers.slice();
  const candidates = remaining > 0 ? successionCandidates(force, officers, dead, king) : [];
  return {
    phase: candidates.length > 0 ? 'prompt' : 'extinct',
    force: force,
    dead: dead,
    month: month,
    remaining: remaining,
    candidates: candidates,
    officers: officers,
    selected: 0,
  };
}

export type SuccessionRowTone = 'cand' | 'note' | 'confirm';

export interface SuccessionRow {
  text: string;
  tone: SuccessionRowTone;
  /** tone==='cand' 時是候選人名字 */
  name: string;
}

export interface SuccessionView {
  title: string;
  sub: string;
  rows: SuccessionRow[];
  hint: string;
  extinct: boolean;
}

/** 彈窗要顯示的純文字（MonarchPanel 只負責排版，不重算規則）。 */
export function successionView(state: SuccessionState | null): SuccessionView {
  if (!state) {
    return { title: '君主陣亡', sub: '', rows: [], hint: '', extinct: true };
  }
  const extinct = state.phase === 'extinct';
  const rows: SuccessionRow[] = [];
  for (let i = 0; i < state.candidates.length; i += 1) {
    const c = state.candidates[i];
    if (!c) continue;
    const clan = c.clan ? ' · 同族' : '';
    const city = c.city ? `　駐 ${c.city}` : '';
    rows.push({ text: `${c.name}${clan}　武 ${c.str} · 智 ${c.int} · 忠 ${c.loyal}${city}`, tone: 'cand', name: c.name });
  }
  if (extinct) {
    const left = state.remaining > 0 ? `還有 ${state.remaining} 城無主` : '名下已無城池';
    rows.push({ text: `殘將散去 · ${left}`, tone: 'note', name: '' });
    rows.push({ text: '確定：勢力滅亡', tone: 'confirm', name: '' });
  }
  return {
    title: extinct ? '君主陣亡 · 勢力滅亡' : '君主陣亡 · 選繼承人',
    sub: `勢力 ${state.force || '—'} · 陣亡 ${state.dead || '—'}（${monthStamp(state.month)}）`,
    rows: rows,
    hint: extinct ? '沒有可繼位的武將，只能就此落幕' : '點一位武將立為新君',
    extinct: extinct,
  };
}

export interface SuccessionOutcome {
  ok: boolean;
  heir: string;
  extinct: boolean;
  force: string;
  month: number;
  reason: string;
  /** 殘將去向（`M.FATE_TEXT` 的文字） */
  fates: string[];
  /** 寫進戰報的那一行 */
  line: string;
  kind: BattleLogKind;
}

/**
 * 玩家點選後落地：prompt → `M.inheritForce`（換君主、勢力 id 不變）；
 * extinct → `M.extinguish`（alive=false + 殘將歸宿，我方清空 monarch/force）。
 * 這兩支合起來等於 `M.kingDeath` 的兩條分支（差別只在「先彈窗、後落地」）。
 */
export function successionLand(save: Record<string, unknown>, state: SuccessionState | null, pick?: string): SuccessionOutcome {
  if (!state) {
    return { ok: false, heir: '', extinct: false, force: '', month: 1, reason: 'no-state', fates: [], line: '', kind: 'info' };
  }
  const t = monthStamp(state.month);
  if (state.phase === 'extinct') {
    const res = M.extinguish(save, state.force, { month: state.month, dead: state.dead, officers: state.officers });
    const fates: string[] = [];
    for (let i = 0; i < res.fates.length; i += 1) {
      const f = res.fates[i];
      if (!f) continue;
      fates.push(`${f.name} ${M.FATE_TEXT[f.fate]}`);
    }
    return {
      ok: res.ok,
      heir: '',
      extinct: true,
      force: state.force,
      month: state.month,
      reason: res.reason,
      fates: fates,
      line: `${t}　${state.force} 君主陣亡：勢力滅亡`,
      kind: 'lost',
    };
  }
  let heir = logStr(pick);
  if (!heir) {
    const idx = state.selected >= 0 && state.selected < state.candidates.length ? state.selected : 0;
    const c = state.candidates[idx];
    heir = c ? c.name : '';
  }
  const res = M.inheritForce(save, state.force, heir, { month: state.month });
  const who = heir || '（無人）';
  return {
    ok: res.ok,
    heir: heir,
    extinct: false,
    force: state.force,
    month: state.month,
    reason: res.reason,
    fates: [],
    line: `${t}　${state.force} 君主陣亡：${who} 繼位（勢力存續 · 名號不變）`,
    kind: 'lost',
  };
}

// #endregion

// #region 遭遇戰（F-06）：真打入口 + 戰後回寫（純邏輯）
// [[ENCOUNTER_CORE]]
// 這一段**不 import 'cc'、不碰 GameState / sys / director**：`game/tests/encounter_battle.test.ts`
// 會按 `[[ENCOUNTER_CORE]]` 標記逐字抽出去、剝掉型別後直接跑行為斷言（Node 的型別剝離）。
// 要改先看那個測試。
//
// [F-06] 為什麼要這一段：Cocos 以前在路上撞到敵軍只擲骰（`Math.random()` 按兵力折算），
// 和 web 的「跳戰鬥頁真打」（`game/web/campaign.html:4547 startEncounter`）不是一回事。
// 正式版改成進 `Battle` 場景真打：`GameState.startBattle()` 把雙方將/兵寫進 BattleLaunch，
// 結算由 BattleRoot 落 `recordBattleResult()`（wins/losses/streak）與 `queuePostBattle()`
// （俘虜/斬首佇列）；回大地圖時再用「戰前快照 → 戰後增量」回寫兵損與 `save.lastBattle`，
// 招降面板仍走既有的 `SurrenderModel.resolveCaptureFlow()`（不重複造）。
// 舊擲骰只留作調試兜底：`?autoenc=1` / `AUTO_ENCOUNTER = true`。

/**
 * 舊「按兵力折算」遭遇戰結算的總開關。
 *
 * **僅調試用：正式版必須真打**（默認 false → 遭遇戰一律進 Battle 場景）。
 * 只有把它改成 true，或 URL 帶 `?autoenc=1`（`autoEncounterOn()` 認這個），才走舊擲骰。
 */
const AUTO_ENCOUNTER: boolean = false;

/** 調試開關：`AUTO_ENCOUNTER = true` 或 `?autoenc=1` → 允許舊擲骰結算（正式版必須真打） */
function autoEncounterOn(debugFlag: unknown): boolean {
  if (AUTO_ENCOUNTER === true) return true;
  return debugFlag === true || String(debugFlag ?? '') === '1';
}

/**
 * 跨場景快照的 localStorage 鍵：Battle 結算後 `director.loadScene('Campaign')` 建的是**新場景實例**，
 * CampaignRoot 的欄位全丟，所以「開戰前雙方部隊 + 戰前 wins/losses 快照」只能落 localStorage。
 */
const ENCOUNTER_PENDING_KEY = 'sanguo_encounter_v1';
/** 快照格式版本：形狀改了就把版本 +1，舊快照會被 `parseEncounterPending()` 丟掉 */
const ENCOUNTER_PENDING_VERSION = 1;
/** 勝方戰後留在地圖上的兵力比例（與 web `resolveEncounter()` 的 `troops * 0.5` 同口徑） */
const ENCOUNTER_SURVIVOR_RATE = 0.5;
/** 戰鬥內兵種/陣形：野戰沒帶 `?troop=&form=`，沿用 BattleRoot 的缺省（大刀/方形、黃巾/雁形） */
const ENCOUNTER_TROOP = 2;
const ENCOUNTER_FORM = 0;
const ENCOUNTER_BTROOP = 10;
const ENCOUNTER_BFORM = 3;
/** 戰鬥內兵力區間：web `encounterUrl()` 的 clamp100（雙方都按整數 1..100 送進戰場） */
const ENCOUNTER_SOLDIERS_MIN = 1;
const ENCOUNTER_SOLDIERS_MAX = 100;

/** 遭遇戰雙方的部隊快照（`GameState.CampaignArmy` 的可序列化子集，純邏輯區不 import 存檔型別） */
interface EncounterArmy {
  id: string;
  side: 'A' | 'B';
  from: string;
  to: string;
  pathIndex: number;
  progress: number;
  troops: number;
  general?: string;
  officers?: string[];
  advisor?: string;
  stationed?: boolean;
}

/** 戰前/戰後的勝敗快照（`GameState.CampaignSave` 的 wins/losses/streak/bestStreak 四欄） */
interface EncounterRecord {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
}

/** 跨場景快照：開戰前把雙方部隊與戰前戰績落 localStorage，回大地圖時算增量 */
interface EncounterPending {
  version: number;
  /** 局指紋（與 `initCampaign()` 的 runKey 同源）：換劇本/換勢力不會把上一局的快照套進來 */
  key: string;
  ts: number;
  month: number;
  /** 傳給 `recordBattleResult(city, …)` 的我方城名（必須在 owned 裡，見 `startEncounterBattle`） */
  city: string;
  mine: EncounterArmy;
  foe: EncounterArmy;
  before: EncounterRecord;
}

/** 戰鬥內某將的屬性（查不到就回 BattleRoot 的缺省口徑，不崩） */
interface EncounterGeneral {
  name: string;
  str: number;
  int: number;
  level: number;
  wise?: number | null;
}

/** `GameState.startBattle()` 吃的 loadout（只列遭遇戰會填的欄位，結構上可賦值給 BattleLoadout） */
interface EncounterLoadout {
  gen: string;
  genStr: number;
  genInt: number;
  genLevel: number;
  troop: number;
  form: number;
  soldiers: number;
  wise: number | null;
  bgen: string;
  bstr: number;
  bint: number;
  btroop: number;
  bform: number;
  bsoldiers: number;
  /** 車輪戰名冊（出陣順序，第 0 位先發） */
  rosterA: string[];
  rosterB: string[];
}

/** `save.lastBattle` 的形狀（`core/roster.ts:readBattleOutcome()` 讀的權威勝負信號） */
interface EncounterLastBattle {
  won: boolean;
  city: string;
  defend: boolean;
  captured: string[];
  executed: string[];
  dead: string[];
  joined: string[];
  ts: number;
}

/** 戰後回寫計畫：復原哪些部隊、寫什麼 lastBattle/戰報/提示 */
interface EncounterPlan {
  winner: 'A' | 'B' | 'draw';
  restores: EncounterArmy[];
  lastBattle: EncounterLastBattle;
  logText: string;
  logKind: 'win' | 'lost' | 'hold';
  note: string;
}

/**
 * 從對峙雙方挑出「我方（A）/ 敵方（B）」。
 *
 * `stationStandoff()` 保證雙方 side 不同；但大地圖上可能出現「兩支都不是我軍」的對撞
 * （AI 打 AI），那種情況回 null → 呼叫方退回調試折算，不把 B 當成玩家讀者操作。
 */
function encounterSides(
  a: EncounterArmy | null | undefined,
  b: EncounterArmy | null | undefined,
): { mine: EncounterArmy; foe: EncounterArmy } | null {
  if (!a || !b || a.id === b.id || a.side === b.side) return null;
  const mine = a.side === 'A' ? a : b;
  const foe = mine === a ? b : a;
  if (mine.side !== 'A') return null;
  return { mine, foe };
}

/** 大地圖兵力 → 戰鬥內兵力（clamp 1..100，取整；與 web `encounterUrl()` 同口徑） */
function encounterSoldiers(troops: unknown): number {
  const n = Math.round(Number(troops));
  if (!Number.isFinite(n)) return ENCOUNTER_SOLDIERS_MIN;
  return Math.max(ENCOUNTER_SOLDIERS_MIN, Math.min(ENCOUNTER_SOLDIERS_MAX, n));
}

/** 組 `GameState.startBattle()` 的 loadout：A 側固定我方，B 側固定敵方（BattleRoot 恆把 A 當玩家） */
function encounterLoadout(
  mine: EncounterArmy,
  foe: EncounterArmy,
  mineGen: EncounterGeneral,
  foeGen: EncounterGeneral,
): EncounterLoadout {
  const rosterA = [mineGen.name || mine.general || '我軍主將', ...(mine.officers ?? [])]
    .filter((name, i, all) => !!name && all.indexOf(name) === i)
    .slice(0, 4);
  const rosterB = [foeGen.name || foe.general || '來犯之將', ...(foe.officers ?? [])]
    .filter((name, i, all) => !!name && all.indexOf(name) === i)
    .slice(0, 4);
  return {
    gen: mineGen.name || mine.general || '我軍主將',
    genStr: mineGen.str,
    genInt: mineGen.int,
    genLevel: mineGen.level,
    troop: ENCOUNTER_TROOP,
    form: ENCOUNTER_FORM,
    soldiers: encounterSoldiers(mine.troops),
    wise: mineGen.wise ?? null,
    bgen: foeGen.name || foe.general || '來犯之將',
    bstr: foeGen.str,
    bint: foeGen.int,
    btroop: ENCOUNTER_BTROOP,
    bform: ENCOUNTER_BFORM,
    bsoldiers: encounterSoldiers(foe.troops),
    rosterA,
    rosterB,
  };
}

/** 把任意 object 收斂成合法的遭遇戰部隊快照；形狀不對回 null（localStorage 是玩家可改的） */
function encounterArmyOf(raw: unknown): EncounterArmy | null {
  const row = raw as Partial<EncounterArmy> | null | undefined;
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id ?? '');
  const side = row.side;
  if (!id || (side !== 'A' && side !== 'B')) return null;
  const from = String(row.from ?? '');
  const to = String(row.to ?? '');
  const troops = Math.round(Number(row.troops));
  if (!from || !to || !Number.isFinite(troops) || troops <= 0) return null;
  const progress = Number(row.progress);
  const army: EncounterArmy = {
    id,
    side,
    from,
    to,
    pathIndex: Math.max(0, Math.round(Number(row.pathIndex) || 0)),
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0,
    troops,
    stationed: row.stationed === true,
  };
  if (row.general) army.general = String(row.general);
  if (Array.isArray(row.officers)) {
    army.officers = row.officers
      .map((name) => String(name))
      .filter((name) => name.length > 0)
      .slice(0, 5);
  }
  if (typeof row.advisor === 'string' && row.advisor) army.advisor = row.advisor;
  return army;
}

/** 把任意 object 收斂成戰績四欄（非法值一律 0） */
function encounterRecordOf(raw: unknown): EncounterRecord {
  const row = (raw ?? {}) as Partial<EncounterRecord>;
  const int = (value: unknown): number => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return { wins: int(row.wins), losses: int(row.losses), streak: int(row.streak), bestStreak: int(row.bestStreak) };
}

/** 開戰前組快照（純函式：給 class 的 `storeEncounterPending()` 序列化用） */
function encounterPendingOf(args: {
  key: string;
  ts: number;
  month: number;
  city: string;
  mine: EncounterArmy;
  foe: EncounterArmy;
  before: EncounterRecord;
}): EncounterPending {
  const ts = Math.round(Number(args.ts));
  return {
    version: ENCOUNTER_PENDING_VERSION,
    key: String(args.key ?? ''),
    ts: Number.isFinite(ts) && ts > 0 ? ts : 1,
    month: Math.max(1, Math.round(Number(args.month) || 1)),
    city: String(args.city ?? ''),
    mine: encounterArmyOf(args.mine) as EncounterArmy,
    foe: encounterArmyOf(args.foe) as EncounterArmy,
    before: encounterRecordOf(args.before),
  };
}

/**
 * 解析 localStorage 裡的跨場景快照。
 *
 * 三道門：`version` 對得上、`key` 與本局 runKey 一致、雙方部隊／城名／ts 形狀合法。
 * 任何一道不過就回 null（呼叫方清掉舊快照）——寧可這場不結算兵損，也不能把上一局的
 * 部隊/勝負套進新局。
 */
function parseEncounterPending(raw: unknown, runKey: string): EncounterPending | null {
  const bag = raw as Partial<EncounterPending> | null | undefined;
  if (!bag || typeof bag !== 'object') return null;
  if (Math.round(Number(bag.version)) !== ENCOUNTER_PENDING_VERSION) return null;
  if (String(bag.key ?? '') !== String(runKey ?? '')) return null;
  const mine = encounterArmyOf(bag.mine);
  const foe = encounterArmyOf(bag.foe);
  const city = String(bag.city ?? '');
  if (!mine || !foe || !city) return null;
  if (mine.side !== 'A' || foe.side !== 'B') return null;
  const ts = Math.round(Number(bag.ts));
  if (!Number.isFinite(ts) || ts <= 0) return null;
  return {
    version: ENCOUNTER_PENDING_VERSION,
    key: String(bag.key),
    ts,
    month: Math.max(1, Math.round(Number(bag.month) || 1)),
    city,
    mine,
    foe,
    before: encounterRecordOf(bag.before),
  };
}

/** 復原部隊：改回大地圖兵力（勝方半兵）並把行軍進度歸零（與舊折算口徑一致） */
function encounterHold(army: EncounterArmy, troops: number): EncounterArmy {
  return { ...army, troops: Math.max(1, Math.round(Number(troops) || 1)), progress: 0 };
}

/**
 * 戰後回寫計畫：只憑「戰前戰績快照 vs 回大地圖時的戰績」判勝負。
 *
 * BattleRoot 結算時走 `recordBattleResult()`：A 勝 → wins+1、否則 losses+1（平手 `draw` 兩欄都不動），
 * 所以 wins 增 = 我方勝、losses 增 = 我方敗、都不增 = 平手或中途退出。
 * lastBattle 只補「權威勝負」；`captured`/`executed` 佇列由 BattleRoot 的 `queuePostBattle()` 寫，
 * 這裡保持空陣列，避免同一批俘虜被記兩次。
 */
function encounterPlan(pending: EncounterPending, after: EncounterRecord, ts: number): EncounterPlan {
  const win = after.wins > pending.before.wins;
  const lose = after.losses > pending.before.losses;
  const winner: 'A' | 'B' | 'draw' = win ? 'A' : lose ? 'B' : 'draw';
  const restores: EncounterArmy[] = [];
  const mineName = pending.mine.general ?? pending.mine.id;
  const foeName = pending.foe.general ?? pending.foe.id;
  const mineTroops = Math.round(pending.mine.troops);
  const foeTroops = Math.round(pending.foe.troops);
  const lastBattle: EncounterLastBattle = {
    won: winner === 'A',
    city: pending.city,
    defend: false,
    captured: [],
    executed: [],
    dead: [],
    joined: [],
    ts: Math.max(1, Math.round(Number(ts) || 0)),
  };
  if (winner === 'A') {
    const survivor = encounterHold(pending.mine, mineTroops * ENCOUNTER_SURVIVOR_RATE);
    restores.push(survivor);
    return {
      winner,
      restores,
      lastBattle,
      logText: `遭 遇 戰：我軍 ${mineName} ${mineTroops} 兵 與 ${foeName} ${foeTroops} 兵 對撞——我軍得勝（真打，餘 ${survivor.troops} 兵）`,
      logKind: 'win',
      note: `路上遭遇戰：我軍擊退 ${pending.foe.from} 軍（餘 ${survivor.troops} 兵）。`,
    };
  }
  if (winner === 'B') {
    const survivor = encounterHold(pending.foe, foeTroops * ENCOUNTER_SURVIVOR_RATE);
    restores.push(survivor);
    return {
      winner,
      restores,
      lastBattle,
      logText: `遭 遇 戰：我軍 ${mineName} ${mineTroops} 兵 與 ${foeName} ${foeTroops} 兵 對撞——我軍敗退（真打，敵軍餘 ${survivor.troops} 兵）`,
      logKind: 'lost',
      note: '路上遭遇戰：我軍潰敗，殘部回圖（點武將可查看俘虜處置）。',
    };
  }
  // 平手／中途退出（wins/losses 都沒動）：雙方按原兵力回圖，不算勝負
  restores.push(encounterHold(pending.mine, mineTroops));
  restores.push(encounterHold(pending.foe, foeTroops));
  return {
    winner,
    restores,
    lastBattle,
    logText: `遭 遇 戰：我軍 ${mineName} ${mineTroops} 兵 與 ${foeName} ${foeTroops} 兵 脫離接觸——平手（雙方按原兵力退回）`,
    logKind: 'hold',
    note: '路上遭遇戰：兩軍平手，各自退回。',
  };
}
// [[/ENCOUNTER_CORE]]
// #endregion

/**
 * 九宮底板清單（w5-cocos-skin）。
 *
 * **只疊底板，不動任何矩形**：每條 rect 都跟本檔既有的版式常量同源 ——
 * 戰報 = `LOG_VIEW`、提示條 = `consoleRects().hint`、兩顆頂欄按鈕 = `FORCES_BUTTON` /
 * `ITEMS_BUTTON`。四張圖都是「透空中心」的框（PNG 採樣：center alpha = 0），所以直接
 * 疊在既有 Graphics 填充之上，把下面那層底色透出來，不需要再加一層深底。
 *
 * `work\cocos_skinapply\skin_nodes_assert.mjs` 會逐條比對這裡的 key 與矩形。
 */
interface SkinSlot {
  readonly name: string;
  readonly key: string;
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

const SKIN_SLOTS: readonly SkinSlot[] = [
  { name: 'SkinLogFrame', key: 'frame_panel', rect: { x: 16, y: 842, w: 718, h: 298 } },
  { name: 'SkinHintFrame', key: 'frame_panel', rect: { x: 25, y: 1260, w: 700, h: 70 } },
  { name: 'SkinForcesPlate', key: 'plate_btn', rect: { x: 384, y: 14, w: 160, h: 52 } },
  { name: 'SkinItemsPlate', key: 'plate_btn', rect: { x: 560, y: 14, w: 176, h: 52 } },
];

/** 月令按鈕底板槽位數（與 onLoad 裡建的 4 個 actionLabels 一一對應） */
const ACTION_SKIN_SLOTS = 4;

/**
 * 劇本起始西元年（`scenarios.json[i].system.YEAR`）：劇本 0 = 184、1 = 189、2 = 200…
 *
 * web 側走 `Era.setAnchor(Saves.startYearOf(save))`（`game/web/campaign.html:1896`）；
 * Cocos 之前把 `AD_ANCHOR = 184` 寫死，於是《討伐董卓》頂欄也顯示「西元 184年」。
 * 缺欄位／越界時退回 184（劇本 0），與 `SelectModel.ts:88` 讀 `system.YEAR` 同一個來源。
 */
export function startYearOfScenario(scenario: unknown): number {
  const system = (scenario as { system?: { YEAR?: unknown } } | null | undefined)?.system;
  const year = Math.trunc(Number(system?.YEAR));
  return Number.isFinite(year) && year >= 100 && year <= 300 ? year : AD_ANCHOR;
}

@ccclass('CampaignRoot')
export class CampaignRoot extends Component {
  private gBase: Graphics | null = null;
  private gMap: Graphics | null = null;
  private gUi: Graphics | null = null;

  /**
   * 底图层：只有原作 CHINAMAP 一张（`bg/map_bg` 已停用，见 buildArt）。缺图时整个图层隐藏，
   * drawFrame 会退回纯色块。
   */
  private artMap: ArtBg | null = null;

  /** 城点图元（map/city_1..4，按人口四分档）与选中光标（map/point） */
  private cityFrames: (SpriteFrame | null)[] = [null, null, null, null];
  private pointFrame: SpriteFrame | null = null;
  private cityTier = new Map<string, number>();
  private cityIcons = new Map<string, { node: Node; sprite: Sprite; box: UITransform }>();
  private pointIcon: { node: Node; sprite: Sprite; box: UITransform } | null = null;
  private cityIconLayer: Node | null = null;
  private cityArtLeft = 5;

  private labelTitle: Label | null = null;
  private labelMonth: Label | null = null;
  /**
   * [R225] 原作大地图时钟（`work/units_per_side/Sango2.exe` 反汇编）：
   *   `0x41B6C1 subl $1` 每帧 `T -= 1`；`0x41B849=3600` 一帧一年、`0x41B855=300` 一月、`0x41B879=10` 一日；
   *   `0x41B7F2` 用 `month = (3600-T)/300+1` 现算显示月份（原作没有「月份推进函数」）；
   *   `T == 0`（`0x41B6CF`）→ 置「内政时间到了」并 `SetScene(0x48CD50=内政)`；
   *   `0x41BBF5`（内政終了回调）只做 `T = 3600` + 切回大地图，**不跑任何模拟**。
   * 所以这里也必须是「每帧减 1」的活时钟，而不是按下按钮一次跑 12 个月。
   */
  private clockT = 3600;
  /** 60Hz 累加器：原作逐帧减 1，我们用固定步长把帧率差异吃掉 */
  private clockAcc = 0;
  /** 每帧推进的 tick 数（原作 `[0x4A64F8]`，命令行 atoi；默认 1） */
  private clockSpeed = 1;
  /** 时钟暂停：内政页开着 / 任一模态暗幕开着 / 场景即将切换 */
  private clockPaused = false;
  /**
   * [R231b] 是否处在「内政阶段」。原作内政是一个场景：正月（T=0）自动进去，
   * 只有按「内政终了」才回大地图。所以城内页的返回键要按这个判断，
   * 不能只看 `clockT <= 0`（新局是 clockT=3600、clockPaused=true 进场的）。
   */
  private interiorPhase = false;

  /**
   * [R235] 場景切換鎖：從城內頁點「出征」→ `doAction('march')` → `loadScene('Deploy')` 的這段路上，
   * 大地圖會先渲染一兩幀再被卸掉。若不鎖，`update()` 會把這段時間當「在大地圖且沒開面板」而開始走表，
   * 於是內政就沒了（製作人實測：內政點出征 → 閃一下大地圖 → 編成回來時已經 2 月）。
   */
  private navLock = false;
  /** 頁頭左側「君主 X」：可點，開君主屬性卡（v16-cocos-monarch） */
  private labelMonarch: Label | null = null;
  private labelStats: Label | null = null;
  private labelHint: Label | null = null;
  private labelItems: Label | null = null;
  /** 頁頭「勢 力」按鈕：開勢力一覽抽屜 */
  private labelForces: Label | null = null;
  /** 地圖下裝裱帶的三色圖例（v18-cocos-layout）：我方 / 勢力 / 無主 */
  private labelLegend: Label[] = [];
  /** 地圖/列表 切換的「列表」入口文字（d4-ending-list） */
  private labelList: Label | null = null;
  /** 名冊入口文字（d3-general-book） */
  private labelBook: Label | null = null;
  /** 存檔入口文字（r86 的 P2）：裝裱帶左端 */
  private labelSave: Label | null = null;
  private actionLabels: Label[] = [];
  /**
   * 月令按鈕的副標（w7-cocos-render2）：主標 num@20 + 副標 body@13 兩行。
   * 舊版是一顆 20px 的兩行 Label（`標題\n說明`），兩行同級、看不出層次；
   * web 的 `.cmd b + .cmd i` 是「粗體主標 + 小字說明」，拆成兩個 Label 才對得上。
   */
  private actionSubs: Label[] = [];
  /** 頁頭副標（title 32 下面那一行 body 14）：讓頁頭同屏就出現 32/20/18/14 四級 */ 
  private labelSubtitle: Label | null = null;

  /**
   * 九宮底板層（w5-cocos-skin）：onLoad 裡在三個 Graphics **之後**、所有 Label **之前**建，
   * 於是底板天然落在「底色之上、文字之下」——一個 siblingIndex 都不用調
   * （`promoteLogLabels()` 之後戰報文字仍然在最上）。
   */
  private skinLayer: Node | null = null;
  private skinNodes = new Map<string, Node>();
  /** 月令按鈕底板（4 個槽位；x/w 每幀由 drawActions() 均分，多出來的隱藏） */
  private skinActionPlates: Node[] = [];

  /** 物品頁面板（w4-cocos-items）：第一次點「物品」時建，之後複用。 */
  private itemsPanel: ItemsPanel | null = null;

  /** 君主/勢力面板（v16-cocos-monarch）：第一次點君主名或「勢力」時建。 */
  private monarchPanel: MonarchPanel | null = null;

  /**
   * 君主存檔視圖：`GameState` 白名單存檔（month/owned/cities/gold/wins/losses 每月同步）
   * + 君主補丁鍵 `sanguo_monarch_v1`（king/monarch/force/monarchSince/forces/fate/drift/
   * loyal/morale/tire）。`MonarchModel` 的所有函數都吃這個物件。
   */
  private monarchState: Record<string, unknown> | null = null;

  /** 各城守將（garrison.json 的 officers），君主面板的 officerCount/讓位候選要用 */
  private officerMap: Record<string, unknown[]> | null = null;

  /** AI 逐條戰報的環形緩衝（最多 BATTLE_LOG_MAX 條，最新在尾；顯示時反過來） */
  private battleLog: BattleLogLine[] = [];
  /** 戰報浮層折疊狀態（點標題列切換） */
  private logCollapsed = false;
  private logTitle: Label | null = null;
  /** 空戰報時的佔位文字（面板固定高度，沒有這行就是一片黑） */
  private logEmpty: Label | null = null;
  private logTimeLabels: Label[] = [];
  private logTextLabels: Label[] = [];
  /** 戰報目前頁（0 起算；[新設計] 8 行一頁，緩衝留 `BATTLE_LOG_KEEP` 條） */
  private logPage = 0;
  /** 戰報總頁數（`refreshBattleLog()` 每幀寫回；只用來點亮/熄滅翻頁鈕） */
  private logPages = 1;
  private logPrev: Label | null = null;
  private logNext: Label | null = null;

  /** 君主陣亡 → 選繼承人：待決狀態（null = 沒彈窗） */
  private successionState: SuccessionState | null = null;
  /**
   * 君主座位：garrison.json 裡 major === 君主的那座城。這座城丟了就判「君主陣亡」。
   * 存 `sys.localStorage` 是因為守城戰在 Deploy 場景結算（GameState.recordBattleResult 直接把城
   * 從 owned 拿掉），回大地圖是新場景，記憶體欄位活不過去。
   */
  private monarchSeat = '';
  /** 玩家勢力已滅亡：避免 syncMonarchState 又把君主播種回來 */
  private monarchExtinct = false;

  private cities: CampaignCity[] = [];
  private paths: CampaignPath[] = [];
  private generals: CampaignGeneral[] = [];
  /** R214d：劇本起始西元年（`scenarios.json[i].system.YEAR`），頂欄紀元用它當錨點 */
  private startYear = AD_ANCHOR;
  /** 整份 GameData：城市卡要查 garrison.json（勢力/太守/守將） */
  private data: GameData | null = null;
  private save: CampaignSave | null = null;
  private selected: string | null = null;
  private hintText = '';
  private actionRects: ActionRect[] = [];
  /** [P0-2] 本局劇本序號（`RunSetup.scenarioIndex()` 在 `start()` 時記下來） */
  private scenIdx = 0;

  private cityLabels = new Map<string, Label>();
  private cityScreen = new Map<string, { x: number; y: number }>();

  /** 內政面板（web `city.html` 的 Cocos 版）：延遲建立、顯示/隱藏當頁面切換 */
  private cityPanel: CityPanel | null = null;

  // [R102 部隊層] ------------------------------------------------------------
  /** 本幀的部隊層列表（`armyScreenList()` 的結果）：**繪製與命中共用這一份** */
  private armyScreen: PlacedArmy[] = [];
  /** 兵團指令面板（延遲建立、同節點複用） */
  private armyMenu: ArmyMenu | null = null;
  /** 選中的部隊 id（畫金環、面板跟著它）；null = 沒選 */
  private armySel: string | null = null;
  /** 「變更目的」選點態：非空時點地圖只認城（web `enterPickMode()` / `campaign.html:3177`） */
  private pickArmyId: string | null = null;
  /** 選中部隊的兵力牌（`抵達` / `N` 兵）；沒選時 active=false */
  private armyBadge: Label | null = null;
  /** 對峙偵測用（web `stationNoticed`，campaign.html:4402）：同一對部隊只記一次，之後才結算 */
  private stationNoticed = new Set<string>();

  /** [R225b] 逐幀行軍：已提示過的抵達部隊（避免每幀重複寫提示條） */
  private readonly arrivedNoticed = new Set<string>();

  onLoad(): void {
    installInputResilience();
    // 底图先建，siblingIndex 0/1/2 → 永远在 Graphics 和 Label 之下（不用改别人的节点顺序）
    this.buildArt();
    this.gBase = this.makeGraphics('CampaignBase');
    this.gMap = this.makeGraphics('CampaignMap');
    this.gUi = this.makeGraphics('CampaignUi');
    // 九宮底板層：緊跟在 gUi 後面建（siblingIndex 比它大、比下面的 Label 小）
    this.buildSkin();

    // 頁頭版式（v16-cocos-monarch 重排，750 寬三列）：
    //   第 1 列 y≈40  ：標題「大 地 圖」x 25–355 ／ 勢力按鈕 x 384–544 ／ 物品按鈕 x 560–736
    //   第 2 列 y≈88  ：君主名 x 24–214（金、可點）／ 勢力·城·戰績 x 224–600 ／ 月份 x 610–740
    //   第 3 列 y≈1276：提示條
    // 舊版標題居中、月份在標題列右側、兩顆按鈕在第二列，統計一變長就和按鈕打架。
    // 注意 makeLabel 的 `cx` 對 left/right 是**框的邊**（見 makeLabel 內的 centerX 換算），
    // 不是中心：left 傳左邊界、right 傳右邊界、center 才傳中心。
    this.labelTitle = this.makeLabel('大 地 圖', 25, 40, 330, 32, COLORS.goldLight, 'left');
    this.labelMonth = this.makeLabel('', 740, 88, 130, 17, COLORS.textDim, 'right');
    this.labelMonarch = this.makeLabel('', 24, 88, 190, 19, M.FORCE_GOLD, 'left');
    this.labelStats = this.makeLabel('', 224, 88, 376, 16, COLORS.textDim, 'left');
    // v18-cocos-layout：提示條從 y=1276 下移到 1298（月令按鈕 1152–1248 之後的空檔），
    // 並把 UITransform 加高到 66，讓「城市卡」那三行不必 SHRINK 就放得下（1265–1331 < 1334）。
    this.labelHint = this.makeLabel('', 375, 1298, 700, 15, COLORS.textDim, 'center');
    // 物品頁入口（w4-cocos-items）：頭部右側，與 labelMonth/labelStats 不重疊
    this.labelItems = this.makeLabel('物 品', ITEMS_BUTTON.x + ITEMS_BUTTON.w / 2, ITEMS_BUTTON.y + 26, ITEMS_BUTTON.w, 20, COLORS.goldLight, 'center');
    // 勢力一覽入口（v16-cocos-monarch）：物品按鈕左側
    this.labelForces = this.makeLabel('勢 力', FORCES_BUTTON.x + FORCES_BUTTON.w / 2, FORCES_BUTTON.y + 26, FORCES_BUTTON.w, 20, COLORS.goldLight, 'center');
    // 圖例（v18-cocos-layout）：地圖下裝裱帶裡的三色點 + 說明，對應任務書的「地圖 → 圖例 → 戰報」。
    // 圓點畫在 drawFrame() 的 gUi 上（cx 273/347/421, cy 792, r 4），文字在點右側 5px。
    this.labelLegend = [
      this.makeLabel('我方', 306, 792, 56, 12, COLORS.goldLight, 'center'),
      this.makeLabel('勢力', 380, 792, 56, 12, COLORS.textDim, 'center'),
      this.makeLabel('無主', 454, 792, 56, 12, COLORS.textFaint, 'center'),
    ];
    // 列表入口文字（底板畫在 drawFrame 的 gUi 上，見 LIST_BUTTON 註釋）
    this.labelList = this.makeLabel(
      '列 表', LIST_BUTTON.x + LIST_BUTTON.w / 2, LIST_BUTTON.y + 18, LIST_BUTTON.w, 20, COLORS.goldLight, 'center',
    );
    // 名冊入口文字（d3-general-book）：頁頭君主名右側
    this.labelBook = this.makeLabel(
      '名 冊', BOOK_HIT.x + BOOK_HIT.w / 2, BOOK_HIT.y + 17, BOOK_HIT.w, 20, COLORS.goldLight, 'center',
    );
    // 存檔入口文字（r86 的 P2）：裝裱帶左端，與「列表」對稱
    this.labelSave = this.makeLabel(
      '存 檔', SAVE_HIT.x + SAVE_HIT.w / 2, SAVE_HIT.y + 18, SAVE_HIT.w, 20, COLORS.goldLight, 'center',
    );
    // 提示/统计偶尔超过 700 宽；SHRINK 比裁掉后半句好。    this.labelHint.overflow = Label.Overflow.SHRINK;
    // 城市卡是两行（兵/民/金 + 勢力/太守/守將），行高必须钉死，否则 SHRINK 会把两行挤成一行。
    this.labelHint.lineHeight = 22;
    // 三行 × 22 = 66：makeLabel 默认只给 fontSize*3 = 45 高，会被 SHRINK 压掉一行。
    this.labelHint.node.getComponent(UITransform)!.setContentSize(700, 66);
    this.labelMonarch.overflow = Label.Overflow.SHRINK;
    this.labelStats.overflow = Label.Overflow.SHRINK;
    addOutline(this.labelMonarch, new Color(6, 8, 12, 210), 1);
    addOutline(this.labelStats, new Color(6, 8, 12, 210), 1);
    addOutline(this.labelHint, new Color(6, 8, 12, 210), 1);

    // 頁頭副標（w7-cocos-render2）：y 57..71，第二列佔 79..97，不撞；x 25..355 也躲開
    // 右側「勢 力」鈕（x 384 起）。hud_layout 只量 labelTitle/Month/Monarch/Stats 四塊。
    this.labelSubtitle = this.makeLabel('', 25, 64, 330, 14, COLORS.textDim, 'left');

    // 4 個槽位：敵軍抵達城下時要挤进一个「守 城 戰」，3 个不够用
    for (let i = 0; i < 4; i += 1) {
      const label = this.makeLabel('', 0, BUTTON_Y + 38, 200, 20, COLORS.text, 'center');
      label.lineHeight = 24;
      label.overflow = Label.Overflow.SHRINK;
      this.actionLabels.push(label);
      // 副標：13px、行高 18，落在主標下方 34px 處（1152+72 = 1224，鈕底 1248 之上）
      const sub = this.makeLabel('', 0, BUTTON_Y + 72, 200, 13, COLORS.textDim, 'center');
      sub.lineHeight = 18;
      sub.overflow = Label.Overflow.SHRINK;
      this.actionSubs.push(sub);
    }

    // 戰報浮層（v17-cocos-monarch）：底板畫在 gUi，文字是 Label 兄弟節點
    this.buildLogLabels();

    // 文字層級（w5-cocos-skin）：等所有 Label 都建好再統一上 role
    this.applyRoles();
  }

  protected async start(): Promise<void> {
    try {
      this.labelHint!.string = '載入劇本與武將…';
      const data = await loadGameData();
      // 剧本索引来自开局选择（RunSetup，标题页/剧本页写入）；越界自动回落 0
      const sci = runScenarioIndex();
      // [P0-2] 記住劇本號：內政面板的 roster/wildPool/關卡守軍都要按它取（舊碼恆 0）
      this.scenIdx = sci;
      // R214c：先取出「这一局是不是刚按的开始新局」，initCampaign 与后面自动开内政都要用
      const freshRun = consumeFreshStart();
    // [R226b] 新局把「時間 / 戰報 / 對峙記錄」一併歸零，否則會沿用上一局的年份、戰報與時鐘。
    if (freshRun) {
      try {
        sys.localStorage.removeItem(BATTLE_LOG_KEY);
      } catch {
        // 原生 localstorage 不可用時忽略：下面 `this.battleLog` 也會清
      }
      this.battleLog = [];
      this.clockT = 3600;
      this.clockAcc = 0;
      this.clockPaused = true;
      this.interiorPhase = false;
      this.arrivedNoticed.clear();
      this.stationNoticed.clear();
      // [R232] 內政與物品的附加欄位另存兩個鍵（見 CityPanel.CITY_EXTRAS_KEY / ItemsModel.BAG_KEY）：
      // 只清 `sanguo_campaign_v1` 不夠——舊局的「逐將年令 / 本月已下令 / 在途 / 背包」都在這裡，
      // 新局一進去就會看到「本月已行動（內政窗口已收束）」（制作人实测：连开两局新局）。
      try {
        sys.localStorage.removeItem('sanguo_city_v1');
        sys.localStorage.removeItem('sanguo_items_v1');
      } catch {
        // 同上：拿不到 localStorage 時忽略
      }
    }
      const scenario = (data.scenarios[sci] ?? data.scenarios[0]) as unknown as CampaignScenario | undefined;
      if (!scenario || !Array.isArray(scenario.cities)) {
        throw new Error('scenarios[0].cities 為空，請確認 bundles/res/data/scenarios.json');
      }
      this.cities = scenario.cities;
      this.paths = Array.isArray(scenario.paths) ? scenario.paths : [];
      // R214d：劇本起始年（scenarios.json 的 `system.YEAR`：劇本 0=184、1=189、2=200…）。
      // web 走 `Era.setAnchor(Saves.startYearOf(save))`（campaign.html:1896），Cocos 之前把
      // `AD_ANCHOR = 184` 寫死，於是《討伐董卓》頂欄也顯示「西元 184年」——用戶實機發現。
      this.startYear = startYearOfScenario(scenario);
      this.generals = data.generals as CampaignGeneral[];
      this.data = data;
      this.computeCityTiers();
      this.save = GameState.initCampaign(this.cities, {
        // 开局指纹：换剧本/换君主时整局作废（GameState.initCampaign 里判 runKey）
        key: `${sci}:${runPlayerForce()}`,
        force: runPlayerForce(),
        // 标题页按过「開始新局」→ 同剧本同君主也要重开（r86 的 P5）；`consumeFreshStart()`
        // 已经在 start() 开头取过（R214c：打完仗回大地图时不能再吃一次，否则 fresh 丢失）
        fresh: freshRun,
      });
      // [F-06] 同劇本/同勢力重開（runKey 不變）時，上一局殘留的遭遇戰快照必須清掉，
      // 否則新局第一幀會拿舊部隊/舊戰績回寫。
      if (freshRun) this.clearEncounterPending();
      // 君主/勢力：GameState 是白名單存檔，君主欄位走補丁鍵（見 syncMonarchState 註釋）
      this.syncMonarchState();
      this.selected = this.save.owned[0] ?? null;
      // 運行時人事播種（2026-11-26）：劇本表只是「開局快照」，這一步把「我方每座城有誰」
      // 寫進存檔（`save.roster[城]` + `save.cities[城].officers`），敵城補劇本表守將。
      // 之後所有面板（物品/武將名冊/勢力/君主/城池列表）都從存檔讀運行時人事，
      // 不再吃 `garrisonOf(data, 0, 城)` 或 `general.CITY` 這種劇本 0 的靜態表。
      this.seedRuntimeOfficers();
      this.buildCityLabels();
      // 城名 Label 是在 start() 才建的，siblingIndex 比 onLoad 建的戰報 Label 大 → 會蓋住戰報，
      // 這裡把戰報整組提回最上層。
      this.promoteLogLabels();
      this.loadBattleLog();
      // [F-06] 從 Battle 場景回來（遭遇戰真打）：把跨場景快照寫回兵損 + 權威勝負 `save.lastBattle`。
      // 必須在 healStaleQueue() 之前（先有 lastBattle，俘虜佇列才不算「無主戰果」被清掉），
      // 也必須在 resolveCaptureFlow() 之前（它靠 lastBattle 判勝負、決定要不要彈招降面板）。
      const encounter = this.applyPendingEncounter();
      if (encounter.logs.length > 0) this.pushBattleLog(encounter.logs);
      this.loadMonarchSeat();
      this.refresh();
      // 守城戰在 Deploy 場景結算（GameState.recordBattleResult 直接改 owned），回大地圖是新場景，
      // 所以「君主座位那座城丟了」要在 start() 再判一次。
      this.checkMonarchDeath();
      // 招降/斬首/釋放：戰後處置的候選由 BattleRoot 寫進存檔（queuePostBattle），
      // 回大地圖是新場景，所以在這裡開面板。沒有候選時 showIfNeeded 直接返回 null，成本為零。
      //
      // `king` 必須顯式傳：`SurrenderModel.kingOf()` 讀的是 `save.monarch || save.king`，
      // 而本移植的君主存在補丁鍵 `sanguo_monarch_v1`（`M.monarchOf()`），乾淨存檔上這兩個
      // 直欄都是空的 ⇒ 我方君主會被當普通敵將出卡（`project/132` 的 P1b）。
      // 君主名從**補丁視圖**取：本移植的君主存在 `sanguo_monarch_v1`（`this.monarchState`），
      // `this.save` 上只有 `GameState` 白名單那幾欄，直接 `M.monarchOf(this.save)` 恆為空。
      const monarchName = M.monarchOf(this.syncMonarchState()) || runPlayerForce() || '';
      // R214：脏档自愈——队列里有待决名字，却没有配套的 `lastBattle`/`lastPost`（战果记录），
      // 说明那是上一局或旧版本遗留的（`initCampaign(fresh)` 在 R214 之前不清这几个键）。
      // 这种「无主队列」一旦弹面板，玩家就会在新局里看到「处置上一局俘虏」——
      // 2026-11-26 实测：选《討伐董卓》+ 劉備，一进大地图先弹处置张角。
      // 判定与清库都在 `core/run_scoped.ts`（有 `game/tests/run_scoped.test.ts` 守门）。
      if (healStaleQueue(this.save)) {
        GameState.persistSave();
        console.warn('[R214] 清掉无主战果队列（旧档遗留），不弹招降面板');
      }
      // R214 诊断行：真机/模拟器上 `adb logcat -s Cocos` 就能看到这一局到底用什么存档进来的。
      // （2026-11-26 排查「新局弹处置张角」时，靠它把「读的是哪份档」与「屏幕上画的是什么」分开。）
      {
        const diag = this.save as unknown as Record<string, unknown>;
        console.log('[R214] campaign start', JSON.stringify({
          sci,
          force: runPlayerForce(),
          runKey: this.save.runKey ?? null,
          owned: this.save.owned,
          captured: diag.captured ?? null,
          executed: diag.executed ?? null,
          hasLastBattle: Boolean(diag.lastBattle || diag.lastPost),
        }));
      }
      // R214b：之前无条件 `showIfNeeded`，而它的 `atCity` 缺省是
      // `officersAt(data, home, scenIdx ?? 0)`——`scenIdx` 拿到 0（黃巾之亂），于是
      // 《討伐董卓》的新局会按「184 年平原的守将」造出敌将卡：用户看到的就是
      // 「一进大地图先弹处置张角」（2026-11-26 实测，存档里其实 captured=null）。
      // F-01（R220/R221）：胜负门与败方处置收进模型层 `SurrenderModel.resolveCaptureFlow()`——
      // 我方胜才开面板；我方败由敌方 AI 处置我方俘将（save 由模型层落库，UI 只补战报/落盘/提示）。
      const homeCity = this.selected ?? this.save.owned[0] ?? '';
      const garrisonNow = garrisonOf(data as unknown as GarrisonData, sci, homeCity);
      const atCity = Array.isArray(garrisonNow?.officers)
        ? garrisonNow!.officers.map((o) => String(o?.name ?? '')).filter(Boolean)
        : undefined;
      const flow = SurrenderModel.resolveCaptureFlow(SurrenderModel.saveOf(this.save), data, {
        home: homeCity,
        atCity,
        king: monarchName,
        mine: this.myOfficerNames(),
        scenIdx: sci,
      });
      if (flow.logs.length > 0) {
        this.pushBattleLog(
          flow.logs.map((raw) => {
            const l = raw as { text?: string | null; kind?: BattleLogKind | null } | null;
            return battleLogLine(
              Number(this.save?.month ?? 0),
              String(l?.text ?? ''),
              (l?.kind ?? (flow.reason === 'lost' ? 'lose' : 'win')) as BattleLogKind,
            );
          }),
        );
        GameState.persistSave();
      }
      if (flow.open) {
        SurrenderPanel.showIfNeeded(this.node, {
          save: this.save,
          data,
          home: flow.home,
          atCity,
          king: monarchName,
          mine: this.myOfficerNames(),
          // 招降/斬首/釋放會改 `save.roster`（`core/roster.applyPostBattle`）：面板關掉後
          // 把運行時人事同步回兩份名單，物品頁/名冊頁立刻看到新名單。
          onDone: () => {
            this.seedRuntimeOfficers();
            this.refresh();
          },
        });
      } else if (flow.reason === 'lost') {
        // 敗方：敵方 AI 已在模型層處置我軍俘將並落庫，這裡補提示條 + 重建運行時名單。
        this.hintText = this.clampHint(flow.notice, 160);
        this.seedRuntimeOfficers();
        this.refresh();
      } else if (encounter.note) {
        // [F-06] 遭遇戰回寫完成但沒有招降候選（勝/平手）：提示條補一句「剛才那場是怎麼回事」。
        this.hintText = this.clampHint(encounter.note, 160);
        this.refresh();
      }
      // R214c：按 PDF《三国群英传2 全界面按键说明》的大循环「内政(1 月) → 大地图(11 月) → 战斗」，
      // 新局第一年的一月先把内政页打开（原版就是先在内政里安排搜索/开发/征兵再出兵）。
      // 只对「刚按过 開始新局」的那一次生效，之后回大地图/从出征回来都不再自动弹。
      if (freshRun && this.save.month <= 1 && !this.monarchExtinct) {
        const home = this.selected ?? this.save.owned[0] ?? '';
        // [R231b] 新局从内政开始（时钟已由 R226b 停在 3600）——这也算「内政阶段」
        if (home) {
          this.interiorPhase = true;
          GameState.setInteriorPending(true);
          this.openCityPanel(home);
        }
      }
      // [R233] 出征是内政指令：部队出发/回城都不结束内政。进入内政时落了 `interiorPending`，
      // 从 Deploy/Battle 回来重建本场时据此恢复「内政阶段」，否则时钟会自己走起来
      // （制作人实测「在内政界面点出征，也会推进时间」）。
      if (!freshRun && !this.monarchExtinct && GameState.isInteriorPending() && !this.interiorPhase) {
        this.clockPaused = true;
        this.clockT = 0;
        this.interiorPhase = true;
        const homeCity = this.selected ?? this.save?.owned[0] ?? '';
        if (homeCity) this.openCityPanel(homeCity);
      }
      // 結局（d4-ending-list）：統一 / 君主亡 / 0 城 → 滿屏結局，蓋在招降面板之上。
      EndingPanel.showIfEnded(
        this.node,
        { ...this.syncMonarchState(), monarchExtinct: this.monarchExtinct },
        this.cities,
        this.generals,
        { onRestart: () => GameState.resetCache() },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.labelHint) this.labelHint.string = `載入失敗：${message}`;
      console.error('[CampaignRoot]', err);
    }
  }

  // -------------------------------------------------------------------------
  // 节点/坐标
  // -------------------------------------------------------------------------

  private makeGraphics(name: string): Graphics {
    const node = new Node(name);
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
    node.setPosition(0, 0, 0);
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    return node.addComponent(Graphics);
  }

  // -------------------------------------------------------------------------
  // 九宮底板 + 文字層級（w5-cocos-skin）
  // -------------------------------------------------------------------------

  /**
   * 建九宮底板層。
   *
   * 為什麼是「一層獨立節點」而不是把 Sprite 掛到既有節點上：四個底板分屬三個 Graphics
   * 圖層（戰報/提示在 gUi、兩顆頂欄按鈕在 gUi），疊在 Graphics 上必須「晚於它、早於
   * Label」——獨立一層剛好落在那個位置，既不用改造 `drawFrame()`，也不用給任何 Label
   * 調 siblingIndex（`promoteLogLabels()` 的邏輯照舊）。
   *
   * 載入失敗時 `makeNineSlice()` 會自己畫深底 + 1px 暗金描邊（`drawFallback`），
   * 所以 `bundle` 缺圖也不會白屏（降級驗證見 project/124）。
   */
  private buildSkin(): void {
    const layer = new Node('CampaignSkin');
    layer.layer = Layers.Enum.UI_2D;
    layer.setPosition(0, 0, 0);
    const transform = layer.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(DESIGN_W, DESIGN_H);
    layer.parent = this.node;
    this.skinLayer = layer;

    for (const slot of SKIN_SLOTS) {
      const node = makeNineSlice(layer, slot.key, slot.rect.w, slot.rect.h);
      node.name = slot.name;
      placeDesign(node, slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h);
      this.skinNodes.set(slot.name, node);
    }

    // 月令按鈕：按鈕數量隨選擇變化（1~4），所以底板做 4 個槽位、每幀按實際矩形擺
    for (let i = 0; i < ACTION_SKIN_SLOTS; i += 1) {
      const plate = makeNineSlice(layer, 'plate_btn', 200, BUTTON_H);
      plate.name = `SkinActionPlate_${i}`;
      plate.active = false;
      this.skinActionPlates.push(plate);
    }
  }

  /** 把九宮節點擺到設計矩形上（矩形本身一個數字都不改，只讓底板跟著它走） */
  private skinPlace(node: Node, rect: { x: number; y: number; w: number; h: number }): void {
    const transform = node.getComponent(UITransform);
    if (transform) transform.setContentSize(Math.max(1, rect.w), Math.max(1, rect.h));
    placeDesign(node, rect.x, rect.y, rect.w, rect.h);
  }

  /** 月令按鈕底板跟著 `drawActions()` 算出來的矩形走（drawActions 末尾調用） */
  private layoutActionPlates(): void {
    for (let i = 0; i < this.skinActionPlates.length; i += 1) {
      const plate = this.skinActionPlates[i];
      const rect = this.actionRects[i];
      if (!plate) continue;
      if (!rect) {
        plate.active = false;
        continue;
      }
      plate.active = true;
      this.skinPlace(plate, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    }
  }

  /**
   * 文字層級分配（w5-cocos-skin）。
   *
   * 第三個參數是「版式豁免字號」：凡是框的位置被斷言腳本鎖死的字，只換描邊/陰影策略、
   * 不動字號；能動的才落 role 默認值。逐條理由見 project/124 的 role 表。
   */
  private applyRoles(): void {
    // 頁標題：title 默認 40 會把 330 寬的框撐爆（hud_layout.mjs 鎖了 x/right），釘在 32
    applyTextRole(this.labelTitle, 'title', 32);
    // 第二列三塊：君主 / 勢力·城·戰績 body 18，月份 num 20（三塊寬度已在 refresh() 裡釘死）
    applyTextRole(this.labelMonarch, 'body', 18);
    applyTextRole(this.labelStats, 'body', 18);
    applyTextRole(this.labelMonth, 'num', 20);
    // 頂欄兩顆按鈕的字：num（20，和原來的 20 一致，補上 1px 描邊）
    applyTextRole(this.labelItems, 'num', 20);
    applyTextRole(this.labelForces, 'num', 20);
    // 圖例 / 提示條：字號由格位和「城市卡三行」釘死，只統一描邊策略
    applyTextRoles(this.labelLegend, 'tip', 12);
    applyTextRole(this.labelList, 'num', 18);
    applyTextRole(this.labelBook, 'num', 18);
    applyTextRole(this.labelHint, 'tip', 15);
    // 月令按鈕的「標題\n說明」：num 20（行高 24 由 onLoad 釘死，role 按比例換算後仍是 24）
    applyTextRoles(this.actionLabels, 'num', 20);
    // 頁頭副標 / 月令副標（w7-cocos-render2）：body 14 / body 13
    applyTextRole(this.labelSubtitle, 'tip', 14);
    applyTextRoles(this.actionSubs, 'badge', 13);
    // 戰報：標題 head 18（原 15，列首 y=890 起，不壓行）、時間/正文 body（字號不動）
    applyTextRole(this.logTitle, 'head', 18);
    applyTextRoles(this.logTimeLabels, 'badge', 12);
    applyTextRoles(this.logTextLabels, 'tip', 13);
    applyTextRole(this.logEmpty, 'tip', 13);
    // 翻頁鈕：num role 但字號釘在 13（22px 高的鈕，20 會撐爆）
    applyTextRole(this.logPrev, 'badge', 13);
    applyTextRole(this.logNext, 'badge', 13);
  }

  // -------------------------------------------------------------------------
  // 美术层（全部异步、失败降级；失败时节点直接隐藏，Graphics 占位照旧）
  // -------------------------------------------------------------------------

  private buildArt(): void {
    // 只留原作 CHINAMAP 一张底图。原先的 `bg/map_bg` 全屏氛围图会和它叠着画：实测把
    // CampaignMapImage 隐藏后地图仍在（project/98 对照复查 §5乙①），说明铺满背景的其实是
    // map_bg。版式统一由 planBaseMap() 算，一张图 + 上下装饰带。
    //
    // v18-cocos-layout：第 3 参数傳 `CONSOLE_TOP`（面板底邊）而不是 DESIGN_H，
    // 下帶只鋪到控制台頂邊；hudTop/hudBottom 仍然傳 HUD_TOP/HUD_BOTTOM（金線外圈位置）。
    const plan = planBaseMap(this.mapImageRect(), DESIGN_W, CONSOLE_TOP, HUD_TOP, CONSOLE_TOP);
    const rect = plan.bands.map;

    // 装饰带先建（siblingIndex 0）：暖褐绢纹 + 双金线，顶替原来 8×12px 的「硬边」渐变淡出
    this.buildMapBands(plan);

    this.artMap = new ArtBg(this.node, 'CampaignMapImage', rect, false);
    this.artMap.node.setSiblingIndex(1);
    this.artMap.load(plan.images[0].path, () => this.onArtReady());

    // 蒙版：对应 web 的 .bgveil（rgba(10,14,20,.58→.72)），把地图压到「看得出山水但看不清细节」
    addVeil(this.node, 'CampaignVeil', this.veilRectOnMap(rect), new Color(8, 11, 16, 168));

    // 全屏再压一层淡的：统一地图与装饰带的明度（band 在压条内侧，压太狠会把金线吃掉）
    addVeil(this.node, 'CampaignVeilScreen', { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H }, new Color(8, 11, 16, 96));

    // 城点/光标图元：放在蒙版之上，标签之下（标签在 start() 里才建）
    this.buildCityArt();
  }

  /** 城点四分档（按人口）+ 选中光标。图没到就不画，Graphics 圆点照旧。 */
  private buildCityArt(): void {
    const layer = new Node('CampaignCityIcons');
    layer.layer = Layers.Enum.UI_2D;
    layer.parent = this.node;
    layer.setPosition(0, 0, 0);
    layer.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.cityIconLayer = layer;

    for (let i = 1; i <= 4; i += 1) {
      const index = i - 1;
      loadFrame(`map/city_${i}`, (frame) => {
        this.cityFrames[index] = frame;
        this.cityArtLeft -= 1;
        if (this.save) this.drawFrame();
      });
    }
    loadFrame('map/point', (frame) => {
      this.pointFrame = frame;
      this.cityArtLeft -= 1;
      if (this.save) this.drawFrame();
    });
  }

  /** 按人口把 60 城打成 1..4 档（关隘/人口 0 归第 1 档）。 */
  private computeCityTiers(): void {
    const pops = this.cities
      .map((city) => Number(city.POPULATION) || 0)
      .filter((pop) => pop > 0)
      .sort((a, b) => a - b);
    if (pops.length === 0) return;
    const at = (q: number): number => pops[Math.min(pops.length - 1, Math.floor(q * pops.length))] ?? 0;
    const q1 = at(0.25);
    const q2 = at(0.5);
    const q3 = at(0.75);
    for (const city of this.cities) {
      const pop = Number(city.POPULATION) || 0;
      let tier = 1;
      if (pop > q1) tier += 1;
      if (pop > q2) tier += 1;
      if (pop > q3) tier += 1;
      this.cityTier.set(city.NAME, tier);
    }
  }

  /** 懒建一个城点精灵节点（锚点在底边中点，正好钉在城点坐标上）。 */
  private cityIconAt(name: string): { node: Node; sprite: Sprite; box: UITransform } {
    const cached = this.cityIcons.get(name);
    if (cached) return cached;
    const node = new Node(`CityIcon_${name}`);
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.cityIconLayer ?? this.node;
    const box = node.addComponent(UITransform);
    box.setAnchorPoint(0.5, 0);
    box.setContentSize(24, 20);
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.enabled = false;
    node.active = false;
    const slot = { node, sprite, box };
    this.cityIcons.set(name, slot);
    return slot;
  }

  private ensurePointIcon(): { node: Node; sprite: Sprite; box: UITransform } {
    if (this.pointIcon) return this.pointIcon;
    const node = new Node('CampaignCursor');
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.cityIconLayer ?? this.node;
    const box = node.addComponent(UITransform);
    box.setAnchorPoint(0.5, 0.5);
    box.setContentSize(9, 9);
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.pointIcon = { node, sprite, box };
    return this.pointIcon;
  }

  /**
   * 上下装饰带（对应 web/campaign.html 的 `drawBands()`）：暖褐渐变 + 极淡绢纹 + 上下双金线
   * + 图边 1px 压线。原来地图上下边缘是 8×12px 的半透明「渐变淡出」，和全屏氛围底图之间
   * 仍是一道硬边（:233 的注释自承）；现在底图只有一张，边缘交给装裱带。
   */
  private buildMapBands(plan: BaseMapPlan): void {
    const node = new Node('CampaignBands');
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    node.setPosition(0, 0, 0);
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    node.setSiblingIndex(0);
    const g = node.addComponent(Graphics);

    this.paintBand(g, plan.bands.top);
    this.paintBand(g, plan.bands.bottom);

    // 图边 1px 金线：底图与装裱带的「接口」（web: rgba(216,179,106,.30) strokeRect）
    g.strokeColor = rgba('#D8B36A', 76);
    g.lineWidth = 1;
    g.rect(
      plan.bands.map.x - HALF_W,
      HALF_H - plan.bands.map.y - plan.bands.map.h,
      plan.bands.map.w,
      plan.bands.map.h,
    );
    g.stroke();

    // 双金线：内线贴着图边（3px + 1px 高光），外线贴着 HUD 压条（1px）。
    // web 用 rail_gold.png(111×12) 平铺；本任务不许跑 Cocos 导入/构建，故用同色同位的实线等价替代，
    // 见 project/101 的「没做到」。
    const [topInner, topOuter] = plan.rails.top;
    const [bottomInner, bottomOuter] = plan.rails.bottom;
    this.fillRect(g, 0, topInner, DESIGN_W, 3, '#B08A4A', 235);
    this.fillRect(g, 0, topInner - 1, DESIGN_W, 1, '#E6C98A', 140);
    this.fillRect(g, 0, topOuter, DESIGN_W, 1, '#8A6A38', 190);
    this.fillRect(g, 0, bottomInner, DESIGN_W, 3, '#B08A4A', 235);
    this.fillRect(g, 0, bottomInner + 3, DESIGN_W, 1, '#E6C98A', 140);
    this.fillRect(g, 0, bottomOuter, DESIGN_W, 1, '#8A6A38', 190);
  }

  /** 一条装裱带：12 段暖褐近似渐变（ΔRGB≈1，看不出台阶）+ 一次批量绢纹。 */
  private paintBand(g: Graphics, band: MapBand): void {
    if (band.h < 1 || band.w < 1) return;
    const STEPS = 12;
    for (let i = 0; i < STEPS; i += 1) {
      const y = band.y + (band.h * i) / STEPS;
      const h = (band.h * (i + 1)) / STEPS - (band.h * i) / STEPS;
      const c = bandColorAt((i + 0.5) / STEPS);
      g.fillColor = new Color(c.r, c.g, c.b, 255);
      g.rect(band.x - HALF_W, HALF_H - y - h, band.w, h);
      g.fill();
    }
    // 绢纹：web 是每 4px 一条 alpha .045 的 #D8B36A 横线；这里把整条带的横线攒进一次 fill。
    g.fillColor = rgba('#D8B36A', 11);
    let lines = 0;
    for (let y = band.y + 3; y + 1 <= band.y + band.h - 2; y += 4) {
      g.rect(band.x - HALF_W, HALF_H - y - 1, band.w, 1);
      lines += 1;
    }
    if (lines > 0) g.fill();
  }

  /**
   * 底图（1280×960 世界）→ 屏幕矩形，与 `toScreen` 同源，保证城点不偏。
   *
   * v18-cocos-layout：改成「按 750 設計寬等比鋪滿、在 MAP_VIEW 內垂直居中」→
   * `{x:0, y:198.75, w:750, h:562.5}`，左右溢出 0（舊版 `{x:-14.63, y:279.99, w:813.59, h:610.19}`）。
   */
  private mapImageRect(): { x: number; y: number; w: number; h: number } {
    return baseMapRect(MAP_VIEW);
  }

  /** 版式驗收用（`work\cocos_layout\assert_layout.mjs`）：底圖矩形 */
  public mapRect(): { x: number; y: number; w: number; h: number } {
    return this.mapImageRect();
  }

  /** 版式驗收用：戰報面板矩形 */
  public logRect(): { x: number; y: number; w: number; h: number } {
    return { x: LOG_VIEW.x, y: LOG_VIEW.y, w: LOG_VIEW.w, h: LOG_VIEW.h };
  }

  /** 版式驗收用：月令按鈕列與底部提示列的位置 */
  public consoleRects(): {
    actions: { x: number; y: number; w: number; h: number };
    hint: { x: number; y: number; w: number; h: number };
  } {
    return {
      actions: { x: 16, y: BUTTON_Y, w: DESIGN_W - 32, h: BUTTON_H },
      hint: { x: 25, y: BUTTON_Y + BUTTON_H + 12, w: DESIGN_W - 50, h: DESIGN_H - (BUTTON_Y + BUTTON_H + 12) - 4 },
    };
  }

  /**
   * 蒙版矩形：**按地图矩形直传**（r89 根治）。
   *
   * `ArtLayer.addVeil()` 的双倍偏移已在源头修掉（`ArtLayer.ts:veilLocalRect()`），
   * 这里不再需要反解；旧版为绕开那个 bug 传的是 `y = (target.y - 2 + 667 - h/2) / 2`
   * （地图 rect 时算出 290.25）。保留这个函数只为调用端不必改：日后要给蒙版加内缩/外扩，
   * 也只改下面这一行。
   */
  private veilRectOnMap(target: { x: number; y: number; w: number; h: number }): {
    x: number;
    y: number;
    w: number;
    h: number;
  } {
    return { x: target.x, y: target.y, w: target.w, h: target.h };
  }

  /** 图到（或明确失败）后重画一次；没存档时什么都不做，start() 会自行 refresh。 */
  private onArtReady(): void {
    if (this.save) this.drawFrame();
  }

  private makeLabel(
    text: string,
    cx: number,
    cy: number,
    width: number,
    fontSize: number,
    color: string,
    align: 'left' | 'center' | 'right',
  ): Label {
    const node = new Node(`Label_${text || 'empty'}`);
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(width, fontSize * 3);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.4);
    label.color = rgba(color);
    label.horizontalAlign =
      align === 'left'
        ? Label.HorizontalAlign.LEFT
        : align === 'right'
          ? Label.HorizontalAlign.RIGHT
          : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.NONE;
    // Label 的横向对齐发生在自己的 UITransform 框内；节点默认锚点 0.5，
    // 所以 left/right 要把“框的边”换算成“框的中心”，否则整段文字会偏出半宽。
    const centerX = align === 'left' ? cx + width / 2 : align === 'right' ? cx - width / 2 : cx;
    node.setPosition(centerX - HALF_W, HALF_H - cy, 0);
    return label;
  }

  private fillRect(g: Graphics, x: number, y: number, w: number, h: number, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(x - HALF_W, HALF_H - y - h, w, h);
    g.fill();
  }

  /** 漸層近似（w5-render）：把設計座標色帶交給本頁的 fillRect */
  private paintBands(g: Graphics, bands: Band[]): void {
    for (let i = 0; i < bands.length; i += 1) {
      const band = bands[i];
      this.fillRect(g, band.x, band.y, band.w, band.h, band.color, band.alpha);
    }
  }

  private strokeRect(g: Graphics, x: number, y: number, w: number, h: number, color: string, width = 2): void {
    g.strokeColor = rgba(color);
    g.lineWidth = width;
    g.rect(x - HALF_W, HALF_H - y - h, w, h);
    g.stroke();
  }

  /**
   * 世界（= 1280×960 底圖原圖像素）→ 設計座標。v18-cocos-layout 起直接從 `baseMapRect()`
   * 推：`k = 750/1280`，`screen = {x: rect.x + wx*k, y: rect.y + wy*k}`。
   * 跟舊版的差別只在尺度（0.635619 → 0.5859375）與原點（-14.63/279.99 → 0/198.75），
   * 城點與底圖仍然是**同一套變換**，所以不會錯位。
   */
  private toScreen(x: number, y: number): { x: number; y: number } {
    const rect = baseMapRect(MAP_VIEW);
    const k = baseMapScale(MAP_VIEW.w);
    return { x: rect.x + x * k, y: rect.y + y * k };
  }

  // -------------------------------------------------------------------------
  // 数据/操作
  // -------------------------------------------------------------------------

  private cityByName(name: string): CampaignCity | undefined {
    return this.cities.find((city) => city.NAME === name);
  }

  private commander(): CampaignGeneral | null {
    if (!this.save) return null;
    const pool = this.generals
      .filter((gen) => gen.NAME !== '盜賊' && !!gen.CITY && this.save!.owned.includes(gen.CITY))
      .sort((a, b) => b.STR + b.INT - (a.STR + a.INT));
    return pool[0] ?? null;
  }

  private actions(): Action[] {
    if (!this.save || !this.selected) {
      return [{ kind: 'advance', title: '內 政 終 了', caption: '結束內政 · 跑完一年', primary: false, enabled: true }];
    }
    const own = this.save.owned.includes(this.selected);
    if (own) {
      // [F4] 「內 政 終 了」＝ 跑完一年（web `campaign.html:2517 endMonth()` → `advanceMonth(12)`）。
      // 舊標題「推進一月」是本次要修掉的 bug：原生包按了只走 1 個月，玩家才回報「還是按月推進」。
      const advance: Action = {
        kind: 'advance',
        title: this.clockPaused ? '內 政 終 了' : '時 間 流 動',
        caption: `結束內政 · 稅入 +${this.income()}`,
        primary: false,
        enabled: true,
      };
      // 敵軍已經到城下 → 「守 城 戰」是唯一该做的事，排到第一位并高亮（web 的 ?defend=1）
      const arrived = GameState.arrivedAt(this.selected, 'B');
      if (arrived.length > 0) {
        const first = arrived[0];
        return [
          {
            kind: 'defend',
            title: '守 城 戰',
            caption: `敵 ${first.general ?? '來犯'} · ${first.troops} 兵`,
            primary: true,
            enabled: true,
          },
          { kind: 'recruit', title: '徵 兵', caption: '進城徵兵 · 金→預備兵→兵', primary: false, enabled: true },
          { kind: 'develop', title: '開 發', caption: '進城開發 · 選將執行', primary: false, enabled: true },
          advance,
        ];
      }
      // 敵軍在路上：给一个不可点的槽位说明「为什麼现在还不能打」，比只在提示行里写更显眼
      const incoming = GameState.armiesTo(this.selected, 'B').filter((army) => army.progress < 1);
      if (incoming.length > 0) {
        const first = incoming[0];
        return [
          { kind: 'recruit', title: '徵 兵', caption: '進城徵兵 · 金→預備兵→兵', primary: false, enabled: true },
          { kind: 'develop', title: '開 發', caption: '進城開發 · 選將執行', primary: false, enabled: true },
          {
            kind: 'defend',
            title: '行 軍 中',
            caption: `${first.from} 軍 ${first.troops} 兵 · ${Math.round(first.progress * 100)}%`,
            primary: false,
            enabled: false,
          },
          advance,
        ];
      }
      return [
        { kind: 'interior', title: '內 政', caption: '徵兵 · 開發 · 搜索', primary: false, enabled: true },
        advance,
      ];
    }
    const distance = GameState.distanceFromOwned(this.selected, this.paths);
    const near = distance === 1;
    const commander = this.commander();
    const intel = this.enemyIntelOf(this.selected);
    // 兵團指令的「出征」是派部隊（progress 0 在路上），所以抵達之後要有第二個入口：
    // 這座敵城城下已經有我方部隊 → 第一位換成「攻 城 戰」（web 的野戰/攻城 entry 同語義）。
    const arrivedMine = GameState.arrivedAt(this.selected, 'A');
    if (arrivedMine.length > 0) {
      const first = arrivedMine[0]!;
      return [
        {
          kind: 'march',
          title: '攻 城 戰',
          caption: `${first.general ?? '我軍'} ${first.troops} 兵 已到城下 · 守 ${intel?.name ?? '—'}`,
          primary: true,
          enabled: true,
        },
        { kind: 'advance', title: '內 政 終 了', caption: `結束內政 · 稅入 +${this.income()}`, primary: false, enabled: true },
      ];
    }
    const onRoadMine = GameState.armiesTo(this.selected, 'A').filter((army) => army.progress < 1);
    if (onRoadMine.length > 0) {
      const first = onRoadMine[0]!;
      return [
        {
          kind: 'march',
          title: '行 軍 中',
          caption: `${first.from} 出發 ${first.troops} 兵 · ${Math.round(first.progress * 100)}%`,
          primary: false,
          enabled: false,
        },
        { kind: 'advance', title: '內 政 終 了', caption: `結束內政 · 稅入 +${this.income()}`, primary: false, enabled: true },
      ];
    }
    return [
      {
        kind: 'march',
        title: '出 征',
        caption: near
          ? `目標 ${this.selected} · 守 ${intel?.name ?? '—'}${commander ? ` · ${commander.NAME}` : ''}`
          : distance >= 99
            ? '與我方領土不接壤'
            : `需 ${distance} 段路`,
        primary: true,
        enabled: near,
      },
      { kind: 'advance', title: '內 政 終 了', caption: `結束內政 · 稅入 +${this.income()}`, primary: false, enabled: true },
    ];
  }

  /** 目標城守將（含空城「守備隊」兜底）：按鈕 caption 與城市卡都用它，避免兩處口徑不同 */
  private enemyIntelOf(name: string): EnemyIntel | null {
    if (!this.data) return null;
    try {
      return resolveEnemyIntel(this.data, this.scenIdx, name, 100);
    } catch (err) {
      console.warn('[CampaignRoot] resolveEnemyIntel 失敗', err);
      return null;
    }
  }

  /**
   * 某城的「带兵武将名」：先取运行时人事（在城、未被俘），再退剧本守将/太守。
   * AiRunner 的候选只带兵、不带将名，这里补上——AI 来犯时不再统一显示「來犯之將」。
   */
  private cityGeneralName(name: string): string {
    const save = this.save;
    try {
      const runtime = O.officersOfCity(save, name, this.rosterCtx());
      if (runtime[0]?.name) return runtime[0].name;
    } catch (err) {
      console.warn('[CampaignRoot] cityGeneralName 失敗', err);
    }
    if (!this.data) return '';
    const table = garrisonOf(this.data as unknown as GarrisonData, this.scenIdx, name);
    return table?.officers?.[0]?.name ?? table?.major ?? '';
  }

  /**
   * 年稅預覽（正月結算）。
   *
   * web 真源：`campaign.html:5437-5448` `advanceMonth()` 內的年稅：
   *   `const tax = CM.annualTax(st.pop); st.money = Saves.num(st.money) + tax; income += tax;`
   * 舊碼 `floor(pop/5000)*4` 是自己編的口徑，跟 web/原作都不一樣，這裡改成同一條公式
   * （關卡不算城，`GameState.isGateCity` 跳過）。
   */
  private income(): number {
    if (!this.save) return 0;
    let total = 0;
    for (const name of this.save.owned) {
      const state = this.save.cities[name];
      if (!state) continue;
      const def = this.cities.find((city) => city.NAME === name);
      if (def && GameState.isGateCity(def)) continue;
      total += Math.floor(state.pop * 75 / 10000) + 2250;
    }
    return total;
  }

  private select(name: string): void {
    this.selected = name;
    this.hintText = '';
    // 自己的城 → 進內政頁（web 是 city.html 獨立頁；Cocos 用面板，見 project/69）
    if (this.save && this.save.owned.includes(name)) {
      this.openCityPanel(name);
      return;
    }
    this.refresh();
  }

  /**
   * 打開內政面板（對應 web `campaign.html` 點自己的城 → `city.html?city=<名>`）。
   * 面板延遲建一次，之後只做 open/hide —— 用顯示/隱藏當頁面切換，不新建 scene。
   */
  private openCityPanel(cityName: string, openCmd?: string): void {
    if (!this.data) return;
    if (!this.cityPanel) {
      const node = new Node('CityPanel');
      node.parent = this.node;
      node.layer = Layers.Enum.UI_2D;
      node.setPosition(0, 0, 0);
      node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
      this.cityPanel = node.addComponent(CityPanel);
    }
    // [P0-2] garrison.json 是 DataLoader 的**可選**增強表：載到了才傳（沒有就讓城 Model 回落 110）
    const garrisonRaw = (this.data as unknown as { garrison?: unknown }).garrison;
    const garrison = Array.isArray(garrisonRaw) ? (garrisonRaw as GarrisonScenario[]) : null;
    this.clockPaused = true;
    // [R229] 原作沒有「返回」：正月內政裡離開城内頁 = 內政終了（T 重設 3600、時間開始流動），
    // 年中只能查看，所以按鉅仍叫「返回」。
    const inInterior = this.interiorPhase || this.clockT <= 0;
    this.cityPanel.open({
      cityName,
      data: this.data,
      scenario: this.scenarioLike(),
      // [P0-2] 當前劇本號：內政 roster / wildPool / 關卡守軍全部按它取
      scenIdx: this.scenIdx,
      garrison,
      // [F12/F15] 大地圖「徵兵」「開發」按鈕：進城後直接開對應抽屜
      openCmd,
      backLabel: inInterior ? '內 政 終 了' : '← 返 回',
      onClose: () => {
        // 面板已把 gold / 城況 / 內政欄位寫回存檔；這裡只重新讀一次並刷新大地圖
        this.save = GameState.loadSave();
        // [R235] 出征是「出門」不是「離開內政」：這條路上不要 endInterior()，
        // 否則時間會在大地圖閃現的那一兩幀開始走（interiorPending 留著，回大地圖時再恢復內政）。
        if (this.navLock) {
          this.cityPanel?.hide();
          return;
        }
        // [ROSTER_SRC] 內政的任免/派遣/招降/移動改的是 `sanguo_city_v1.roster`；
        // 關面板時把兩份名單與 `cities[城].officers` 同步一次，物品頁/名冊頁立刻同口徑。
        this.seedRuntimeOfficers();
        this.cityPanel?.hide();
        // [R227] 原作「離開內政」＝ T 重設 3600（0x41BBF5）；玩家用「返回」關掉城內頁時同樣處理，
        // 否則 T=0 會立刻再把內政頁彈回來。
        if (this.interiorPhase) {
          // [R231b] 内政阶段按「内政终了」/关页 = 原作 0x41BBF5：T 重设 3600、时间开始流动
          this.endInterior();
        } else {
          if (this.clockT <= 0) {
            this.clockT = 3600;
            this.clockAcc = 0;
          }
          this.clockPaused = false;
        }
        this.hintText = `${cityName}：內政已更新（國庫 ${GameState.nationalGold()} 金）。`;
        this.refresh();
      },
      onDeploy: (target: string) => {
        // 出征沿用大地圖既有的 doAction('march')：敵情、出發城都在那裡定
        // [R235] 這條路會切到 Deploy 場景：先上鎖，否則大地圖閃現的那一兩幀會把時間走掉
        this.navLock = true;
        this.cityPanel?.hide();
        this.selected = target;
        this.hintText = '';
        this.doAction('march');
      },
    });
  }

  /**
   * [F4] 內 政 終 了 = 推進一年（用戶實測抱怨的那一項）。
   *
   * web 真源：`web/campaign.html:2517-2533 endMonth()`：
   *   ① 正月才有內政窗口（`Saves.monthOfYear(save.month) !== 1` → 拒）；
   *   ② 本月已收束（`CM.monthLocked(save, UNLIMITED)`）→ 拒；
   *   ③ `CM.markMonthActed()` + 兩行日誌（「內 政 終 了」「大 地 圖：結束內政 → 跑完一年」）；
   *   ④ `advanceMonth(12)` —— 逐月循環 12 次（5389-5558），月份事件按月結算。
   *
   * Cocos 這一版**推進方式逐字一致**：一次跑 N 個月，逐月 `advanceMonth`（年稅/補兵）→
   * `advanceArmiesMonth()`（我軍行軍/抵達）→ `runMapAi()`（AI 月結算/出兵），最後落到次年正月。
   * 不是「月份 +12 就完事」—— 月報、行軍、抵達城下都按 N 次逐月走。
   * 內政窗口回到 web 口徑：原作只在每年正月開（`Saves.monthOfYear(save.month) === 1`），
   * 面板內部的閘門見 `CityPanel.runCommand`（正月門 + 逐將年令）。
   * `GameState.advanceSteps()` 在 `sanguo_adv_single='1'` 時只走 1 個月（對照 web `?adv=1`）。
   */
  /**
   * [R225] 原作时钟：每帧 `T -= 1`（`0x41B6C1`），跨过 300 的整数倍就是一个月，`T == 0` 进内政。
   *
   * 与旧实现的差别（旧实现在 `endInterior()` 里一次帧内 for 循环跑 12 个月）：
   *   - 时间由 `update(dt)` 驱动，玩家能看见月份一周一周走、兵团一格一格挪；
   *   - 月度结算（年税/补兵/行军/AI）只在**月边界**跑一次；
   *   - 「內 政 終 了」只把 `T` 重设 3600 并恢复时钟（原作 `0x41BBF5`），不做模拟。
   */
  update(dt: number): void {
    if (!this.save) return;
    // [R227] T 已歸零但還沒進內政（例如上一步被 UI 暫停）：先補這一步，別讓玩家「錯過」內政。
    if (this.clockT <= 0 && !this.clockPaused) {
      this.enterInterior();
      return;
    }
    if (!this.clockRunning()) return;
    // 60Hz 固定步长：原作逐帧减 1，60fps ≈ 一秒 60 tick（一年 60 秒、一月 5 秒）
    const step = 1 / 60;
    this.clockAcc += Math.min(dt, 0.25);
    let guard = 0;
    while (this.clockAcc >= step && guard < 240) {
      this.clockAcc -= step;
      guard += 1;
      this.stepClock(this.clockSpeed);
      // stepClock 可能开内政页 / 切战场，此时立刻收手
      if (!this.clockRunning()) return;
    }
  }

  /** 时钟能不能走：内政页/模态暗幕/无存档都不走（原作内政场景不碰 T） */
  private clockRunning(): boolean {
    if (!this.save) return false;
    if (this.navLock) return false; // [R235] 場景切換中（出征 → Deploy）不許走表
    if (this.clockPaused) return false;
    if (this.cityPanel?.isOpen()) return false;
    if (this.node.children.some((c) => c.name.startsWith('Scrim_'))) return false;
    // [R227] 原作打開任何界面時，大地圖場景仍在跑，但玩家的「內政/操作」機會不能被時間吃掉：
    // 這裡把「面板開著就停錶」當成硬規則（用戶實測：開著界面時間照跑，回來已經過了好幾個月）。
    if (this.node.children.some((c) => c.active && UI_PANEL_NODES.has(c.name))) return false;
    return true;
  }

  /** 推进 n 个 tick：跨月结算 + T==0 进内政（原作 `0x41B6C1` / `0x41B6CF`） */
  private stepClock(n: number): void {
    if (!this.save || n <= 0) return;
    const before = this.clockT;
    this.clockT = Math.max(0, this.clockT - n);
    // [R225b] 原作兵團是「每幀推進」（0x41AFAB），不是按月跳；先走行軍再處理月邊界。
    this.stepArmiesFrame(n);
    if (this.clockPaused) { this.clockT = Math.max(0, this.clockT); return; }
    const monthBefore = Math.floor((3600 - before) / 300);
    const monthAfter = Math.floor((3600 - this.clockT) / 300);
    for (let m = monthBefore + 1; m <= monthAfter; m += 1) {
      if (!this.monthTick()) return;
    }
    if (this.clockT <= 0) this.enterInterior();
  }

  /**
   * 月边界的一次结算（旧 `endInterior()` 循环体逐月搬过来，顺序完全一致）：
   * 年税/补兵 → 我军行军/抵达 → AI 月结算 → 战报。
   * 返回 false 表示中途切了战场（本 tick 不再继续）。
   */
  private monthTick(): boolean {
    if (!this.save) return false;
    const from = this.save.month;
    const income = GameState.advanceMonth(this.cities, { data: this.data });
    const ai = this.runMapAi();
    if (!ai) this.spawnRaid();
    this.save = GameState.loadSave();
    this.recordAiBattleLog(ai);
    const arriving = this.save.owned
      .map((city) => GameState.arrivedAt(city, 'B').map((army) => ({ army, city })))
      .reduce((acc, list) => acc.concat(list), [] as Array<{ army: Army; city: string }>);
    if (arriving.length > 0 && this.clockT > 300) {
      this.hintText = this.clampHint(`敵軍已到 ${arriving[0].city} 城下：點該城 →「守 城 戰」。`, 160);
    } else if (income > 0) {
      this.hintText = this.clampHint(`${from} 月 → ${this.save.month} 月：稅入 +${income} 金。`, 160);
    }
    this.refresh();
    return true;
  }

  /** 原作 `T == 0`：进内政（年份在进内政时 +1，`0x4238BB`）；这里開城內頁代替「内政场景」 */
  private enterInterior(): void {
    if (!this.save || this.clockPaused) return;
    this.clockPaused = true;
    this.interiorPhase = true;
    this.clockT = 0;
    // [R233] 内政阶段落盘：出征/攻城往返会重建 CampaignRoot，靠它恢复「还在内政里」
    GameState.setInteriorPending(true);
    const home = this.selected ?? this.save.owned[0] ?? '';
    this.pushBattleLog([
      // [R232] 戰報是給玩家看的，反匯編位址留在程式註解裡，不要寫進 UI
      battleLogLine(this.save.month, '時 間：一年過去了 → 進入內政', 'year'),
    ]);
    this.hintText = this.clampHint('內政時間到了：安排完搜索／開發／徵兵，點左上「內 政 終 了」再回大地圖。', 160);
    this.refresh();
    if (home) this.openCityPanel(home);
  }

  /**
   * [R225] 「內 政 終 了」＝ 原作 `0x41BBF5`：把 `T` 重设 3600、清队伍状态、切回大地图。
   * **不跑任何月份模拟**（旧实现一次跑 12 个月，用户实测抱怨的点）。
   */
  private endInterior(): void {
    if (!this.save) return;
    this.interiorPhase = false;
    this.clockPaused = false;
    this.clockT = 3600;
    this.clockAcc = 0;
    // [R233] 内政结束（原作 0x41BBF5）→ 清标记，之后切场景回来不再自动进内政
    GameState.setInteriorPending(false);
    this.pushBattleLog([
      battleLogLine(this.save.month, '內 政 終 了：時間開始流動', 'year'),
    ]);
    this.hintText = this.clampHint('時間開始流動：部队会按月前进，一年后自动回到内政。', 160);
    this.refresh();
  }

  private doAction(kind: ActionKind): void {
    if (!this.save) return;
    if (kind === 'advance') {
      // [R225] 原作這顆按鈕只屬於內政場景（`0x41BBF5`：T 重設 3600 後切回大地圖）。
      // 時鐘在走（不在內政）時點它 → 忽略，否則會把 T 歸零、白等一年。
      if (!this.clockPaused) {
        this.hintText = this.clampHint('時間正在流動：等內政時間到了再處理內政。', 160);
        this.refresh();
        return;
      }
      this.endInterior();
      return;
    }
    if (!this.selected) return;
    const selected = this.selected;
    if (kind === 'interior') {
      // R214d：大地圖底部不再用舊口徑「金 500 → 兵 +40 / 金 400 → 民 +3000」直接改數字，
      // 一律進城內頁走 P1 規則（徵兵在城內抽屜、開發不收金、逐將年令、正月窗口）。
      this.hintText = '';
      this.openCityPanel(selected);
      return;
    }
    if (kind === 'recruit') {
      // [F15] 不再走舊口徑「金 500 → 兵 +40」：進城開徵兵抽屜（金→預備兵→兵，原作線）
      this.hintText = '';
      this.openCityPanel(selected, '徵兵');
      return;
    }
    if (kind === 'develop') {
      // [F12] 開發同樣進城：先任命太守、再選執行將（原作不允許無將代行）
      this.hintText = '';
      this.openCityPanel(selected, '開發');
      return;
    }
    if (kind === 'defend') {
      // 守城戰：守方永遠是我方（A），來犯部隊的將/兵放 B 方；戰後按 armyId 把這支部隊撤掉
      const arrived = GameState.arrivedAt(selected, 'B');
      const attack = arrived[0];
      if (!attack) {
        this.hintText = '沒有抵達城下的敵軍。';
        this.refresh();
        return;
      }
      const intel = this.enemyIntelOf(attack.from);
      GameState.setDeployEnemy({
        name: attack.general || intel?.name || '來犯之將',
        str: intel?.str ?? 70,
        int: intel?.int ?? 60,
        troops: Math.max(1, Math.min(100, Math.round(attack.troops))),
        defense: intel?.defense ?? 300,
        fallback: intel?.fallback ?? false,
        owner: intel?.owner ?? '',
      });
      // 守方主将从「被攻的这座城」的驻将里挑（web defendUrl 的 `gen=defenderOf(city)`）
      GameState.setDeployFrom(selected);
      GameState.setDeployTarget(selected);
      GameState.setDeployArmy(attack.id);
      // [R231] 進的是守城戰編成：清掉可能殘留的「攻城戰前準備 / 派兵」上下文，
      // 否則 DeployRoot 會優先走攻城或派兵分支。
      GameState.clearDeploySiege();
      GameState.clearDeployMarch();
      director.loadScene('Deploy');
      return;
    }
    if (kind === 'march') {
      // 兩條路：
      //   A) 城下已有我方部隊 → 攻城戰（進 Deploy 編成屏，這次是「我方進攻」）
      //   B) 還沒有部隊 → 派出部隊（兵團指令與駐紮都需要它先存在）
      const arrivedMine = GameState.arrivedAt(selected, 'A');
      const siege = arrivedMine[0];
      if (!siege) {
        // 打自己的城（增援）→ 不進編成，直接派過去的舊行為
        if (this.save?.owned.includes(selected)) {
          this.dispatchArmyTo(selected);
          return;
        }
        // 打敵城/空城 → 先進編成屏選將、排順序，再由編成屏「出征」派兵團
        const from = GameState.nearestOwnedTo(selected, this.paths);
        if (!from) {
          this.hintText = '找不到可以出發的我方城。';
          this.refresh();
          return;
        }
        const pathIndex = pathBetween(this.scenarioLike(), from, selected);
        if (pathIndex === null) {
          this.hintText = '沒有可走的路：只能打相鄰城。';
          this.refresh();
          return;
        }
        const leader = this.leaderOf(from);
        // 原作兩欄相加才是上陣總數（步 min(5L,100) + 騎 clamp((L-20)*5,0,100)）
        const cap = Math.max(1, Math.round(troopCapSumOf(this.armyGeneralLevel(leader))));
        if (this.troopsOf(from) < 1) {
          this.hintText = `${from} 沒有兵可出征（主將步+騎上限 ${cap}），先徵兵再出征。`;
          this.refresh();
          return;
        }
        // [R231] 這是「從出發城重新派兵」的路，先清掉可能殘留的攻城快照；
        // 抵達戰（城下已有部隊）走下面的 setDeploySiege 分支。
        GameState.clearDeploySiege();
        GameState.setDeployMarch({ from, target: selected, pathIndex });
        GameState.setDeployFrom(from);
        GameState.setDeployTarget(selected);
        GameState.setDeployArmy(null);
        const intel = this.enemyIntelOf(selected);
        GameState.setDeployEnemy(
          intel
            ? {
                name: intel.name,
                str: intel.str,
                int: intel.int,
                troops: intel.troops,
                defense: intel.defense,
                fallback: intel.fallback,
                owner: intel.owner ?? '',
              }
            : null,
        );
        director.loadScene('Deploy');
        return;
      }
      // 進攻不能走 setDeployArmy()：DeployRoot.ts 會把 armyId 當「守城戰」語義（defend=true），
      // 攻城結果由 BattleRoot 的 recordBattleResult（帶 armyId）處理。
      // [R231] 守衛必須在撤隊之前判：舊碼先 removeArmy 再判接壤，不接壤就把部隊白丟了。
      if (GameState.distanceFromOwned(selected, this.paths) !== 1) {
        this.hintText = '不接壤：只能打與我方相鄰的城。';
        this.refresh();
        return;
      }
      // [R231] 撤隊後把「剛抵達的這支兵團」寫成攻城戰前準備快照（將/兵/armyId 全帶走）。
      // 舊碼只寫 setDeployMarch，Deploy 屏按「出征」會再派一支新兵團 → 新兵團又走到城下 → 再彈編成。
      GameState.removeArmy(siege.id);
      this.save = GameState.loadSave();
      GameState.clearDeployMarch();
      GameState.setDeploySiege(this.siegeSnapshotOf(siege, selected, siege.from));
      // 敵情在大地圖這一刻定下來（web campaign.html 出征同樣是 `battleSetup(...)` → bgen/bstr/bint）。
      // 傳給 DeployRoot 可以省一次查表，也讓「编成屏 / 戰鬥屏 / 城市卡」三處显示同一組数。
      const intel = this.enemyIntelOf(selected);
      GameState.setDeployEnemy(
        intel
          ? {
              name: intel.name,
              str: intel.str,
              int: intel.int,
              troops: intel.troops,
              defense: intel.defense,
              fallback: intel.fallback,
              owner: intel.owner,
            }
          : null,
      );
      GameState.setDeployArmy(null);
      // web 的出征 URL 带 `from=<出發城>`，deploy.html 用它做 `officersOf(HOME)`。
      // Cocos 用 GameState.setDeployFrom() 传同一份信息（takeDeployFrom 取一次即清）。
      // 出發城 = 与目标相邻、距离序列里最先回溯到的我方城；找不到就交给 DeployRoot 兜底。
      GameState.setDeployFrom(siege.from);
      GameState.setDeployTarget(selected);
      // 軍師：web 在 `encounterUrl()` 傳 `?wise=<seq>`（campaign.html:4358）。Cocos 的 DeployRoot
      // 只讀自己編成屏選的軍師技，這裡把部隊的軍師序號記進提示條，讓玩家在編成屏照著選。
      const advisor = siege.advisor ?? '';
      const wiseSeq = advisor ? this.armyWiseSeq(advisor) : 0;
      this.hintText = advisor
        ? `攻城戰：軍師 ${advisor}${wiseSeq ? `（軍師技 #${wiseSeq}，編成屏請選同一項）` : ''}。`
        : `攻城戰：${siege.general ?? '我軍'} ${siege.troops} 兵。`;
      director.loadScene('Deploy');
    }
  }

  // -------------------------------------------------------------------------
  // 行軍（web campaign.html 的 `save.armies` / spawnAiArmy / handleMarchEvents）
  // -------------------------------------------------------------------------

  /** `core/march.ts` 只认 `{cities, paths}` 这个形状，直接拿本屏的数据喂它 */
  private scenarioLike(): { cities: CampaignCity[]; paths: CampaignPath[] } {
    return { cities: this.cities, paths: this.paths };
  }

  private troopsOf(name: string): number {
    const state = this.save?.cities[name];
    if (state && Number.isFinite(state.troops)) return Math.max(0, Math.round(state.troops));
    const city = this.cityByName(name);
    return city ? GameState.garrisonOf(city) : 0;
  }

  private neighborsOf(name: string): string[] {
    const out: string[] = [];
    for (const path of this.paths) {
      if ((path.Length ?? 0) >= 30000) continue;
      if (path.Start === name) out.push(path.End);
      else if (path.End === name) out.push(path.Start);
    }
    return out;
  }

  /**
   * 敌城出兵候选：只看「与某座我方城相邻」的敌城（web aiCandidates 同口径）。
   * 目标 = 相邻我方城里守军最少的那座；敌兵 < 守军 + 30 就不出兵。
   */
  private raidCandidates(): Array<{ from: string; to: string; troops: number; mine: number; general: string }> {
    const save = this.save;
    if (!save) return [];
    const out: Array<{ from: string; to: string; troops: number; mine: number; general: string }> = [];
    for (const city of this.cities) {
      if (save.owned.includes(city.NAME)) continue;
      // 原作空城/无守将不出兵（0x40CAF1 的 +0x3C 门）；无名将的城不能当作出发城
      const general = this.cityGeneralName(city.NAME);
      if (!general) continue;
      const troops = this.troopsOf(city.NAME);
      const mineNeighbors = this.neighborsOf(city.NAME).filter((name) => save.owned.includes(name));
      if (mineNeighbors.length === 0) continue;
      mineNeighbors.sort((a, b) => this.troopsOf(a) - this.troopsOf(b) || a.localeCompare(b));
      const to = mineNeighbors[0];
      const mine = this.troopsOf(to);
      if (troops < mine + 30) continue;
      out.push({ from: city.NAME, to, troops, mine, general });
    }
    out.sort((a, b) => b.troops - b.mine - (a.troops - a.mine) || a.from.localeCompare(b.from));
    return out;
  }

  /**
   * 大地圖 AI：一次推进所有 AI 势力（对齐 web campaign.html 的 runAiMonth）。
   *
   * - AI 打 AI：就地结算，得失手/灭亡都写进 log 与存档；
   * - AI 打玩家：只产出来犯队列，转成 B 方在途部队（progress=0 → 下个月走完才到城下），
   *   玩家点该城走「守 城 戰」，与现有 arrivedAt 流程一致。
   *
   * `playerId: PLAYER_FORCE` 是**故意**的：Cocos 玩家没有势力 id，`initCampaign` 直接把
   * 剧本前 3 城给玩家，这 3 城在 garrison.json 里可能属于 3 个不同势力。传固定 `'玩家'`
   * 后 AiRunner 会把这 3 城的 owner 改写成 `'玩家'`，AI 才会把它们当「别人的城」来打。
   */
  private runMapAi(): AiMonthOutcome | null {
    const save = this.save;
    if (!save || !this.data) return null;
    // [ROSTER_SRC] AI 世界播種也吃存檔運行時人事：先取這座城「現在」的歸屬/太守/駐將
    // （`save.cities[城]` 或我方 roster），只有完全沒有紀錄的城才回落劇本表；
    // 劇本表 fallback 用本局 `this.scenIdx`（舊碼恆 0 ⇒《討伐董卓》跑到 184 年的人事）。
    const garrisonOfCity = (name: string): AiRunnerGarrison | null => {
      const data = this.data;
      if (!data) return null;
      const ctx = this.rosterCtx();
      const table = garrisonOf(data, this.scenIdx, name);
      const runtime = O.officersOfCity(save, name, ctx);
      if (!table && runtime.length === 0) return null;
      // 原作 0x40CAF1 开头 `if (city->[+0x3C] == 0) return 0`：城里没有在职武将就不能出兵。
      // 这里只给 AI 世界播种（garrisonOf 钩子）用，所以“空城不再回落剧本太守”，
      // 否则剧本表里的旧太守名会让空城通过 canDispatch（governor 非空）继续出兵。
      const major = runtime.length
        ? O.cityMajorNameOf(save, name, ctx) || table?.major || ''
        : '';
      return {
        owner: O.cityOwnerOf(save, name) || table?.owner || '',
        major,
        garrison: table?.garrison ?? 0,
        officers: runtime.map((o) => ({ name: o.name, str: o.str, int: o.int, loyal: o.loyal, status: o.status })),
      };
    };
    // 型別：`GameState.CityRuntime.officers` 已升成物件陣列（cocos-officers，
    // 證據 work/cocos_officers85/assign_check.ts + tsconfig.assign.json 的結構賦值檢查），
    // 所以 `CampaignSave` 可以直接賦給 `AiSave`，這行不再需要 `as unknown as AiSave`。
    // 執行期口徑沒變：
    //   - AI 的 `buildMeta/ensureMeta` 只從 `garrisonOf` 與 cities 補缺，不假設 officers 型別；
    //   - `normalize()` 的 `stringArray()` 仍會濾掉非字串，舊存檔照樣相容。
    // （工作記錄：v17-cocos-monarch 之前這裡是唯一一處跨模組型別斷言。）
    const out = runAiMonth(save, this.cities, this.generals, {
      // 玩家势力名来自开局选择（RunSetup）；未选择时回落到 AiRunner 的默认值 '玩家'
      playerId: runPlayerForce() || PLAYER_FORCE,
      paths: this.paths,
      seed: (save.month + 1) * 7919, // 与 web 同一条种子公式
      garrisonOf: garrisonOfCity,
      capOf: (name: string) => {
        const city = this.cityByName(name);
        return city ? GameState.garrisonOf(city) : 0;
      },
    });
    for (const row of out.incoming) {
      const pathIndex = pathBetween(this.scenarioLike(), row.from, row.to);
      if (pathIndex === null) continue;
      // 原作无将城不出兵：出发城查不到任何在职武将就丢弃这条来犯
      const general = row.cand?.generals?.[0] || this.cityGeneralName(row.from) || '';
      if (!general) continue;
      const army: Army = {
        id: GameState.nextArmyId('B'),
        side: 'B',
        from: row.from,
        to: row.to,
        pathIndex,
        progress: 0,
        troops: Math.max(1, Math.round(row.troops)),
        general,
      };
      GameState.addArmy({ ...army, officers: this.armyRosterFor(row.from, general), advisor: '', stationed: false } as CampaignArmy);
    }
    if (out.changed) GameState.persistSave();
    return out;
  }

  /**
   * 每月最多派一支：同一起点已有在途部队就不重复发，全场敌军在途上限 3 支
   * （与 web spawnAiArmy 的两条闸门一致）。返回新部队，没出兵返回 null。
   */
  private spawnRaid(): Army | null {
    const save = this.save;
    if (!save) return null;
    const active = GameState.armies().filter((army) => army.side === 'B' && army.progress < 1);
    if (active.length >= 3) return null;
    for (const candidate of this.raidCandidates()) {
      if (active.some((army) => army.from === candidate.from)) continue;
      const pathIndex = pathBetween(this.scenarioLike(), candidate.from, candidate.to);
      if (pathIndex === null) continue;
      const intel = this.enemyIntelOf(candidate.from);
      const army: Army = {
        id: GameState.nextArmyId('B'),
        side: 'B',
        from: candidate.from,
        to: candidate.to,
        pathIndex,
        progress: 0,
        troops: Math.max(20, Math.min(100, Math.round(candidate.troops * 0.6))),
        general: candidate.general || intel?.name || '敵軍將',
      };
      // 隨軍武將：web `spawnAiArmy()`（campaign.html:4255）也帶 officers（但不任命軍師）
      const officers = this.armyRosterFor(candidate.from, army.general ?? '');
      GameState.addArmy({ ...army, officers, advisor: '', stationed: false } as CampaignArmy);
      return army;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  private buildCityLabels(): void {
    for (const city of this.cities) {
      const label = this.makeLabel(city.NAME, 375, 300, 110, CITY_LABEL_FONT, COLORS.textDim, 'center');
      // 城名壓在深浅不一的底圖上：body role 的 1px 深色描邊（原 addOutline 同參數，
      // 這裡只是把它收到 role 表裡統一管理）。字號釘在 CITY_LABEL_FONT —— 60 城錯開
      // 是 layoutCityLabels(60 個 110→14px 框) 算出幾個字的寬度，改字號會撞框。
      applyTextRole(label, 'body', CITY_LABEL_FONT);
      this.cityLabels.set(city.NAME, label);
    }
  }

  /**
   * 我方在职武将名单（含君主）。
   *
   * 给 `SurrenderPanel` 当 `mine`：`surrenderCandidates()` 用它把「自己人」从敌将卡里剔掉。
   * 为什么要显式给：Cocos 存档的 `roster` 与 `cities[i].officers` 是两条来源，旧档上
   * `roster` 可能还没同步，光靠 `myNamesOf(save)` 会让自己的君主/太守出现在「抓到敵將」里
   * （`project/132` 的 P1b）。
   */
  private myOfficerNames(): string[] {
    const out: string[] = [];
    const add = (raw: unknown): void => {
      const s = String(raw ?? '');
      if (s && out.indexOf(s) < 0) out.push(s);
    };
    add(M.monarchOf(this.save));
    add(M.monarchOf(this.monarchState ?? {}));
    const owned = new Set<string>(Array.isArray(this.save?.owned) ? this.save.owned.map((n) => String(n ?? '')) : []);
    for (const city of this.cities) {
      // `this.cities` 的静态类型是场景清单（`CampaignCity`），运行期却是 `GameState` 的
      // 城市状态（多了 `major/officers` 这两个 AI 端口字段），所以这里按运行期形状取。
      const run = city as unknown as { NAME?: string; major?: string; officers?: Array<{ name?: string } | string> };
      if (!run || !owned.has(String(run.NAME ?? ''))) continue;
      add(run.major);
      for (const officer of run.officers ?? []) {
        add(typeof officer === 'string' ? officer : officer?.name);
      }
    }
    const roster = (this.save as unknown as { roster?: unknown }).roster;
    if (roster && typeof roster === 'object') for (const name of Object.keys(roster as Record<string, unknown>)) add(name);
    return out;
  }

  private refresh(): void {
    const save = this.save;
    if (!save || !this.labelMonth || !this.labelStats) return;
    const view = this.syncMonarchState();
    const year = Math.floor((save.month - 1) / 12) + 1;
    const month = ((save.month - 1) % 12) + 1;
    // 頂欄紀元（web `era.eraTextOfMonth()`，`game/web/era.js:161`；
    // 原作證據 `work/video_ui/A_map_date_zoom_t0130.png`：`西元 184年 4月`，
    // 西元後、年后各一個半角空格，不是「第 1 年 4 月」）
    this.labelMonth.string = `西元 ${adYearOfMonth(save.month, this.startYear)}年 ${month}月`;
    // 頁頭：「君主 X」單獨一段（可點開屬性卡）+「勢力 Y · 城 N · 戰績」
    const monarch = M.monarchOf(view);
    const force = M.forceIdOf(view);
    if (this.labelMonarch) {
      this.labelMonarch.string = `君主 ${monarch || '未選'}`;
      this.labelMonarch.color = rgba(monarch ? M.FORCE_GOLD : COLORS.textDim);
    }
    // [F16] 國庫 = Σ 每城 money（web `CM.nationalGold()`），頂欄顯示國庫而不是單一錢包。
    this.labelStats.string = `·　勢力 ${force || '—'}　·　城 ${save.owned.length}　·　國庫 ${GameState.nationalGold()} 金　·　戰績 ${save.wins} 勝 ${save.losses} 敗`;
    if (this.labelSubtitle) {
      // 頁頭副標：全圖規模一眼可見（web 頁頭 `.hint` 的等價物）
      const total = this.cities.length;
      const forces = new Set<string>();
      for (const city of this.cities) forces.add(typeof city.KING === 'string' ? city.KING : '關隘');
      this.labelSubtitle.string = `全 圖 ${total} 城 · ${forces.size} 方 · 我方 ${save.owned.length} 城`;
      this.labelSubtitle.color = rgba(COLORS.textDim);
    }
    this.labelHint!.string = this.hintText || this.defaultHint();
    this.drawFrame();
    this.refreshBattleLog();
    // 面板開著時跟著換月/攻城重畫（面板只讀 save，不反向叫 refresh，無遞歸）
    if (this.monarchPanel?.isOpen) this.monarchPanel.refresh();
  }

  /**
   * 提示條是**單行、不換行、不裁切**（`labelHint` 建的時候 overflow 保持預設 NONE），
   * 所以超長字串會整條衝出設計寬度、壓在黑邊上（實測 876×1368：AI 月報 13 個勢力全列）。
   * 這裡統一在寫進 `hintText` 前截斷，完整內容一律留在戰報裡。
   */
  private clampHint(text: string, max = 96): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }

  private defaultHint(): string {
    if (!this.selected) return '點城選中；自己的城可內政，別人的城可出征。';
    if (!this.save) return '';
    const card = this.cityCard(this.selected);
    if (this.save.owned.includes(this.selected)) {
      const state = this.save.cities[this.selected];
      const arrived = GameState.arrivedAt(this.selected, 'B');
      const incoming = GameState.armiesTo(this.selected, 'B').filter((army) => army.progress < 1);
      if (arrived.length > 0) {
        const first = arrived[0];
        return `敵 軍 已 到 城 下：${first.general ?? '來犯'} · ${first.troops} 兵（自 ${first.from}）\n點下方「守 城 戰」迎擊\n${card}`;
      }
      if (incoming.length > 0) {
        const first = incoming[0];
        return `行 軍 中：${first.from} → ${this.selected} · ${first.troops} 兵 · 已走 ${Math.round(first.progress * 100)}%\n${card}`;
      }
      return `內政：${this.selected} 兵 ${state?.troops ?? 0} · 民 ${state?.pop ?? 0} · 金 ${state?.money ?? 0}\n${card}`;
    }
    const city = this.cityByName(this.selected);
    const intel = this.enemyIntelOf(this.selected);
    const head = intel
      ? `出征 ${this.selected}：守軍約 ${city ? GameState.garrisonOf(city) : 0} 兵 · 守將 ${intel.name}（武 ${intel.str} / 智 ${intel.int}）`
      : `出征 ${this.selected}：守軍約 ${city ? GameState.garrisonOf(city) : 0} 兵`;
    return `${head}\n${card}`;
  }

  /**
   * 城市卡第二行：勢力 / 太守 / 守將（web campaign.html 的城市卡同字段）。
   *
   * 数据来源 `core/garrison.ts`：`garrisonOf()` 拿勢力/太守/守军，`defendersOf()`
   * 拿上阵的 3 名守将（STR+INT 前 3、太守优先）。`garrison.json` 缺失时两者都会
   * 退回「按武将行 city_by_times 推算」，最差返回空串而不是抛错。
   */
  private cityCard(name: string): string {
    const data = this.data;
    const city = this.cityByName(name);
    const fallback = `勢力 ${this.kingNameOf(city)} · 太守 — · 守將 —`;
    if (!data) return fallback;
    try {
      // [ROSTER_SRC] 先取存檔運行時人事（這座城現在歸誰、駐著誰）；沒有任何紀錄才回落劇本表
      // （`garrisonOf/defendersOf` 用**本局**劇本號，舊碼恆 0 ⇒ 劇本 1 顯示 184 年的人事）。
      const ctx = this.rosterCtx();
      const runtime = O.officersOfCity(this.save, name, ctx);
      const garrison = garrisonOf(data as GarrisonData, this.scenIdx, name);
      const defenders = defendersOf(data as GarrisonData, this.scenIdx, name, 3);
      const owner = O.cityOwnerOf(this.save, name) || garrison?.owner || this.kingNameOf(city);
      const major = O.cityMajorNameOf(this.save, name, ctx) || garrison?.major || '—';
      // 空城（garrison.json 里 officers: []）显示兜底守備隊，而不是一个「—」让人以爲没有守军逻辑
      const intel = this.enemyIntelOf(name);
      const runtimeNames = runtime.map((officer) => officer.name);
      const ordered = major !== '—' && runtimeNames.indexOf(major) >= 0
        ? [major, ...runtimeNames.filter((n) => n !== major)]
        : runtimeNames;
      const names =
        ordered.slice(0, 3).join('/') ||
        defenders.map((officer) => officer.name).join('/') ||
        (intel?.fallback ? `${intel.name}（城防折算 武 ${intel.str}/智 ${intel.int}）` : '—');
      return `勢力 ${owner} · 太守 ${major} · 守將 ${names}`;
    } catch (err) {
      console.warn('[CampaignRoot] cityCard 失敗', err);
      return fallback;
    }
  }

  /**
   * `scenarios.json` 的 `KING` 有两种取值：君主名字串（有主城），或数字 1..12（關隘/空城，
   * 数字是关隘编号而不是势力号）。直接显示会把城市卡写成「勢力 1」，所以数字一律当關隘。
   */
  private kingNameOf(city: CampaignCity | null | undefined): string {
    const king = city?.KING;
    if (typeof king === 'string' && king.length > 0) return king;
    if (typeof king === 'number') return '關隘';
    return '無主';
  }

  private drawFrame(): void {
    const base = this.gBase;
    const map = this.gMap;
    const ui = this.gUi;
    if (!base || !map || !ui || !this.save) return;
    base.clear();
    map.clear();
    ui.clear();

    // 底图模式：整屏交给一张 map/chinamap（+ CampaignBands 装饰带），Graphics 只加两层
    // 半透明压条，让 HUD / 控制台的字有底可落；缺图时退回原来那套纯色块（绝不白屏）。
    //
    // v18-cocos-layout：控制台压条从 (0,1080,750,254) 改成 (0,830,750,504) —— 戰報/按鈕/提示
    // 现在占 830–1334 整段，压条要跟着下移，否则中间的 830–1080 会露出底图并和戰報打架。
    if (this.artMap?.state === 'ready') {
      // 頂欄/控制台壓條改成縱向漸層（w5-render）：純色壓條在 750×1334 上會讀成「一塊布」。
      // 色值照 web 版截圖採樣校準（頁頭 lum≈37、控制台頂 lum≈43、底 lum≈15）。控制台保留
      // 上亮下暗的落差（RMS 靠這個），但整段比原本的 #05070A 抬亮一檔，免得讀成黑洞。
      // 頁頭（w9-render3 第二版）：同樣是「兩層漸層相乘」——web `campaign.html:22`
      // `header{background:linear-gradient(180deg,rgba(216,179,106,.08),transparent)}`
      // 疊在頁頭底色上。14×5 格 = 70 色，每格 53×25 設計像素（dpr=2 下 26×12，夠 8 個像素）。
      this.paintBands(base, lightGrid({ x: 0, y: 0, w: DESIGN_W, h: 124 }, 16, 6, WARM.head, 16, -10));
      // w9-render3：控制台原本是偏藍的 '#272A2D'→'#0D1013'，同一屏上頁頭暖、控制台冷，
      // 讀起來像兩套 UI。web `city.html` 全站只有一套暖褐底（`.sec` 是
      // `linear-gradient(180deg,rgba(18,15,12,.72),rgba(10,9,8,.86))`），所以這裡換成 WARM 表。
      //
      // 再往上一層（w9-render3 第二版）：只切縱向色帶的話色數上限就是段數（28 段），而一段
      // 750×18 的橫條在 dpr=2 截圖裡被平均成兩三種像素色。web 的 `.sec` 底下還壓著
      // `box-shadow:inset 0 0 72px`，等於**兩個方向各一層漸層**，所以同一塊面板有上百色。
      // `lightGrid` 就是照這個做：R 沿 x、G 沿 y 各走一格，22×13 格 = 286 個互不相同的 RGB。
      this.paintBands(base, lightGrid({ x: 0, y: CONSOLE_TOP, w: DESIGN_W, h: DESIGN_H - CONSOLE_TOP }, 26, 15, WARM.console, 20, -16));
      // 交叉疊光（w9-render3）：web 的 `linear-gradient(165deg,…)` 同時帶縱向與橫向分量，
      // 純縱向色帶只有 steps 種色。這裡在縱向色帶上再壓一層「左亮右暗」的暖光，
      // 兩層交叉後每個格子各自一個色 —— 這就是 web 面板能有上百色的機制。
      this.paintBands(
        base,
        wash({ x: 0, y: CONSOLE_TOP, w: DESIGN_W, h: DESIGN_H - CONSOLE_TOP }, '#D8B36A', 24, 4, 12, true),
      );
      // 雙線描邊（w9-render3）：web `campaign.html:70` `.city{border:1px solid rgba(255,255,255,.05)}`
      // 是外線、`:72` `.city.target{box-shadow:0 0 0 1px rgba(216,179,106,.35) inset}` 是內線。
      this.paintBands(base, doubleEdge({ x: 0, y: CONSOLE_TOP, w: DESIGN_W, h: DESIGN_H - CONSOLE_TOP }, '#000000', 170, WARM.line, 150, 1, 2));
    } else {
      this.paintBands(base, vBands(0, 0, DESIGN_W, DESIGN_H, '#12161B', '#171009', 24, 255, 255));
      this.paintBands(base, vBands(0, 0, DESIGN_W, 124, WARM.head, WARM.headLow, 12, 255, 255));
      this.fillRect(base, 0, 124, DESIGN_W, CONSOLE_TOP - 124, COLORS.field, 255);
      this.paintBands(base, vBands(0, CONSOLE_TOP, DESIGN_W, DESIGN_H - CONSOLE_TOP, WARM.console, WARM.consoleLow, 24, 255, 255));
    }
    this.fillRect(base, 0, 123, DESIGN_W, 1, COLORS.line);
    this.fillRect(base, 0, CONSOLE_TOP - 1, DESIGN_W, 1, COLORS.line);
    this.fillRect(base, 0, CONSOLE_TOP + 1, DESIGN_W, 1, COLORS.gold, 44);
    // w7-cocos-render2：頁頭頂端高光條 + 四周內陰影 + 控制台頂緣內陰影，
    // 讓頁頭讀成「壓暗的絨布」而不是一塊純色（web 是 `linear-gradient(180deg,#fff2,transparent)`）。
    this.paintBands(base, vBands(0, 0, DESIGN_W, 7, '#5E4C2C', '#2A241C', 4, 132, 58));
    // 頁頭金調漸層（w9-render3）：web `campaign.html:22`
    //   `header{background:linear-gradient(180deg,rgba(216,179,106,.08),transparent)}`
    // —— 頁頭本身不是純色，頂端有一層極淡的金往上打。這裡用縱向 wash 補，與已存在的
    // 縱向色帶交叉，頁頭就從「一塊暖暖的布」變成「有光的絨面」。
    this.paintBands(base, wash({ x: 0, y: 0, w: DESIGN_W, h: 124 }, '#D8B36A', 18, 0, 8, false));
    this.paintBands(base, edgeBands({ x: 0, y: 0, w: DESIGN_W, h: 124 }, '#000000', 150, 22, 4));
    this.paintBands(base, vBands(0, CONSOLE_TOP, DESIGN_W, 9, '#000000', '#272A2D', 5, 130, 0));

    this.drawMap(map);
    this.drawActions(ui);
    // 物品頁入口（w4-cocos-items）：頭部右側的小按鈕（金屬漸層 + 頂部高光）
    this.paintBands(ui, vBands(ITEMS_BUTTON.x, ITEMS_BUTTON.y, ITEMS_BUTTON.w, ITEMS_BUTTON.h, '#3A2C1B', '#161009', 6, 246, 246));
    this.paintBands(ui, hBands(ITEMS_BUTTON.x, ITEMS_BUTTON.y, ITEMS_BUTTON.w, ITEMS_BUTTON.h, '#6B5327', '#221809', 4, 64, 22));
    this.paintBands(ui, topSheen(ITEMS_BUTTON.x + 1, ITEMS_BUTTON.y + 1, ITEMS_BUTTON.w - 2, '#F2DCA8', 48));
    this.paintBands(ui, edgeBands(ITEMS_BUTTON, '#000000', 90, 6, 2));
    this.strokeRect(ui, ITEMS_BUTTON.x, ITEMS_BUTTON.y, ITEMS_BUTTON.w, ITEMS_BUTTON.h, COLORS.gold, 1);
    // 勢力一覽入口（v16-cocos-monarch）
    this.paintBands(ui, vBands(FORCES_BUTTON.x, FORCES_BUTTON.y, FORCES_BUTTON.w, FORCES_BUTTON.h, '#3A2C1B', '#161009', 6, 246, 246));
    this.paintBands(ui, hBands(FORCES_BUTTON.x, FORCES_BUTTON.y, FORCES_BUTTON.w, FORCES_BUTTON.h, '#6B5327', '#221809', 4, 64, 22));
    this.paintBands(ui, topSheen(FORCES_BUTTON.x + 1, FORCES_BUTTON.y + 1, FORCES_BUTTON.w - 2, '#F2DCA8', 48));
    this.paintBands(ui, edgeBands(FORCES_BUTTON, '#000000', 90, 6, 2));
    this.strokeRect(ui, FORCES_BUTTON.x, FORCES_BUTTON.y, FORCES_BUTTON.w, FORCES_BUTTON.h, COLORS.gold, 1);
    // 頁頭「君主 X」可點（點開屬性卡）：底下一條極淡的金線，提示這裡能點
    this.fillRect(ui, MONARCH_HIT.x, MONARCH_HIT.y + MONARCH_HIT.h - 3, MONARCH_HIT.w, 1, COLORS.gold, 70);
    // 圖例底板（w7-cocos-render2）：三色點 + 說明落在同一塊小絹面上，x 從 266 起以躲開「名 冊」
    this.paintBands(ui, vBands(266, 774, 234, 36, '#2A2115', '#11100A', 6, 168, 168));
    this.paintBands(ui, topSheen(267, 775, 232, '#F2DCA8', 34));
    this.strokeRect(ui, 266, 774, 234, 36, COLORS.line, 1);
    // 圖例（v18-cocos-layout）：地圖下裝裱帶裡的三色圓點，文字是 onLoad 建的 labelLegend。
    // 圓點 cx 268/342/416，文字框中心 306/380/454（= 點右邊 10px），r=4。
    const legendDots = [COLORS.gold, COLORS.ours, COLORS.textFaint];
    legendDots.forEach((color, index) => {
      const cx = 268 + index * 74;
      ui.fillColor = rgba(color, 235);
      ui.circle(cx - HALF_W, HALF_H - 792, 4);
      ui.fill();
    });
    // 列表入口（d4-ending-list）：地圖/列表 兩檔切換的「列表」端，放裝裱帶右端（圖例右邊的空位）。
    this.paintBands(ui, vBands(LIST_BUTTON.x, LIST_BUTTON.y, LIST_BUTTON.w, LIST_BUTTON.h, '#3A2C1B', '#161009', 6, 246, 246));
    this.paintBands(ui, topSheen(LIST_BUTTON.x + 1, LIST_BUTTON.y + 1, LIST_BUTTON.w - 2, '#F2DCA8', 44));
    this.paintBands(ui, hBands(LIST_BUTTON.x, LIST_BUTTON.y, LIST_BUTTON.w, LIST_BUTTON.h, '#6B5327', '#221809', 4, 60, 20));
    this.paintBands(ui, edgeBands(LIST_BUTTON, '#000000', 90, 6, 2));
    ui.strokeColor = rgba(COLORS.gold, 210);
    ui.lineWidth = 1;
    ui.rect(LIST_BUTTON.x - HALF_W, HALF_H - LIST_BUTTON.y - LIST_BUTTON.h, LIST_BUTTON.w, LIST_BUTTON.h);
    ui.stroke();
    // 戰報面板（v18-cocos-layout）：地圖下方的獨立區域，不再壓在城點上
    this.drawBattleLog(ui);
  }

  private drawMap(g: Graphics): void {
    const byName = new Map(this.cities.map((city) => [city.NAME, city]));

    // 地圖面紗（w9-render3）—— 對齊 web `campaign.html:65-66`：
    //   `#mapwrap::after{background:linear-gradient(rgba(10,14,20,.58),rgba(10,14,20,.72))}`
    //   `#mapwrap{box-shadow:inset 0 0 72px 6px rgba(8,11,15,.42)}`
    // Cocos 的 Graphics 沒有 box-shadow / gradient，這裡用兩件事逼近：
    //   1. 一整片縱向壓暗（上淺下深，與 web 的 0.58→0.72 同向）—— 底圖原本亮得發白，
    //      壓暗之後底圖才退回「背景」，城點與金框才浮得起來；
    //   2. 四邊 72px 的內陰影（edgeBands），成本 4×6 次 fillRect。
    // 兩層都畫在 gMap 的最前面：道路 / 城點 / 城名標籤在後面畫，不會被壓暗。
    const mapRect = { x: MAP_VIEW.x, y: MAP_VIEW.y, w: MAP_VIEW.w, h: MAP_VIEW.h };
    this.paintBands(g, vBands(mapRect.x, mapRect.y, mapRect.w, mapRect.h, '#0A0E14', '#080A0E', 10, 30, 70));
    this.paintBands(g, edgeBands(mapRect, '#05070A', 132, 72, 6));
    // 左亮右暗的極淡暖光（web 地圖也是同一個光源方向，見 `.btn` 的 165deg）
    this.paintBands(g, wash(mapRect, '#D8B36A', 12, 0, 10, true));

    for (const sentinel of [false, true]) {
      g.lineWidth = sentinel ? 1 : 2;
      g.strokeColor = sentinel ? rgba(COLORS.textFaint, 38) : rgba(COLORS.gold, 58);
      for (const path of this.paths) {
        if (((path.Length ?? 0) >= 30000) !== sentinel) continue;
        const a = byName.get(path.Start);
        const b = byName.get(path.End);
        if (!a || !b) continue;
        const points = path.points && path.points.length > 0 ? path.points : [a.pos_xy, b.pos_xy];
        points.forEach((point, index) => {
          const p = this.toScreen(point[0], point[1]);
          if (index === 0) g.moveTo(p.x - HALF_W, HALF_H - p.y);
          else g.lineTo(p.x - HALF_W, HALF_H - p.y);
        });
        g.stroke();
      }
    }

    // 城点图元高度（按城收集）—— 标签避让要拿它算「图元上方」的起点
    const iconHeights = new Map<string, number>();
    for (const city of this.cities) {
      const p = this.toScreen(city.pos_xy[0], city.pos_xy[1]);
      this.cityScreen.set(city.NAME, p);
      // 勢力分色（v16-cocos-monarch）：14 家固定色板 + 備色，無主/關隘走中性灰；
      // 我方城在色板之外再加一圈金環（任務書要求的「14 家色板 + 玩家金環」）。
      // v17：色板/金環/標籤色收進 `cityTintOf()` 純函數，探針才能直接斷言色號分布。
      const owner = this.ownerOf(city.NAME);
      const tint = cityTintOf(owner, this.playerForce());
      const color = tint.color;
      const selected = this.selected === city.NAME;
      const tier = this.cityTier.get(city.NAME) ?? 1;
      const art = this.cityFrames[tier - 1] ?? this.cityFrames[0];
      const radius = selected ? 15 : 11;
      let iconH = 0;

      // 勢力色暈圈：不論有沒有圖元都先墊一層，讓「這座城屬哪一家」一眼可讀
      g.fillColor = rgba(color, tint.glowAlpha);
      g.circle(p.x - HALF_W, HALF_H - p.y, radius + 5);
      g.fill();

      if (art) {
        // 原作城点图元：底边中点钉在城点坐标上（城点不偏，靠的还是 toScreen）。
        // 尺寸只认 spriteFrame 自己的 rect/originalSize：texture 可能是 2048 的图集页，
        // 拿它当 contentSize 会把 60 个城点画成 60 张整屏图（project/98 §5乙②）。
        const icon = this.cityIconAt(city.NAME);
        const size = cityIconSize(art);
        iconH = size.height;
        if (icon.box.width !== size.width || icon.box.height !== size.height) {
          icon.box.setContentSize(size.width, size.height);
        }
        if (icon.sprite.spriteFrame !== art) icon.sprite.spriteFrame = art;
        icon.node.setPosition(p.x - HALF_W, HALF_H - p.y, 0);
        if (!icon.sprite.enabled) icon.sprite.enabled = true;
        if (!icon.node.active) icon.node.active = true;
      } else {
        // 缺图元时：实心势力色圆点 + 1px 深色描边（原来是「我方绿 / 敌方红」两色）
        g.fillColor = rgba(color);
        g.circle(p.x - HALF_W, HALF_H - p.y, radius);
        g.fill();
        g.strokeColor = rgba(M.FORCE_EDGE, 220);
        g.lineWidth = 2;
        g.circle(p.x - HALF_W, HALF_H - p.y, radius);
        g.stroke();
      }

      // 玩家金环：色板说明「他是哪一家」，金环说明「这是你」
      if (tint.ringAlpha > 0) {
        g.strokeColor = rgba(tint.ringColor, tint.ringAlpha);
        g.lineWidth = tint.ringWidth;
        g.circle(p.x - HALF_W, HALF_H - p.y, art ? 16 : radius + 4);
        g.stroke();
      }

      if (selected) {
        g.strokeColor = rgba(COLORS.goldLight);
        g.lineWidth = 3;
        g.circle(p.x - HALF_W, HALF_H - p.y, art ? 22 : radius + 9);
        g.stroke();
      }

      iconHeights.set(city.NAME, iconH);
    }

    // 标签统一错开：旧实现按城点逐个摆、再把 y 夹进 [MAP_VIEW.y+14, ...]，
    // 结果 60 城全叠在 y=144（project/98 对照复查 §5乙③）。
    this.placeCityLabels(iconHeights);

    // 选中光标（map/point）：压在城点上方，和放大镜式的选中环区分
    if (this.pointFrame) {
      const cursor = this.ensurePointIcon();
      const at = this.selected ? this.cityScreen.get(this.selected) : null;
      if (at) {
        cursor.box.setContentSize(9, 9);
        if (cursor.sprite.spriteFrame !== this.pointFrame) cursor.sprite.spriteFrame = this.pointFrame;
        cursor.node.setPosition(at.x - HALF_W, HALF_H - (at.y - 30), 0);
        cursor.node.active = true;
      } else {
        cursor.node.active = false;
      }
    }

    // 部隊層（R102）：`armyScreenList()` 一次算出「畫在哪」與「點哪支」，兩邊吃同一份。
    // web 同一句：`for (const it of armyScreenList()) drawArmyMark(g, it)`（campaign.html:3566），
    // 命中用 `hitArmy(px,py)` 查同一份 `armyScreenList()`（:2886）。分兩份必然出現
    // 「看到 A 卻選到 B」——重疊時錯開的九宮格順序只要有一邊不同就會錯位。
    this.armyScreen = armyScreenList(this.scenarioLike(), this.save!.armies ?? [], (x, y) => this.toScreen(x, y));
    for (const it of this.armyScreen) drawArmyMark(g, it, this.armySel);
    this.placeArmyBadge();
  }

  /**
   * 選中部隊的兵力牌（web `drawArmyMark` 的選中態：黑底小牌在旗幟上方，字 `抵達`/`N 兵`）。
   * 掛成一顆 Label 而不是畫進 Graphics —— 數字要能隨時改，畫進 Graphics 就得整層重畫。
   */
  private placeArmyBadge(): void {
    const picked = this.armySel ? this.armyScreen.find((it) => it.a.id === this.armySel) : null;
    // 兵團指令面板開著時不畫兵力牌：它是獨立 Label（不在面板節點裡），抬到最上層會浮在面板上
    if (!picked || this.armyMenu?.isOpen) {
      if (this.armyBadge) this.armyBadge.node.active = false;
      return;
    }
    if (!this.armyBadge) {
      // 13px、金框黑底的小牌；`makeLabel` 的 cy 是「框的垂直中線」
      this.armyBadge = this.makeLabel('', 375, 470, 88, 13, COLORS.text, 'center');
      this.armyBadge.node.name = 'ArmyBadge';
      this.armyBadge.horizontalAlign = Label.HorizontalAlign.CENTER;
    }
    const label = picked.a.progress >= 1 ? '抵達' : `${picked.a.troops}`;
    // 黑底小牌（web `drawArmyMark` 選中態：`rgba(8,12,16,.84)`、高 19、寬＝文字寬+10）。
    // 畫在 Graphics 上，字仍用 Label —— Cocos 的 Graphics 沒有 measureText，寬度取固定 34（夠 3 位兵數或「抵達」）。
    const plateW = 34;
    this.fillRect(this.gMap!, picked.x - plateW / 2, picked.y - 36 - 9.5, plateW, 19, '#080C10', 214);
    this.armyBadge.string = label;
    this.armyBadge.color = new Color().fromHEX(armyFlagInk(picked.a));
    // 旗面在 it.y-9…-17（設計座標，y 向下為正）→ 牌放在更上面 36px，與 web 的 y-36 同位置
    const uiX = picked.x - HALF_W;
    const uiY = HALF_H - (picked.y - 36);
    this.armyBadge.node.setPosition(uiX, uiY, 0);
    this.armyBadge.node.active = true;
    this.armyBadge.node.setSiblingIndex(this.node.children.length - 1);
  }

  /**
   * 60 城标签错开（纯函数 layoutCityLabels 的落地点）：
   * 按屏幕 y 排序 → 奇偶分上下 → 撞了同方向再让一行 → 上下都不许出图。
   * 标签框只在图幅内（图幅上下各留 12px），所以不会压到 HUD 压条和装饰带。
   */
  private placeCityLabels(iconHeights: Map<string, number>): void {
    const items: CityLabelItem[] = this.cities.map((city) => {
      const p = this.cityScreen.get(city.NAME) ?? { x: MAP_VIEW.x + MAP_VIEW.w / 2, y: MAP_VIEW.y + MAP_VIEW.h / 2 };
      return { name: city.NAME, x: p.x, y: p.y, iconH: iconHeights.get(city.NAME) ?? 0 };
    });
    const mapRect = this.mapImageRect();
    const boxes = layoutCityLabels(items, {
      fontSize: CITY_LABEL_FONT,
      gap: CITY_LABEL_GAP,
      top: Math.floor(mapRect.y) + 12,
      bottom: Math.floor(mapRect.y + mapRect.h) - 12,
      screenW: DESIGN_W,
    });
    const owned = this.save?.owned ?? [];
    for (const box of boxes) {
      const label = this.cityLabels.get(box.name);
      if (!label) continue;
      label.node.setPosition(box.x - HALF_W, HALF_H - box.y, 0);
      // 城名跟城點同色系：色板原色太暗壓在淺底圖上看不清，用提亮版；
      // 我方城用玩家金（與城點金環同語義）。v16-cocos-monarch
      const owner = this.ownerOf(box.name);
      const tint = cityTintOf(owner, this.playerForce());
      label.color = rgba(tint.labelColor || COLORS.textDim);
      // owned 只在無主判定時兜底（我方城 ownerOf 一定有值，這裡防存檔未播種）
      if (!owner && owned.includes(box.name)) label.color = rgba(M.FORCE_GOLD);
    }
  }

  private drawActions(g: Graphics): void {
    const actions = this.actions();
    this.actionRects = [];
    const count = actions.length;
    const totalGap = BUTTON_GAP * (count - 1);
    const width = (DESIGN_W - 32 - totalGap) / count;
    actions.forEach((action, index) => {
      const x = 16 + index * (width + BUTTON_GAP);
      const rect = { x, y: BUTTON_Y, w: width, h: BUTTON_H, kind: action.kind };
      this.actionRects.push(rect);
      // 金屬漸層底 + 頂部高光（w5-render）：web 的月令按鈕是上亮下暗的金屬片
      // w9-render3：非主按鈕原本是冷藍灰（'#242C36'→'#10151C'）。web `campaign.html:83`
      // 的 `.btn` 確實是冷灰 `linear-gradient(165deg,#2A3038,#191D23)`，但整頁其餘面板這一輪
      // 已統一成暖褐（見 Draw.ts `WARM`），按鈕留冷灰會被讀成「外來控件」—— 這裡只把底色
      // 往暖推（R 比 B 高 10、明度結構不動），保留 `.btn` 的上亮下暗。
      const top = action.primary ? '#4A3A20' : '#2A251E';
      const alpha = action.enabled ? 255 : 96;
      // w9-render3 第二版：`lightGrid` 一次把「上亮下暗（G 軸 -14）」與「左亮右暗（R 軸 +14）」
      // 兩層漸層做進同一張底板。web `.btn` 的 `linear-gradient(165deg,#2A3038,#191D23)` 正是
      // 165° 斜向 —— 兩個方向同時走，所以按鈕上一塊 229×120 的片能有幾十種像素色。
      this.paintBands(g, lightGrid({ x, y: BUTTON_Y, w: width, h: BUTTON_H }, 10, 5, top, 14, -14, alpha));
      if (action.enabled) {
        // w7-cocos-render2：再疊一層「左亮右暗」的橫向金屬反光 + 四邊內陰影，
        // 對齊 web `.btn` 的 linear-gradient(90deg) + inset box-shadow。
        this.paintBands(g, hBands(x, BUTTON_Y, width, BUTTON_H, action.primary ? '#7A5C2C' : '#4A3E2C', action.primary ? '#241A0C' : '#14100A', 5, 78, 26));
        this.paintBands(g, topSheen(x + 2, BUTTON_Y + 2, width - 4, action.primary ? '#FBEBBE' : '#C9B99A', action.primary ? 70 : 26));
        this.paintBands(g, edgeBands({ x, y: BUTTON_Y, w: width, h: BUTTON_H }, '#000000', 96, 8, 3));
        this.paintBands(g, topSheen(x + 2, BUTTON_Y + BUTTON_H - 2, width - 4, '#000000', 96));
        // 雙線描邊（w9-render3）：web `city.html:100` `.btn.primary{box-shadow:inset 0 0 0 2px
        // rgba(216,179,106,.30)}` —— 外圈粗金線之外，內縮 2px 還有一條淡金線。
        this.paintBands(g, doubleEdge({ x, y: BUTTON_Y, w: width, h: BUTTON_H }, '#000000', 140, action.primary ? COLORS.goldLight : COLORS.line, 96, 1, 3));
      }
      this.strokeRect(g, x, BUTTON_Y, width, BUTTON_H, action.primary ? COLORS.gold : COLORS.line, 2);
      const label = this.actionLabels[index];
      if (label) {
        label.string = action.title;
        label.color = rgba(action.enabled ? (action.primary ? COLORS.goldLight : COLORS.text) : COLORS.textFaint);
        label.node.setPosition(x + width / 2 - HALF_W, HALF_H - (BUTTON_Y + 38), 0);
      }
      const sub = this.actionSubs[index];
      if (sub) {
        sub.string = action.caption;
        sub.color = rgba(action.enabled ? (action.primary ? '#E9D7A6' : COLORS.textDim) : COLORS.textFaint);
        sub.node.setPosition(x + width / 2 - HALF_W, HALF_H - (BUTTON_Y + 72), 0);
      }
    });
    for (let i = count; i < this.actionLabels.length; i += 1) {
      const label = this.actionLabels[i];
      if (label) label.string = '';
      const sub = this.actionSubs[i];
      if (sub) sub.string = '';
    }
    // 九宮底板跟著剛算出來的矩形重擺（按鈕數 1~4 變動時 x/寬度都會變）
    this.layoutActionPlates();
  }

  // -------------------------------------------------------------------------
  // 触控：设计坐标 = 节点局部坐标 + 半宽/半高
  // -------------------------------------------------------------------------

  private onTouch(event: EventTouch): void {
    // 【r224 P0-1】同一幀的點擊已經被別的场景（出征编成頁）認領，大地圖不再處理：
    // 否則「出征」那一擊會順帶打到「內政終了」，把剛開的局推過一年，並在換月鏈路裡炸掉輸入。
    if (tapLatched()) return;
    // 【r224】全屏暗幕（城池一覽/勢力圖/存檔位/名冊）開著時，大地圖不吃任何點擊。
    // 暗幕不再掛 BlockInputEvents（那會讓全局 input 完全收不到事件，見 showSheetScrim），
    // 穿透改由這裡擋；暗幕節點只在面板開著時存在。
    if (this.node.children.some((child) => child.name.startsWith('Scrim_'))) return;
    // 物品頁 / 內政頁 / 君主頁 / 兵團指令開著時，大地圖不吃任何點擊（面板自己也會處理，這裡只防穿透）
    if (this.itemsPanel?.isOpen) return;
    if (this.cityPanel?.isOpen()) return;
    if (this.monarchPanel?.isOpen) return;
    if (this.armyMenu?.isOpen) return;
    // 君主陣亡彈窗是「非答不可」：面板關掉之前不許點地圖（面板自己也吞三顆按鈕）
    if (this.successionState) return;
    if (!this.save) return;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    const x = local.x + HALF_W;
    const y = HALF_H - local.y;

    // 戰報浮層（v17-cocos-monarch）：標題列點擊折疊；展開時整塊吞點擊，避免誤選城
    const logHitArea = logHit(x, y, this.logCollapsed);
    if (logHitArea === 'header') {
      // 翻頁鈕在標題列右側（同一條帶）→ 先判鈕，否則永遠只會折疊
      const turn = logPageHit(x, y, this.logCollapsed);
      if (turn !== 0) {
        this.turnBattleLogPage(turn);
        return;
      }
      this.toggleBattleLog();
      return;
    }
    if (logHitArea === 'body') return;

    // 物品頁入口（w4-cocos-items）
    if (
      x >= ITEMS_BUTTON.x &&
      x <= ITEMS_BUTTON.x + ITEMS_BUTTON.w &&
      y >= ITEMS_BUTTON.y &&
      y <= ITEMS_BUTTON.y + ITEMS_BUTTON.h
    ) {
      this.openItems();
      return;
    }

    // 勢力一覽入口（v16-cocos-monarch）
    if (
      x >= FORCES_BUTTON.x &&
      x <= FORCES_BUTTON.x + FORCES_BUTTON.w &&
      y >= FORCES_BUTTON.y &&
      y <= FORCES_BUTTON.y + FORCES_BUTTON.h
    ) {
      this.openForcesPanel();
      return;
    }

    // 存檔入口（r86 的 P2）：裝裱帶左端
    if (
      x >= SAVE_HIT.x &&
      x <= SAVE_HIT.x + SAVE_HIT.w &&
      y >= SAVE_HIT.y &&
      y <= SAVE_HIT.y + SAVE_HIT.h
    ) {
      this.openSaveSlots();
      return;
    }

    // 列表入口（d4-ending-list）：地圖/列表 兩檔的「列表」端
    if (
      x >= LIST_BUTTON.x &&
      x <= LIST_BUTTON.x + LIST_BUTTON.w &&
      y >= LIST_BUTTON.y &&
      y <= LIST_BUTTON.y + LIST_BUTTON.h
    ) {
      this.openCityList();
      return;
    }

    // 名冊入口（d3-general-book）：頁頭第二列
    if (
      x >= BOOK_HIT.x &&
      x <= BOOK_HIT.x + BOOK_HIT.w &&
      y >= BOOK_HIT.y &&
      y <= BOOK_HIT.y + BOOK_HIT.h
    ) {
      this.openGeneralBook();
      return;
    }

    // 頁頭「君主 X」→ 君主屬性卡
    if (
      x >= MONARCH_HIT.x &&
      x <= MONARCH_HIT.x + MONARCH_HIT.w &&
      y >= MONARCH_HIT.y &&
      y <= MONARCH_HIT.y + MONARCH_HIT.h
    ) {
      this.openMonarchCard();
      return;
    }

    for (const rect of this.actionRects) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        this.doAction(rect.kind);
        return;
      }
    }
    if (y < MAP_VIEW.y || y > MAP_VIEW.y + MAP_VIEW.h) return;
    // 命中優先級照 web（campaign.html:3627-3642）：
    //   「變更目的」選點態 → 只認城；否則 部隊 > 城。
    // 部隊判定吃 `armyScreen`（＝本幀畫出來的那份），所以「看到哪支就點得到哪支」。
    let best: string | null = null;
    let bestIndex = -1;
    let bestDistance = 42 * 42;
    for (let i = 0; i < this.cities.length; i += 1) {
      const city = this.cities[i];
      if (!city) continue;
      const p = this.cityScreen.get(city.NAME);
      if (!p) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = city.NAME;
        bestIndex = i;
      }
    }
    const armyIndex = armyHitIndex(
      this.armyScreen.map((it) => [it.x, it.y] as [number, number]),
      x,
      y,
    );
    const hit = resolveMapHit(this.pickArmyId !== null, armyIndex, bestIndex);
    if (hit.kind === 'pick') {
      // 選點態：只認城（web campaign.html:3632 的 `if (pickArmyId) { hitCity … return }`）。
      // Cocos 沒有右鍵／Esc，所以「點空地」＝取消變更目的（[新設計]；
      // web 用右鍵 `contextmenu`(:3645) 與 Esc `keydown`(:3650) 退出）。
      if (best) this.applyRetarget(best);
      else this.exitPickMode();
      return;
    }
    if (hit.kind === 'army') {
      const picked = this.armyScreen[hit.armyIndex];
      // [R227] 兵團已停在敵城下時，兵圖標會蓋住城：此時點擊優先給城（否則永遠點不到城、開不了戰）。
      if (picked && best && picked.a.progress >= 1 && !(this.save?.owned.includes(best) ?? false)) {
        this.select(best);
        return;
      }
      if (picked) this.openArmyMenu(picked.a.id);
      return;
    }
    if (hit.kind === 'city' && best) this.select(best);
  }

  // -------------------------------------------------------------------------
  // 部隊層 + 兵團指令（R102；web campaign.html:2878-3230 的移植）
  //
  // 分工：
  //   ArmyLayer 的 ARMY_CORE 段 = 純邏輯（座標、錯開、命中、駐紮、軍師、可點性）；
  //   ArmyMenu = 面板（兵團指令 5 項 + 任命軍師子頁）；
  //   這裡 = 接線（誰能點、點完改哪個存檔欄位、寫哪條戰報）。
  // 每個寫入都走 GameState 的具名 API（updateArmy / enterCityWithArmy / applyArmyProgress），
  // 不在本檔直接改 `this.save` —— 存檔是 GameState 的快取物件，旁路改會漏 persist。
  // -------------------------------------------------------------------------

  /**
   * 主將等級（R85 唯一口徑）：`scenarioLevelOf()` 的分劇本起始等級表。
   *
   * 為什麼不能直接吃 `core/wises.generalLevel()`：`generals.json` 的 401 條**沒有 `level` 欄位**，
   * `generalLevel()` 對所有武將都回 1 ⇒ `troopCapOf(1)` = 5 兵。實機回報「城 244 兵出征只有
   * 5 兵」就是這條：等級錯成 1，帶兵上限跟著錯成 5。分劇本表（TIMES1..5 的 BaseEXP 反推）
   * 才是 Lv2/2/4/6/8 的真值，與編成屏 `DeployRoot.levelOf()`、web `generalLevelOf()` 同一條。
   *
   * 表沒載入時 `scenarioLevelOf(name, own)` 回 `own`（= 舊行為 1），退化但不崩。
   */
  private armyGeneralLevel(name: string): number {
    const gen = this.generals.find((row) => row.NAME === name);
    if (!gen) return 0;
    try {
      const own = generalLevel(gen);
      return scenarioLevelOf(gen.NAME, Math.max(1, own));
    } catch {
      return 1;
    }
  }

  /**
   * 這名武將的軍師技序號（web `armyWiseSeq()`，campaign.html:3049）：
   * 取 `listWisdomChoices()` 的**最後一條**（= 最高檔），沒有就 0（＝沒學）。
   * Cocos 沒有 web 的 `save.learned[name].wise` 那份額外學習紀錄，所以只有天生 WISESKILL。
   */
  private armyWiseSeq(name: string): number {
    const gen = this.generals.find((row) => row.NAME === name);
    if (!gen || !this.data) return 0;
    try {
      const list = listWisdomChoices(this.data, gen);
      return list.length > 0 ? list[list.length - 1] ?? 0 : 0;
    } catch {
      return 0;
    }
  }

  private armyWiseHint(seq: number): string {
    try {
      return wiseHintOf(seq) ?? '';
    } catch {
      return '';
    }
  }

  /** 開兵團指令面板（web `renderArmySheet()`；`mode='advisor'` 直接進「任 命 軍 師」子頁） */
  private openArmyMenu(id: string, mode: 'menu' | 'advisor' = 'menu'): void {
    this.save = GameState.loadSave();
    const army = GameState.armyOf(id);
    if (!army) {
      this.armySel = null;
      this.hintText = '這支部隊已經不在地圖上了。';
      this.refresh();
      return;
    }
    this.armySel = id;
    const owned = this.save?.owned ?? [];
    this.armyMenu = ArmyMenu.show(this.node, {
      army,
      // [F16] 兵團面板顯示國庫（Σ 每城 money），不是舊的單一錢包。
      gold: GameState.nationalGold(),
      months: armyMonths(this.scenarioLike(), army.pathIndex),
      isMine: (city: string) => owned.includes(city),
      levelOf: (name: string) => this.armyGeneralLevel(name),
      wiseSeqOf: (name: string) => this.armyWiseSeq(name),
      wiseHintOf: (seq: number) => this.armyWiseHint(seq),
      mode,
      onClose: () => {
        this.armyMenu = null;
        this.armySel = null;
        this.refresh();
      },
      onCommand: (act: ArmyCmdAct) => this.runArmyCommand(act, id),
      onAdvisor: (name: string) => this.appointAdvisor(id, name),
    });
    this.refresh();
  }

  private closeArmyMenu(): void {
    const menu = this.armyMenu;
    this.armyMenu = null;
    if (menu) menu.close();
  }

  /** 兵團指令 5 項的分發（web `$('armyCmds')` 的 `data-army-act`，campaign.html:3218） */
  private runArmyCommand(act: ArmyCmdAct, id: string): void {
    if (act === 'general') {
      // web 是單將資料卡（`renderGeneralSheet`）；Cocos 的「武 將 資 料」名冊面板就是同一份資料，
      // 直接開名冊（差異見 project/186 §6）。
      this.closeArmyMenu();
      this.openGeneralBook();
      return;
    }
    if (act === 'retarget') {
      this.enterPickMode(id);
      return;
    }
    if (act === 'station') {
      this.toggleStation(id);
      return;
    }
    if (act === 'enter') {
      this.enterCityForArmy(id);
    }
  }

  /**
   * 進入「變更目的」選點態（web `enterPickMode()`，campaign.html:3177）。
   * 選點態下地圖只認城（`resolveMapHit` 的 `pick` 分支）。
   */
  private enterPickMode(id: string): void {
    const army = GameState.armyOf(id);
    if (!army) return;
    if (army.side !== 'A') {
      this.hintText = '敵軍兵團不能變更目的。';
      this.refresh();
      return;
    }
    this.pickArmyId = id;
    this.armySel = id;
    this.closeArmyMenu();
    this.hintText = '請選擇兵團目的城市（點相鄰的敵城／空城）· 點空地取消';
    this.refresh();
  }

  /** 退出選點態（web `exitPickMode()`，campaign.html:3189） */
  private exitPickMode(silent = false): void {
    if (!this.pickArmyId) return;
    this.pickArmyId = null;
    if (!silent) this.hintText = '已取消變更目的：兵團照原路走。';
    this.refresh();
  }

  /**
   * 選點態點到某座城 → 改道（web `applyRetarget()`，campaign.html:3199）。
   * 六條拒絕文案全在 `armyRetargetCheck()` 裡（逐字照 web），這裡只負責顯示與寫入。
   */
  private applyRetarget(city: string): void {
    const id = this.pickArmyId;
    if (!id) return;
    const army = GameState.armyOf(id);
    if (!army) {
      this.pickArmyId = null;
      this.refresh();
      return;
    }
    const owned = this.save?.owned ?? [];
    const check = armyRetargetCheck(
      army,
      city,
      (from: string, to: string) => pathBetween(this.scenarioLike(), from, to),
      (name: string) => owned.includes(name),
    );
    if (!check.ok) {
      // 失敗留在選點態（web 也是 `notice(chk.why, 5000)` 不退出），玩家可以再點別座城
      this.hintText = check.why ?? '無法變更目的。';
      this.refresh();
      return;
    }
    GameState.updateArmy(id, {
      to: city,
      pathIndex: check.pathIndex ?? army.pathIndex,
      progress: 0,
      reported: false,
    });
    this.save = GameState.loadSave();
    this.pickArmyId = null;
    this.pushBattleLog([
      battleLogLine(this.save.month, `兵 團 改 道：${army.from} → ${city}（${armyMonths(this.scenarioLike(), check.pathIndex ?? army.pathIndex)} 個月）`, 'info'),
    ]);
    this.hintText = `兵團改道：${army.from} → ${city}，重新從出發城算起。`;
    this.openArmyMenu(id);
  }

  /**
   * 部隊駐紮 / 解除（web `toggleStation()`，campaign.html:3139）。
   * 三條拒絕提示逐字照 web：敵軍、已到城下、還在出發城。
   */
  private toggleStation(id: string): void {
    const army = GameState.armyOf(id);
    if (!army) return;
    if (army.side !== 'A') {
      this.hintText = '敵軍兵團不能下令駐紮。';
      this.refresh();
      return;
    }
    const stationed = army.stationed === true;
    const onRoad = army.progress > 0 && army.progress < 1;
    if (!stationed && !onRoad) {
      this.hintText = army.progress >= 1 ? '部隊已到城下，不能再駐紮。' : '部隊還在出發城：出發後才能在路上駐紮。';
      this.refresh();
      return;
    }
    GameState.updateArmy(id, { stationed: !stationed });
    this.save = GameState.loadSave();
    const who = army.general ?? '部隊';
    this.pushBattleLog([
      battleLogLine(
        this.save.month,
        stationed
          ? `解 除 駐 紮：${who} 繼續向 ${army.to} 前進`
          : `部 隊 駐 紮：${who} 停在 ${army.from} → ${army.to} 道上（進度凍結，擋住同段敵軍）`,
        'hold',
      ),
    ]);
    this.hintText = stationed
      ? '已解除駐紮，部隊隨下個月推進。'
      : '部隊駐紮：進度凍結；敵軍沿這條道來會被擋在接觸點。';
    this.openArmyMenu(id);
  }

  /**
   * 任命軍師（web `renderAdvisorSheet()` + `$('advisorList')` click，campaign.html:3100/:3233）。
   * 非名單成員 → `armySetAdvisor` 回 false、不改值；空字串 → 免職。
   */
  private appointAdvisor(id: string, name: string): void {
    const army = GameState.armyOf(id);
    if (!army) return;
    if (armyOfficerList(army).length < 2) {
      this.hintText = '軍團僅主將一人，無可任命。';
      this.refresh();
      return;
    }
    if (!armySetAdvisor(army, name)) {
      this.hintText = '這名武將不在隨軍名單裡。';
      this.refresh();
      return;
    }
    GameState.updateArmy(id, { advisor: army.advisor ?? '' });
    this.save = GameState.loadSave();
    this.hintText = name ? `任命 ${name} 為軍師（開戰時發動軍師技）。` : '已免職軍師。';
    this.openArmyMenu(id, 'advisor');
  }

  /** 進入城內（web `enterCity()`，campaign.html:2982）：守軍收編、上限 600、部隊消失 */
  private enterCityForArmy(id: string): void {
    const army = GameState.armyOf(id);
    if (!army) return;
    const owned = this.save?.owned ?? [];
    const check = armyCanEnterCity(army, (name: string) => owned.includes(name));
    if (!check.ok) {
      this.hintText = check.why ?? '不能進城。';
      this.refresh();
      return;
    }
    const who = army.general ?? '部隊';
    const add = Math.max(0, Math.floor(army.troops));
    const out = GameState.enterCityWithArmy(id);
    if (!out.ok || !out.city) {
      this.hintText = '進城失敗：部隊不在城上。';
      this.refresh();
      return;
    }
    this.save = GameState.loadSave();
    this.closeArmyMenu();
    this.armySel = null;
    this.pushBattleLog([
      battleLogLine(this.save.month, `兵 團 進 城：${who} ${add} 兵 入 ${out.city}（守軍 ${out.troops}）`, 'info'),
    ]);
    this.hintText = `${who} ${add} 兵 進入 ${out.city}，守軍 ${out.troops}（上限 600）。`;
    this.refresh();
  }

  /**
   * 出征 = 派出一支 A 方部隊（web `dispatchArmy()`，campaign.html:2829）。
   *
   * 出兵數 = **min(出發城現有守軍, 出發城主將「步+騎」總上限)**；總上限
   * = `troopCapSumOf(等級)` = `min(等級×5, 100)` 步 + `clamp((等級−20)×5, 0, 100)` 騎，
   * 與原作 `unit+0x58/+0x5C`（project/170）及 web `dispatchCapOf()` 同一條口徑。
   *
   * 舊碼兩個坑（實機回報「城 244 兵只帶 5 兵」）：
   *  1. 等級走 `core/wises.generalLevel()`，但 `generals.json` 沒有 `level` 欄位 →
   *     一律回 1 ⇒ 上限 5 兵（現在走 `scenarioLevelOf()`，見 `armyGeneralLevel()`）；
   *  2. 城兵 < 上限時直接拒絕出征；現在改成「全帶」，扣兵也只扣實際帶走的 `taken`。
   */
  private dispatchArmyTo(target: string): void {
    if (!this.save) return;
    const from = GameState.nearestOwnedTo(target, this.paths);
    if (!from) {
      this.hintText = '找不到可以出發的我方城。';
      this.refresh();
      return;
    }
    const pathIndex = pathBetween(this.scenarioLike(), from, target);
    if (pathIndex === null) {
      this.hintText = '沒有可走的路：只能打相鄰城。';
      this.refresh();
      return;
    }
    const leader = this.leaderOf(from);
    // 原作兩欄相加才是上陣總數（步 + 騎）；舊碼只取步兵欄，Lv20+ 會少帶騎兵
    const cap = Math.max(1, Math.round(troopCapSumOf(this.armyGeneralLevel(leader))));
    const garrison = this.troopsOf(from);
    // 城兵不足上限 → 全帶；只有真的沒兵才拒絕（不再要求「守軍 >= 上限」）
    const taken = Math.min(cap, Math.max(0, Math.round(garrison)));
    if (taken < 1) {
      this.hintText = `${from} 沒有兵可出征（主將步+騎上限 ${cap}），先徵兵再出征。`;
      this.refresh();
      return;
    }
    const officers = this.armyRosterFor(from, leader);
    const id = GameState.nextArmyId('A');
    GameState.addArmy({
      id,
      side: 'A',
      from,
      to: target,
      pathIndex,
      progress: 0,
      troops: taken,
      general: leader || undefined,
      officers,
      advisor: '',
      stationed: false,
    } as GameState.CampaignArmy);
    // 守軍扣掉實際帶走的兵（web: `save.cities[from].troops -= cap`；本作 cap 可能大於城兵 → 扣 taken）
    const state = this.save.cities[from];
    if (state) state.troops = Math.max(0, Math.round(state.troops - taken));
    this.save = GameState.loadSave();
    this.armySel = id;
    this.pushBattleLog([
      battleLogLine(
        this.save.month,
        `我 軍 出 征：${from} → ${target}（${taken} 兵，${armyMonths(this.scenarioLike(), pathIndex)} 個月）`,
        'info',
      ),
    ]);
    this.hintText = `我軍出征：${from} → ${target}（${taken} 兵，${armyMonths(this.scenarioLike(), pathIndex)} 個月）。點部隊下兵團指令。`;
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // [F-06] 路上遭遇戰：進 Battle 場景真打 + 戰後回寫
  // -------------------------------------------------------------------------
  // 舊碼在 `advanceArmiesMonth()` 的對峙分支直接 `Math.random()` 折算勝負，玩家看不到戰鬥。
  // 現在：對峙拖過一個月 → 雙方（blocker=駐紮方、mover=推進方）一起送進 Battle 場景，我方固定
  // A 側；BattleRoot 結算時 `recordBattleResult()` 記 wins/losses、`queuePostBattle()` 記俘虜，
  // 回大地圖時 `applyPendingEncounter()` 用「戰前快照 → 戰後增量」回寫兵損 + `save.lastBattle`，
  // 招降面板交給 start() 既有的 `SurrenderModel.resolveCaptureFlow()`（不重複造）。
  // 跨場景只能靠 sys.localStorage 傳「開戰前快照」（Battle → Campaign 是新場景實例）。

  /**
   * 讀 URL / 小遊戲啟動參數（照 `BattleRoot.queryValue()` 同款）。
   *
   * 用途：`?autoenc=1` 調試開關。刻意用正則解析 `location.search` 而不是 `URLSearchParams`：
   * 原生/小遊戲平台不保證有這個 Web API（`SkinLab.skinLabEnabled()` 也是同樣寫法）。
   */
  private static queryValue(key: string): string | null {
    try {
      const host = globalThis as unknown as {
        window?: { location?: { search?: string } };
        wx?: {
          getLaunchOptionsSync?: () => { query?: Record<string, unknown> };
          getEnterOptionsSync?: () => { query?: Record<string, unknown> };
        };
      };
      const search = host.window?.location?.search ?? '';
      if (search) {
        const hit = new RegExp(`(?:^|\\?|&)${key}=([^&]*)`).exec(search);
        if (hit) return decodeURIComponent(hit[1] ?? '');
      }
      const query = host.wx?.getLaunchOptionsSync?.()?.query ?? host.wx?.getEnterOptionsSync?.()?.query;
      const value = query ? query[key] : undefined;
      return value === undefined || value === null ? null : String(value);
    } catch {
      return null;
    }
  }

  /** 遭遇戰跨場景快照的 runKey：與 `initCampaign()` 的 key 同源（劇本:勢力），換局不會串檔 */
  private encounterRunKey(): string {
    const key = (this.save as unknown as { runKey?: unknown } | null)?.runKey;
    return String(key ?? `${this.scenIdx}:${runPlayerForce()}`);
  }

  /** 某將在戰鬥裡的屬性（查不到就回 BattleRoot 的缺省口徑：str 70 / int 60 / Lv5 / 無軍師技） */
  private encounterGeneralOf(name: string | undefined): EncounterGeneral {
    const general = name ? this.generals.find((row) => row.NAME === name) : undefined;
    const level = name ? this.armyGeneralLevel(name) : 0;
    const wise = name ? this.armyWiseSeq(name) : 0;
    return {
      name: general?.NAME ?? name ?? '',
      str: general?.STR ?? 70,
      int: general?.INT ?? 60,
      level: level > 0 ? level : 5,
      wise: wise > 0 ? wise : null,
    };
  }

  /** 沒帶將名的敵軍（劇本只寫兵不寫將）：按敵城守將情報補名字/屬性 */
  private encounterIntelGeneral(city: string): EncounterGeneral {
    const intel = this.enemyIntelOf(city);
    return {
      name: intel?.name || `敵將（${city}）`,
      str: intel?.str ?? 70,
      int: intel?.int ?? 60,
      level: 5,
      wise: null,
    };
  }

  /**
   * 發起遭遇戰：把雙方寫進 BattleLaunch 並切到 `Battle` 場景。
   *
   * 回傳 true = 已發起（呼叫方必須立刻停止月推進）；false = 兩邊都不是我軍，呼叫方可退回折算。
   */
  private startEncounterBattle(a: CampaignArmy, b: CampaignArmy): boolean {
    const sides = encounterSides(a, b);
    if (!sides) return false;
    const save = this.save;
    if (!save) return false;
    const mine = sides.mine;
    const foe = sides.foe;
    // 戰後 `recordBattleResult(city, …)` 的 city 必須是**已在 owned 的我方城**：
    //   · 傳空字 → 它 `if (!city) return;`，wins/losses/lastBattle 全都落不了庫；
    //   · 傳不在 owned 的城 → 我方 A 勝時會被 `if (won) save.owned.push(city)` 誤算成「攻下這座城」。
    const city = save.owned.includes(mine.from) ? mine.from : (save.owned[0] ?? mine.from);
    const month = save.month;
    const mineGen = this.encounterGeneralOf(mine.general);
    const foeGen = foe.general ? this.encounterGeneralOf(foe.general) : this.encounterIntelGeneral(foe.from);
    // 先落快照再切場景：BattleRoot 一進場就能打，回寫靠這份快照 + 戰後 wins/losses 增量。
    this.storeEncounterPending(
      encounterPendingOf({
        key: this.encounterRunKey(),
        ts: Date.now(),
        month,
        city,
        mine,
        foe,
        before: { wins: save.wins, losses: save.losses, streak: save.streak, bestStreak: save.bestStreak },
      }),
    );
    // 兩支都先從地圖撤掉（web `startEncounter()` 同款）：敗方戰後不再出現，勝方由回寫以半兵重建。
    GameState.removeArmy(mine.id);
    GameState.removeArmy(foe.id);
    this.save = GameState.loadSave();
    this.pushBattleLog([
      battleLogLine(
        month,
        `遭 遇 戰：${mine.general ?? mine.id} ${Math.round(mine.troops)} 兵 對 ${foe.general ?? foe.id} ${Math.round(foe.troops)} 兵——進入戰場（真打）`,
        'atk',
      ),
    ]);
    GameState.startBattle(city, encounterLoadout(mine, foe, mineGen, foeGen));
    return true;
  }

  /**
   * 回大地圖時把「上一場遭遇戰」的結果寫回：復原勝方部隊（半兵）、寫 `save.lastBattle`。
   *
   * 時機：`start()` 的 `loadBattleLog()` 之後、`healStaleQueue()` 與 `resolveCaptureFlow()` 之前——
   * 先有 lastBattle，俘虜佇列才不會被當「無主戰果」清掉，招降面板也才判得出勝負。
   */
  private applyPendingEncounter(): { logs: BattleLogLine[]; note: string } {
    const save = this.save;
    if (!save) return { logs: [], note: '' };
    const raw = this.readEncounterPending();
    const pending = raw === null ? null : parseEncounterPending(raw, this.encounterRunKey());
    this.clearEncounterPending();
    if (!pending) return { logs: [], note: '' };
    const after: EncounterRecord = {
      wins: save.wins,
      losses: save.losses,
      streak: save.streak,
      bestStreak: save.bestStreak,
    };
    const plan = encounterPlan(pending, after, Date.now());
    // 勝方（或平手雙方）以半兵回到大地圖，行軍進度歸零 → 重新走原本那條路（與舊折算口徑一致）。
    for (const army of plan.restores) GameState.addArmy(army);
    // `lastBattle` 是 `core/roster.readBattleOutcome()` 讀的權威勝負信號；也讓 `healStaleQueue()`
    // 認得「這批俘虜有主」。俘虜/斬首佇列由 BattleRoot 的 `queuePostBattle()` 寫，這裡不重複寫。
    (save as unknown as Record<string, unknown>).lastBattle = plan.lastBattle;
    GameState.persistSave();
    this.save = GameState.loadSave();
    return { logs: [battleLogLine(this.save.month, plan.logText, plan.logKind)], note: plan.note };
  }

  /** 寫跨場景快照（Battle 結算後回大地圖是新場景實例，CampaignRoot 欄位全丟，只能走 localStorage） */
  private storeEncounterPending(pending: EncounterPending): void {
    try {
      sys.localStorage.setItem(ENCOUNTER_PENDING_KEY, JSON.stringify(pending));
    } catch {
      // 原生平台 localStorage 不可用時戰後兵損回寫不了，但戰鬥本身照打（記 console 不崩）
      console.warn('[F-06] 遭遇戰快照寫入失敗：戰後兵損不會回寫');
    }
  }

  private readEncounterPending(): unknown {
    try {
      const text = sys.localStorage.getItem(ENCOUNTER_PENDING_KEY);
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  private clearEncounterPending(): void {
    try {
      sys.localStorage.removeItem(ENCOUNTER_PENDING_KEY);
    } catch {
      // 清不掉也只是下次啟動被 parse/runKey 擋掉，忽略
    }
  }

  /**
   * 推進一個月的行軍（web `planArmyMoves()` + `handleMarchEvents()`，campaign.html:1346 / :4404）。
   *
   * 與舊 `GameState.marchArmies(3)` 的差別：
   *   1) 步長按路段長度折算（`armyStep()` = 1 / marchMonths，web `marchStep()`），不再固定 1/3；
   *   2) 駐紮中的部隊 progress 凍結（`frozen`）；
   *   3) 同段有駐紮敵軍時被夾在接觸點（`stationProgressLimit()`），不前進也不後退、不超車；
   *   4) 對峙（`stationStandoff()`）第一次只記戰報；拖過一個月就**進 Battle 場景真打**
   *      （F-06：衝突雙方一起送進戰場，我方 A 側；戰後兵損/勝負由 `applyPendingEncounter()` 回寫）。
   *      只有調試開關 `?autoenc=1` / `AUTO_ENCOUNTER = true` 才走舊的「按兵力折算」
   *      （campaign.html:4390：兵多者勝率 clamp(0.15,0.85)、勝方留一半兵力）——**僅調試用，
   *      正式版必須真打**。
   */
  private advanceArmies(stepFor: (army: CampaignArmy) => number): {
    still: CampaignArmy[];
    arrived: CampaignArmy[];
    logs: BattleLogLine[];
    notes: string[];
    /** 本幀是否已發起遭遇戰（true → 呼叫端必須立刻收手，場景馬上切到 Battle） */
    battle: boolean;
  } {
    const logs: BattleLogLine[] = [];
    const notes: string[] = [];
    const month = this.save?.month ?? 1;
    let battleStarted = false;
    const armies = GameState.armies();
    const moves = planArmyMoves(armies, stepFor);
    // 只寫回 progress，不重排順序（`applyArmyProgress` 保證 id 對得上，錯開的九宮格不會抖）
    GameState.applyArmyProgress(moves.map((move) => ({ id: move.a.id, progress: move.next })));
    let blockedCount = 0;
    for (const move of moves) {
      if (!move.blockedBy || move.frozen) continue;
      if (move.next >= move.want - 1e-9) continue;
      blockedCount += 1;
      logs.push(
        battleLogLine(
          month,
          `行 軍 受 阻：${move.a.general ?? move.a.id} 被 ${move.blockedBy} 擋在 ${armyAtCity(move.a) || '路上'}（進度 ${Math.round(move.next * 100)}%）`,
          'hold',
        ),
      );
    }
    if (blockedCount > 0) notes.push(`${blockedCount} 支部隊被駐紮敵軍擋住。`);

    // 對峙：第一次只記錄，拖過一個月就結算（否則兩支敵對部隊會永遠卡在接觸點）
    const standoff = stationStandoff(GameState.armies());
    if (standoff) {
      const key = stationPairKey(standoff.blocker, standoff.mover);
      const first = !this.stationNoticed.has(key);
      if (first) {
        this.stationNoticed.add(key);
        const who = standoff.blocker.general ?? standoff.blocker.id;
        logs.push(
          battleLogLine(
            month,
            `駐 紮 阻 擋：${who} 擋住 ${standoff.mover.from} → ${standoff.mover.to} 的敵軍，雙方在接觸點對峙`,
            'hold',
          ),
        );
        notes.push('兩軍在路上對峙：下月仍未解開就會開戰。');
      } else {
        this.stationNoticed.delete(key);
        const a = standoff.blocker;
        const b = standoff.mover;
        // [F-06] 正式版：進 Battle 場景真打（雙方將/兵寫進 BattleLaunch，A 側固定我方）。
        // 只有 `?autoenc=1` / `AUTO_ENCOUNTER = true` 才允許走下面的舊擲骰兜底——僅調試用。
        const debugDice = autoEncounterOn(CampaignRoot.queryValue('autoenc'));
        if (!debugDice && this.startEncounterBattle(a, b)) {
          battleStarted = true;
        } else {
          // 舊「按兵力折算」結算（調試兜底）：調試開關打開、或兩邊都不是我軍時才會到這裡。
          const mine = Math.max(1, Math.round(a.troops));
          const foe = Math.max(1, Math.round(b.troops));
          const chance = Math.max(0.15, Math.min(0.85, mine / (mine + foe)));
          const win = Math.random() < chance;
          const winner = win ? a : b;
          const loser = win ? b : a;
          GameState.removeArmy(loser.id);
          GameState.updateArmy(winner.id, { troops: Math.max(1, Math.round(winner.troops * 0.5)), progress: 0 });
          logs.push(
            battleLogLine(
              month,
              `遭 遇 戰：${a.general ?? '我軍'} ${mine} 兵 與 ${b.general ?? '敵軍'} ${foe} 兵 對撞——${winner.general ?? winner.id} 勝，${loser.general ?? loser.id} 潰散`,
              'atk',
            ),
          );
          notes.push('路上遭遇戰已按兵力折算（調試開關 autoenc 開啟；正式版必須真打）。');
        }
      }
    }

    const after = GameState.armies();
    const still = after.filter((army) => army.progress < 1);
    const arrived = after.filter((army) => army.progress >= 1);
    return { still, arrived, logs, notes, battle: battleStarted };
  }

  /**
   * 出發城的主將名：存檔運行時的 `cities[城].major` 優先 → 劇本表（**本局**劇本號）→ `''`。
   * 舊碼是 `garrisonOf(this.data, 0, city)`：劇本號恆 0，換劇本/換勢力後會取錯太守。
   */
  /**
   * [R225b] 每幀行軍：原作兵團每幀推進
   * （`0x41AFAB`：`+0x9A` 倒數 → 到 0 推一格 → 重裝 `4980/[+0x82]` tick；`+0x9E`=2 行軍中）。
   * 這裡把「整段路 marchMonths 個月（300 tick/月）」攤到每 tick，progress 連續增長；
   * 抵達 / 被駐紮敵軍封鎖 / 對峙 / 遭遇戰仍沿用 `planArmyMoves()` 的規則。
   */
  private stepArmiesFrame(n: number): void {
    if (!this.save || n <= 0) return;
    const scenario = this.scenarioLike();
    const res = this.advanceArmies((army) => {
      const step = armyStep(scenario, army.pathIndex);
      const months = Math.max(1, Math.round(1 / Math.max(1e-6, step)));
      return n / (months * 300);
    });
    if (res.logs.length > 0) this.pushBattleLog(res.logs);
    if (res.battle) {
      this.save = GameState.loadSave();
      this.clockPaused = true;
      this.hintText = this.clampHint('遭 遇 戰：已進入戰場（戰鬥結算後回到大地圖）。', 160);
      this.refresh();
      return;
    }
    let arrivedNew: CampaignArmy | null = null;
    for (const army of res.arrived) {
      if (army.side !== 'A' || this.arrivedNoticed.has(army.id)) continue;
      // [R228] 先不標記：等真的處理成功（佔城/開戰/進城）再把 id 寫進 arrivedNoticed，
      // 否則一次失敗（例如存檔還沒載好）就永遠不再重試，部隊會停在城下不動。
      arrivedNew = army;
      break;
    }
    if (arrivedNew) {
      const target = armyAtCity(arrivedNew);
      if (target && !(this.save?.owned.includes(target) ?? false)) {
        // [R226] 原作：兵團走到敵城下就進戰鬥，不是等玩家再點一次城、再點「攻城戰」。
        // [R227] 不再複用 `doAction('march')`：那條路有「必須接壤」守衛（distanceFromOwned === 1），
        // 多段行軍的部隊走到遠城會被判「不接壤」→ 部隊被撤掉、也不進戰鬥（用戶實測）。
        this.selected = target;
        // [R228] 真空城（沒有守將、守軍 0）沒有攻城戰可打：直接接收，部隊併入守軍。
        const intel = this.enemyIntelOf(target);
        // [R243] 空城判定要**以存檔的真實守軍為準**：`garrison.json` 的 intel 只是劇本播種，
        // 城池被抽空（守軍 0、無守將）後它仍然回 `守備隊`，舊碼看 intel 就會給 0 兵空城開一場
        // 「有守備隊」的攻城戰 —— 打光以後對方連一個實體單位都沒有，只能拖到 198 秒平手
        // （製作人實機：「占領空城，触发战斗，击杀守城武将和所有士兵后战斗不结束」）。
        const liveTroops = Math.max(0, Math.floor(Number(this.save?.cities?.[target]?.troops ?? intel?.troops ?? 0) || 0));
        const intelName = String(intel?.name ?? '').trim();
        const hasRealGeneral = !!intelName && intelName !== '守備隊';
        const emptyCity = liveTroops <= 0 && !hasRealGeneral;
        if (emptyCity) {
          const out = GameState.occupyCity(target, arrivedNew.id);
          this.save = GameState.loadSave();
          this.arrivedNoticed.add(arrivedNew.id);
          this.pushBattleLog([
            battleLogLine(this.save.month, `兵 團 進 城：${arrivedNew.general ?? '我軍'} ${arrivedNew.troops} 兵 接 收 ${target}（守軍 ${out.troops ?? 0}）`, 'win'),
          ]);
          this.hintText = this.clampHint(`佔 領 ${target}：${arrivedNew.general ?? '我軍'} ${arrivedNew.troops} 兵 入城。`, 160);
          this.refresh();
          return;
        }
        this.startArrivalSiege(arrivedNew, target);
        this.arrivedNoticed.add(arrivedNew.id);
        return;
      }
      if (target) {
        // 到自家城（增援/回防）：直接併入守軍，不回大地圖等手點。
        const out = GameState.enterCityWithArmy(arrivedNew.id);
        this.save = GameState.loadSave();
        this.arrivedNoticed.add(arrivedNew.id);
        this.hintText = this.clampHint(
          `兵 團 進 城：${arrivedNew.general ?? '我軍'} ${arrivedNew.troops} 兵 入 ${out.city}（守軍 ${out.troops}）。`,
          160,
        );
        this.refresh();
        return;
      }
      this.hintText = this.clampHint('部隊已抵達目的地。', 160);
      this.refresh();
    }
  }

  /**
   * [R227] 兵團抵達敵城 → 直接進編成屏（原作：走到城下就開打，不需要玩家再點城）。
   * 不復用 `doAction('march')`：那裡有「必須接鄰」守衛，多段行軍會被判不接壤而白撤隊。
   */
  private startArrivalSiege(army: Army, target: string): void {
    if (!this.save) return;
    const from = saveOwnedOr(this.save, army.from);
    GameState.removeArmy(army.id);
    this.save = GameState.loadSave();
    // [R231] 抵達戰的上下文＝「這支剛抵達的兵團」，不是「從出發城重新派兵」。
    // 舊碼只寫 setDeployMarch：Deploy 屏按「出征」會再 dispatchMarch 一支新兵團，
    // 新兵團走到目標又觸發抵達 → 每抵達一次彈一次編成（本 bug 的根因）。
    GameState.clearDeployMarch();
    GameState.setDeploySiege(this.siegeSnapshotOf(army as CampaignArmy, target, from));
    GameState.setDeployFrom(from);
    GameState.setDeployTarget(target);
    GameState.setDeployArmy(null);
    const intel = this.enemyIntelOf(target);
    GameState.setDeployEnemy(
      intel
        ? {
            name: intel.name,
            str: intel.str,
            int: intel.int,
            troops: intel.troops,
            defense: intel.defense,
            fallback: intel.fallback,
            owner: intel.owner ?? '',
          }
        : null,
    );
    this.hintText = this.clampHint(`兵 臨 城 下：${army.general ?? '我軍'} ${army.troops} 兵 抵 ${target}，進入編成。`, 160);
    this.refresh();
    director.loadScene('Deploy');
  }

  /**
   * [R231] 抵達兵團 → 攻城戰前準備快照。
   *
   * 兵團抵達時已被 `removeArmy()`，Deploy 屏只能靠這份快照還原參戰部隊：
   * 主將/隨軍/兵數/站位與 `armyId`（戰後 `recordBattleResult` 用來清部隊，已不在存檔時是 no-op）。
   */
  private siegeSnapshotOf(army: CampaignArmy, target: string, from: string): GameState.DeploySiege {
    return {
      from,
      target,
      pathIndex: army.pathIndex,
      armyId: army.id,
      general: army.general ?? '',
      officers: Array.isArray(army.officers) ? army.officers.filter((name) => !!name).slice(0, 4) : [],
      troops: Math.max(1, Math.round(Number(army.troops) || 1)),
      advisor: army.advisor ?? '',
    };
  }

  /** 舊入口（測試與對照用）：按月推進一步。正式流程已改成逐幀，見 `stepArmiesFrame()`。 */
  private advanceArmiesMonth(): {
    still: CampaignArmy[];
    arrived: CampaignArmy[];
    logs: BattleLogLine[];
    notes: string[];
    battle: boolean;
  } {
    const scenario = this.scenarioLike();
    return this.advanceArmies((army) => armyStep(scenario, army.pathIndex));
  }

  private leaderOf(city: string): string {
    const major = O.cityMajorNameOf(this.save, city, this.rosterCtx());
    if (major) return major;
    const table = this.data ? garrisonOf(this.data, this.scenIdx, city) : null;
    return typeof table?.major === 'string' ? table.major : '';
  }

  /**
   * 隨軍武將名單（web `armyRosterFor()`，campaign.html:2820）：
   * 主將排第一 → 出發城名冊裡的人 → 名冊補齊 → 上限 5（`armyRosterPick()`）。
   * web 還有一份「出陣隊列」優先序（DQ.queueOf），Cocos 沒有那個概念 → 傳空陣列。
   */
  private armyRosterFor(city: string, leader: string): string[] {
    // [ROSTER_SRC] 運行時駐將優先（存檔）；存檔完全沒有紀錄才回落劇本表（用本局劇本號）。
    const roster = O.officerNamesOfCity(this.save, city, this.rosterCtx());
    if (roster.length === 0) {
      const table = this.data ? garrisonOf(this.data, this.scenIdx, city) : null;
      for (const officer of table?.officers ?? []) {
        const name = typeof officer?.name === 'string' ? officer.name : '';
        if (name && roster.indexOf(name) < 0) roster.push(name);
      }
    }
    const picked = armyRosterPick([], roster, leader);
    if (picked.length === 0 && leader) picked.push(leader);
    return picked;
  }

  // -------------------------------------------------------------------------
  // 物品頁（w4-cocos-items）：CampaignRoot 只負責「建立/複用面板 + 灌資料」，
  // 面板內部的存檔、分頁、裝備判定全部在 ItemsPanel.ts 裡。
  // -------------------------------------------------------------------------

  private openItems(): void {
    const data = this.data;
    if (!data) return;
    let panel = this.itemsPanel;
    if (!panel || !panel.isValid) {
      panel = ItemsPanel.show(this.node, {
        onClose: () => {
          // 面板關掉後把大地圖重畫一遍（面板是後加的子節點，蓋在上面）
          this.refresh();
        },
      });
      this.itemsPanel = panel;
    }
    // [ROSTER_SRC] 武將池的資料源是**存檔**（我方城運行時人事），不是劇本 0 的靜態 `CITY`。
    // 2026-11-26 用戶反饋：《討伐董卓》劉備開局，物品頁武將卡卻是黃巾之亂的張角。
    const save = GameState.loadSave();
    this.save = save;
    const city = this.selected ?? save.owned[0] ?? '';
    const ctx = this.rosterCtx();
    panel.open(data.generals, data.items, save.owned ?? [], {
      save,
      generals: data.generals,
      scenIdx: this.scenIdx,
      cityName: city,
      // 默認選將：當前城太守（leaderOf）→ 君主；都不在池裡才落到池首。
      king: M.monarchOf(this.monarchState ?? {}) || runPlayerForce() || '',
      preferName: this.leaderOf(city),
      roster: ctx.roster ?? null,
      playerForce: runPlayerForce(),
      scenarioCities: this.cities,
    });
  }

  // -------------------------------------------------------------------------
  // 君主與勢力（v16-cocos-monarch）
  //
  // `GameState.ts` 是**白名單存檔**：`normalize()` 只重建 owned/wins/losses/
  // streak/bestStreak/month/gold/seeded/cities/armies/armySeq，未知鍵全丟；
  // 而本任務禁止改它。所以沿用 `CityPanel` 已經走通的「補丁鍵」做法：
  //   ① 戰役主檔照舊交給 `GameState`；
  //   ② 君主欄位（`MONARCH_SAVE_KEYS` 十個）另存 `sanguo_monarch_v1`；
  //   ③ 給 `MonarchModel` 的 `save` 是「主檔快照 + 君主補丁」的合併視圖
  //      （`syncMonarchState()`），每次 `refresh()` 都把 month/owned/cities/
  //      gold/wins/losses 從主檔抄進去。模型只讀這幾個鍵，抄進來即等價於 web
  //      的單一 `save` 物件。給 GameState.ts 的正式補丁見 project/106 §5。
  // -------------------------------------------------------------------------

  /** 主檔 + 君主補丁的合併視圖（`MonarchModel` 的 `save` 參數就是它） */
  private syncMonarchState(): Record<string, unknown> {
    const save = this.save;
    if (!save) return this.monarchState ?? {};
    const view = this.monarchState ?? this.readMonarchExtras();
    view.month = save.month;
    view.owned = save.owned;
    view.cities = save.cities;
    // [F16] 君主視圖的 `gold` 也給國庫口徑（模型本身不讀它，只為與 web 存檔視圖同形）
    view.gold = GameState.nationalGold();
    view.wins = save.wins;
    view.losses = save.losses;
    // 開局播種：web 在 `saves.newCampaign` 裡做（web/saves.js:1030-1046），
    // Cocos 的 `GameState.initCampaign` 不管君主，所以在第一次合併時補種。
    // v17：玩家勢力已滅亡（`monarchExtinct`）時**不能再播種**，否則滅亡後一刷頁面
    // 又冒出一個「君主」——那等於把剛演完的「勢力滅亡」偷偷復活。
    if (!M.monarchOf(view)) {
      // 开局选的君主优先（RunSetup.playerForce）；没选就让 MonarchModel 自己挑剧本首个 KING
      if (!this.monarchExtinct) M.seedMonarch(view, this.cities, { king: runPlayerForce() || undefined });
    } else M.seedCityOwners(view, this.cities);
    // 老檔（本輪之前建的）也沒有城歸屬：`forceRoster()` 按 `save.cities[城].owner` 聚合，
    // 缺了就顯示「勢力一覽 · 0 家」「名下城數 0」。這裡無條件補空值（不覆蓋已有的）。
    this.monarchState = view;
    return view;
  }

  private readMonarchExtras(): Record<string, unknown> {
    try {
      const raw = sys.localStorage.getItem(MONARCH_EXTRAS_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /** 只寫君主自己擁有的鍵（month/cities 那幾份以 `GameState` 為準） */
  private writeMonarchExtras(view: Record<string, unknown> | null): void {
    if (!view) return;
    const out: Record<string, unknown> = {};
    for (const key of MONARCH_SAVE_KEYS) {
      if (view[key] !== undefined) out[key] = view[key];
    }
    try {
      sys.localStorage.setItem(MONARCH_EXTRAS_KEY, JSON.stringify(out));
    } catch (err) {
      console.warn('[CampaignRoot] 君主補丁寫入失敗', err);
    }
  }

  /** 面板改過君主狀態（目前只有讓位）→ 落盤 + 頁頭重畫 */
  private commitMonarch(note: string): void {
    this.writeMonarchExtras(this.monarchState);
    this.hintText = note;
    this.refresh();
  }

  /** 城的歸屬：我方城一律算玩家勢力；敵城讀劇本 `KING`（關隘的 KING 是數字 1..12，不算勢力） */
  private ownerOf(cityName: string): string {
    if (this.save?.owned.includes(cityName)) return M.forceIdOf(this.monarchState);
    const king = this.cityByName(cityName)?.KING;
    return typeof king === 'string' ? king.trim() : '';
  }

  private playerForce(): string {
    return M.forceIdOf(this.monarchState);
  }

  /**
   * 內政 extras（`sanguo_city_v1`）裡的 roster；讀不到/壞資料 → `null`。
   *
   * Cocos 目前有兩份 roster：戰役存檔的 `save.roster`（招降台帳，`core/roster` 寫）與
   * 內政 extras 的 `roster`（任免/派遣/招降，`CityPanel.persist` 寫），兩者互不同步。
   */
  private readExtrasRoster(): Record<string, unknown> | null {
    try {
      const raw = sys.localStorage.getItem(CITY_EXTRAS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const roster = (parsed as { roster?: unknown }).roster;
      return roster && typeof roster === 'object' && !Array.isArray(roster)
        ? (roster as Record<string, unknown>)
        : null;
    } catch (err) {
      console.warn(`[ROSTER_SRC] 讀 ${CITY_EXTRAS_KEY} 失敗：${String(err)}`);
      return null;
    }
  }

  /**
   * 面板/播種的統一上下文：存檔 `save.roster` **∪** 內政 extras roster。
   * `scenIdx` 只給「還沒有人事紀錄的城」播種用，已有名單的城換劇本不受影響。
   */
  private rosterCtx(): O.OfficersCtx {
    const save = this.save as unknown as { roster?: unknown } | null;
    return {
      generals: this.generals,
      scenIdx: this.scenIdx,
      roster: O.mergeRosters(save?.roster, this.readExtrasRoster()),
      playerForce: runPlayerForce(),
      scenarioCities: this.cities,
    };
  }

  /**
   * 運行時人事播種/同步（2026-11-26「物品頁武將卡是張角」的根治點）。
   *
   * 我方每座城：把 `save.roster[城]` 與 `save.cities[城].officers` 寫成同一份名單；
   * 敵城：有人事紀錄就尊重（AI 月結寫的），沒有才按**本局劇本**的劇本表播種。
   * 入口：`start()`、招降面板 `onDone`、內政面板 `onClose`（見各處呼叫）。
   */
  private seedRuntimeOfficers(): void {
    const save = this.save;
    if (!save) return;
    const ctx = this.rosterCtx();
    const result = O.seedCityOfficers(save, this.cities, ctx);
    GameState.persistSave();
    console.log(`[ROSTER_SRC] seed officers: owned=${result.owned} seeded=${result.seeded}`);
  }

  /**
   * 各城駐將：存檔運行時人事（`OfficersOfCity.officersOfCity`）——
   * 君主面板的在職武將/讓位候選/殘將、名冊頁的「城 → 武將」索引都用它。
   * 舊碼是 `garrisonOf(data, 0, 城)`（劇本 0 靜態表，換劇本/換勢力都會錯）。
   */
  private officersByCity(): Record<string, O.OfficerLike[]> {
    return O.officersByCity(this.save, this.cities, this.rosterCtx());
  }

  private ensureMonarchPanel(): MonarchPanel {
    const existing = this.monarchPanel;
    if (existing && existing.isValid) return existing;
    const panel = MonarchPanel.show(this.node, {
      save: () => this.monarchState ?? {},
      generals: this.data?.generals ?? [],
      cities: this.cities,
      officersByCity: () => this.officersByCity(),
      ownerOf: (name: string) => this.ownerOf(name),
      onCommit: (note: string) => this.commitMonarch(note),
      onClose: () => this.refresh(),
    });
    this.monarchPanel = panel;
    return panel;
  }

  /** 點頁頭「君主 X」：開君主屬性卡 */
  private openMonarchCard(): void {
    if (!this.save) return;
    this.syncMonarchState();
    this.ensureMonarchPanel().open('card');
  }

  /** 點頁頭「勢 力」：開勢力一覽抽屜 */
  /**
   * 全屏暗幕（r90 起）：大面板盖住大地图时，底下的页头/地图会从半透明面板里透出来，
   * 文字互相压。这里在最上层面板下面铺一张 210 alpha 的黑幕。
   * 每个入口用完自己 destroy，避免叠层。
   *
   * 【r224 觸控根因】暗幕**不能**掛 `BlockInputEvents`：它會在節點上註冊 TOUCH_START/END
   * 監聽，於是引擎 `PointerEventDispatcher`（priority UI=1，先於全局 input 派發）把暗幕當成
   * 命中目標 → 認領該 touch 並回傳 `false` → `Input._emitEvent` 直接 `break`，
   * **全局 `input.on(TOUCH_END)` 監聽（所有面板與大地圖都靠它）從此收不到任何事件**，
   * 面板看起來就「按鈕全部無效、畫面卡住」（原生/模擬器必現，JS 幀循環仍在跑）。
   * 因此改由 `onTouch()` 開頭檢查 `Scrim_*` 子節點擋穿透，暗幕只負責畫。
   */
  private showSheetScrim(tag: string): Node {
    const name = `Scrim_${tag}`;
    const old = this.node.getChildByName(name);
    if (old) old.destroy();
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    n.parent = this.node;
    n.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    const g = n.addComponent(Graphics);
    g.fillColor = new Color(4, 6, 10, 210);
    g.rect(-DESIGN_W / 2, -DESIGN_H / 2, DESIGN_W, DESIGN_H);
    g.fill();
    return n;
  }

  private hideSheetScrim(tag: string): void {
    const n = this.node.getChildByName(`Scrim_${tag}`);
    if (n) n.destroy();
  }

  private openForcesPanel(): void {
    if (!this.save) return;
    this.syncMonarchState();
    // d3-general-book：勢力圖（60 城着色 + 路網 + 逐家明細）取代舊的君主頁 forces 抽屜。
    this.showSheetScrim('forces');
    ForcesPanel.show(this.node, {
      save: this.save as unknown as NonNullable<Parameters<typeof ForcesPanel.show>[1]['save']>,
      data: this.data,
      cities: this.cities as unknown as NonNullable<Parameters<typeof ForcesPanel.show>[1]['cities']>,
      // [ROSTER_SRC] 城的駐將/歸屬/太守走存檔運行時人事，不再讓面板自己 `garrisonOf(data, 0, 城)`
      officersByCity: this.officersByCity(),
      paths: this.paths,
      // 劇本號只給「沒有任何人事紀錄的城」播種/取 cities 用
      scenIdx: this.scenIdx,
      ownerOf: (name: string) => this.ownerOf(name),
      player: runPlayerForce(),
      onClose: () => {
        this.hideSheetScrim('forces');
        this.refresh();
      },
    });
  }

  /** 名冊入口（d3-general-book）：按勢力/按城的武將名冊 + 單將卡。 */
  private openGeneralBook(): void {
    if (!this.save) return;
    this.syncMonarchState();
    this.showSheetScrim('book');
    GeneralBookPanel.show(this.node, {
      // 面板只在「自己補 cities / officersByCity」時讀 data；generals/magics/wises 必須顯式傳，
      // 否則 401 行名冊會是 0 人（r90c 截图实测「全部 0 / 篩選後 0 人」）。
      generals: this.data?.generals ?? [],
      magics: this.data?.magics ?? null,
      wises: this.data?.wises ?? null,
      data: this.data,
      // GeneralBookPanelOptions 用的是宽类型（unknown/object），本模块的 CampaignSave/CampaignCity
      // 直接传会被名义类型挡住；面板只读，这里按结构互转。
      save: this.save as unknown as NonNullable<GeneralBookPanelOptions['save']>,
      cities: this.cities as unknown as NonNullable<GeneralBookPanelOptions['cities']>,
      // [ROSTER_SRC] 名冊「所屬城」從存檔運行時人事反查（`officersByCity`）；
      // `scenIdx` 只給「沒有任何紀錄的將」取劇本表城市（`city_by_times[scenIdx]`）用。
      officersByCity: this.officersByCity(),
      scenIdx: this.scenIdx,
      ownerOf: (name: string) => this.ownerOf(name),
      onClose: () => {
        this.hideSheetScrim('book');
        this.refresh();
      },
    });
  }

  /**
   * 「列表」入口（d4-ending-list）：開城池列表頁。
   * 點一行回調把 `selected` 指到該城並重畫，等於「從列表選城 → 回地圖」。
   */
  /**
   * 存檔槽面板（r86 的 P2）。
   *
   * 讀檔成功後整場景重載：`GameState` 內部有模組級快取（`resetCache()` 才清），
   * 直接改 `this.save` 會留一堆舊節點/舊 AI 隊列，重載是最省心的等價做法。
   * `SaveSlotsPanel` 自己寫 `CAMPAIGN_KEYS` 那七把鍵，不經過 `GameState.save()`，
   * 所以讀完必須重載才能把新檔吃進去。
   */
  private openSaveSlots(): void {
    if (!this.save) return;
    this.showSheetScrim('saves');
    SaveSlotsPanel.show(this.node, {
      save: this.save,
      onLoad: (_result: LoadSlotResult) => {
        this.hideSheetScrim('saves');
        GameState.resetCache();
        director.loadScene('Campaign');
      },
      onClose: () => {
        this.hideSheetScrim('saves');
        this.refresh();
      },
    });
  }

  private openCityList(): void {
    if (!this.save) return;
    const save = this.save;
    this.showSheetScrim('list');
    CityListPanel.show(this.node, {
      // CityList 的入参是结构型（Index signature），与三个本模块类型的名义差异用结构互转抹平；
      // 面板只读不写（不写回 save，只通过 onPick 回传城名），见 CityListPanelOptions 的定义。
      save: save as unknown as NonNullable<CityListPanelOptions['save']>,
      cities: this.cities as unknown as NonNullable<CityListPanelOptions['cities']>,
      generals: this.generals as unknown as NonNullable<CityListPanelOptions['generals']>,
      selected: this.selected,
      onPick: (name: string) => {
        // 【r224】點行依 CityListPanel 的設計「不自動關閉」，所以暗幕要留到使用者按
        // 「關閉 / 返回地圖」才一起收。先前這裡先 hideSheetScrim('list')，暗幕一消失
        // 穿透守衛就失效（面板還開著，地圖卻重新吃點擊）。
        this.selected = name;
        this.refresh();
      },
      onClose: () => {
        this.hideSheetScrim('list');
        this.refresh();
      },
    });
  }

  // -------------------------------------------------------------------------
  // 戰報（v17-cocos-monarch：AI 逐條戰報，不只月報第一行）
  //
  // web 是 `save.log`（campaign.html:2574 只留 8 條）+ `renderLog()`（:1934 反序）。
  // Cocos 的 `GameState` 存檔是白名單，加不了 log 欄位，所以戰報自己落一個 localStorage 鍵，
  // 換場景（打守城戰）回來還在。
  // -------------------------------------------------------------------------

  private buildLogLabels(): void {
    if (this.logTitle) return;
    // v18-cocos-layout：戰報搬到地圖下方（718 寬），字級跟著放大一檔（14→15 / 11→13），
    // 時間列 66 寬、正文從 x+78 起（舊的 336 窄條用 58/74）。
    this.logTitle = this.makeLabel('戰 報', LOG_VIEW.x + 12, LOG_VIEW.y + 15, LOG_VIEW.w - 26, 15, COLORS.goldLight, 'left');
    this.logTitle.overflow = Label.Overflow.SHRINK;
    addOutline(this.logTitle, new Color(6, 8, 12, 220), 1);
    for (let i = 0; i < BATTLE_LOG_MAX; i += 1) {
      const cy = LOG_VIEW.y + LOG_ROW_TOP + i * LOG_ROW_H + LOG_ROW_H / 2;
      const time = this.makeLabel('', LOG_VIEW.x + 12, cy, 66, 12, COLORS.textFaint, 'left');
      time.overflow = Label.Overflow.SHRINK;
      const text = this.makeLabel('', LOG_VIEW.x + 82, cy, LOG_VIEW.w - 96, 13, COLORS.text, 'left');
      text.overflow = Label.Overflow.SHRINK;
      addOutline(text, new Color(4, 6, 9, 210), 1);
      time.node.active = false;
      text.node.active = false;
      this.logTimeLabels.push(time);
      this.logTextLabels.push(text);
    }
    // 空戰報佔位：面板既然固定 298 高，沒有紀錄時不能是一片黑（v18-cocos-layout）
    this.logEmpty = this.makeLabel(
      '尚無戰事 · 出征或推進一月後，這裡會逐條記錄',
      LOG_VIEW.x + 82,
      LOG_VIEW.y + LOG_ROW_TOP + LOG_ROW_H / 2,
      LOG_VIEW.w - 96,
      13,
      COLORS.textFaint,
      'left',
    );
    this.logEmpty.overflow = Label.Overflow.SHRINK;
    this.logEmpty.node.active = false;
    // 翻頁鈕（[新設計]）：標題列右側兩顆，和標題同一條帶，`logPageHit()` 是唯一命中口徑
    this.logPrev = this.makeLabel('◀', LOG_PAGE_PREV.x + LOG_PAGE_PREV.w / 2, LOG_PAGE_PREV.y + LOG_PAGE_PREV.h / 2, LOG_PAGE_PREV.w, 13, COLORS.textFaint, 'center');
    this.logNext = this.makeLabel('▶', LOG_PAGE_NEXT.x + LOG_PAGE_NEXT.w / 2, LOG_PAGE_NEXT.y + LOG_PAGE_NEXT.h / 2, LOG_PAGE_NEXT.w, 13, COLORS.textFaint, 'center');
    this.logPrev.overflow = Label.Overflow.SHRINK;
    this.logNext.overflow = Label.Overflow.SHRINK;
    this.logPrev.node.active = false;
    this.logNext.node.active = false;
  }

  /** 戰報文字要浮在城市名之上（城名在 start() 才建，siblingIndex 在後 → 會蓋住戰報） */
  private promoteLogLabels(): void {
    const nodes: Node[] = [];
    if (this.logTitle) nodes.push(this.logTitle.node);
    if (this.logEmpty) nodes.push(this.logEmpty.node);
    if (this.logPrev) nodes.push(this.logPrev.node);
    if (this.logNext) nodes.push(this.logNext.node);
    for (let i = 0; i < this.logTimeLabels.length; i += 1) {
      const time = this.logTimeLabels[i];
      const text = this.logTextLabels[i];
      if (time) nodes.push(time.node);
      if (text) nodes.push(text.node);
    }
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (node) node.setSiblingIndex(this.node.children.length - 1);
    }
  }

  private pushBattleLog(lines: readonly BattleLogLine[]): void {
    if (lines.length === 0) return;
    // 緩衝留 BATTLE_LOG_KEEP 條（面板仍 8 行一頁），新的一條一定在「第 1 頁」→ 翻回頁首
    this.battleLog = battleLogAppend(this.battleLog, lines, BATTLE_LOG_KEEP);
    this.logPage = 0;
    this.storeBattleLog();
    this.refreshBattleLog();
  }

  /** `runMapAi()` 的結果 → 逐條戰報（出兵 / 易手 / 陣亡 三類，見 `battleLogFromAi`） */
  private recordAiBattleLog(ai: AiMonthOutcome | null): void {
    const lines = battleLogFromAi(ai, BATTLE_LOG_KEEP);
    if (lines.length === 0) return;
    this.battleLog = battleLogAppend(this.battleLog, lines, BATTLE_LOG_KEEP);
    this.logPage = 0;
    this.storeBattleLog();
  }

  private storeBattleLog(): void {
    try {
      sys.localStorage.setItem(BATTLE_LOG_KEY, JSON.stringify(this.battleLog));
    } catch (err) {
      console.warn('[CampaignRoot] 戰報寫入失敗', err);
    }
  }

  private loadBattleLog(): void {
    let raw: string | null = null;
    try {
      raw = sys.localStorage.getItem(BATTLE_LOG_KEY);
    } catch {
      raw = null;
    }
    if (!raw) {
      this.battleLog = [];
      return;
    }
    const out: BattleLogLine[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length; i += 1) {
          const rec = parsed[i] as Record<string, unknown> | null;
          if (!rec) continue;
          const s = typeof rec.s === 'string' ? rec.s : '';
          if (!s) continue;
          const t = typeof rec.t === 'string' ? rec.t : '';
          out.push({ t: t, s: s, k: logKindOf(rec.k) });
        }
      }
    } catch {
      out.length = 0;
    }
    this.battleLog = out.slice(Math.max(0, out.length - BATTLE_LOG_KEEP));
    this.logPage = 0;
  }

  /** 把環形緩衝刷到 Label（月份分組 + 8 行一頁；最新在上，和 web 的 `renderLog()` 一致） */
  private refreshBattleLog(): void {
    const month = this.save ? this.save.month : 0;
    const page = battleLogPage(this.battleLog, this.logPage, BATTLE_LOG_MAX, month);
    this.logPage = page.page;
    this.logPages = page.pages;
    // v18-cocos-layout：折疊 = 收起全部行（面板高度不變，見 drawBattleLog 的註釋）
    const rows: BattleLogRow[] = this.logCollapsed ? [] : page.rows;
    for (let i = 0; i < BATTLE_LOG_MAX; i += 1) {
      const row = i < rows.length ? rows[i] : null;
      const time = this.logTimeLabels[i];
      const text = this.logTextLabels[i];
      // 分組標題列不寫時間列（標題自己帶年月），正文整條讓給組頭
      const isMonth = Boolean(row && row.month);
      if (time) {
        time.node.active = Boolean(row) && !isMonth;
        if (row && !isMonth) time.string = row.t;
      }
      if (text) {
        text.node.active = Boolean(row);
        if (row) {
          text.string = row.s;
          text.color = rgba(logColor(row.k) || COLORS.text);
        }
      }
    }
    if (this.logTitle) {
      const arrow = this.logCollapsed ? '▸' : '▾';
      if (this.battleLog.length === 0) this.logTitle.string = `戰 報 · 尚無戰事 ${arrow}`;
      else if (this.logCollapsed) this.logTitle.string = `戰 報 · 共 ${this.battleLog.length} 條 ${arrow}`;
      else this.logTitle.string = `戰 報 · 共 ${this.battleLog.length} 條 · ${page.page + 1}/${page.pages} 頁 ${arrow}`;
    }
    if (this.logEmpty) this.logEmpty.node.active = !this.logCollapsed && this.battleLog.length === 0;
    // 翻頁鈕：折疊或只有一頁時收掉；頁首/頁尾熄燈（亮 = goldLight，暗 = textFaint）
    const showTurn = !this.logCollapsed && page.pages > 1;
    if (this.logPrev) {
      this.logPrev.node.active = showTurn;
      this.logPrev.color = rgba(page.page > 0 ? COLORS.goldLight : COLORS.textFaint);
    }
    if (this.logNext) {
      this.logNext.node.active = showTurn;
      this.logNext.color = rgba(page.page < page.pages - 1 ? COLORS.goldLight : COLORS.textFaint);
    }
  }

  /**
   * 戰報面板底板（畫在 gUi 上，文字是 Label 兄弟節點）。
   *
   * v18-cocos-layout：面板搬到地圖下方、恆為 `LOG_VIEW.h`（298）高 —— 折疊只收起行，
   * 不再把高度縮成 LOG_BAR_H（那會在控制台裡挖出一個 254px 的洞）。標題列仍可點折疊。
   */
  private drawBattleLog(g: Graphics): void {
    // 戰報面板：上冷下暖漸層 + 內描邊（w5-render，原本單一 #0B0E13 @216 讀成一片純黑）。
    // 色值對齊 web 版戰報面板採樣 rgb(25,28,29)/lum 27，段數 20（298px / 20 ≈ 15px 一段）。
    // w9-render3：色值改吃 WARM（原本 '#1E2126'→'#14171B' 是冷藍灰，夾在暖褐頁頭下面像另一套 UI）。
    this.paintBands(
      g,
      lightGrid(LOG_VIEW, 24, 13, WARM.panelHi, 18, -14),
    );
    // 交叉疊光：web `city.html:48` `.sec{background:linear-gradient(180deg,…)}` 之上還有一層
    // `::before{border:1px solid rgba(255,255,255,.08)}` 的絹面反光；這裡用橫向暖光近似，
    // 與縱向色帶交叉後得到 20×10 個格子色（單向色帶只有 20 種）。
    this.paintBands(g, wash(LOG_VIEW, '#D8B36A', 20, 0, 10, true));
    this.paintBands(g, edgeBands(LOG_VIEW, '#000000', 90, 22, 3));
    // w7-cocos-render2：面板頂/底高光 + 內金線（web 的 `inset 0 1px #fff2` + `inset 0 0 0 1px`）
    this.paintBands(g, topSheen(LOG_VIEW.x + 2, LOG_VIEW.y + 2, LOG_VIEW.w - 4, '#F2DCA8', 30));
    this.paintBands(g, topSheen(LOG_VIEW.x + 2, LOG_VIEW.y + LOG_VIEW.h - 2, LOG_VIEW.w - 4, '#000000', 80));
    // 雙線描邊（w9-render3）：外 1px 暗、內 1px 金（web `.btn`/`.sec` 的 1px 亮邊 + 1px 暗邊）
    this.paintBands(g, doubleEdge(LOG_VIEW, '#000000', 170, COLORS.gold, 66, 1, 2));
    // 標題列金線：和頁頭「君主」下的金線同一種語言
    this.fillRect(g, LOG_VIEW.x, LOG_VIEW.y + LOG_HEAD_H - 1, LOG_VIEW.w, 1, COLORS.gold, 90);
    if (this.logCollapsed) return;
    const page = battleLogPage(this.battleLog, this.logPage, BATTLE_LOG_MAX, this.save ? this.save.month : 0);
    const rows = page.rows;
    // 月份分組標題列（[新設計]）：淡金底 + 下緣一條金線；字色是 logColor('year')
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || !row.month) continue;
      const top = LOG_VIEW.y + LOG_ROW_TOP + i * LOG_ROW_H;
      this.fillRect(g, LOG_VIEW.x + 8, top + 3, LOG_VIEW.w - 16, LOG_ROW_H - 6, COLORS.gold, 16);
      this.fillRect(g, LOG_VIEW.x + 8, top + LOG_ROW_H - 3, LOG_VIEW.w - 16, 1, COLORS.gold, 110);
    }
    // v18-cocos-layout：空格也畫一條更淡的帳頁線，避免大片純黑讀成「沒做完」
    for (let i = 1; i < BATTLE_LOG_MAX; i += 1) {
      const y = LOG_VIEW.y + LOG_ROW_TOP + i * LOG_ROW_H;
      this.fillRect(g, LOG_VIEW.x + 8, y, LOG_VIEW.w - 16, 1, COLORS.line, rows.length > i ? 70 : 34);
    }
  }

  private toggleBattleLog(): void {
    this.logCollapsed = !this.logCollapsed;
    this.refreshBattleLog();
    this.drawFrame();
  }

  /** 戰報翻頁（`logPageHit()` 的兩個命中區 → 這裡）。頁首再往前 / 頁尾再往後 = 不動，不繞回 */
  private turnBattleLogPage(delta: number): void {
    const next = this.logPage + (delta < 0 ? -1 : 1);
    if (next < 0 || next >= this.logPages) return;
    this.logPage = next;
    this.refreshBattleLog();
    // 分組標題列的淡金底是 Graphics 畫的 → 換頁要重畫一幀
    this.drawFrame();
  }

  // -------------------------------------------------------------------------
  // 君主陣亡 → 選繼承人（v17-cocos-monarch）
  //
  // 觸發口徑：君主座位（garrison.json 的 major === 君主那座城）丟了 → 陣亡。
  // web 是「太守 == 君主 且 這座城本來就是他的」（campaign.html:2697），但 web 只在
  // 破城那一刻判一次；Cocos 的守城戰在 Deploy 場景結算（GameState.recordBattleResult
  // 直接把城從 owned 拿掉），所以靠 localStorage 記住座位，回大地圖再判。
  // -------------------------------------------------------------------------

  private loadMonarchSeat(): void {
    let seat = '';
    let extinct = false;
    try {
      seat = sys.localStorage.getItem(MONARCH_SEAT_KEY) || '';
      extinct = sys.localStorage.getItem(MONARCH_EXTINCT_KEY) === '1';
    } catch {
      seat = '';
      extinct = false;
    }
    const save = this.save;
    // 新開局（第一月、零戰績）→ 上一局的「勢力滅亡」與「君主座位」都不能帶過來：
    // 舊座位不在新局的三城裡，會被 detectMonarchDeath() 誤判成開局即陣亡。
    if (save && save.month <= 1 && save.wins === 0 && save.losses === 0) {
      extinct = false;
      seat = '';
      try {
        sys.localStorage.removeItem(MONARCH_EXTINCT_KEY);
        sys.localStorage.removeItem(MONARCH_SEAT_KEY);
      } catch {
        extinct = false;
        seat = '';
      }
    }
    this.monarchSeat = seat;
    this.monarchExtinct = extinct;
  }

  private storeMonarchSeat(seat: string): void {
    try {
      if (seat) sys.localStorage.setItem(MONARCH_SEAT_KEY, seat);
      else sys.localStorage.removeItem(MONARCH_SEAT_KEY);
    } catch (err) {
      console.warn('[CampaignRoot] 君主座位寫入失敗', err);
    }
  }

  private storeMonarchExtinct(dead: boolean): void {
    try {
      if (dead) sys.localStorage.setItem(MONARCH_EXTINCT_KEY, '1');
      else sys.localStorage.removeItem(MONARCH_EXTINCT_KEY);
    } catch (err) {
      console.warn('[CampaignRoot] 滅亡旗標寫入失敗', err);
    }
  }

  /**
   * 判君主座位。「回傳死者名字」＝判定陣亡；回傳 '' ＝沒事。
   * 三種情形：①記住的座位還在 → 沒事；②君主此刻在別的城當太守 → 搬座位；③舊座位丟了 → 陣亡。
   */
  private detectMonarchDeath(): string {
    const save = this.save;
    if (!save) return '';
    const view = this.syncMonarchState();
    const monarch = M.monarchOf(view);
    if (!monarch) return '';
    // [R242] 君主战死/被俘：战斗结算时已写 `generalStatus`（见 `BattleRoot`），这里直接采信。
    // 旧码只从「君主不在任何城的太守位」推断死亡，君主在战场上死了也照样当他还活着 → 永不失败。
    const fate = (save.generalStatus && typeof save.generalStatus === 'object'
      ? (save.generalStatus as Record<string, unknown>)[monarch]
      : '') as unknown;
    if (String(fate ?? '').trim() === '死' || String(fate ?? '').trim() === '俘') return monarch;
    const owned = save.owned;
    const seat = this.monarchSeat;
    if (seat && owned.indexOf(seat) >= 0) return '';
    let found = '';
    const data = this.data;
    if (data) {
      const ctx = this.rosterCtx();
      for (let i = 0; i < owned.length; i += 1) {
        const name = owned[i];
        if (!name) continue;
        // [ROSTER_SRC] 座位 = 君主現在當太守的那座城：存檔運行時人事優先，劇本表只兜底。
        // 舊碼 `garrisonOf(data, 0, name)` 恆吃劇本 0，換劇本後座位判定會整個跑偏。
        if (O.cityMajorNameOf(save, name, ctx) === monarch) {
          found = name;
          break;
        }
      }
    }
    if (found) {
      this.monarchSeat = found;
      this.storeMonarchSeat(found);
      return '';
    }
    if (seat) {
      // 上一輪記的座位這會兒不在 owned 裡 → 那座城丟了
      this.monarchSeat = '';
      this.storeMonarchSeat('');
      return monarch;
    }
    if (owned.length > 0) {
      // 第一次判：君主不在任何城的太守位（玩家開局三城常分屬三個勢力）→ 首城兜底
      this.monarchSeat = owned[0] ?? '';
      this.storeMonarchSeat(this.monarchSeat);
    }
    return '';
  }

  /** 君主陣亡 → 彈「選繼承人」（或「勢力滅亡」）；沒有就什麼都不做 */
  private checkMonarchDeath(): void {
    if (this.successionState || this.monarchExtinct) return;
    const save = this.save;
    if (!save) return;
    const dead = this.detectMonarchDeath();
    // 分派是純函數（`planMonarchDeath`），這裡只做副作用 —— 0 城 / 已彈窗 / 已滅亡都在裡面擋掉
    const plan = planMonarchDeath(dead, save.owned.length, Boolean(this.successionState), this.monarchExtinct);
    if (plan.kind === 'ending') {
      // 0 城：繼承沒有意義（`M.kingDeath` 的 remaining===0 也是直接滅亡）。這裡直接落滅亡旗標，
      // 把滿屏結局讓給 `EndingPanel.showIfEnded()`（start() 緊接著就會叫），
      // 否則繼承窗會先彈、再被結局面板蓋住 —— 玩家點不到剛才那個窗。
      this.monarchExtinct = true;
      this.storeMonarchExtinct(true);
      this.monarchSeat = '';
      this.storeMonarchSeat('');
      this.hintText = '君主陣亡：名下已無城池，勢力滅亡。';
      return;
    }
    if (plan.kind !== 'prompt') return;
    const force = this.playerForce();
    const all = this.officersByCity();
    const officers = successionOfficers(
      save.owned,
      (city: string) => this.ownerOf(city),
      (city: string) => all[city] ?? [],
      force,
    );
    const state = successionStart({
      force: force,
      dead: plan.dead,
      month: save.month,
      remaining: plan.remaining,
      officers: officers,
      king: plan.dead,
    });
    this.successionState = state;
    const view = successionView(state);
    this.hintText = `${view.title}：${view.hint}`;
    this.ensureMonarchPanel().openSuccession(view, (name: string) => this.commitSuccession(name));
    this.refresh();
  }

  /** 玩家點完 → 落地（`M.inheritForce` / `M.extinguish`）→ 寫戰報 → 重畫 */
  private commitSuccession(name: string): void {
    const state = this.successionState;
    if (!state) return;
    const view = this.syncMonarchState();
    const out = successionLand(view, state, name);
    this.successionState = null;
    this.writeMonarchExtras(view);
    this.monarchExtinct = out.extinct;
    this.storeMonarchExtinct(out.extinct);
    this.monarchSeat = '';
    this.storeMonarchSeat('');
    const fates = out.fates.length > 0 ? `（${out.fates.slice(0, 3).join('、')}）` : '';
    this.battleLog = battleLogPush(this.battleLog, battleLogLine(out.month, out.line, out.kind), BATTLE_LOG_KEEP);
    this.logPage = 0;
    this.storeBattleLog();
    this.hintText = out.extinct
      ? `君主陣亡：勢力滅亡${fates}。`
      : `君主陣亡：${out.heir || '（無人）'} 繼位（勢力存續 · 名號不變）。`;
    this.refresh();
    // 沒有繼承人 = 勢力滅亡 → 滿屏結局（`EndingPanel` 判 monarchExtinct）。不主動叫一次，
    // 玩家得離開大地圖重進才看得到結局，中間一直停在「君主已死但遊戲照跑」的狀態。
    if (out.extinct) {
      EndingPanel.showIfEnded(this.node, { ...view, monarchExtinct: true }, this.cities, this.generals, {
        onRestart: () => GameState.resetCache(),
      });
    }
  }

  // 注册/注销放在 onEnable/onDisable，避免场景切换后野指针
  onEnable(): void {
    input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'CampaignRoot'), this);
  }

  onDisable(): void {
    input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'CampaignRoot'), this);
  }
}
