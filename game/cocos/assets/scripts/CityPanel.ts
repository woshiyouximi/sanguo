/**
 * 內政頁（Cocos Creator 3.8 面板版）—— web `city.html` + `city_model.js` 的移植。
 *
 * ## 為什麼是「面板」不是場景
 * web 的內政頁是獨立頁面（`game/web/city.html`）。Cocos 這邊不新建 `.scene`
 * （手寫 scene JSON 容易壞，而且需要 asset-db 生成 `.meta`），改成由
 * `CampaignRoot` 在**當前場景**裡實例化一個全屏節點掛上本組件，用
 * 「顯示 / 隱藏」當頁面切換 —— 見 `project/69_Cocos内政页.md` §3/§4。
 *
 * ## 職責
 * 1. 把 `GameState` 的 `CampaignSave`（只有 troops/pop/money）與本檔額外維護的
 *    內政欄位（def/cav/inf/prep/prepMonth/roster/appointed/searchLog/foundItems/
 *    auto/autoMonth/lastActionMonth）拼成 `CityModel.CitySave`；
 * 2. 9 條命令（開墾/徵兵/搜索/移動/任命/物品/情報/出征/自治）全部走 `CityModel`，
 *    效果寫回 `GameState.save` + `sys.localStorage`；
 * 3. 複刻 web 的 HUD（12 項屬性）、命令按钮、結果日誌（6 條）、月令鎖（R8）。
 *
 * ## 存檔分層（重要）
 * `GameState.normalize()` 是白名單：城市只留 `troops/pop/money`，未知頂層鍵全丟。
 * 所以內政欄位不能塞進 `sanguo_campaign_v1`，本檔另開 `sanguo_city_v1`（`CITY_EXTRAS_KEY`），
 * 進出面板時雙向合併。詳見報告 §4。
 *
 * ## 坐標口徑
 * 與其他 Root 一致：設計座標 750×1334、左上原點；落到節點局部座標用
 * `view/layout.ts` 的 `toLocal(sx, sy)`（`x-375 / 667-y`）。
 */
import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  input,
  Input,
  Label,
  Layers,
  Node,
  sys,
  UITransform,
  Vec3,
} from 'cc';
import { addOutline, ArtBg } from './ArtLayer';
// 漸層近似（w5-render）：Cocos 沒有 CSS gradient，用多段色帶逼近
import { Band, doubleEdge, edgeBands, innerEdge, lightGrid, topSheen, vBands, WARM, wash } from './Draw';
import { ItemsPanel } from './ItemsPanel';
import * as GameState from './GameState';
import * as M from './CityModel';
// 城市駐將的唯一入口（純邏輯、零 cc 依賴）：物品頁武將池從存檔運行時人事取。
import * as O from './OfficersOfCity';
// 文字層級（w5-cocos-skin）：卡片標題 / 正文 / 數值統一走 role 表
import { applyTextRole, applyTextRoles } from './TextRole';
import type { GameData } from './types';
// 九宮皮膚（w5-cocos-skin）：透空中心的框/牌疊在 gMain 填充之上、Label 之下
import { makeNineSlice, placeDesign } from './UiSkin';
import { clamp, DESIGN_H, DESIGN_W, toLocal } from './view/layout';
import { COLORS, FONT, FONT_FAMILY } from './view/theme';
import { guardTouch } from './InputGuard';

const { ccclass } = _decorator;

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/** 內政附加欄位的存檔鍵（與 `GameState.SAVE_KEY` 分開，理由見檔頭） */
export const CITY_EXTRAS_KEY = 'sanguo_city_v1';

/* ======================================================================
 * §0 型別 / 小工具
 * ==================================================================== */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `#RRGGBB` → `Color`（Graphics / Label 都吃 Color，不吃字符串） */
function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 與 web `fmt` 同：`toLocaleString('en-US')` 的千分位 */
function fmt(value: unknown): string {
  const n = M.num(value);
  return Math.trunc(n).toLocaleString('en-US');
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** 移動失敗的原因文案（照抄 web `city_app.js` 的 reason 映射） */
const MOVE_REASON: Record<string, string> = {
  empty: '沒有選擇兵力或武將。',
  target: '目標城不合法。',
  'not-own-city': '這座城不是我方的。',
  'not-owned': '目標不是我方城池。',
  'not-adjacent': '目標不相鄰（只能調往相鄰我方城）。',
  absent: '這座城沒有那位武將。',
  full: '目標城部隊已滿。',
};

/* ======================================================================
 * §1 版面常量（設計座標，左上原點）
 * ==================================================================== */

const R_HEADER: Rect = { x: 0, y: 0, w: DESIGN_W, h: 118 };
const R_BACK: Rect = { x: 18, y: 26, w: 104, h: 64 };
const R_TITLE: Rect = { x: 136, y: 22, w: 330, h: 46 };
const R_MONTH: Rect = { x: 470, y: 26, w: 262, h: 42 };

/**
 * 資訊卡（v18-cocos-layout 重排）：**4 欄 × 3 行**，對齊 web `city.html` 的 3×4 表格
 * （人口|金|兵|預備兵 / 防務|太守|軍師|內政效率 / 武將|疲勞|士氣|月令）。
 *
 * 舊版是「2 欄 × 6 行、340 高」，12 個 label 直接浮在朝堂圖上、沒有卡片底，
 * 左半邊被圖的紅色帷幔吃掉對比度（截圖 r89_03_city.png）。現在每格是
 * 「小字標籤（14px 暗）+ 大字數值（24px 亮）」上下兩行，卡片本身是半透明深色 + 金框。
 */
const R_HUD: Rect = { x: 18, y: 126, w: 714, h: 206 };
const HUD_ROW_H = 66;
const HUD_PAD = 8;
const HUD_COL_W = (R_HUD.w - HUD_PAD * 2) / 4;
const HUD_NAME_H = 24;
/** 標籤字級與數值字級 */
const HUD_NAME_FONT = 14;
const HUD_VALUE_FONT = 24;

/** 內政命令卡：標題列 42 + 3×3 網格（按鈕 230×104、間距 12 → 392..728） */
const R_CMD: Rect = { x: 18, y: 344, w: 714, h: 396 };
const CMD_TITLE_H = 42;
const CMD_W = 230;
const CMD_H = 104;
const CMD_GAP_X = 12;
const CMD_GAP_Y = 12;

/**
 * 紀錄卡：880..1228（348 = 標題 48 + 5 行 × 60）。
 *
 * v18-cocos-layout 第二版：起點從 752 下移到 880 —— 朝堂帶（PALAIS + 地面接縫）正好
 * 是 0..880，紀錄卡從帶底開始，於是「朝堂 → 紀錄 → 提示」三段與大地圖頁的
 * 「地圖 → 戰報 → 按鈕」同構；也讓驗收斷言「紀錄矩形不與地圖矩形(130..830)相交」成立。
 */
const R_LOG: Rect = { x: 18, y: 880, w: 714, h: 348 };
const R_LOG_TITLE: Rect = { x: 34, y: 886, w: 220, h: 34 };
/** 右上角狀態：v18 起改「最近 5 條」（原本「本月令可下」與資訊卡的「月令 可下」重複） */
const R_LOG_STATE: Rect = { x: 512, y: 888, w: 206, h: 30 };
const LOG_ROW_H = 60;
const LOG_ROWS = 5;

/** 頁尾提示條：1240..1320 —— 整頁吃到 1320（驗收要求「最底部元素 bottom ≥ 1300」） */
const R_HINT: Rect = { x: 18, y: 1240, w: 714, h: 80 };

const R_SHEET: Rect = { x: 18, y: 752, w: 714, h: 476 };
const R_SHEET_TITLE: Rect = { x: 42, y: 758, w: 400, h: 36 };
const SHEET_ROW_H = 60;
const SHEET_ROW_GAP = 4;
const SHEET_ROWS = 6;

/* ---- 朝堂帶 / 地面接縫（美術）---------------------------------------- */

/** 接縫 y：朝堂圖高 562，地面從這裡起（與 `buildArt()` 的兩個矩形同源） */
const SEAM_Y = 562;

/**
 * 接縫柔化帶的色值 = `floor_0N` 頂 6 列均值（實測，見 `work/cocos_art_final/seam_metrics.txt`）。
 *
 * 為什麼要這條帶：`palais_0N` 底列與 `floor_0N` 頂列不是同源（地面是平色漸層板，
 * 不是朝堂圖底列的模糊），兩者亮度差 ΔL 實測 −2.1 / −17.6 / −20.5 / −46.0 / −22.5，
 * 在 y=562 上是一道硬邊。用地面色做三角 alpha 漸層（上 56px、下 32px）把它壓成一道影。
 */
const SEAM_TINT: string[] = ['#351910', '#210F05', '#3D150C', '#46210F', '#3D1706'];

/**
 * 九條命令：主令 7（`CMD_ORDER`）+ 副令 2（`CMD_SECONDARY`，情報/移動不占月令）。
 *
 * [F7] web 真源 `city.html:754-759`：`[...M.CMD_ORDER, ...(M.CMD_EXTRA||[])]` 進 `#grid`、
 * `M.CMD_SECONDARY` 進 `#subgrid`（`makeBtn(cmd,' sub')`）。Cocos 只有一組九宮，所以兩組
 * 合併成 9 格 —— 7 + 2 正好填滿九宮。
 * 舊碼是 `CMD_ORDER`(8 條：開發/徵兵/搜索/移動/任命/物品/情報/出征) + `CMD_EXTRA`(自治)，
 * 把「移動/情報/物品」當主令，與 web 的 7 主令 + 2 副令口徑不符。
 */
function cmdList(): string[] {
  return ([] as string[]).concat(M.CMD_ORDER, M.CMD_SECONDARY);
}

/* ======================================================================
 * §2 組件
 * ==================================================================== */

export interface CityPanelOptions {
  /** 當前城名 */
  cityName: string;
  /** `DataLoader.loadGameData()` 的結果（generals/items/wises） */
  data: GameData;
  /** 當前劇本（`{ cities, paths }`，`core/march` 與 CityModel 共用這個形狀） */
  scenario: M.CityScenario;
  /**
   * [P0-2] 當前劇本序號（`RunSetup.scenarioIndex()` 的結果）。
   * 內政的 roster / wildPool / garrison 全部按這個劇本取；缺省 0 = 舊行為（第一個劇本）。
   */
  scenIdx?: number;
  /** [P0-2] `garrison.json` 原始陣列（關卡守軍兵力按劇本取；沒有就回落 110） */
  garrison?: M.GarrisonScenario[] | null;
  /**
   * [P1-5/F12/F15] 進場直接開哪個抽屜（大地圖「徵兵」「開發」按鈕走同一面版）。
   * 只接受命令表裡的名字（'徵兵' / '開發'）；開完就清掉，下次開面版不會重播。
   */
  openCmd?: string;
  /** 關閉面板：由 `CampaignRoot` 負責隱藏 + 刷新大地圖 */
  onClose: () => void;
  /** 出征：把目標城交回 `CampaignRoot` 走既有的 `doAction('march')` */
  onDeploy?: (target: string) => void;
}

/** 抽屜的一行 */
interface SheetRow {
  text: string;
  act: (() => void) | null;
}

/**
 * 九宮底板清單（w5-cocos-skin）。
 *
 * **只疊底板，矩形一個不改**：每條 rect 就是本檔既有的 `R_HUD` / `R_CMD` / `R_LOG` /
 * `R_HINT` / `R_BACK`。frame_panel / plate_btn 的 PNG 中心是 alpha 0（只畫框），
 * 所以直接疊在 `drawMain()` 的填充之上，半透明卡片底（`vAlpha` 226）照舊透出來。
 *
 * `work\cocos_skinapply\skin_nodes_assert.mjs` 會逐條比對這裡的 key 與矩形。
 */
interface SkinSlot {
  readonly name: string;
  readonly key: string;
  readonly rect: Rect;
}

const SKIN_SLOTS: readonly SkinSlot[] = [
  { name: 'SkinHudFrame', key: 'frame_panel', rect: { x: 18, y: 126, w: 714, h: 206 } },
  { name: 'SkinCmdFrame', key: 'frame_panel', rect: { x: 18, y: 344, w: 714, h: 396 } },
  { name: 'SkinLogFrame', key: 'frame_panel', rect: { x: 18, y: 880, w: 714, h: 348 } },
  { name: 'SkinHintFrame', key: 'frame_panel', rect: { x: 18, y: 1240, w: 714, h: 80 } },
  { name: 'SkinBackPlate', key: 'plate_btn', rect: { x: 18, y: 26, w: 104, h: 64 } },
];

@ccclass('CityPanel')
export class CityPanel extends Component {
  // ---- 狀態 ----
  private opts: CityPanelOptions | null = null;
  private cityName = '';
  private save: M.CitySave | null = null;
  private ctx: M.CityCtx = {};
  private bag: number[] = [];
  private locked = false;
  private opened = false;
  private registered = false;
  private built = false;

  /** 物品頁（w4-cocos-items）：由內政頁「物品」按鈕打開，掛在本面板節點下 */
  private itemsPanel: ItemsPanel | null = null;

  // ---- 節點 ----
  private gMain: Graphics | null = null;
  private gSheet: Graphics | null = null;

  /** 朝堂远景（bg/policy/palais_0N，750×562）+ 预烘柔焦地面（floor_0N，750×318） */
  private artHall: ArtBg | null = null;
  private artFloor: ArtBg | null = null;
  /** 接縫柔化帶（畫在兩張美術之上、CityPanelBg 之下，只影響美術，不動面板） */
  private artSeam: Graphics | null = null;
  /** 当前已载入的朝堂序号（1..5）；-1 = 还没载 */
  private hallShown = -1;

  private lblBack: Label | null = null;
  private lblTitle: Label | null = null;
  private lblMonth: Label | null = null;
  private hudNames: Label[] = [];
  private hudValues: Label[] = [];
  private cmdTags: Label[] = [];
  private cmdSubs: Label[] = [];
  private logLabels: Label[] = [];
  private lblLogTitle: Label | null = null;
  /** 版式驗收用：四張卡的設計矩形（ensureBuilt 時填） */
  public layoutRects: { hud: Rect; cmd: Rect; log: Rect; hint: Rect } | null = null;
  private lblLogState: Label | null = null;
  /** 「內政命令」卡標題（v18-cocos-layout 加，對齊 web `#cmdgrid` 上方的標題） */
  private lblCmdTitle: Label | null = null;
  private lblHint: Label | null = null;
  /** 朝堂紀要帶（w7-cocos-render2）：R_CMD 底 740 → R_LOG 頂 880 的 140px 過渡帶 */
  private lblBandTitle: Label | null = null;
  private lblBandText: Label | null = null;
  private lblBandNote: Label | null = null;
  /** 紀要帶第三行（14px）：和 22/18/16 一起湊出同屏四級 */
  private lblBandTip: Label | null = null;
  private lblSheetTitle: Label | null = null;
  private sheetLabels: Label[] = [];

  // ---- 抽屜 ----
  private sheetOpen = false;
  private sheetTitle = '';
  private sheetRows: SheetRow[] = [];
  private sheetRects: Rect[] = [];

  /** 命令按鈕矩形（固定版面，建一次） */
  private cmdRects: Rect[] = [];

  /**
   * 九宮底板層（w5-cocos-skin）：緊跟在 `gMain` 後面建 ⇒ 兄弟序在 gMain 之後、
   * 在標題/資訊/命令/日誌/抽屜所有 Label 之前。底板自然落在「填充之上、文字之下」。
   */
  private skinLayer: Node | null = null;
  private skinNodes = new Map<string, Node>();
  /** 9 個命令按鈕的牌底（plate_btn） */
  private cmdPlates: Node[] = [];
  /** 「最近執行的命令」高亮疊層（plate_sel，見 markCommandPlate） */
  private cmdSel: Node | null = null;

  /* --------------------------------------------------------------------
   * §2.1 生命週期
   * ------------------------------------------------------------------ */

  protected onLoad(): void {
    this.ensureBuilt();
  }

  protected onDestroy(): void {
    this.unregisterTouch();
  }

  /** 節點層是否已建好（onLoad 與 open() 都可能先到，用 flag 去重） */
  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    // 0) 朝堂美术：必须最先建 —— 兄弟序在前 ⇒ 压在所有 Graphics / Label 之下
    this.buildArt();

    // 1) 主 Graphics：必須第一個建立 —— 兄弟序在後 ⇒ 畫在所有 Label 之下
    const gNode = new Node('CityPanelBg');
    gNode.parent = this.node;
    gNode.layer = Layers.Enum.UI_2D;
    gNode.setPosition(0, 0, 0);
    gNode.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.gMain = gNode.addComponent(Graphics);

    // 1b) 九宮底板層（w5-cocos-skin）：緊跟在 gMain 之後建 ⇒ 兄弟序比 gMain 大、
    //     比下面所有 Label 小，底板就「疊在填充上、文字下」，一個 siblingIndex 都不用調
    this.buildSkin();

    // 2) 標題列
    this.lblBack = this.makeLabel('← 返回', R_BACK, 24, COLORS.text, 'center');
    this.lblTitle = this.makeLabel('', R_TITLE, FONT.title, COLORS.goldLight, 'left');
    this.lblMonth = this.makeLabel('', R_MONTH, 22, COLORS.textDim, 'right');
    if (this.lblTitle) addOutline(this.lblTitle, rgba(COLORS.black, 210), 1);

    // 3) 資訊卡：4 欄 × 3 行 = 12 項，每格「標籤在上、數值在下」（對齊 web 的 3×4 表格）
    for (let i = 0; i < 12; i += 1) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const cellX = R_HUD.x + HUD_PAD + col * HUD_COL_W;
      const cellY = R_HUD.y + HUD_PAD + row * HUD_ROW_H;
      this.hudNames.push(
        this.makeLabel('', { x: cellX + 10, y: cellY + 4, w: HUD_COL_W - 20, h: HUD_NAME_H }, HUD_NAME_FONT, COLORS.textDim, 'left'),
      );
      this.hudValues.push(
        this.makeLabel(
          '',
          { x: cellX + 10, y: cellY + 4 + HUD_NAME_H, w: HUD_COL_W - 20, h: HUD_ROW_H - 14 - HUD_NAME_H },
          HUD_VALUE_FONT,
          COLORS.text,
          'left',
        ),
      );
    }

    // 4) 內政命令卡標題（web `#cmdgrid` 上方的「內政命令」）
    this.lblCmdTitle = this.makeLabel('內政命令', { x: 34, y: R_CMD.y + 6, w: 260, h: 34 }, 18, COLORS.gold, 'left');

    // 5) 九個命令按鈕：3 × 3，每個「主標 + 副標」
    this.cmdRects = [];
    for (let i = 0; i < 9; i += 1) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const rect: Rect = {
        x: R_CMD.x + col * (CMD_W + CMD_GAP_X),
        y: R_CMD.y + CMD_TITLE_H + 6 + row * (CMD_H + CMD_GAP_Y),
        w: CMD_W,
        h: CMD_H,
      };
      this.cmdRects.push(rect);
      // 每顆命令按鈕墊一張 plate_btn 牌底（九宮拉伸，按下高亮見 markCommandPlate）
      this.addCommandPlate(rect);
      this.cmdTags.push(
        this.makeLabel('', { x: rect.x, y: rect.y + 8, w: rect.w, h: 52 }, 28, COLORS.goldLight, 'center'),
      );
      this.cmdSubs.push(
        this.makeLabel('', { x: rect.x + 4, y: rect.y + 60, w: rect.w - 8, h: 32 }, 14, COLORS.textDim, 'center'),
      );
    }

    // 6) 日誌區
    this.lblLogTitle = this.makeLabel('紀　錄', R_LOG_TITLE, 18, COLORS.gold, 'left');
    this.lblLogState = this.makeLabel('', R_LOG_STATE, 15, COLORS.textDim, 'right');
    for (let i = 0; i < LOG_ROWS; i += 1) {
      this.logLabels.push(
        this.makeLabel(
          '',
          { x: R_LOG.x + 14, y: R_LOG.y + 48 + i * LOG_ROW_H, w: R_LOG.w - 28, h: LOG_ROW_H - 10 },
          17,
          COLORS.text,
          'left',
        ),
      );
    }

    // 7) 頁尾提示
    this.lblHint = this.makeLabel('', R_HINT, 16, COLORS.textDim, 'center');

    // 7a) 朝堂紀要帶（w7-cocos-render2）：R_CMD 底 740 → R_LOG 頂 880 那 140px 原本是純色留白
    //     （gaps.py 量到整段無墨 142px）。這裡放「標題 22 + 一句摘要 16 + 右側小結 18」，
    //     三級字號同屏，正好也是「文字層級」要的對照。帶子本身畫在 drawMain()。
    this.lblBandTitle = this.makeLabel('朝 堂 紀 要', { x: 34, y: 744, w: 260, h: 34 }, 22, COLORS.gold, 'left');
    this.lblBandNote = this.makeLabel('', { x: 472, y: 744, w: 242, h: 34 }, 18, COLORS.goldLight, 'right');
    this.lblBandText = this.makeLabel('', { x: 34, y: 782, w: 660, h: 30 }, 16, COLORS.text, 'left');
    this.lblBandTip = this.makeLabel('', { x: 34, y: 814, w: 660, h: 30 }, 14, COLORS.textDim, 'left');

    // 7b) 版式驗收用（work\cocos_layout\assert_layout.mjs）：四張卡的設計矩形
    this.layoutRects = { hud: { ...R_HUD }, cmd: { ...R_CMD }, log: { ...R_LOG }, hint: { ...R_HINT } };

    // 8) 抽屜（最後建立 ⇒ 蓋住日誌區與提示）
    const sNode = new Node('CityPanelSheet');
    sNode.parent = this.node;
    sNode.layer = Layers.Enum.UI_2D;
    sNode.setPosition(0, 0, 0);
    sNode.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.gSheet = sNode.addComponent(Graphics);
    this.lblSheetTitle = this.makeLabel('', R_SHEET_TITLE, 20, COLORS.goldLight, 'left');
    for (let i = 0; i < SHEET_ROWS; i += 1) {
      const y = R_SHEET.y + 52 + i * (SHEET_ROW_H + SHEET_ROW_GAP);
      this.sheetLabels.push(
        this.makeLabel('', { x: R_SHEET.x + 22, y, w: R_SHEET.w - 44, h: SHEET_ROW_H }, 17, COLORS.text, 'center'),
      );
    }

    // 9) 文字層級（w5-cocos-skin）：所有 Label 都建好了，統一上 role
    this.applyRoles();
  }

  /* --------------------------------------------------------------------
   * §2.2 九宮底板（w5-cocos-skin）
   * ------------------------------------------------------------------ */

  /**
   * 建九宮底板層與四張卡片的框。
   *
   * 為什麼是獨立一層：底板要「晚於 gMain、早於所有 Label」，獨立一層剛好落在中間；
   * 反過來（把 Sprite 掛到 Label 節點上）就得給每個 Label 記 siblingIndex，會和
   * `promoteLogLabels` 那類既有排序邏輯打架。
   */
  private buildSkin(): void {
    const layer = new Node('CityPanelSkin');
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

    // 「最近執行的命令」高亮疊層：plate_sel 只有四角/四邊有裝飾（中心 alpha 0），
    // 疊在牌底上就是一圈金角，不會蓋住命令字
    const sel = makeNineSlice(layer, 'plate_sel', CMD_W, CMD_H);
    sel.name = 'SkinCmdSelected';
    sel.active = false;
    this.cmdSel = sel;
  }

  /** 給第 i 顆命令按鈕墊一張牌（plate_btn 九宮拉伸到按鈕矩形） */
  private addCommandPlate(rect: Rect): void {
    const layer = this.skinLayer;
    if (!layer) return;
    const plate = makeNineSlice(layer, 'plate_btn', rect.w, rect.h);
    plate.name = `SkinCmdPlate_${this.cmdPlates.length}`;
    placeDesign(plate, rect.x, rect.y, rect.w, rect.h);
    this.cmdPlates.push(plate);
  }

  /**
   * 指令按下/執行的視覺反饋：把 plate_sel 疊到剛點的那顆上。
   *
   * 選「plate_sel 疊層」而不是「Sprite 換色」：plate_btn 的九宮中心是透空的，
   * 換色（`Sprite.color`）只會染到邊框，看不出「按的是哪一顆」；叠一層 plate_sel
   * 才能在深底上給出金角高亮。而且它不改任何輸入語義（CityPanel 只接了 TOUCH_END，
   * 加 TOUCH_START 會引入新的按下幀與重複觸發風險），只是 runCommand 執行後的一次擺位。
   */
  private markCommandPlate(index: number): void {
    const sel = this.cmdSel;
    const rect = this.cmdRects[index];
    if (!sel) return;
    if (!rect) {
      sel.active = false;
      return;
    }
    const transform = sel.getComponent(UITransform);
    if (transform) transform.setContentSize(rect.w, rect.h);
    placeDesign(sel, rect.x, rect.y, rect.w, rect.h);
    sel.active = true;
  }

  /**
   * 文字層級分配（w5-cocos-skin）。
   *
   * 第三個參數是「版式豁免字號」：卡片/格位的矩形高度是釘死的（HUD 名稱行 24、
   * 命令副標行 32…），放不下 role 默認字號的位置只換描邊策略、不動字號。
   * 逐條理由見 project/124 的 role 表。
   */
  private applyRoles(): void {
    // 標題列：頁標題 title（R_TITLE 高 46，40px 會頂滿，釘在既有的 FONT.title=34）；
    // 返回鈕 num；月份 num
    applyTextRole(this.lblTitle, 'title', FONT.title);
    applyTextRole(this.lblBack, 'num', 22);
    applyTextRole(this.lblMonth, 'num', 20);

    // 資訊卡 24 個 Label：名稱 body（HUD_NAME_H=24 的行高上限，14→16）、數值 num（20）
    applyTextRoles(this.hudNames, 'body', 16);
    applyTextRoles(this.hudValues, 'num', 20);

    // 命令卡：區塊名 head 22、九個主標 head 22（原 28）、副標 body 16（原 14）
    applyTextRole(this.lblCmdTitle, 'head', 22);
    applyTextRoles(this.cmdTags, 'head', 22);
    applyTextRoles(this.cmdSubs, 'body', 16);

    // 紀錄卡：區塊名 head 22、狀態 num、5 行正文 body 18
    applyTextRole(this.lblLogTitle, 'head', 22);
    applyTextRole(this.lblLogState, 'badge', 15);
    applyTextRoles(this.logLabels, 'body', 18);

    // 提示條 / 抽屜
    applyTextRole(this.lblHint, 'tip', 16);
    applyTextRole(this.lblSheetTitle, 'head', 20);
    applyTextRoles(this.sheetLabels, 'body', 17);

    // 朝堂紀要帶（w7-cocos-render2）：標題 head 22 / 摘要 body 16 / 右側小結 num 18，
    // 和資訊卡（16/20）、命令卡（22/16）、紀錄（22/18）合起來同屏就有 5 種字號。
    applyTextRole(this.lblBandTitle, 'head', 22);
    applyTextRole(this.lblBandNote, 'num', 18);
    applyTextRole(this.lblBandText, 'body', 16);
    applyTextRole(this.lblBandTip, 'tip', 14);
  }

  /**
   * 朝堂遠景 + 預烘柔焦地面。
   * 參照 web `city.html`：PALAIS 750×562 帶（640→750 = 1.17×、裁 0%）；
   * 地面是原圖「最底 24 列」縱向拉伸 12× 再 blur，這裡已預烘成 floor_0N。
   */
  private buildArt(): void {
    this.artHall = new ArtBg(this.node, 'CityHallArt', { x: 0, y: 0, w: 750, h: 562 }, true);
    this.artHall.node.setSiblingIndex(0);
    this.artFloor = new ArtBg(this.node, 'CityHallFloor', { x: 0, y: 562, w: 750, h: 318 }, true);
    this.artFloor.node.setSiblingIndex(1);
    // 接縫柔化帶：兄弟序 2 ⇒ 在兩張美術之上、CityPanelBg（後建）之下
    const sNode = new Node('CityHallSeam');
    sNode.parent = this.node;
    sNode.layer = Layers.Enum.UI_2D;
    sNode.setPosition(0, 0, 0);
    sNode.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.artSeam = sNode.addComponent(Graphics);
    sNode.setSiblingIndex(2);
  }

  /**
   * 把 y=562 那道硬邊壓成一道影：以地面色做三角 alpha 漸層（上 56px 由 0 升到 236，
   * 下 32px 由 236 落回 0，二次曲線讓兩端更柔）。實測暴露列 mean|ΔL| 8.61–36.11 → 0.85–3.32。
   */
  private paintSeam(palais: number): void {
    const g = this.artSeam;
    if (!g) return;
    g.clear();
    const idx = Math.max(1, Math.min(SEAM_TINT.length, palais)) - 1;
    const color = SEAM_TINT[idx];
    const up = 56;
    const dn = 32;
    const peak = 236;
    for (let i = 0; i < up; i += 1) {
      const t = (i + 1) / (up + 1);
      const alpha = Math.round(peak * t * t);
      this.fillRect(g, { x: 0, y: SEAM_Y - up + i, w: 750, h: 1 }, color, alpha);
    }
    for (let i = 0; i < dn; i += 1) {
      const t = (dn - i) / (dn + 1);
      const alpha = Math.round(peak * t * t);
      this.fillRect(g, { x: 0, y: SEAM_Y + i, w: 750, h: 1 }, color, alpha);
    }
  }

  /**
   * 把 `floor_0N` 的底邊（y=880）也軟掉：預烘地面圖只到 880，再往下是近實色 #0B0E13，
   * 兩者在 880 上原本是一道硬邊（截圖 r89_03_city.png 下半截那條橫線）。
   * v18-cocos-layout 加：52px 三角漸層（828→880，alpha 0→252），與 `paintSeam()` 同一手法。
   */
  private paintFloorFade(): void {
    const g = this.artSeam;
    if (!g) return;
    const from = 828;
    const to = 880;
    const peak = 252;
    for (let y = from; y < to; y += 1) {
      const t = (y - from + 1) / (to - from + 1);
      this.fillRect(g, { x: 0, y, w: 750, h: 1 }, '#0B0E13', Math.round(peak * t * t));
    }
  }

  /** 依城規模挑朝堂圖：RATE 1..5；人口 ≥30 萬 → 6（原作只有 palais_01..05，6 回 1） */
  private applyHall(): void {
    const n = M.hallIndexOf(this.def());
    const palais = n === 6 ? 1 : Math.max(1, Math.min(5, n));
    if (palais === this.hallShown) return;
    this.hallShown = palais;
    const tag = palais < 10 ? `0${palais}` : `${palais}`;
    this.paintSeam(palais);
    this.paintFloorFade();
    this.artHall?.load(`bg/policy/palais_${tag}`, () => this.drawMain());
    this.artFloor?.load(`bg/policy/floor_${tag}`, () => this.drawMain());
  }

  /** 建一個 Label 節點（設計座標矩形 → 節點中心） */
  private makeLabel(text: string, rect: Rect, fontSize: number, color: string, align: 'left' | 'center' | 'right'): Label {
    const node = new Node(`CityPanelLbl`);
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(Math.max(1, rect.w), Math.max(1, rect.h));
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.35);
    label.color = rgba(color);
    label.horizontalAlign =
      align === 'left'
        ? Label.HorizontalAlign.LEFT
        : align === 'right'
          ? Label.HorizontalAlign.RIGHT
          : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    const p = toLocal(rect.x + rect.w / 2, rect.y + rect.h / 2);
    node.setPosition(p.x, p.y, 0);
    return label;
  }

  /* --------------------------------------------------------------------
   * §2.2 開 / 關
   * ------------------------------------------------------------------ */

  isOpen(): boolean {
    return this.opened;
  }

  /** 由 `CampaignRoot` 呼叫：載入存檔 → 補算換月 → 重繪 */
  open(options: CityPanelOptions): void {
    this.ensureBuilt();
    this.opts = options;
    this.cityName = options.cityName;
    this.opened = true;
    this.node.active = true;
    this.applyHall();
    this.registerTouch();

    const parsedBag = M.parseItemsSave(this.readBagRaw()).bag;
    // 空背包的存档会解析出 null / undefined（R224 P0-1 崩溃点之一），统一收敛成空数组
    this.bag = Array.isArray(parsedBag) ? parsedBag : [];
    this.ctx = {
      generals: (options.data.generals ?? []) as unknown as M.CityGeneral[],
      items: (options.data.items ?? []) as unknown as M.CityItem[],
      wises: (options.data.wises ?? []) as unknown as M.CityWise[],
      scenario: options.scenario,
      // [P0-2] 劇本號一路傳進來：roster / wildPool / 關卡守軍都按它取
      scenIdx: M.intOr(options.scenIdx, 0, 0),
      garrison: options.garrison ?? null,
      bag: this.bag,
    };
    this.save = this.mergeSave();
    this.closeSheet();
    // 進頁先補「換月」：預備兵（金→預備兵，原作線）+ 自治代行（web city.html 的 autonomyTick）
    const tick = M.autonomyTick(this.save, this.cities(), this.ctx);
    if (tick.refilled.length > 0 || tick.auto) {
      M.ensureExtras(this.save);
    }
    this.persist();
    this.refresh();
    // [F-03] 月流水收進 core：把「內政存檔合併器」註冊給 GameState，
    // 讓 CampaignRoot 的每月推進（endInterior）也能跑自治代行 + 金→預備兵，
    // 而不是只有玩家進內政頁時補跑一次。CityPanel 其餘邏輯不動。
    GameState.setCityMonthBridge({
      data: options.data,
      civic: (): any => {
        // GameState 已換月/徵稅；內政真源在 extras ⇒ 每次先重併，再跑 autonomyTick
        // （內部以 autoMonth 做幂等 guard，重跑不會重複發錢），跑完立刻 persist 回寫兩份存檔。
        this.save = this.mergeSave();
        const tick = M.autonomyTick(this.save, this.cities(), this.ctx);
        this.persist();
        // CityModel.AutonomyResult → core MonthCivicOutcome（字段名不同：gained→n）
        return {
          month: tick.month,
          refilled: Array.isArray(tick.refilled)
            ? tick.refilled.map((r: { city: string; gained: number }) => ({ city: r.city, n: r.gained, cost: 0 }))
            : 0,
        };
      },
    });
    // [F12/F15] 大地圖按鈕進來時直接開對應抽屜（只開一次；runCommand 自己會做正月/收束閘門）
    const openCmd = options.openCmd;
    if (openCmd) {
      options.openCmd = '';
      const idx = cmdList().indexOf(openCmd);
      if (idx >= 0) this.runCommand(idx);
    }
  }

  /** 隱藏（不動存檔；`onClose` 由呼叫者決定要不要回寫） */
  hide(): void {
    this.opened = false;
    this.unregisterTouch();
    this.closeSheet();
    // 內政頁收起來時，掛在它下面的物品頁也要跟著關：否則節點雖然 active=false，
    // input 監聽還掛著，會把大地圖的點擊吃掉（ItemsPanel 的 onTouch 只看 opened）
    if (this.itemsPanel?.isOpen) this.itemsPanel.close();
    this.node.active = false;
  }

  /** 主動關閉：回大地圖 */
  close(): void {
    const cb = this.opts?.onClose;
    this.hide();
    if (cb) cb();
  }

  private registerTouch(): void {
    if (this.registered) return;
    input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'CityPanel'), this);
    this.registered = true;
  }

  private unregisterTouch(): void {
    if (!this.registered) return;
    input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'CityPanel'), this);
    this.registered = false;
  }

  /* --------------------------------------------------------------------
   * §2.3 存檔合併（GameState ⇄ CitySave）
   * ------------------------------------------------------------------ */

  private readBagRaw(): unknown {
    try {
      const raw = sys.localStorage.getItem(M.BAG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** 讀內政附加欄位（`sanguo_city_v1`） */
  private readExtras(): Record<string, unknown> {
    try {
      const raw = sys.localStorage.getItem(CITY_EXTRAS_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private cities(): M.CityDef[] {
    const cities = this.opts?.scenario?.cities;
    return Array.isArray(cities) ? (cities as unknown as M.CityDef[]) : [];
  }

  private def(): M.CityDef | null {
    return M.cityDefOf(this.cityName, this.opts?.scenario ?? null);
  }

  private st(): M.CityState | null {
    if (!this.save) return null;
    return M.ensureCityState(this.save, this.def());
  }

  /**
   * 拼出 `CitySave`：
   * - `gold/month/owned/cities(troops,pop,money)` 以 `GameState` 為真源；
   * - `cities(def,cav,inf,prep,prepMonth)` 與 roster/appointed/searchLog/… 來自 `sanguo_city_v1`。
   *
   * [OFFICER_OBJ] `GameState.cities[*].officers` 現在是 `CityOfficer[]`（`{name,str,int,loyal,status}`，
   * 由 `AiRunner.applyWorld()` 每月回寫、`GameState.normalize()` 保鮮），但**本面板不碰它**：
   * 這裡的「武將」清單一律走 `M.rosterOf()`（`sanguo_city_v1`.roster，與 web 版 `city_model.js`
   * 的 `save.roster` 同源，玩家任免/派遣只改那份）。兩套資料各管各的，所以下面只搬
   * troops/pop/money 三個數字，**不要**整物件覆蓋 `rt`、也不要拿 extras 的 roster 去寫 officers。
   */
  private mergeSave(): M.CitySave {
    const gs = GameState.loadSave();
    const extras = this.readExtras();
    const cities: Record<string, M.CityState> = {};
    if (isRecord(extras.cities)) {
      for (const name of Object.keys(extras.cities)) {
        const row = extras.cities[name];
        if (isRecord(row)) cities[name] = row as M.CityState;
      }
    }
    // GameState 的三個欄位覆蓋 extras 的同名欄（它們是跨屏共用的真源）
    if (isRecord(gs.cities)) {
      for (const name of Object.keys(gs.cities)) {
        const rt = gs.cities[name];
        if (!isRecord(rt)) continue;
        const cur = cities[name] ?? ({} as M.CityState);
        if (Number.isFinite(Number(rt.troops))) cur.troops = M.num(rt.troops);
        if (Number.isFinite(Number(rt.pop))) cur.pop = M.num(rt.pop);
        if (Number.isFinite(Number(rt.money))) cur.money = M.num(rt.money);
        cities[name] = cur;
      }
    }

    const save: M.CitySave = {
      // [F16] `gs` 已經在 `loadSave()` 裡遷移過：錢包併進主城 money、`gold` 恆為 0。
      gold: gs.goldMigrated === true ? 0 : M.num(gs.gold),
      goldMigrated: gs.goldMigrated === true,
      month: M.intOr(gs.month, 1, 1),
      owned: Array.isArray(gs.owned) ? gs.owned.slice() : [],
      cities,
      roster: isRecord(extras.roster) ? (extras.roster as M.Roster) : {},
      appointed: isRecord(extras.appointed) ? (extras.appointed as M.Appointed) : {},
      searchLog: Array.isArray(extras.searchLog) ? (extras.searchLog as M.LogEntry[]) : [],
      // [P1-2] 搜索次數必須跨屏保存：否則重進內政頁只剩 60 條日誌可數，第 61 次起種子凍結。
      searchSeq: isRecord(extras.searchSeq) ? (extras.searchSeq as Record<string, number>) : {},
      searchNonce: M.intOr(extras.searchNonce, 0, 0),
      foundItems: Array.isArray(extras.foundItems) ? (extras.foundItems as number[]) : [],
      // [F2/F3] 逐將年令 + 隨軍名單（old save 相容：ensureExtras 會補成空物件）
      acted: isRecord(extras.acted) ? (extras.acted as Record<string, number>) : {},
      away: isRecord(extras.away) ? (extras.away as Record<string, string>) : {},
      // [F3] 部隊真源在 GameState：syncAway 用它把行軍中的將從城內名單剔掉
      armies: Array.isArray(gs.armies) ? gs.armies : [],
      auto: isRecord(extras.auto) ? (extras.auto as Record<string, number>) : {},
      autoMonth: M.intOr(extras.autoMonth, 0, 0),
      lastActionMonth: M.intOr(extras.lastActionMonth, 0, 0),
      bag: Array.isArray(this.bag) ? this.bag.slice() : [],
    };
    M.ensureExtras(save);
    // [F3] 依當前行軍部隊重算 away（出征 / 回城 / 退兵都反映在同一個 save.armies 上）
    M.syncAway(save);
    return save;
  }

  /** 回寫：GameState（troops/pop/money/gold/month）＋ 內政附加欄位 */
  private persist(): void {
    const save = this.save;
    if (!save) return;

    const gs = GameState.loadSave();
    // [F16] 錢已經在每城 `money` 裡（`rt.money` 下面逐城回寫），單一錢包歸零並打遷移標記。
    gs.gold = 0;
    gs.goldMigrated = true;
    gs.month = M.intOr(save.month, gs.month, 1);
    if (Array.isArray(save.owned)) gs.owned = save.owned.slice();

    const cities = save.cities ?? {};
    if (isRecord(gs.cities)) {
      // [OFFICER_OBJ] 只回寫這三個數字：`rt.officers` 是 AI 每月寫進來的人事真相
      // （`CityRuntime.officers: CityOfficer[]`），extras 裡沒有這份資料，寫回去只會把它抹掉。
      for (const name of Object.keys(gs.cities)) {
        const st = cities[name];
        const rt = gs.cities[name];
        if (!st || !rt) continue;
        rt.troops = Math.max(0, Math.trunc(M.num(st.troops)));
        rt.pop = Math.max(0, Math.trunc(M.num(st.pop)));
        rt.money = Math.max(0, Math.trunc(M.num(st.money)));
      }
    }
    GameState.persistSave();

    const extras = {
      cities: save.cities,
      roster: save.roster,
      appointed: save.appointed,
      searchLog: save.searchLog,
      // [P1-2] 搜索計數器與 nonce 跟著戰役檔走（重進頁面／跑完一年都不斷）
      searchSeq: save.searchSeq,
      searchNonce: save.searchNonce,
      foundItems: save.foundItems,
      // [F2/F3] 逐將年令與隨軍名單（跨月保存；換年由 clearActed 清）
      acted: save.acted,
      away: save.away,
      auto: save.auto,
      autoMonth: save.autoMonth,
      lastActionMonth: save.lastActionMonth,
      bag: this.bag,
    };
    try {
      sys.localStorage.setItem(CITY_EXTRAS_KEY, JSON.stringify(extras));
    } catch (err) {
      console.warn('[CityPanel] 內政存檔寫入失敗', err);
    }
  }

  /* --------------------------------------------------------------------
   * §2.4 繪製
   * ------------------------------------------------------------------ */

  private fillRect(g: Graphics, r: Rect, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(r.x - HALF_W, HALF_H - r.y - r.h, r.w, r.h);
    g.fill();
  }

  private strokeRect(g: Graphics, r: Rect, color: string, width = 2, alpha = 255): void {
    g.strokeColor = rgba(color, alpha);
    g.lineWidth = width;
    g.rect(r.x - HALF_W, HALF_H - r.y - r.h, r.w, r.h);
    g.stroke();
  }

  private hline(g: Graphics, x: number, y: number, w: number, color: string, alpha = 255, width = 1): void {
    g.strokeColor = rgba(color, alpha);
    g.lineWidth = width;
    g.moveTo(x - HALF_W, HALF_H - y);
    g.lineTo(x + w - HALF_W, HALF_H - y);
    g.stroke();
  }

  /** 垂直分隔線（v18-cocos-layout：資訊卡的 4 欄格線） */
  private vline(g: Graphics, x: number, y: number, h: number, color: string, alpha = 255, width = 1): void {
    g.strokeColor = rgba(color, alpha);
    g.lineWidth = width;
    g.moveTo(x - HALF_W, HALF_H - y);
    g.lineTo(x - HALF_W, HALF_H - y - h);
    g.stroke();
  }

  /** 把一段設計座標色帶交給本頁的 `fillRect`（座標轉換只發生在 fillRect 裡） */
  private paintBands(g: Graphics, bands: Band[]): void {
    for (let i = 0; i < bands.length; i += 1) {
      const band = bands[i];
      this.fillRect(g, band, band.color, band.alpha);
    }
  }

  private drawMain(): void {
    const g = this.gMain;
    if (!g) return;
    g.clear();

    const artReady = this.artHall !== null && this.artHall.state === 'ready';
    if (this.artSeam) this.artSeam.node.active = artReady; // 圖沒到時別留一條褐色帶
    const vAlpha = artReady ? 226 : 255; // 卡片半透明：能看見朝堂圖，但字壓得住（舊值 168 太透）

    // 全屏底（w5-render）：三段縱向色帶取代三塊純色。色值不是憑感覺挑的：照 web 版
    // `web_city.png` 取樣校準（頁頭 lum≈34、資訊卡 lum≈30、命令牌 lum≈44、結果面板 lum≈28），
    // 第一版用了 #0D121A 這一檔冷黑，整頁實測 mean 掉到 31.5，於是整體提亮一檔。
    const veil = artReady ? 34 : 250;
    this.paintBands(g, vBands(0, 0, DESIGN_W, 562, '#1A1712', '#12100C', 12, veil, veil));
    this.paintBands(
      g,
      vBands(0, 562, DESIGN_W, 318, '#12100C', '#1A140C', 12, artReady ? 46 : 250, artReady ? 46 : 250),
    );
    this.paintBands(
      g,
      vBands(0, 880, DESIGN_W, DESIGN_H - 880, '#1A1712', '#231A12', 20, artReady ? 250 : 253, artReady ? 250 : 253),
    );

    // 標題帶：暖棕漸層 + 下緣雙金線（web：頁頭壓暗、下緣一條金線）
    this.paintBands(g, vBands(0, 0, DESIGN_W, R_HEADER.h, '#30240F', '#16110B', 12, artReady ? 244 : 255, artReady ? 244 : 255));
    this.hline(g, 0, R_HEADER.h, DESIGN_W, COLORS.gold, 120, 2);
    this.hline(g, 0, R_HEADER.h + 2, DESIGN_W, COLORS.gold, 40, 1);
    // 返回鈕：暖金漸層底 + 頂部高光（web 的 .btn 是上亮下暗的金屬片）
    this.paintBands(
      g,
      vBands(R_BACK.x, R_BACK.y, R_BACK.w, R_BACK.h, '#3A2C1B', '#1B1209', 8, artReady ? 244 : 255, artReady ? 244 : 255),
    );
    this.paintBands(g, topSheen(R_BACK.x + 2, R_BACK.y + 2, R_BACK.w - 4, '#F2DCA8', 44));
    this.paintBands(g, edgeBands(R_BACK, '#000000', 90, 6, 2));
    this.paintBands(g, topSheen(R_BACK.x + 2, R_BACK.y + R_BACK.h - 2, R_BACK.w - 4, '#000000', 90));
    this.strokeRect(g, R_BACK, COLORS.gold, 2, 130);
    // 標題帶頂端高光條（w7-cocos-render2）：和大地圖頁頭同一種「絨布」語言
    this.paintBands(g, vBands(0, 0, DESIGN_W, 6, '#5E4C2C', '#30240F', 4, 132, 58));
    this.paintBands(g, edgeBands({ x: 0, y: 0, w: DESIGN_W, h: R_HEADER.h }, '#000000', 140, 18, 3));

    // 資訊卡：半透明深色漸層 + 金框 + 內部金色格線（對齊 web「半透明深色資訊卡 + 金色分隔線」）
    this.paintBands(g, vBands(R_HUD.x, R_HUD.y, R_HUD.w, R_HUD.h, '#26221C', '#181411', 16, vAlpha, vAlpha));
    this.strokeRect(g, R_HUD, COLORS.gold, 1, 160);
    this.paintBands(g, topSheen(R_HUD.x + 2, R_HUD.y + 2, R_HUD.w - 4, '#F2DCA8', 34));
    this.paintBands(g, topSheen(R_HUD.x + 2, R_HUD.y + R_HUD.h - 2, R_HUD.w - 4, '#000000', 80));
    for (let i = 1; i < 4; i += 1) {
      const x = R_HUD.x + HUD_PAD + i * HUD_COL_W;
      this.vline(g, x, R_HUD.y + 6, R_HUD.h - 12, COLORS.gold, 60);
      this.vline(g, x + 1, R_HUD.y + 6, R_HUD.h - 12, COLORS.gold, 26);
    }
    for (let i = 1; i < 3; i += 1) {
      this.hline(g, R_HUD.x + HUD_PAD, R_HUD.y + HUD_PAD + i * HUD_ROW_H, R_HUD.w - HUD_PAD * 2, COLORS.gold, 54);
    }
    this.paintBands(g, edgeBands(R_HUD, '#000000', 110, 26, 4));

    // 內政命令卡：底色漸層 + 標題列金線 + 內框
    // w9-render3：底色換成暖褐（原本 '#24252A'→'#121417' 是冷灰），並疊一層橫向暖光，
    // 讓整張卡在「上亮下暗」之外還有「左亮右暗」（web `.sec` 的 180deg + `::before` 兩層）。
    this.paintBands(g, vBands(R_CMD.x, R_CMD.y, R_CMD.w, R_CMD.h, WARM.panelHi, WARM.consoleLow, 16, vAlpha, vAlpha));
    this.paintBands(g, wash(R_CMD, '#D8B36A', 20, 0, 10, true));
    this.strokeRect(g, R_CMD, COLORS.line, 1, 210);
    this.hline(g, R_CMD.x + 12, R_CMD.y + CMD_TITLE_H, R_CMD.w - 24, COLORS.gold, 115);
    this.paintBands(g, innerEdge(R_CMD, COLORS.gold, 34, 3));

    // 九顆命令牌：既有外框 + 內層暖棕漸層 + 頂部高光 + 底部壓暗
    // —— web 的 `.cmd` 是「雙層框 + 內暗棕底 + 上亮下暗」，Cocos 原本只有單層框 + 純色底
    const cmds = cmdList();
    const save = this.save;
    const windowClosed = this.locked;
    // [P0-4] 逐將年令：開發/搜索要指定執行將，城內沒有「今年還沒行動」的將時這兩格變灰。
    const freeExecs = save
      ? M.rosterOf(save, this.cityName, this.ctx).filter((g) => !M.actedLocked(save, g.NAME)).length
      : 0;
    for (let i = 0; i < this.cmdRects.length; i += 1) {
      const rect = this.cmdRects[i];
      const cmd = cmds[i];
      const primary = cmd === '自治';
      const needsExec = cmd === '開發' || cmd === '搜索';
      const noExec = needsExec && freeExecs <= 0;
      const enabled = !windowClosed && !noExec;
      const inner = { x: rect.x + 4, y: rect.y + 4, w: rect.w - 8, h: rect.h - 8 };
      const top = enabled ? (primary ? '#4A3520' : '#402D1C') : '#1A1F26';
      const bottom = enabled ? (primary ? '#241809' : '#1A1209') : '#0F1319';
      this.paintBands(g, vBands(inner.x, inner.y, inner.w, inner.h, top, bottom, 10, enabled ? 236 : 226, enabled ? 236 : 226));
      // 交叉疊光 + 雙線描邊（w9-render3）：web `.cmd` 的底是「上亮下暗漸層」再疊
      // `.cmd::before{border-image:…金框;opacity:.40}` 的內框（`city.html:219`）。
      // 這裡先壓一層橫向暖光把色數乘開，再用 doubleEdge 補「外暗內亮」兩條 1px 線。
      if (enabled) this.paintBands(g, wash(inner, '#D8B36A', 26, 2, 6, true));
      if (enabled) {
        this.paintBands(g, topSheen(inner.x + 2, inner.y + 1, inner.w - 4, '#F4DCAE', primary ? 74 : 52));
        this.paintBands(g, topSheen(inner.x + 2, inner.y + inner.h - 2, inner.w - 4, '#000000', 90));
      }
      this.strokeRect(g, inner, enabled ? COLORS.goldDim : COLORS.line, 1, enabled ? 120 : 90);
      this.strokeRect(g, rect, enabled ? (primary ? COLORS.gold : COLORS.line) : COLORS.line, 2, enabled ? 200 : 110);
    }

    // 紀錄卡：上冷下暖漸層（web 結果卡是 rgba(16,20,26,.72)，透出朝堂美術）
    // w9-render3：這塊是整頁最大的近純黑平面（750×360），冷灰底色在這裡最扎眼；
    // 換成暖褐 + 橫向暖光之後，它才跟上面九顆暖棕命令牌同一族。
    // w9-render3 第二版：20 段縱向色帶在 dpr=2 截圖裡只剩幾種像素色（一段 714×17 被平均掉），
    // 改成 18×9 的二維色域打底 —— R 沿 x、G 沿 y 各走一格，15×9 個格子互不相同，
    // 對應 web `.logsec{linear-gradient(4 段)}` + `box-shadow:inset` 的雙層疊法（`city.html:229`）。
    this.paintBands(
      g,
      lightGrid(R_LOG, 18, 10, WARM.panelHi, 16, -12, artReady ? 224 : 248),
    );
    this.paintBands(g, wash(R_LOG, '#D8B36A', 18, 0, 10, true));
    // 雙線描邊：外 1px 暗、內縮 2px 一條淡金（web `.sec` 的 1px 亮邊 + 1px 暗邊）
    this.paintBands(g, doubleEdge(R_LOG, '#000000', 150, COLORS.gold, 54, 1, 2));
    this.strokeRect(g, R_LOG, COLORS.line, 1, 210);
    this.paintBands(g, innerEdge(R_LOG, COLORS.gold, 40, 1));
    this.paintBands(g, topSheen(R_LOG.x + 2, R_LOG.y + 2, R_LOG.w - 4, '#F2DCA8', 30));
    this.paintBands(g, topSheen(R_LOG.x + 2, R_LOG.y + R_LOG.h - 2, R_LOG.w - 4, '#000000', 80));
    this.hline(g, R_LOG.x + 12, R_LOG.y + 44, R_LOG.w - 24, COLORS.gold, 140);
    for (let i = 1; i < LOG_ROWS; i += 1) {
      this.hline(g, R_LOG.x + 12, R_LOG.y + 48 + i * LOG_ROW_H, R_LOG.w - 24, COLORS.line, 120);
    }

    // 頁尾提示條
    this.paintBands(
      g,
      vBands(R_HINT.x, R_HINT.y, R_HINT.w, R_HINT.h, WARM.console, WARM.consoleLow, 8, artReady ? 242 : 255, artReady ? 242 : 255),
    );
    this.strokeRect(g, R_HINT, COLORS.line, 1, 190);
    this.paintBands(g, topSheen(R_HINT.x + 1, R_HINT.y + 1, R_HINT.w - 2, COLORS.gold, 30));

    // 命令卡與紀錄卡之間的 140px 過渡帶（w7-cocos-render2）：
    // 舊版只有一層 186→210 的暗漸層，整條亮度 < 110，gaps.py 判「無墨」（142px）。
    // 現在照 web 的「同一張半透明面板」做成一塊真的朝堂紀要牌：兩段縱向漸層（上暖下更暖）
    // + 四邊內陰影 + 上下金線 + 左側豎金線，正好托住 lblBandTitle/Text/Tip 三行字。
    const bandY = R_CMD.y + R_CMD.h;
    const bandH = R_LOG.y - bandY;
    const band = { x: 18, y: bandY, w: DESIGN_W - 36, h: bandH };
    this.paintBands(g, vBands(band.x, band.y, band.w, bandH / 2, '#302A20', '#1A1712', 10, 226, 214));
    this.paintBands(g, vBands(band.x, band.y + bandH / 2, band.w, bandH - bandH / 2, '#1A1712', '#2C241A', 10, 214, 232));
    this.paintBands(g, edgeBands(band, '#000000', 120, 16, 3));
    this.paintBands(g, topSheen(band.x + 1, band.y + 1, band.w - 2, '#F2DCA8', 46));
    this.paintBands(g, topSheen(band.x + 1, band.y + bandH - 2, band.w - 2, '#000000', 90));
    this.strokeRect(g, band, COLORS.gold, 1, 96);
    this.hline(g, band.x + 10, band.y + 2, band.w - 20, COLORS.gold, 130);
    this.hline(g, band.x + 10, band.y + bandH - 4, band.w - 20, COLORS.gold, 90);
    this.fillRect(g, { x: band.x + 8, y: band.y + 6, w: 2, h: bandH - 16 }, COLORS.gold, 70);
  }

  private drawSheet(): void {
    const g = this.gSheet;
    if (!g) return;
    g.clear();
    if (!this.sheetOpen) return;
    this.fillRect(g, R_SHEET, COLORS.bgDeep, 250);
    this.strokeRect(g, R_SHEET, COLORS.gold, 2, 170);
    this.hline(g, R_SHEET.x + 16, R_SHEET.y + 46, R_SHEET.w - 32, COLORS.gold, 90);
    this.sheetRects = [];
    for (let i = 0; i < SHEET_ROWS; i += 1) {
      const rect: Rect = {
        x: R_SHEET.x + 16,
        y: R_SHEET.y + 52 + i * (SHEET_ROW_H + SHEET_ROW_GAP),
        w: R_SHEET.w - 32,
        h: SHEET_ROW_H,
      };
      this.sheetRects.push(rect);
      if (i >= this.sheetRows.length) continue;
      const cancel = i === this.sheetRows.length - 1;
      this.fillRect(g, rect, cancel ? COLORS.panel : COLORS.panelHi, 255);
      this.strokeRect(g, rect, cancel ? COLORS.line : COLORS.gold, 1, cancel ? 170 : 90);
    }
  }

  /* --------------------------------------------------------------------
   * §2.5 內容刷新
   * ------------------------------------------------------------------ */

  private setLabel(label: Label | null, text: string): void {
    if (label) label.string = text;
  }

  private tireOf(name: string): number {
    return this.statValue('tire', name, 0);
  }

  private moraleOf(name: string): number {
    return this.statValue('morale', name, 60);
  }

  /** 只影響顯示的「疲勞 / 士氣」（web 從 save.tire / save.morale 讀，缺省 0 / 60） */
  private statValue(key: string, name: string, fallback: number): number {
    const save = this.save;
    const map = save ? save[key] : null;
    if (!isRecord(map) || !name) return fallback;
    const raw = map[name];
    if (raw === undefined || raw === null || raw === '') return fallback;
    return clamp(Math.round(M.num(raw)), 0, 100);
  }

  private cmdSub(cmd: string, st: M.CityState, save: M.CitySave): string {
    switch (cmd) {
      case '開發':
        return `金 ${M.DEV.COST} · 民防共增`;
      case '徵兵':
        return `預備 ${fmt(st.prep)} · 步／騎`;
      case '搜索':
        return `金 ${M.SEARCH.COST} · 人才/寶物`;
      case '移動':
        return '調兵 · 調將';
      case '任命':
        return '太守 · 軍師';
      case '武將資料':
        return '數值 · 裝備';
      case '情報':
        return '本城 · 鄰城';
      case '出征':
        return '打相鄰敵城';
      case '自治': {
        const n = M.autoCities(save, this.cities()).length;
        return n > 0 ? `已設 ${n} 城 · 施行` : '設定代行開發';
      }
      default:
        return '';
    }
  }

  /**
   * 紀錄區空位的「提示」行（w5-render）。
   *
   * 為什麼要填：web 內政頁的結果卡有半透明底 + 朝堂美術透出，空著也不顯空；Cocos 的
   * 紀錄卡下面是近實色，5 行只寫 1 行就變成 347px 純黑（驗收報告 122 量的暗帶）。
   *
   * 內容全部是**本頁已經在顯示的數字**（城防/預備兵/兵/士氣/太守/武將）與 CMD_META
   * 既有的成本常數（開發 400、搜索 200），沒有任何新增玩法或新資料欄位。
   */
  private tipsOf(
    st: M.CityState,
    prepCap: number,
    eff: number,
    genCount: number,
    major: string,
    capTotal: number,
    actedNow: number,
    awayCount: number,
    year: number,
  ): string[] {
    const prepFull = st.prep >= prepCap ? '（已滿）' : '';
    return [
      // [F2] 原作 0x423Cxx：每將每年只能搜索或開發一次（`save.acted[將]=年序`），情報/移動不占。
      `◇ 第 ${year} 年 · 已行動 ${actedNow}／${genCount} 將（在途 ${awayCount}）`,
      `◇ 城防 ${fmt(st.def)} · 預備兵 ${fmt(st.prep)}／${fmt(prepCap)}${prepFull}`,
      `◇ 開發 −金${fmt(M.DEV.COST)} · 搜索 −金${fmt(M.SEARCH.COST)} · 徵兵 金${fmt(M.PREP_PER_GOLD)}→1 預備`,
      `◇ 兵 ${fmt(st.troops)}／${fmt(capTotal)} · 士氣 ${this.moraleOf(major)}／100`,
      `◇ 內政效率 ×${eff.toFixed(2)} · 武將 ${genCount} 員 · 太守 ${major || '—'}`,
    ];
  }

  private refresh(): void {
    const save = this.save;
    const def = this.def();
    if (!save || !this.built) return;
    const st = M.ensureCityState(save, def);
    if (!st) return;

    // [P0-4/正月門] 非正月只讀（web `readOnly()` 同口徑）；出征/自治用掉窗口後同樣鎖住。
    this.locked = M.readOnly(save, false);
    const caps = M.armCaps(save, def, this.ctx);
    const roster = M.rosterOf(save, this.cityName, this.ctx);
    const major = M.majorOf(save, def) || '—';
    const wise = M.wiseOf(save, def) || '—';
    const eff = M.efficiencyOf(save, def, this.ctx);
    const prepCap = M.prepCapOf(st.pop);
    // [F2] 逐將年令：`save.acted[將]=年序`，一年一次/將；[F3] 在途（隨軍）的將不算城內人力。
    const actedNow = M.actedNames(save).length;
    const year = M.yearIndexOf(save);
    const awayCount = M.awayNameSet(save).size;
    const freeExecs = roster.filter((g) => !M.actedLocked(save, g.NAME)).length;
    // [F19] 武將數／上限（10）—— 超編只標紅、不裁切（web `officerCapState`）。
    const officer = M.officerCapState(roster.length);

    this.setLabel(this.lblBack, '← 返回');
    this.setLabel(this.lblTitle, this.cityName || '（無城）');
    this.setLabel(this.lblMonth, M.monthLabel(save.month));

    const fields: Array<[string, string, string]> = [
      ['人口', fmt(st.pop), COLORS.text],
      // [F16] 金 = 國庫（Σ 每城 money），不是 `save.gold`（遷移後恆為 0）。
      ['金', fmt(GameState.nationalGold()), COLORS.goldLight],
      ['兵', `${fmt(st.troops)}／${fmt(caps.total)}`, COLORS.text],
      ['預備兵', `${fmt(st.prep)}／${fmt(prepCap)}`, st.prep >= prepCap ? COLORS.gold : COLORS.text],
      ['防務', fmt(st.def), COLORS.text],
      ['太守', major, COLORS.oursLight],
      ['軍師', wise, COLORS.oursLight],
      ['內政效率', `×${eff.toFixed(2)}`, COLORS.ok],
      // [F19] 顯示 `13/10`（當前/上限），超編標紅；不裁切武將名單。
      ['武將', `${officer.n} / ${officer.cap}`, officer.over ? COLORS.danger : COLORS.text],
      ['疲勞', `${this.tireOf(major)}/100`, this.tireOf(major) >= 60 ? COLORS.danger : COLORS.text],
      ['士氣', `${this.moraleOf(major)}/100`, this.moraleOf(major) < 30 ? COLORS.textFaint : COLORS.text],
      // [P0-4] 年令 = 今年已行動的將數／城內將數（原作逐將年令；不再是「月令 n/7」）。
      ['年令', `${actedNow} / ${roster.length}`, actedNow >= roster.length ? COLORS.textFaint : COLORS.ok],
    ];
    for (let i = 0; i < fields.length && i < this.hudNames.length; i += 1) {
      const [name, value, color] = fields[i];
      this.setLabel(this.hudNames[i], name);
      this.setLabel(this.hudValues[i], value);
      const valueNode = this.hudValues[i];
      if (valueNode) valueNode.color = rgba(color);
    }

    const cmds = cmdList();
    for (let i = 0; i < cmds.length && i < this.cmdTags.length; i += 1) {
      const cmd = cmds[i];
      const meta = M.CMD_META[cmd];
      this.setLabel(this.cmdTags[i], meta?.tag ?? cmd);
      this.setLabel(this.cmdSubs[i], this.cmdSub(cmd, st, save));
      // [P0-4] 只在「需要用將」的命令上按年令變灰（開發/搜索要選執行將）；情報/移動不占年令。
      const needsExec = cmd === '開發' || cmd === '搜索';
      const dull = this.locked || (needsExec && freeExecs === 0);
      const tag = this.cmdTags[i];
      if (tag) tag.color = rgba(dull ? COLORS.textFaint : COLORS.goldLight);
      const sub = this.cmdSubs[i];
      if (sub) sub.color = rgba(dull ? COLORS.textFaint : COLORS.textDim);
    }

    // 日誌（新的一條在最上面）。空位不再留白（w5-render）：用**本頁已在顯示的數據**
    // 算出的「提示」行填滿 —— web 基準是最長連續空白 130px，Cocos 原本 347px。
    // 這些行不是新玩法：全部取自資訊卡既有欄位與 CMD_META 既有常數（開發/搜索成本）。
    const logs = M.recentLog(save, LOG_ROWS);
    const tips = this.tipsOf(st, prepCap, eff, roster.length, major, caps.total, actedNow, awayCount, year);
    for (let i = 0; i < LOG_ROWS; i += 1) {
      const row = logs[i];
      const tipIndex = i - logs.length - (logs.length === 0 ? 1 : 0);
      let text = '';
      if (row) text = `${row.t}  ${row.cmd}  ${row.text}`;
      else if (i === 0) text = '尚無紀錄。點上面任一命令。';
      else if (tipIndex >= 0 && tipIndex < tips.length) text = tips[tipIndex];
      this.setLabel(this.logLabels[i], text);
      const label = this.logLabels[i];
      if (label) label.color = rgba(row ? COLORS.text : i === 0 ? COLORS.textFaint : COLORS.textDim);
    }
    this.setLabel(this.lblLogTitle, '紀　錄');
    // v18-cocos-layout：原本這裡寫「本月令 可下」，與資訊卡第 12 格「月令 可下」重複；
    // 改成 web 結果卡的右上標註「最近 6 條」。
    this.setLabel(this.lblLogState, `最近 ${LOG_ROWS} 條`);
    // [P0-4/正月門] 非正月只讀（web `readOnlyHint()` 同文案）；正月內政按逐將年令。
    const affairsMonth = M.isAffairsMonth(save);
    this.setLabel(
      this.lblHint,
      !affairsMonth
        ? M.OFF_MONTH_HINT
        : this.locked
          ? `${M.LOCK_HINT} · 回大地圖「內政終了」跑完一年`
          : `正月內政 · 每將今年一次（已行動 ${actedNow} 人，情報/移動 不占）`,
    );

    // 朝堂紀要帶（w7-cocos-render2）：全部取自資訊卡已有的欄位，不引入新數據源
    this.setLabel(this.lblBandTitle, '朝 堂 紀 要');
    this.setLabel(
      this.lblBandNote,
      `${!affairsMonth ? '非正月 · 只讀' : this.locked ? '內政已終了' : `年令 第 ${year} 年`} · 國庫 ${fmt(GameState.nationalGold())}`,
    );
    this.setLabel(this.lblBandText, `太守 ${major} · 軍師 ${wise} · 武將 ${roster.length} 員 · 內政效率 ×${eff.toFixed(2)}`);
    this.setLabel(
      this.lblBandTip,
      `預備兵 ${fmt(st.prep)}／${fmt(prepCap)} · 兵 ${fmt(st.troops)}／${fmt(caps.total)} · 人口 ${fmt(st.pop)}`,
    );

    // 抽屜
    this.setLabel(this.lblSheetTitle, this.sheetOpen ? this.sheetTitle : '');
    for (let i = 0; i < SHEET_ROWS; i += 1) {
      const row = this.sheetOpen ? this.sheetRows[i] : undefined;
      this.setLabel(this.sheetLabels[i], row ? row.text : '');
      const label = this.sheetLabels[i];
      if (label) label.color = rgba(row && row.act ? COLORS.text : COLORS.textDim);
    }

    this.drawMain();
    if (this.sheetOpen) this.drawSheet();
    else if (this.gSheet) this.gSheet.clear();
  }

  /* --------------------------------------------------------------------
   * §2.6 抽屜
   * ------------------------------------------------------------------ */

  private openSheet(title: string, rows: SheetRow[]): void {
    this.sheetOpen = true;
    this.sheetTitle = title;
    const list = rows.slice(0, SHEET_ROWS - 1);
    list.push({ text: '取　消', act: () => this.closeSheet() });
    this.sheetRows = list;
    this.sheetRects = [];
    this.refresh();
  }

  private closeSheet(): void {
    this.sheetOpen = false;
    this.sheetTitle = '';
    this.sheetRows = [];
    this.sheetRects = [];
    if (this.gSheet) this.gSheet.clear();
    for (let i = 0; i < this.sheetLabels.length; i += 1) this.setLabel(this.sheetLabels[i], '');
    this.setLabel(this.lblSheetTitle, '');
  }

  /* --------------------------------------------------------------------
   * §2.7 命令
   * ------------------------------------------------------------------ */

  /** 記一條日誌（帶本城 + 命令名 + 月份戳） */
  private note(cmd: string, text: string): void {
    const save = this.save;
    if (!save) return;
    M.logAdd(save, { m: save.month, city: this.cityName, cmd, kind: 'cmd', text });
  }

  /**
   * [P0-4/F2] 記「這名將今年已行動」：`save.acted[將] = 年序`（一年一次/將，web `markActed`）。
   *
   * 舊碼用 `markMonthActed`（一月一條，任一條命令鎖整頁）與 [F7] 誤移植的「主令每項每月一次」
   * 逐令月配額，兩者都已廢除；原作是**逐將年令**。內政窗口收束（`monthLocked`）仍只由
   * 「出征／自治」觸發（web 同）。
   */
  private actedBy(name: string): void {
    const save = this.save;
    if (!save) return;
    M.markActed(save, name);
    this.closeSheet();
    this.persist();
    this.refresh();
  }

  /** [P0-1] 搜到寶物／兵符：寫進 `localStorage['sanguo_items_v1']`（與 web `bagAdd` 同鍵同格式） */
  private bagAdd(seq: number): void {
    const n = M.num(seq);
    if (!n) return;
    try {
      const raw = sys.localStorage.getItem(M.BAG_KEY);
      const next = M.bagAddRaw(raw, n);
      sys.localStorage.setItem(M.BAG_KEY, next);
      this.bag = M.bagSeqsOf(next);
      if (this.ctx) this.ctx.bag = this.bag;
    } catch (err) {
      console.warn('[CityPanel] 背包寫入失敗', err);
    }
  }

  /**
   * [P0-4/F2] 選執行武將（原作「每項主令都要指定人，不能空手代行」）：只列今年還沒行動的城內將。
   * 沒有可用將 → 記一條提示並取消命令（不吃年令、不扣金）。
   */
  private pickExec(title: string, cb: (name: string) => void): void {
    const save = this.save;
    if (!save) return;
    const all = M.rosterOf(save, this.cityName, this.ctx);
    const free = all.filter((g) => !M.actedLocked(save, g.NAME));
    if (!free.length) {
      const used = all.filter((g) => M.actedLocked(save, g.NAME)).map((g) => g.NAME);
      this.note(
        title,
        used.length
          ? `沒有可用的武將：${used.join('、')} 今年已經行動過（每將每年只能搜索或開發一次）。`
          : '這座城沒有可用的武將（在路上的不算，F3）。',
      );
      this.persist();
      this.refresh();
      return;
    }
    const rows: SheetRow[] = free.map((g) => ({
      text: `${g.NAME}（統 ${fmt(g.STR)} · 智 ${fmt(g.INT)}）`,
      act: () => {
        cb(g.NAME);
      },
    }));
    this.openSheet(`執行武將（${title}）`, rows);
  }

  private runCommand(index: number): void {
    const save = this.save;
    const def = this.def();
    const cmd = cmdList()[index];
    if (!save || !def || !cmd) return;

    // [P0-4] 兩道閘：①正月門 —— 非正月只讀（web `readOnly()` 同口徑）；②窗口收束 ——
    // 出征/自治用掉窗口後要回大地圖「內政終了」跑完一年。逐將年令在具體命令裡由 pickExec 處理。
    if (M.readOnly(save, false)) {
      this.note(
        cmd,
        M.isAffairsMonth(save)
          ? `${M.LOCK_HINT}（內政窗口已收束）—— 回大地圖「內政終了」跑完一年。`
          : M.OFF_MONTH_HINT,
      );
      this.persist();
      this.refresh();
      return;
    }

    // 九宮高亮：把 plate_sel 疊到剛點的這顆（純外觀，不影響下面任何分支）
    this.markCommandPlate(index);

    switch (cmd) {
      case '開發':
        this.cmdDevelop();
        return;
      case '徵兵':
        this.cmdEnlistSheet();
        return;
      case '搜索':
        this.cmdSearch();
        return;
      case '移動':
        this.cmdMoveSheet();
        return;
      case '任命':
        this.cmdAppointSheet(null);
        return;
      case '武將資料':
        this.cmdItems();
        return;
      case '情報':
        this.cmdIntel();
        return;
      case '出征':
        this.cmdDeploy();
        return;
      case '自治':
        this.cmdAutoSheet();
        return;
      default:
        return;
    }
  }

  private cmdDevelop(): void {
    const save = this.save;
    const def = this.def();
    if (!save || !def) return;
    // [P0-4/原作] 沒有太守不能開發（web `doDevelop` 同文案；太守提供效率倍率）
    if (!M.majorOf(save, def)) {
      this.note('開發', '需先任命太守：沒有太守不能開發（原作不允許無太守代行）。');
      this.persist();
      this.refresh();
      return;
    }
    // [P0-4/F2] 先選執行將（今年還沒行動的城內將）
    this.pickExec('開發', (name) => this.developBy(name));
  }

  private developBy(name: string): void {
    const save = this.save;
    const def = this.def();
    if (!save || !def) return;
    if (M.actedLocked(save, name)) {
      this.closeSheet();
      this.note('開發', `${name} 今年已行動（每將每年只能搜索或開發一次），換一位。`);
      this.persist();
      this.refresh();
      return;
    }
    // [P1-1] 執行將 = 玩家選的這名將（舊碼永遠用太守）；效率倍率仍看太守（web 同公式）。
    const r = M.develop(save, def, { ...this.ctx, exec: name });
    if (!r.ok) {
      this.closeSheet();
      this.note('開發', r.reason === 'gold' ? `金不足（需 ${fmt(r.cost)}）。` : '人口飽和、防禦力最高了。');
      this.persist();
      this.refresh();
      return;
    }
    // [F7] 開發成本 R85 起為 0（原作不花金），所以成功文案要分「不耗金 / 扣 N 金」兩種。
    const cost = Math.max(0, Math.trunc(M.num(r.cost)));
    this.note(
      '開發',
      `${name} 執行：人口增加 ${fmt(r.pop)} 人，防禦力增加 ${fmt(r.def)}。${cost > 0 ? `（金 -${fmt(cost)}）` : '（不耗金）'}`,
    );
    this.actedBy(name);
  }

  private cmdEnlistSheet(): void {
    const save = this.save;
    const def = this.def();
    if (!save || !def) return;
    // [P0-3/F13] 原作線：進徵兵頁先結算「金 → 預備兵」（web `prepFromMoney`：100 金 = 1 預備兵）。
    const conv = M.prepFromMoney(save, def);
    const st = M.ensureCityState(save, def);
    if (!st) return;
    if (conv.ok && conv.n > 0) {
      this.note('徵兵', `金 -${fmt(conv.cost)} → 預備兵 +${fmt(conv.n)}（共 ${fmt(conv.prep)}／${fmt(conv.cap)}）。`);
      // 先落盤：玩家若在抽屜按「取消」，這筆「金→預備兵」的結算不能丟。
      this.persist();
    }
    const caps = M.armCaps(save, def, this.ctx);
    const room = caps.total - st.troops;
    const maxInf = Math.max(0, Math.min(caps.inf - st.inf, room, st.prep));
    const maxCav = Math.max(0, Math.min(caps.cav - st.cav, room, st.prep));
    const rows: SheetRow[] = [];
    if (maxInf > 0) rows.push({ text: `步兵 +${fmt(maxInf)}（預備兵 -${fmt(maxInf)}）`, act: () => this.enlist('inf', maxInf) });
    if (maxCav > 0) rows.push({ text: `騎兵 +${fmt(maxCav)}（預備兵 -${fmt(maxCav)}）`, act: () => this.enlist('cav', maxCav) });
    if (!rows.length) {
      this.note('徵兵', st.prep <= 0 ? '預備兵不足，無法徵兵。' : '部隊兵已滿（步／騎上限）。');
      this.persist();
      this.refresh();
      return;
    }
    this.openSheet('徵　兵', rows);
  }

  private enlist(arm: string, n: number): void {
    const save = this.save;
    const def = this.def();
    if (!save) return;
    const r = M.enlist(save, def, { arm, n }, this.ctx);
    if (!r.ok) {
      const reason = r.reason;
      const text =
        reason === 'no-prep'
          ? '預備兵不足。'
          : reason === 'arm-full'
            ? '該兵種已達上限。'
            : reason === 'troops-full'
              ? '部隊兵已滿（600）。'
              : '徵兵失敗。';
      this.note('徵兵', text);
      this.persist();
      this.refresh();
      return;
    }
    const st = M.ensureCityState(save, def);
    const label = M.ARM_NAMES[r.arm ?? arm] ?? arm;
    this.note(
      '徵兵',
      `${label} +${fmt(r.n)}（預備兵 -${fmt(r.taken)}）。步 ${fmt(st?.inf)}／騎 ${fmt(st?.cav)}，共 ${fmt(st?.troops)}／${fmt(M.RECRUIT.CAP)}。`,
    );
    // [P0-4] 徵兵不是「將的一令」（web `doRecruit` → `afterCommand(false)`）：不吃逐將年令。
    this.closeSheet();
    this.persist();
    this.refresh();
  }

  private cmdSearch(): void {
    const save = this.save;
    const def = this.def();
    if (!save || !def) return;
    // [P0-4/F2] 先選執行將（搜索結果不看執行將，但這名將今年的年令會被鎖；web 同）
    this.pickExec('搜索', (name) => this.searchBy(name));
  }

  private searchBy(name: string): void {
    const save = this.save;
    const def = this.def();
    if (!save || !def) return;
    if (M.actedLocked(save, name)) {
      this.closeSheet();
      this.note('搜索', `${name} 今年已行動（每將每年只能搜索或開發一次），換一位。`);
      this.persist();
      this.refresh();
      return;
    }
    const r = M.search(save, def, { ...this.ctx, exec: name });
    if (!r.ok) {
      this.closeSheet();
      this.note('搜索', r.reason === 'gold' ? `金不足（需 ${fmt(r.cost)}）。` : '這裡不能搜索。');
      this.persist();
      this.refresh();
      return;
    }
    // [P0-1] 命中寶物／兵符：真的寫進背包（web `city.html:1026 bagAdd(r.seq)`）。
    // `foundItems` 仍由 CityModel.search() 記錄（日誌用）；成功日誌也由它自己寫（含種子結果）。
    if ((r.kind === 'treasure' || r.kind === 'talisman') && M.num(r.seq) > 0) {
      this.bagAdd(M.num(r.seq));
    }
    this.actedBy(name);
  }

  private cmdMoveSheet(): void {
    const save = this.save;
    const st = this.st();
    if (!save || !st) return;
    const owned = Array.isArray(save.owned) ? save.owned : [];
    const dests = M.neighboursOf(this.cityName, this.opts?.scenario ?? null).filter((n) => owned.includes(n));
    if (!dests.length) {
      this.note('移動', '沒有相鄰的我方城池可調動。');
      this.persist();
      this.refresh();
      return;
    }
    const half = Math.floor(M.num(st.troops) / 2);
    const rows: SheetRow[] = dests.slice(0, SHEET_ROWS - 1).map((to) => {
      const dst = M.cityStateOf(save, to);
      return {
        text: `→ ${to}（兵 ${fmt(dst?.troops)}／${fmt(M.RECRUIT.CAP)}，送出 ${fmt(half)}）`,
        act: () => this.moveTo(to, half),
      };
    });
    this.openSheet('移　動', rows);
  }

  private moveTo(to: string, troops: number): void {
    const save = this.save;
    if (!save) return;
    const r = M.move(save, this.def(), { to, troops }, this.ctx);
    if (!r.ok) {
      this.note('移動', MOVE_REASON[r.reason ?? ''] ?? '移動失敗。');
      this.persist();
      this.refresh();
      return;
    }
    const bits: string[] = [];
    if (M.num(r.troops) > 0) bits.push(`兵 ${fmt(r.troops)}`);
    if (r.general) bits.push(`將 ${r.general.NAME}`);
    this.note('移動', `→ ${to}：${bits.join('、') || '無'}。`);
    // [F7] 移動是副令（`CMD_SECONDARY`），不占月令：成功後只存檔刷新，不吃配額。
    this.closeSheet();
    this.persist();
    this.refresh();
  }

  private cmdAppointSheet(role: 'major' | 'wise' | null): void {
    const save = this.save;
    const def = this.def();
    if (!save || !def) return;
    const roster = M.rosterOf(save, this.cityName, this.ctx);
    if (!roster.length) {
      this.note('任命', '本城沒有武將可任命。');
      this.persist();
      this.refresh();
      return;
    }
    if (!role) {
      const major = M.majorOf(save, def) || '—';
      const wise = M.wiseOf(save, def) || '—';
      this.openSheet('任　命', [
        { text: `太守：${major}（點此改任）`, act: () => this.cmdAppointSheet('major') },
        { text: `軍師：${wise}（點此改任）`, act: () => this.cmdAppointSheet('wise') },
      ]);
      return;
    }
    const rows: SheetRow[] = roster.slice(0, SHEET_ROWS - 1).map((g) => ({
      text: `${g.NAME}　STR ${fmt(g.STR)} / INT ${fmt(g.INT)}`,
      act: () => this.appointTo(role, g.NAME),
    }));
    this.openSheet(role === 'major' ? '任命太守' : '任命軍師', rows);
  }

  private appointTo(role: 'major' | 'wise', name: string): void {
    const save = this.save;
    const def = this.def();
    if (!save) return;
    const r = M.appoint(save, def, role, name, this.ctx);
    const major = M.majorOf(save, def) || '—';
    const wise = M.wiseOf(save, def) || '—';
    this.note('任命', `太守 ${major}、軍師 ${wise}。`);
    // [F7] 任命免費、也不是月令（web CMD_META：'免費'）—— 不吃配額。
    this.closeSheet();
    this.persist();
    this.refresh();
  }

  private itemName(seq: number): string {
    const items = this.ctx.items ?? [];
    const hit = items.find((it) => M.num(it.Sequence) === seq);
    return hit ? `${hit.Name ?? `#${seq}`}` : `#${seq}`;
  }

  private cmdItems(): void {
    const bag = M.parseItemsSave(this.readBagRaw()).bag;
    this.bag = bag;
    if (this.ctx) this.ctx.bag = bag;
    // 有完整道具資料就交給物品頁（w4-cocos-items）：四槽/屬性/原作欄位都在那邊，
    // 內政頁原本的 6 行清單只是背包一覽。缺資料時退回原本的 sheet。
    const data = this.opts?.data;
    if (data && (data.items?.length ?? 0) > 0) {
      let panel = this.itemsPanel;
      if (!panel || !panel.isValid) {
        panel = ItemsPanel.show(this.node, {
          onClose: () => {
            if (this.opened) this.refresh();
          },
        });
        this.itemsPanel = panel;
      }
      // [ROSTER_SRC] 物品頁武將池的資料源是存檔運行時人事（我方城現在的駐將），
      // 不是 `generals.json` 的靜態 `CITY`（劇本 0）——2026-11-26 用戶反饋的張角卡。
      const gs = GameState.loadSave();
      const owned = (this.save as { owned?: unknown } | null)?.owned;
      const saveRoster = (this.save as { roster?: unknown } | null)?.roster;
      const gsRoster = (gs as unknown as { roster?: unknown }).roster;
      const gsKing = (gs as unknown as { king?: unknown }).king;
      const playerForce = typeof gsKing === 'string' ? gsKing.trim() : '';
      const def = this.def();
      panel.open(data.generals ?? [], data.items, Array.isArray(owned) ? (owned as string[]) : [], {
        save: gs,
        generals: data.generals,
        scenIdx: M.intOr(this.opts?.scenIdx, 0, 0),
        cityName: this.cityName,
        // 默認選將：當前城太守（內政任命名單）→ 君主 → 池首
        preferName: this.save && def ? M.majorOf(this.save, def) || '' : '',
        king: playerForce || '',
        roster: O.mergeRosters(saveRoster, gsRoster),
        playerForce,
        scenarioCities: this.opts?.scenario?.cities ?? null,
      });
      return;
    }
    const rows: SheetRow[] = bag
      .slice(0, SHEET_ROWS - 1)
      .map((seq, i) => ({ text: `${i + 1}. ${this.itemName(seq)}`, act: null }));
    if (!rows.length) rows.push({ text: '背包是空的。', act: null });
    this.openSheet(`物　品（共 ${bag.length} 件）`, rows);
  }

  private cmdIntel(): void {
    const save = this.save;
    const def = this.def();
    if (!save || !def) return;
    const info = M.intel(save, def, this.ctx);
    const rows: SheetRow[] = [];
    if (info.self) {
      const s = info.self;
      rows.push({
        text: `本城 ${s.name}｜兵 ${fmt(s.troops)}（步${fmt(s.inf)}騎${fmt(s.cav)}）｜預 ${fmt(s.prep)}/${fmt(s.prepCap)}｜防 ${fmt(s.def)}`,
        act: null,
      });
    }
    for (const r of info.rows.slice(0, SHEET_ROWS - 2)) {
      const owner = r.mine ? '我方' : r.gate ? '關卡' : r.owner || '無主';
      rows.push({
        text: `${owner} ${r.name}｜兵 ${fmt(r.troops)}｜防 ${fmt(r.def)}｜將 ${r.generals}${r.auto ? '｜自治' : ''}`,
        act: null,
      });
    }
    if (!rows.length) rows.push({ text: '（沒有情資）', act: null });
    this.openSheet('情　報', rows);
    // [F7] 情報是副令（`CMD_SECONDARY`），只讀、不占月令（舊碼這裡會 consume 一條）。
    this.persist();
    this.refresh();
  }

  private cmdDeploy(): void {
    const save = this.save;
    const def = this.def();
    if (!save || !def) return;
    const targets = M.deployTargets(save, def, this.ctx);
    if (!targets.length) {
      this.note('出征', '相鄰沒有可出征的敵城（或只有關卡）。');
      this.persist();
      this.refresh();
      return;
    }
    const rows: SheetRow[] = targets.slice(0, SHEET_ROWS - 1).map((t) => ({
      text: `${t.name}｜${t.owner || '無主'}｜兵 ${fmt(t.troops)}｜防 ${fmt(t.def)}｜將 ${t.generals}`,
      act: () => this.deployTo(t.name),
    }));
    this.openSheet('出　征', rows);
  }

  private deployTo(target: string): void {
    const onDeploy = this.opts?.onDeploy;
    if (!onDeploy) {
      this.note('出征', `已選定目標：${target}。`);
      this.persist();
      this.refresh();
      return;
    }
    // [P0-4] 出征收束本月內政窗口（web `city.html:1217-1218`：`markMonthActed` 後跳 deployUrl）。
    const save = this.save;
    if (save) {
      M.markMonthActed(save, false);
      this.persist();
    }
    // 交給 CampaignRoot 走既有 `doAction('march')`（敵情/出發城都在那裡定）
    onDeploy(target);
  }

  private cmdAutoSheet(): void {
    const save = this.save;
    if (!save) return;
    const owned = Array.isArray(save.owned) ? save.owned : [];
    if (!owned.length) {
      this.note('自治', '沒有我方城池。');
      this.persist();
      this.refresh();
      return;
    }
    const rows: SheetRow[] = owned.slice(0, SHEET_ROWS - 2).map((name) => ({
      text: `${M.isAuto(save, name) ? '☑' : '☐'} ${name}`,
      act: () => {
        M.setAuto(save, name, !M.isAuto(save, name));
        this.persist();
        this.cmdAutoSheet();
      },
    }));
    rows.push({ text: '▶ 施行自治（代行開墾）', act: () => this.runAuto() });
    this.openSheet('自　治', rows);
  }

  private runAuto(): void {
    const save = this.save;
    if (!save) return;
    const r = M.runAutonomy(save, this.cities(), this.ctx, { from: '' });
    if (!r.ok) {
      this.note('自治', r.reason === 'none' ? M.AUTONOMY.NO_CITY : '沒有可以代行開發的城（金不足或已飽和）。');
      // 失敗不吃月令（web openAuto 失敗只跳提示、不進 afterCommand）
      this.persist();
      this.refresh();
      return;
    }
    const detail = r.ran.map((x) => `${x.city}+${fmt(x.pop)}人`).join('、');
    this.note('自治', `${r.text}  ${detail}`);
    // [P0-4] 自治照 web 收束本月內政窗口（web `openAuto` → `afterCommand(true)` → `markMonthActed`）。
    M.markMonthActed(save, false);
    this.closeSheet();
    this.persist();
    this.refresh();
  }

  /* --------------------------------------------------------------------
   * §2.8 觸控
   * ------------------------------------------------------------------ */

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    // 物品頁開著時，觸控全歸它：內政頁的指令格（y 478–790）與物品列表（y 456–1100）重疊，
    // 不擋的話點一行物品會同時觸發徵兵/搜索之類的指令
    if (this.itemsPanel?.isOpen) return;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    const x = local.x + HALF_W;
    const y = HALF_H - local.y;

    if (this.sheetOpen) {
      for (let i = 0; i < this.sheetRows.length; i += 1) {
        const rect = this.sheetRects[i];
        if (rect && inside(rect, x, y)) {
          const row = this.sheetRows[i];
          if (row.act) row.act();
          return;
        }
      }
      return;
    }

    if (inside(R_BACK, x, y)) {
      this.close();
      return;
    }
    for (let i = 0; i < this.cmdRects.length; i += 1) {
      if (inside(this.cmdRects[i], x, y)) {
        this.runCommand(i);
        return;
      }
    }
  }
}
