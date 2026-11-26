/**
 * 武將資料名冊（Cocos 3.8.8，750×1334 縱屏）—— 補 web `game/web/campaign.html` 的
 * `#generalSheet`（`:343-357` 骨架、`:1735 generalRowsAll()`、`:1760 renderGeneralSheet()`）。
 *
 * 這一頁在 Cocos 側整塊缺失（c5 審計 4h）。web 版是「全勢力武將名冊 · 按勢力分組」的浮層：
 * 逐將一行 `名 · 城 · 勢力` + `武 / 智 / 忠誠 / 士氣 / 疲勞`，點一行展開。Cocos 沒有輸入法，
 * 所以篩選做成兩檔（任務書 §二·1）：
 *   · **按勢力/城分頁簽**（對應 web 的 byForce 分組，`:1760` 的 `byForce` 計數）
 *   · **按名字首字**（8 枚一頁 + ◀▶，`GeneralBook.initialsOf()`；401 人首字太散，只能分頁給）
 *
 * 三條硬約束：
 *  1. 不新建 `.scene`：掛在呼叫方的 Canvas 下（`show(parent, opts)`），用完 `destroy()`；
 *  2. **401 條不建 401 個節點**：行節點池 20 個（`ROW_POOL`）+ 一頁 20 行，
 *     翻頁只改 8 個 Label 的 `string`，節點數從頭到尾不變（上限見報告）；
 *  3. 無資源不白屏：頭像走 `Portrait.loadPortrait()` 五級回落（`face/full` → `face/thumb` →
 *     `hero` → `hero(encoded)` → 隱藏），**底下永遠墊著「勢力色格 + 名字首字」**，
 *     圖沒到 / 全失敗看到的是色塊不是白塊；九宮全走 `UiSkin`，它自己會降級 Graphics 描邊。
 *
 * 一個判定都不在本檔：等級口徑、技能解鎖過濾、分組、分頁、文案全在 `GeneralBook.ts`
 * （純函式，`work/cocos_book/model_assert.mjs` 直接斷言），本檔只做節點 + 命中矩形。
 *
 * 座標口徑同 `CampaignRoot` / `ItemsPanel` / `SurrenderPanel`：設計 750×1334、左上原點，
 * 落到 Cocos UI 時 `x-375 / 667-y`。
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
  Sprite,
  UITransform,
  Vec3,
} from 'cc';
import type { SpriteFrame } from 'cc';
import { addOutline, ArtSprite, loadFrame, loadFrameCached } from './ArtLayer';
import {
  BOOK_PAGE_SIZE,
  NO_CITY_KEY,
  WILD_KEY,
  buildBook,
  equipLine,
  filterBook,
  groupByCity,
  groupByForce,
  initialsOf,
  moodLine,
  paginateBook,
  skillLine,
  summarize,
  summaryText,
  vitalLine,
} from './GeneralBook';
import type { BookGeneral, BookGroup, BookGroupRow } from './GeneralBook';
import { forceColorOf } from './MonarchModel';
import { loadPortrait } from './Portrait';
import { makeNineSlice } from './UiSkin';
import { COLORS, FONT_FAMILY } from './view/theme';

const { ccclass } = _decorator;

const HALF_W = 375;
const HALF_H = 667;
const DESIGN_W = 750;
const DESIGN_H = 1334;

export interface BookRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一頁 20 行、行高 40 → 800 高的列表區。行節點池就是這個數。 */
export const ROW_POOL = BOOK_PAGE_SIZE;
export const ROW_H = 40;
/** 行頭像同時在載的上限：一頁 20 行不要一次打 20 個 `bundle.load`（微信小遊戲當時要≤10 並發）。 */
export const FACE_LOAD_MAX = 3;
/** 行頭像格的邊長（與 `drawList()` 畫的 26×26 色格同尺寸） */
export const ROW_FACE_PX = 26;
/** 勢力/城 篩選 chips：1 個「全部」+ 8 個分組 */
export const CHIP_POOL = 9;
/** 首字 chips：8 個一頁 + ◀ ▶ */
export const INIT_POOL = 8;
export const BOOK_NODE_NAME = 'GeneralBookPanel';

/** 版式：頁頭 0–124、頁簽 132–184、篩選 192–232、首字 238–278、表頭 284–310、列表 312–1112、
 *  翻頁 1116–1156、返回 1180–1248（距底 86）。 */
export const BOOK_LAYOUT = {
  screen: { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H },
  title: { x: 150, y: 8, w: 450, h: 52 },
  sub: { x: 24, y: 64, w: 520, h: 34 },
  close: { x: 636, y: 30, w: 96, h: 52 },
  tabForce: { x: 18, y: 132, w: 240, h: 52 },
  tabCity: { x: 262, y: 132, w: 240, h: 52 },
  clear: { x: 506, y: 132, w: 226, h: 52 },
  chipRow: { x: 18, y: 192, w: 714, h: 40 },
  initRow: { x: 18, y: 238, w: 714, h: 40 },
  colHead: { x: 18, y: 284, w: 714, h: 26 },
  list: { x: 18, y: 312, w: 714, h: ROW_POOL * ROW_H },
  navPrev: { x: 18, y: 1116, w: 120, h: 40 },
  navPage: { x: 168, y: 1116, w: 414, h: 40 },
  navNext: { x: 612, y: 1116, w: 120, h: 40 },
  back: { x: 250, y: 1180, w: 250, h: 68 },
  hint: { x: 18, y: 1190, w: 224, h: 48 },
  card: { x: 30, y: 168, w: 690, h: 824 },
  cardPortrait: { x: 50, y: 192, w: 220, h: 296 },
  cardName: { x: 286, y: 192, w: 404, h: 56 },
  cardMeta: { x: 286, y: 254, w: 404, h: 30 },
  cardVital: { x: 286, y: 290, w: 404, h: 28 },
  cardMood: { x: 286, y: 322, w: 404, h: 28 },
  cardStat: { x: 286, y: 354, w: 404, h: 28 },
  cardSkill: { x: 50, y: 502, w: 648, h: 30 },
  cardWise: { x: 50, y: 536, w: 648, h: 30 },
  cardEquip: { x: 50, y: 570, w: 648, h: 30 },
  cardKing: { x: 50, y: 604, w: 648, h: 26 },
  cardFate: { x: 50, y: 634, w: 648, h: 26 },
  cardClose: { x: 250, y: 900, w: 220, h: 64 },
} as const satisfies Record<string, BookRect>;

/** 列表列位（絕對設計 x）：首字格 / 名 / 武 / 智 / 級 / 城 / 勢力 / 狀態 */
export const BOOK_COL = {
  face: { x: 24, w: 30 },
  name: { x: 60, w: 146 },
  str: { x: 210, w: 46 },
  int: { x: 260, w: 46 },
  lv: { x: 310, w: 46 },
  city: { x: 362, w: 140 },
  force: { x: 508, w: 132 },
  status: { x: 646, w: 80 },
} as const satisfies Record<string, { x: number; w: number }>;

export function bookRowRect(index: number): BookRect {
  return { x: BOOK_LAYOUT.list.x, y: BOOK_LAYOUT.list.y + index * ROW_H, w: BOOK_LAYOUT.list.w, h: ROW_H };
}

export function bookColRect(col: keyof typeof BOOK_COL, index: number, padLeft = 4): BookRect {
  const c = BOOK_COL[col];
  const y = BOOK_LAYOUT.list.y + index * ROW_H;
  return { x: c.x + padLeft, y, w: c.w - padLeft, h: ROW_H };
}

/** 篩選 chip 的矩形（9 等分：74 寬 + 6 縫 = 714） */
export function chipRect(index: number): BookRect {
  const w = 74;
  const gap = 6;
  return { x: BOOK_LAYOUT.chipRow.x + index * (w + gap), y: BOOK_LAYOUT.chipRow.y, w, h: BOOK_LAYOUT.chipRow.h };
}

/** 首字 chip 的矩形：◀(28) + 8×76 + 縫 4 + ▶(28) */
export function initRect(index: number): BookRect {
  const y = BOOK_LAYOUT.initRow.y;
  const h = BOOK_LAYOUT.initRow.h;
  const chipW = 76;
  const gap = 4;
  const x0 = BOOK_LAYOUT.initRow.x + 28 + gap;
  return { x: x0 + index * (chipW + gap), y, w: chipW, h };
}

export function initArrowRect(side: 'prev' | 'next'): BookRect {
  const y = BOOK_LAYOUT.initRow.y;
  const h = BOOK_LAYOUT.initRow.h;
  if (side === 'prev') return { x: BOOK_LAYOUT.initRow.x, y, w: 28, h };
  const right = BOOK_LAYOUT.initRow.x + BOOK_LAYOUT.initRow.w;
  return { x: right - 28, y, w: 28, h };
}

/* =====================================================================
 * §2 純邏輯：名冊頁的「分組鍵 → chips」「首字分頁」
 * =================================================================== */

/** chip 的一項：`key` 是 `filterBook()` 吃的分組鍵（`''` = 全部） */
export interface BookChip {
  key: string;
  label: string;
  color: string;
  count: number;
  mine: boolean;
}

/**
 * 把分組表拍成 chips：`全部` 打頭，再取前 8 組（我方/未登場的排序由 `GeneralBook` 決定）。
 * 超過 8 組的部分不上 chip —— 401 人 15 家 + 在野 + 未登場剛好 8~9 組，實際溢出只會在
 * 按城分組時出現（34 城），那時前 8 組就是我方城 + 人最多的城，夠用。
 */
export function chipsOf(groups: readonly BookGroupRow[], total: number, limit = CHIP_POOL - 1): BookChip[] {
  const out: BookChip[] = [{ key: '', label: `全部 ${total}`, color: COLORS.textDim, count: total, mine: false }];
  for (let i = 0; i < groups.length && out.length <= limit; i += 1) {
    const group = groups[i];
    out.push({
      key: group.key,
      label: `${group.label} ${group.count}`,
      color: group.color,
      count: group.count,
      mine: group.mine,
    });
  }
  return out;
}

/** 分組鍵 → 人話（命題/副標用）：`''` → 全部，`WILD_KEY` → 在野，`NO_CITY_KEY` → 未登場 */
export function chipLabelOf(key: string, groups: readonly BookGroupRow[]): string {
  if (!key) return '全部';
  for (const group of groups) if (group.key === key) return group.label;
  if (key === WILD_KEY) return '在野';
  if (key === NO_CITY_KEY) return '未登場';
  return key;
}

/** 首字清單的一頁（8 個）；回傳 `{items, page, pages}`，`pages` 至少 1。 */
export function initialPage(
  rows: readonly BookGeneral[],
  page: number,
  size = INIT_POOL,
): { items: string[]; page: number; pages: number } {
  const all = initialsOf(rows).map((it) => it.ch);
  const pages = Math.max(1, Math.ceil(all.length / size));
  const p = Math.min(Math.max(0, Math.trunc(page) || 0), pages - 1);
  return { items: all.slice(p * size, p * size + size), page: p, pages };
}

/** 列表副標：`401 人 · 在職 79 · 在野 63 · 未登場 259 · 15 家 · 34 城`（`GeneralBook` 同一支） */
export function subTextOf(rows: readonly BookGeneral[]): string {
  return summaryText(summarize(rows));
}

/* =====================================================================
 * §3 面板
 * =================================================================== */

/** 給 headless（`work/cocos_book/panel_headless.mjs`）與報告用的狀態快照。 */
export interface BookDebug {
  opened: boolean;
  group: BookGroup;
  filterForce: string;
  filterInitial: string;
  /** 當前篩選後的總人數（不是 401 時說明篩選生效） */
  filtered: number;
  page: number;
  pages: number;
  /** 當前頁畫出來的行數（最後一頁可能 < 20） */
  rows: number;
  visible: string[];
  chips: string[];
  initials: string[];
  initPage: number;
  initPages: number;
  selected: string | null;
  cardOpen: boolean;
  cardName: string;
  cardMeta: string;
  cardSkill: string;
  cardWise: string;
  cardEquip: string;
  cardVital: string;
  cardMood: string;
  cardPortrait: string;
  hits: number;
  title: string;
  sub: string;
  pageText: string;
}

export interface GeneralBookPanelOptions {
  /** `generals.json`（401 條） */
  generals?: unknown;
  /** magics.json / wises.json（技能名） */
  magics?: unknown;
  wises?: unknown;
  /** `CampaignRoot.save` */
  save?: object;
  /** 各城守將 `{城: [武將]}`（campaign 傳 `CampaignRoot.officersByCity()`＝存檔運行時人事） */
  officersByCity?: Record<string, unknown>;
  /** 城 → 勢力 id；缺省 `save.cities[n].owner` → `city.KING` */
  ownerOf?: (city: string) => string;
  /** 全部城（`scenarios.json` 的 cities）；缺省從 `data.scenarios[scenIdx]` 取 */
  cities?: readonly unknown[];
  /**
   * 劇本號（`CampaignRoot.scenIdx`）：補 `cities` 與「守將表反查不到時的所屬城」都用它。
   * 缺省 0 只是舊行為兜底（《討伐董卓》要傳 1，否則名冊的城/勢力全按 184 年算）。
   */
  scenIdx?: number;
  /** 有它就自己能補 `cities` / `officersByCity` */
  data?: object | null;
  /** 一開始要不要直接按城分組（web 的 `bootCmd` 沒有這檔，缺省按勢力） */
  group?: BookGroup;
  onClose?: (() => void) | null;
}

interface Hit {
  rect: BookRect;
  label: string;
  act: () => void;
}

interface BookRowNodes {
  face: Label;
  name: Label;
  str: Label;
  int: Label;
  lv: Label;
  city: Label;
  force: Label;
  status: Label;
}

function rgba(hexColor: string, alpha = 255): Color {
  const n = Number.parseInt(hexColor.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

function scenarioOf(data: unknown, scenIdx = 0): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const scenarios = (data as Record<string, unknown>).scenarios;
  if (!Array.isArray(scenarios) || !scenarios.length) return null;
  const pick = scenarios[scenIdx] ?? scenarios[0];
  return pick && typeof pick === 'object' ? (pick as Record<string, unknown>) : null;
}

function cityNameOf(city: unknown): string {
  if (typeof city === 'string') return city;
  if (!city || typeof city !== 'object') return '';
  const box = city as Record<string, unknown>;
  const name = box.NAME ?? box.name;
  return typeof name === 'string' ? name.trim() : '';
}

function normOwnerId(raw: unknown): string {
  const id = (typeof raw === 'string' ? raw : String(raw ?? '')).trim();
  if (!id) return '';
  return /^\d+$/.test(id) ? '' : id;
}

@ccclass('GeneralBookPanel')
export class GeneralBookPanel extends Component {
  /* ---- 生命週期 ---- */

  private built = false;
  private opened = false;
  private listening = false;
  private onCloseCb: (() => void) | null = null;

  /* ---- 資料 ---- */

  private rows: BookGeneral[] = [];
  private groups: BookGroupRow[] = [];
  private owned: string[] = [];
  private group: BookGroup = 'force';
  private filterForce = '';
  private filterInitial = '';
  private initPage = 0;
  private page = 0;
  private selected: BookGeneral | null = null;
  private hits: Hit[] = [];
  /** 單將卡自己的命中項（模態，見 `tap()`） */
  private cardHits: Hit[] = [];

  /* ---- 節點 ---- */

  private g: Graphics | null = null;
  private labelTitle: Label | null = null;
  private labelSub: Label | null = null;
  private labelPage: Label | null = null;
  private labelPrev: Label | null = null;
  private labelNext: Label | null = null;
  private labelTabForce: Label | null = null;
  private labelTabCity: Label | null = null;
  private labelClear: Label | null = null;
  private labelHint: Label | null = null;
  private headLabels: Label[] = [];
  private chipLabels: Label[] = [];
  private initLabels: Label[] = [];
  private initPrev: Label | null = null;
  private initNext: Label | null = null;
  private rowNodes: BookRowNodes[] = [];
  private tabForcePlate: Node | null = null;
  private tabCityPlate: Node | null = null;
  private cardRoot: Node | null = null;
  private cardPortrait: ArtSprite | null = null;
  private cardFace: Label | null = null;
  private cardName: Label | null = null;
  private cardMeta: Label | null = null;
  private cardVital: Label | null = null;
  private cardMood: Label | null = null;
  private cardStat: Label | null = null;
  private cardSkill: Label | null = null;
  private cardWise: Label | null = null;
  private cardEquip: Label | null = null;
  private cardKing: Label | null = null;
  private cardFate: Label | null = null;
  private cardClose: Label | null = null;
  /** 卡片縮圖當前掛的是誰（避免同一人重複載圖） */
  private portraitFor = '';
  private portraitVia = 'none';

  /* ---- 行頭像（R208）：節點池 20 個，圖是非同步來的，名字認領 ---- */

  /** 20 個行頭像圖層，與 `rowNodes` 同序；空行/換人時先把 node 收掉 */
  private rowFaces: ArtSprite[] = [];
  /** 該行當前要的人名（`''` = 空行）；圖回來時靠它判斷「這張臉還屬於這一行嗎」 */
  private rowFaceName: string[] = [];
  /** 名字 → 載到的圖（`null` = 五級回落全失敗，負快取，別每頁重試同一人） */
  private faceFrames = new Map<string, SpriteFrame | null>();
  /** 等載佇列（限流見 `FACE_LOAD_MAX`） */
  private faceQueue: Array<{ i: number; name: string }> = [];
  private faceBusy = 0;
  private facePumping = false;

  /* --------------------------------------------------------------------- */
  /* 對外 API                                                              */
  /* --------------------------------------------------------------------- */

  static show(parent: Node, options: GeneralBookPanelOptions = {}): GeneralBookPanel {
    const node = parent.getChildByName(BOOK_NODE_NAME) ?? new Node(BOOK_NODE_NAME);
    if (!node.parent) {
      node.layer = Layers.Enum.UI_2D;
      node.parent = parent;
    }
    let panel = node.getComponent(GeneralBookPanel);
    if (!panel) panel = node.addComponent(GeneralBookPanel);
    panel.onCloseCb = options.onClose ?? null;
    panel.build();
    panel.open(options);
    const top = node.parent ? node.parent.children.length - 1 : 0;
    if (top >= 0) node.setSiblingIndex(top);
    return panel;
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** 建節點樹（冪等）。節點總數固定：與 401 人無關，只看 `ROW_POOL` / `CHIP_POOL` / `INIT_POOL`。 */
  build(): void {
    if (this.built) return;
    this.built = true;
    // `destroyPanel()` 之後再 `show()` 會走第二次 build：池子必須清空，否則陣列會疊兩份
    this.headLabels = [];
    this.chipLabels = [];
    this.initLabels = [];
    this.rowNodes = [];
    this.hits = [];

    const root = this.node;
    root.layer = Layers.Enum.UI_2D;
    const transform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(DESIGN_W, DESIGN_H);

    // 蒙版（web 的 `.sheet-scrim` 同義）
    const veil = new Node('BookVeil');
    veil.layer = Layers.Enum.UI_2D;
    veil.parent = root;
    const veilBox = veil.addComponent(UITransform);
    veilBox.setAnchorPoint(0.5, 0.5);
    veilBox.setContentSize(DESIGN_W, DESIGN_H);
    const veilG = veil.addComponent(Graphics);
    veilG.fillColor = new Color(6, 8, 12, 226);
    veilG.rect(-HALF_W, -HALF_H, DESIGN_W, DESIGN_H);
    veilG.fill();

    // 底板（列表區 + 頁頭壓條），必須在 g 之下
    const bgG = this.makeGraphics('BookPlate');
    this.fillRect(bgG, BOOK_LAYOUT.list, '#0E1116', 210);

    // 所有色塊 / 分隔線 / 行底色 / 首字格都畫在這一個 Graphics 上
    this.g = this.makeGraphics('BookG');

    // 頁頭
    this.labelTitle = this.makeLabel('BookTitle', '武 將 資 料', BOOK_LAYOUT.title, 40, COLORS.goldLight, 'center');
    addOutline(this.labelTitle, new Color(6, 8, 12, 220), 1);
    this.labelSub = this.makeLabel('BookSub', '', BOOK_LAYOUT.sub, 22, COLORS.textDim, 'left', Label.Overflow.SHRINK);
    makeSkinBtn(root, 'BookCloseBtn', '關 閉', BOOK_LAYOUT.close);

    // 頁簽（九宮 plate_btn 底 + 文字；底片留著改色標「選中」）
    this.tabForcePlate = makeSkinPlate(root, 'BookTabForcePlate', BOOK_LAYOUT.tabForce);
    this.labelTabForce = this.makeLabel('BookTabForce', '按 勢 力', BOOK_LAYOUT.tabForce, 22, COLORS.text, 'center');
    this.tabCityPlate = makeSkinPlate(root, 'BookTabCityPlate', BOOK_LAYOUT.tabCity);
    this.labelTabCity = this.makeLabel('BookTabCity', '按 城', BOOK_LAYOUT.tabCity, 22, COLORS.textDim, 'center');
    // 底片先建、文字後建 —— 否則九宮會蓋住文字（兄弟序 = 繪製序）
    addTextPlate(root, 'BookClearPlate', BOOK_LAYOUT.clear);
    this.labelClear = this.makeLabel('BookClear', '清 除 篩 選', BOOK_LAYOUT.clear, 22, COLORS.textDim, 'center');

    // 篩選 chips（9 個）與首字（8 + 2 箭頭）
    for (let i = 0; i < CHIP_POOL; i += 1) {
      this.chipLabels.push(this.makeLabel(`BookChip${i}`, '', chipRect(i), 18, COLORS.textDim, 'center', Label.Overflow.SHRINK));
    }
    this.initPrev = this.makeLabel('BookInitPrev', '◀', initArrowRect('prev'), 18, COLORS.textDim, 'center');
    for (let i = 0; i < INIT_POOL; i += 1) {
      this.initLabels.push(this.makeLabel(`BookInit${i}`, '', initRect(i), 18, COLORS.textDim, 'center'));
    }
    this.initNext = this.makeLabel('BookInitNext', '▶', initArrowRect('next'), 18, COLORS.textDim, 'center');

    // 表頭
    const heads: Array<[string, keyof typeof BOOK_COL, 'left' | 'center' | 'right']> = [
      ['名', 'name', 'left'],
      ['武', 'str', 'center'],
      ['智', 'int', 'center'],
      ['級', 'lv', 'center'],
      ['所 屬 城', 'city', 'left'],
      ['勢 力', 'force', 'left'],
      ['狀 態', 'status', 'center'],
    ];
    for (let i = 0; i < heads.length; i += 1) {
      const [text, col, align] = heads[i];
      const rect: BookRect = {
        x: BOOK_COL[col].x + 4,
        y: BOOK_LAYOUT.colHead.y,
        w: BOOK_COL[col].w - 4,
        h: BOOK_LAYOUT.colHead.h,
      };
      this.headLabels.push(this.makeLabel(`BookHead${i}`, text, rect, 18, COLORS.textFaint, align));
    }

    // 行節點池 20 個（頭像圖層排在 8 個 Label 之後 = 蓋在首字牌上面，圖到了再關首字）
    for (let i = 0; i < ROW_POOL; i += 1) {
      this.rowNodes.push({
        face: this.makeLabel(`BookRowFace${i}`, '', bookColRect('face', i), 18, COLORS.text, 'center'),
        name: this.makeLabel(`BookRowName${i}`, '', bookColRect('name', i), 22, COLORS.text, 'left'),
        str: this.makeLabel(`BookRowStr${i}`, '', bookColRect('str', i), 20, COLORS.text, 'center'),
        int: this.makeLabel(`BookRowInt${i}`, '', bookColRect('int', i), 20, COLORS.text, 'center'),
        lv: this.makeLabel(`BookRowLv${i}`, '', bookColRect('lv', i), 20, COLORS.textDim, 'center'),
        city: this.makeLabel(`BookRowCity${i}`, '', bookColRect('city', i), 18, COLORS.textDim, 'left'),
        force: this.makeLabel(`BookRowForce${i}`, '', bookColRect('force', i), 18, COLORS.textDim, 'left'),
        status: this.makeLabel(`BookRowStatus${i}`, '', bookColRect('status', i), 18, COLORS.textDim, 'center'),
      });
      const faceCol = bookColRect('face', i);
      const img = new ArtSprite(
        this.node,
        `BookRowFaceImg${i}`,
        { x: faceCol.x, y: faceCol.y + (ROW_H - ROW_FACE_PX) / 2, w: ROW_FACE_PX, h: ROW_FACE_PX },
        'contain',
      );
      img.setVisible(true);
      this.rowFaces.push(img);
      this.rowFaceName.push('');
    }

    // 翻頁
    this.labelPrev = this.makeLabel('BookPrev', '◀ 上頁', BOOK_LAYOUT.navPrev, 22, COLORS.textDim, 'center');
    this.labelPage = this.makeLabel('BookPage', '', BOOK_LAYOUT.navPage, 20, COLORS.textDim, 'center');
    this.labelNext = this.makeLabel('BookNext', '下頁 ▶', BOOK_LAYOUT.navNext, 22, COLORS.textDim, 'center');
    this.labelHint = this.makeLabel('BookHint', '無輸入法：用勢力/首字篩選', BOOK_LAYOUT.hint, 12, COLORS.textFaint, 'left');

    // 返回
    addTextPlate(root, 'BookBackPlate', BOOK_LAYOUT.back);
    const back = this.makeLabel('BookBack', '返 回 大 地 圖', BOOK_LAYOUT.back, 30, COLORS.goldLight, 'center');
    addOutline(back, new Color(6, 8, 12, 220), 1);

    this.buildCard();

    this.node.active = false;
  }

  /** 單將卡（浮在名冊上；節點一次建好，開關只切 `cardRoot.active`）。 */
  private buildCard(): void {
    const card = new Node('BookCard');
    card.layer = Layers.Enum.UI_2D;
    card.parent = this.node;
    const transform = card.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(DESIGN_W, DESIGN_H);
    this.cardRoot = card;
    card.active = false;

    // 卡片底板（九宮 frame_panel）
    const frame = makeNineSlice(card, 'frame_panel', BOOK_LAYOUT.card.w, BOOK_LAYOUT.card.h);
    frame.name = 'BookCardFrame';
    placeAt(frame, BOOK_LAYOUT.card, BOOK_LAYOUT.card.w, BOOK_LAYOUT.card.h);
    const cardG = this.makeGraphics('BookCardG', card);
    this.fillRect(cardG, BOOK_LAYOUT.card, '#10141A', 246);

    // 立繪：plate_sel 當相框底、真 FACE 立繪疊上、首字色塊墊在最下面
    const plate = makeNineSlice(card, 'plate_sel', BOOK_LAYOUT.cardPortrait.w, BOOK_LAYOUT.cardPortrait.h);
    plate.name = 'BookCardPlate';
    placeAt(plate, BOOK_LAYOUT.cardPortrait, BOOK_LAYOUT.cardPortrait.w, BOOK_LAYOUT.cardPortrait.h);
    this.cardFace = this.makeLabel('BookCardFace', '', BOOK_LAYOUT.cardPortrait, 96, COLORS.goldLight, 'center', Label.Overflow.NONE, card);
    this.cardPortrait = new ArtSprite(card, 'BookCardArt', BOOK_LAYOUT.cardPortrait, 'contain');
    this.cardPortrait.setVisible(true);

    this.cardName = this.makeLabel('BookCardName', '', BOOK_LAYOUT.cardName, 40, COLORS.text, 'left', Label.Overflow.SHRINK, card);
    addOutline(this.cardName, new Color(6, 8, 12, 220), 1);
    this.cardMeta = this.makeLabel('BookCardMeta', '', BOOK_LAYOUT.cardMeta, 22, COLORS.textDim, 'left', Label.Overflow.SHRINK, card);
    this.cardVital = this.makeLabel('BookCardVital', '', BOOK_LAYOUT.cardVital, 20, COLORS.text, 'left', Label.Overflow.SHRINK, card);
    this.cardMood = this.makeLabel('BookCardMood', '', BOOK_LAYOUT.cardMood, 20, COLORS.text, 'left', Label.Overflow.SHRINK, card);
    this.cardStat = this.makeLabel('BookCardStat', '', BOOK_LAYOUT.cardStat, 20, COLORS.textDim, 'left', Label.Overflow.SHRINK, card);

    const g = this.g;
    void g;
    const lineY = BOOK_LAYOUT.cardSkill.y - 12;
    this.hlineOn(cardG, lineY, BOOK_LAYOUT.card.x + 24, BOOK_LAYOUT.card.w - 48, COLORS.line, 220);

    this.cardSkill = this.makeLabel('BookCardSkill', '', BOOK_LAYOUT.cardSkill, 22, COLORS.goldLight, 'left', Label.Overflow.SHRINK, card);
    this.cardWise = this.makeLabel('BookCardWise', '', BOOK_LAYOUT.cardWise, 22, COLORS.goldLight, 'left', Label.Overflow.SHRINK, card);
    this.cardEquip = this.makeLabel('BookCardEquip', '', BOOK_LAYOUT.cardEquip, 20, COLORS.textDim, 'left', Label.Overflow.SHRINK, card);
    this.cardKing = this.makeLabel('BookCardKing', '', BOOK_LAYOUT.cardKing, 18, COLORS.textFaint, 'left', Label.Overflow.SHRINK, card);
    this.cardFate = this.makeLabel('BookCardFate', '', BOOK_LAYOUT.cardFate, 18, COLORS.textFaint, 'left', Label.Overflow.SHRINK, card);

    addTextPlate(card, 'BookCardClosePlate', BOOK_LAYOUT.cardClose);
    this.cardClose = this.makeLabel('BookCardClose', '關 閉 卡 片', BOOK_LAYOUT.cardClose, 22, COLORS.text, 'center', Label.Overflow.NONE, card);
  }

  /** 填資料並刷新。 */
  open(options: GeneralBookPanelOptions = {}): void {
    if (!this.built) this.build();
    const save = options.save && typeof options.save === 'object' ? (options.save as Record<string, unknown>) : {};
    const data = options.data ?? null;
    const scenario = scenarioOf(data, options.scenIdx ?? 0);
    const cities = options.cities ?? (Array.isArray(scenario?.cities) ? (scenario?.cities as unknown[]) : []);
    const ownerOf = this.ownerOfOf(cities, save, options.ownerOf);
    const ownedRaw = save.owned;
    this.owned = Array.isArray(ownedRaw) ? ownedRaw.map((x) => normOwnerId(typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean) : [];

    this.rows = buildBook({
      generals: options.generals,
      save,
      magics: options.magics,
      wises: options.wises,
      officersByCity: options.officersByCity ?? null,
      ownerOf,
      scenIdx: options.scenIdx,
    });
    this.group = options.group === 'city' ? 'city' : 'force';
    this.filterForce = '';
    this.filterInitial = '';
    this.initPage = 0;
    this.page = 0;
    this.selected = null;
    this.portraitFor = '';
    if (this.cardRoot) this.cardRoot.active = false;
    this.opened = true;
    this.node.active = true;
    if (!this.listening) {
      input.on(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = true;
    }
    this.refresh();
  }

  /** 關（節點保留給下次 `show()` 複用；真正移除由呼叫方 `destroy()`）。 */
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.node.active = false;
    if (this.cardRoot) this.cardRoot.active = false;
    this.selected = null;
    if (this.listening) {
      input.off(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = false;
    }
    const cb = this.onCloseCb;
    if (cb) cb();
  }

  /** 破壞節點（任務書 §三：用完 `destroy()`）。`show()` 是可重建的，所以直接移除整棵樹。 */
  destroyPanel(): void {
    this.close();
    if (this.node.isValid) this.node.destroy();
    this.built = false;
    this.rows = [];
    this.rowNodes = [];
    this.chipLabels = [];
    this.initLabels = [];
  }

  /** 給 headless / 報告的狀態。 */
  debug(): BookDebug {
    const filtered = this.filteredRows();
    const pages = this.pageCount(filtered.length);
    const visible = this.pageRows(filtered).map((row) => row.name);
    const row = this.selected;
    return {
      opened: this.opened,
      group: this.group,
      filterForce: this.filterForce,
      filterInitial: this.filterInitial,
      filtered: filtered.length,
      page: this.page,
      pages,
      rows: visible.length,
      visible,
      chips: this.chipLabels.map((label) => label.string),
      initials: this.initLabels.filter((l) => l.node.active).map((l) => l.string),
      initPage: this.initPage,
      initPages: initialPage(this.filteredByForce(), this.initPage).pages,
      selected: row ? row.name : null,
      cardOpen: !!this.cardRoot?.active,
      cardName: this.cardName ? this.cardName.string : '',
      cardMeta: this.cardMeta ? this.cardMeta.string : '',
      cardSkill: this.cardSkill ? this.cardSkill.string : '',
      cardWise: this.cardWise ? this.cardWise.string : '',
      cardEquip: this.cardEquip ? this.cardEquip.string : '',
      cardVital: this.cardVital ? this.cardVital.string : '',
      cardMood: this.cardMood ? this.cardMood.string : '',
      cardPortrait: this.portraitVia,
      hits: this.hits.length,
      title: this.labelTitle ? this.labelTitle.string : '',
      sub: this.labelSub ? this.labelSub.string : '',
      pageText: this.labelPage ? this.labelPage.string : '',
    };
  }

  /** 模擬一次點擊（設計座標，左上原點）。 */
  tap(x: number, y: number): boolean {
    // 單將卡是**模態**的：開著時只有卡片自己的命中項生效，其餘一律當「點卡片外面」。
    // （不先擋住列表命中項的話，卡片底下的行會搶先命中，點「關閉」會變成「換看另一個人」。）
    if (this.cardRoot?.active) {
      for (const hit of this.cardHits) {
        const rect = hit.rect;
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
          hit.act();
          return true;
        }
      }
      this.closeCard();
      return true;
    }
    for (const hit of this.hits) {
      const rect = hit.rect;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        hit.act();
        return true;
      }
    }
    return false;
  }

  get hitList(): ReadonlyArray<{ rect: BookRect; label: string }> {
    return this.hits.map((hit) => ({ rect: hit.rect, label: hit.label }));
  }

  /* ---- 篩選 / 分頁（對外，headless 也能直接叫） ---- */

  setGroup(group: BookGroup): void {
    if (this.group === group) return;
    this.group = group;
    this.filterForce = '';
    this.filterInitial = '';
    this.initPage = 0;
    this.page = 0;
    this.refresh();
  }

  setForceFilter(key: string): void {
    this.filterForce = this.filterForce === key ? '' : key;
    this.filterInitial = '';
    this.initPage = 0;
    this.page = 0;
    this.refresh();
  }

  setInitialFilter(ch: string): void {
    this.filterInitial = this.filterInitial === ch ? '' : ch;
    this.page = 0;
    this.refresh();
  }

  setPage(page: number): void {
    const pages = this.pageCount(this.filteredRows().length);
    const next = Math.min(Math.max(0, Math.trunc(page) || 0), pages - 1);
    if (next === this.page) return;
    this.page = next;
    this.refresh();
  }

  openCard(row: BookGeneral): void {
    this.selected = row;
    if (this.cardRoot) this.cardRoot.active = true;
    this.refresh();
  }

  closeCard(): void {
    this.selected = null;
    if (this.cardRoot) this.cardRoot.active = false;
    this.portraitFor = '';
    this.refresh();
  }

  /* --------------------------------------------------------------------- */
  /* 派生資料                                                              */
  /* --------------------------------------------------------------------- */

  private ownerOfOf(
    cities: readonly unknown[],
    save: Record<string, unknown>,
    given?: (city: string) => string,
  ): (city: string) => string {
    const byName = new Map<string, unknown>();
    for (const city of cities) byName.set(cityNameOf(city), city);
    const savedCities = save.cities && typeof save.cities === 'object' ? (save.cities as Record<string, unknown>) : {};
    return (city: string): string => {
      if (given) {
        const got = normOwnerId(given(city));
        if (got) return got;
      }
      const own = savedCities[city];
      if (own && typeof own === 'object') {
        const id = normOwnerId((own as Record<string, unknown>).owner);
        if (id) return id;
      }
      const rec = byName.get(city);
      const box = rec && typeof rec === 'object' ? (rec as Record<string, unknown>) : null;
      return normOwnerId(box?.KING);
    };
  }

  /** 當前分組表（按勢力 / 按城） */
  private groupRows(): BookGroupRow[] {
    return this.group === 'city' ? groupByCity(this.rows, this.owned) : groupByForce(this.rows);
  }

  /** 只套勢力篩選（首字列要看這一層的全部首字，不能自己把自己篩掉） */
  private filteredByForce(): BookGeneral[] {
    return filterBook(this.rows, { force: this.filterForce });
  }

  private filteredRows(): BookGeneral[] {
    return filterBook(this.rows, { force: this.filterForce, initial: this.filterInitial });
  }

  private pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / ROW_POOL));
  }

  private pageRows(filtered: readonly BookGeneral[]): BookGeneral[] {
    const start = this.page * ROW_POOL;
    const out: BookGeneral[] = [];
    for (let i = start; i < start + ROW_POOL && i < filtered.length; i += 1) out.push(filtered[i]);
    return out;
  }

  /* --------------------------------------------------------------------- */
  /* 繪製                                                                  */
  /* --------------------------------------------------------------------- */

  private refresh(): void {
    this.hits = [];
    const filtered = this.filteredRows();
    const pages = this.pageCount(filtered.length);
    if (this.page >= pages) this.page = pages - 1;
    if (this.page < 0) this.page = 0;

    this.groups = this.groupRows();
    const texts = summarize(this.rows);

    if (this.labelTitle) this.labelTitle.string = '武 將 資 料';
    if (this.labelSub) {
      this.labelSub.string = `${summaryText(texts)} · 按${this.group === 'city' ? '城' : '勢力'}分組`;
    }
    if (this.labelHint) {
      this.labelHint.string =
        this.filterForce || this.filterInitial
          ? `篩選：${chipLabelOf(this.filterForce, this.groups)}${this.filterInitial ? ` · 首字「${this.filterInitial}」` : ''}`
          : '無輸入法：用勢力/首字篩選';
      this.labelHint.color = rgba(this.filterForce || this.filterInitial ? COLORS.goldLight : COLORS.textFaint);
    }

    this.drawTabs();
    this.drawChips(texts.total);
    this.drawInitials();
    this.drawList(filtered);
    this.drawNav(pages, filtered.length);
    this.drawCard();
  }

  private drawTabs(): void {
    const force = this.group === 'force';
    if (this.labelTabForce) this.labelTabForce.color = rgba(force ? COLORS.goldLight : COLORS.textDim);
    if (this.labelTabCity) this.labelTabCity.color = rgba(force ? COLORS.textDim : COLORS.goldLight);
    tintPlate(this.tabForcePlate, force ? COLORS.gold : '#3A4250', force ? 235 : 170);
    tintPlate(this.tabCityPlate, force ? '#3A4250' : COLORS.gold, force ? 170 : 235);
    this.addHit('tab:force', BOOK_LAYOUT.tabForce, () => this.setGroup('force'));
    this.addHit('tab:city', BOOK_LAYOUT.tabCity, () => this.setGroup('city'));
    this.addHit('clear', BOOK_LAYOUT.clear, () => {
      this.filterForce = '';
      this.filterInitial = '';
      this.initPage = 0;
      this.page = 0;
      this.refresh();
    });
    this.addHit('close', BOOK_LAYOUT.close, () => this.close());
    this.addHit('back', BOOK_LAYOUT.back, () => this.close());
  }

  private drawChips(total: number): void {
    const chips = chipsOf(this.groups, total);
    const g = this.g;
    for (let i = 0; i < CHIP_POOL; i += 1) {
      const label = this.chipLabels[i];
      const chip = chips[i];
      const rect = chipRect(i);
      if (!chip) {
        label.node.active = false;
        continue;
      }
      label.node.active = true;
      const on = this.filterForce === chip.key;
      label.string = chip.label;
      label.color = rgba(on ? COLORS.goldLight : chip.mine ? COLORS.text : COLORS.textDim);
      if (g) {
        this.fillRect(g, rect, on ? '#1E2732' : '#12161C', 235);
        this.strokeRect(g, rect, on ? COLORS.gold : chip.mine ? COLORS.goldDim : COLORS.line, on ? 235 : 170, 1);
        this.fillRect(g, { x: rect.x, y: rect.y + rect.h - 3, w: rect.w, h: 3 }, chip.color, on ? 255 : 180);
      }
      const key = chip.key;
      this.addHit(`chip:${key || 'all'}`, rect, () => this.setForceFilter(key));
    }
  }

  private drawInitials(): void {
    const pool = this.filteredByForce();
    const page = initialPage(pool, this.initPage);
    this.initPage = page.page;
    const all = initialsOf(pool).length;
    const multi = page.pages > 1;
    if (this.initPrev) {
      this.initPrev.node.active = multi;
      this.initPrev.color = rgba(page.page > 0 ? COLORS.textDim : COLORS.textFaint);
      if (page.page > 0) {
        this.addHit('initPrev', initArrowRect('prev'), () => {
          this.initPage = Math.max(0, this.initPage - 1);
          this.refresh();
        });
      }
    }
    if (this.initNext) {
      this.initNext.node.active = multi;
      this.initNext.color = rgba(page.page < page.pages - 1 ? COLORS.textDim : COLORS.textFaint);
      if (page.page < page.pages - 1) {
        this.addHit('initNext', initArrowRect('next'), () => {
          this.initPage = Math.min(page.pages - 1, this.initPage + 1);
          this.refresh();
        });
      }
    }
    const g = this.g;
    for (let i = 0; i < INIT_POOL; i += 1) {
      const label = this.initLabels[i];
      const ch = page.items[i];
      const rect = initRect(i);
      if (!ch) {
        label.node.active = false;
        continue;
      }
      label.node.active = true;
      const on = this.filterInitial === ch;
      label.string = ch;
      label.color = rgba(on ? COLORS.goldLight : COLORS.textDim);
      if (g) {
        this.fillRect(g, rect, on ? '#1E2732' : '#12161C', 230);
        this.strokeRect(g, rect, on ? COLORS.gold : COLORS.line, on ? 235 : 150, 1);
      }
      this.addHit(`init:${ch}`, rect, () => this.setInitialFilter(ch));
    }
    void all;
  }

  private drawList(filtered: readonly BookGeneral[]): void {
    const rows = this.pageRows(filtered);
    const g = this.g;
    for (let i = 0; i < ROW_POOL; i += 1) {
      const nodes = this.rowNodes[i];
      const row = rows[i];
      const rect = bookRowRect(i);
      if (!row) {
        this.rowFaceName[i] = '';
        const img = this.rowFaces[i];
        if (img) img.node.active = false;
        for (const key of Object.keys(nodes) as Array<keyof BookRowNodes>) nodes[key].node.active = false;
        continue;
      }
      for (const key of Object.keys(nodes) as Array<keyof BookRowNodes>) nodes[key].node.active = true;

      if (g) {
        this.fillRect(g, rect, row.mine ? '#161C26' : '#12161C', 235);
        // 左側勢力色條
        this.fillRect(g, { x: rect.x + 6, y: rect.y + 5, w: 3, h: rect.h - 10 }, row.color, 235);
        // 首字格（頭像的降級態：永遠畫，圖到了也還是它當底）
        const faceRect = bookColRect('face', i);
        this.fillRect(g, { x: faceRect.x, y: rect.y + (ROW_H - 26) / 2, w: 26, h: 26 }, row.color, row.mine ? 255 : 205);
        this.strokeRect(g, { x: faceRect.x, y: rect.y + (ROW_H - 26) / 2, w: 26, h: 26 }, row.mine ? COLORS.gold : '#0A0D11', row.mine ? 235 : 200, 1);
        // 行底細線
        this.hlineOn(g, rect.y + rect.h - 1, rect.x + 6, rect.w - 12, COLORS.line, 110);
      }

      nodes.face.string = Array.from(row.name)[0] ?? '·';
      nodes.face.color = rgba(row.mine ? '#0B0F14' : COLORS.text);
      nodes.name.string = row.name;
      nodes.name.color = rgba(row.mine ? COLORS.goldLight : row.status === '未' ? COLORS.textFaint : COLORS.text);
      nodes.str.string = String(row.str);
      nodes.int.string = String(row.int);
      nodes.lv.string = String(row.level);
      nodes.city.string = row.city || '—';
      nodes.force.string = row.forceLabel;
      nodes.force.color = rgba(row.force ? row.color : COLORS.textFaint);
      nodes.status.string = row.statusText;
      nodes.status.color = rgba(
        row.status === '登' ? COLORS.ok : row.status === '俘' ? COLORS.enemy : row.status === '野' ? COLORS.gold : COLORS.textFaint,
      );

      const picked = row;
      this.syncRowFace(i, row.name);
      this.addHit(`row:${i}:${row.name}`, rect, () => this.openCard(picked));
    }
  }

  /* --------------------------------------------------------------------- */
  /* 行頭像（R208）                                                        */
  /* --------------------------------------------------------------------- */

  /**
   * 讓第 `index` 行顯示 `name` 的頭像。
   *
   * 三條原則：
   * 1. **首字牌是底，臉是浮層**：圖沒到、載失敗、沒 FACE 映射時看到的是「勢力色格 + 首字」，
   *    永遠不會白塊（與本檔開頭 §3 的承諾一致）。
   * 2. **名字認領**：非同步圖回來時這一格可能已經翻到別人的名字上了，`rowFaceName[index]`
   *    對不上就丟掉，絕不把張三的臉貼到李四那行。
   * 3. **限流 + 快取**：一頁 20 行只同時載 `FACE_LOAD_MAX` 個；載到的圖按名字存進
   *    `faceFrames`（含 `null` 負快取），翻頁回來直接用，不再打 bundle。
   */
  private syncRowFace(index: number, name: string): void {
    const img = this.rowFaces[index];
    if (!img) return;
    const letter = this.rowNodes[index] ? this.rowNodes[index].face : null;
    if (this.rowFaceName[index] !== name) {
      this.rowFaceName[index] = name;
      img.node.active = false; // 換人：先收掉上一張臉，等新圖到了再顯示
      const hit = this.faceFrames.get(name);
      if (hit !== undefined) {
        this.applyRowFace(index, hit);
        return;
      }
      this.faceQueue.push({ i: index, name });
      this.pumpFaces();
    }
    if (letter) letter.node.active = !(this.rowFaceName[index] === name && img.state === 'ready');
  }

  /** 把一張（可能為 null 的）圖套到第 `index` 行；null = 隱藏圖、露出首字牌。 */
  private applyRowFace(index: number, frame: SpriteFrame | null): void {
    const img = this.rowFaces[index];
    if (!img) return;
    const letter = this.rowNodes[index] ? this.rowNodes[index].face : null;
    if (!frame) {
      img.apply(null);
      if (letter) letter.node.active = true;
      return;
    }
    const ok = img.apply(frame); // 'contain'：30×40 縮成 19.5×26，不變形、不溢出
    if (letter) letter.node.active = !ok;
  }

  /** 佇列泵：最多 `FACE_LOAD_MAX` 個在載；`facePumping` 防同步回呼把泵遞迴進去。 */
  private pumpFaces(): void {
    if (this.facePumping) return;
    this.facePumping = true;
    while (this.faceBusy < FACE_LOAD_MAX && this.faceQueue.length > 0) {
      const job = this.faceQueue.shift();
      if (!job) break;
      if (this.rowFaceName[job.i] !== job.name) continue; // 這行已經翻走了，別浪費一次載入
      const hit = this.faceFrames.get(job.name);
      if (hit !== undefined) {
        this.applyRowFace(job.i, hit);
        continue;
      }
      this.faceBusy += 1;
      let got: SpriteFrame | null = null;
      const cap = {
        apply: (frame: SpriteFrame | null): boolean => {
          if (frame) got = frame;
          return frame !== null;
        },
      };
      loadPortrait(
        cap,
        job.name,
        'thumb', // 30×40：26px 的行格子用 thumb 就夠，full 是 100×120（4 倍像素）
        loadFrameCached,
        (result) => {
          this.faceBusy -= 1;
          const frame = result.via === 'none' ? null : got;
          this.faceFrames.set(job.name, frame);
          if (this.rowFaceName[job.i] === job.name) this.applyRowFace(job.i, frame);
          this.pumpFaces();
        },
        true,
      );
    }
    this.facePumping = false;
  }

  private drawNav(pages: number, filtered: number): void {
    const multi = pages > 1;
    if (this.labelPage) {
      this.labelPage.string = `第 ${this.page + 1} / ${pages} 頁　（篩選後 ${filtered} 人）`;
      this.labelPage.node.active = true;
    }
    if (this.labelPrev) {
      this.labelPrev.node.active = multi;
      this.labelPrev.color = rgba(this.page > 0 ? COLORS.textDim : COLORS.textFaint);
      if (this.page > 0) this.addHit('prev', BOOK_LAYOUT.navPrev, () => this.setPage(this.page - 1));
    }
    if (this.labelNext) {
      this.labelNext.node.active = multi;
      this.labelNext.color = rgba(this.page < pages - 1 ? COLORS.textDim : COLORS.textFaint);
      if (this.page < pages - 1) this.addHit('next', BOOK_LAYOUT.navNext, () => this.setPage(this.page + 1));
    }
  }

  private drawCard(): void {
    this.cardHits = [];
    const card = this.cardRoot;
    if (!card || !card.active) return;
    const row = this.selected;
    if (!row) return;

    if (this.cardName) {
      this.cardName.string = row.name;
      this.cardName.color = rgba(row.mine ? COLORS.goldLight : COLORS.text);
    }
    if (this.cardMeta) {
      this.cardMeta.string = `${row.statusText} · ${row.forceLabel} · ${row.city || '未登場'}${row.mine ? ' · 我方' : ''}`;
      this.cardMeta.color = rgba(row.force && row.color ? row.color : COLORS.textDim);
    }
    if (this.cardVital) this.cardVital.string = vitalLine(row);
    if (this.cardMood) this.cardMood.string = moodLine(row);
    if (this.cardStat) {
      this.cardStat.string = `武 ${row.str}　智 ${row.int}　級 ${row.level}　義理 ${row.constancy}　帶兵 ${row.troopCap}`;
    }
    if (this.cardSkill) this.cardSkill.string = skillLine(row.skill, '必殺技');
    if (this.cardWise) this.cardWise.string = skillLine(row.wise, '軍師技');
    if (this.cardEquip) this.cardEquip.string = equipLine(row);
    if (this.cardKing) {
      this.cardKing.string = `君主 ${row.loyalKing || '—'}　TYPE ${row.type}　FACE ${row.faceNo ?? (row.face || '—')}`;
    }
    if (this.cardFate) {
      this.cardFate.string = `忠 ${row.loyal}　氣 ${row.spirit}　疲 ${row.tire}　（存檔覆蓋：loyal/morale/tire）`;
    }
    if (this.cardFace) {
      this.cardFace.string = Array.from(row.name)[0] ?? '將';
      this.cardFace.color = rgba(row.color || COLORS.textDim, 210);
    }
    // 立繪：只給單將卡載（列表不做 401 張異步圖，理由見報告 §4）
    if (this.portraitFor !== row.name) {
      this.portraitFor = row.name;
      this.portraitVia = 'none';
      const target = this.cardPortrait;
      if (target) {
        loadPortrait(
          target,
          row.name,
          'full',
          loadFrame,
          (result) => {
            this.portraitVia = result.via;
          },
          true,
        );
      }
    }

    // 卡片是模態：自己的命中項放 `cardHits`，不跟列表搶
    this.cardHits.push({ rect: BOOK_LAYOUT.cardClose, label: 'cardClose', act: () => this.closeCard() });
  }

  /* --------------------------------------------------------------------- */
  /* 觸控                                                                  */
  /* --------------------------------------------------------------------- */

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    this.tap(local.x + HALF_W, HALF_H - local.y);
  }

  /* --------------------------------------------------------------------- */
  /* 幾何 / 建節點                                                         */
  /* --------------------------------------------------------------------- */

  private centerOf(rect: BookRect): { x: number; y: number } {
    return { x: rect.x + rect.w / 2 - HALF_W, y: HALF_H - (rect.y + rect.h / 2) };
  }

  private makeGraphics(name: string, parent?: Node): Graphics {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = parent ?? this.node;
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    return node.addComponent(Graphics);
  }

  private makeLabel(
    name: string,
    text: string,
    rect: BookRect,
    fontSize: number,
    color: string,
    align: 'left' | 'center' | 'right',
    overflow: number = Label.Overflow.NONE,
    parent?: Node,
  ): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = parent ?? this.node;
    const transform = node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(Math.max(1, rect.w), Math.max(1, rect.h));
    const p = this.centerOf(rect);
    node.setPosition(p.x, p.y, 0);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.3);
    label.color = rgba(color);
    label.horizontalAlign =
      align === 'left' ? Label.HorizontalAlign.LEFT : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = overflow === Label.Overflow.NONE && align !== 'center' ? Label.Overflow.SHRINK : overflow;
    return label;
  }

  private fillRect(g: Graphics, rect: BookRect, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.fill();
  }

  private strokeRect(g: Graphics, rect: BookRect, color: string, alpha = 255, width = 1): void {
    g.strokeColor = rgba(color, alpha);
    g.lineWidth = width;
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.stroke();
  }

  private hlineOn(g: Graphics, y: number, x: number, w: number, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(x - HALF_W, HALF_H - y, w, 1);
    g.fill();
  }

  private addHit(label: string, rect: BookRect, act: () => void): void {
    this.hits.push({ rect, label, act });
  }
}

/* =====================================================================
 * §4 模組級小工具
 * =================================================================== */

/** 九宮底板（`plate_btn` 等），返回節點（呼叫方可 tint 它標「選中」） */
function makeSkinPlate(parent: Node, name: string, rect: BookRect): Node {
  const node = makeNineSlice(parent, 'plate_btn', rect.w, rect.h);
  node.name = name;
  placeAt(node, rect, rect.w, rect.h);
  return node;
}

/** 把九宮底 tint 成某色（`Sprite.color` 直接乘在原圖上；原圖是灰白，tint 後就是想要的色） */
function tintPlate(node: Node | null, color: string, alpha = 255): void {
  if (!node) return;
  const sprite = node.getComponent(Sprite);
  if (sprite) sprite.color = rgba(color, alpha);
}

/** 九宮按鈕（`plate_btn` + 居中 Label） */
function makeSkinBtn(parent: Node, name: string, text: string, rect: BookRect): Node {
  const node = makeSkinPlate(parent, name, rect);
  const labelNode = new Node(`${name}Label`);
  labelNode.layer = Layers.Enum.UI_2D;
  labelNode.parent = node;
  const transform = labelNode.addComponent(UITransform);
  transform.setAnchorPoint(0.5, 0.5);
  transform.setContentSize(Math.max(1, rect.w), Math.max(1, rect.h));
  const label = labelNode.addComponent(Label);
  label.string = text;
  label.fontFamily = FONT_FAMILY;
  label.fontSize = 22;
  label.lineHeight = 28;
  label.color = rgba(COLORS.text);
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  return node;
}

/** 只有底板（文字另外擺，方便換色不動底） */
function addTextPlate(parent: Node, name: string, rect: BookRect): Node {
  return makeSkinPlate(parent, name, rect);
}

/** 設計座標擺位（左上原點） */
function placeAt(node: Node, rect: BookRect, w: number, h: number): void {
  node.setPosition(rect.x + w / 2 - HALF_W, HALF_H - (rect.y + h / 2), 0);
}

/** `forceColorOf` 的再導出：面板外部（報告/hook）不必再 import 一次 MonarchModel */
export { forceColorOf };
