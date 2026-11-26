/**
 * MonarchPanel.ts — 君主屬性卡 + 讓位候選浮層 + 勢力一覽 / 勢力明細（Cocos 面板版）。
 *
 * ## 為什麼是面板不是場景
 * 與 `CityPanel.ts` / `ItemsPanel.ts` 同一個做法：不新建 `.scene`，由 `CampaignRoot`
 * 在當前場景裡實例化一個全屏節點掛上本組件，用「顯示 / 隱藏」當頁面切換。
 *
 * ## 職責
 * 1. **君主屬性卡**：武力 / 智力 / 等級 / 忠誠 / 士氣 / 疲勞 / 名下城數 / 在職武將 /
 *    投降殘將 / 旗號 / 勢力 / 即位月（12 格，2 列 × 6 行）；
 * 2. **讓位候選浮層**：`M.abdicateCandidates()` 排序後一頁 5 人，點一個就讓位；
 * 3. **勢力一覽抽屜**：`M.forceRoster()` 全表（我方 → 存續 → 城多），帶勢力色塊；
 * 4. **勢力明細抽屜**：`M.forceDetail()` 該勢力武將（武/智/忠/士/疲 + 狀態 + 殘將歸宿）。
 *
 * 純邏輯全部在 `MonarchModel.ts`（那份檔案不 import `cc`，會被 node 對拍），本檔只負責
 * 「排版 + 觸控 + 把使用者操作寫回存檔」。
 *
 * ## 存檔分層（重要，與 `GameState.ts` 的關係）
 * `GameState.normalize()` 是**白名單**：`CampaignSave` 只有
 * `owned/wins/losses/streak/bestStreak/month/gold/seeded/cities/armies/armySeq`，
 * 未知頂層鍵一律丟掉。所以君主的
 * `king / monarch / force / monarchSince / forces / fate / drift / loyal / morale / tire`
 * **不能**塞進 `sanguo_campaign_v1`，本檔照 `CityPanel.CITY_EXTRAS_KEY` 的先例另開
 * `sanguo_monarch_v1`（`MONARCH_EXTRAS_KEY`），由 `CampaignRoot` 雙向合併。
 * 正確的長期做法是給 `GameState.CampaignSave` 加欄位（補丁見 project/106 §5），
 * 本次不動那個檔案（任務約束）→ 這裡只留補丁鍵。
 *
 * ## 坐標口徑
 * 設計座標 750×1334、左上原點；落到節點局部座標用 `view/layout.ts` 的
 * `toLocal(sx, sy)`（`x-375 / 667-y`），與 CityPanel / CampaignRoot 完全一致。
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
  UITransform,
  Vec3,
} from 'cc';
import * as M from './MonarchModel';
import { DESIGN_H, DESIGN_W, toLocal } from './view/layout';
import { COLORS, FONT, FONT_FAMILY } from './view/theme';
import { guardTouch } from './InputGuard';

const { ccclass } = _decorator;

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/** 君主附加欄位的存檔鍵（與 `GameState.SAVE_KEY` 分開，理由見檔頭） */
export const MONARCH_EXTRAS_KEY = 'sanguo_monarch_v1';
/** 面板節點名（`MonarchPanel.show` 用它找已存在的節點） */
export const MONARCH_NODE_NAME = 'MonarchPanel';

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

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** 抽屜一行 */
interface SheetRow {
  text: string;
  /** 左側色塊（勢力一覽用） */
  swatch?: string;
  act?: (() => void) | null;
}

/**
 * 君主陣亡彈窗的一行。由 `CampaignRoot` 的 `successionView()` 產生（純邏輯在那邊），
 * 面板只排版：`text` 直接顯示，`tone` 決定是否可點。
 */
export interface SuccessionPanelRow {
  text: string;
  /** 'cand' 可點（立為新君）／'note' 純文字／'confirm' 確定勢力滅亡 */
  tone: string;
  /** tone==='cand' 時是候選人名字（回呼用） */
  name: string;
}

/** 君主陣亡彈窗的顯示資料 */
export interface SuccessionPanelView {
  title: string;
  sub: string;
  hint: string;
  extinct: boolean;
  rows: readonly SuccessionPanelRow[];
}

/* ======================================================================
 * §1 版面常量（設計座標，左上原點）
 * ==================================================================== */

const R_CARD: Rect = { x: 26, y: 88, w: 698, h: 1160 };
const R_TITLE: Rect = { x: 52, y: 104, w: 430, h: 48 };
const R_SINCE: Rect = { x: 470, y: 108, w: 232, h: 40 };
const R_BAND: Rect = { x: 44, y: 158, w: 662, h: 40 };
const R_STATS: Rect = { x: 40, y: 206, w: 670, h: 470 };
const R_NOTE: Rect = { x: 40, y: 690, w: 670, h: 108 };
const R_HINT: Rect = { x: 40, y: 1218, w: 670, h: 26 };

const STAT_ROW_H = 78;
const STAT_COL_W = 330;

const R_BTN_FORCES: Rect = { x: 40, y: 1118, w: 214, h: 92 };
const R_BTN_ABD: Rect = { x: 268, y: 1118, w: 214, h: 92 };
const R_BTN_CLOSE: Rect = { x: 496, y: 1118, w: 214, h: 92 };

const R_SHEET: Rect = { x: 18, y: 672, w: 714, h: 584 };
const R_SHEET_TITLE: Rect = { x: 42, y: 680, w: 430, h: 36 };
const SHEET_ROW_H = 60;
const SHEET_ROW_GAP = 4;
/** 5 行資料 + 1 行翻頁 / 返回 + 1 行取消 */
const SHEET_ROWS = 7;
const PAGE_ROWS = SHEET_ROWS - 2;

/** 12 項屬性（2 列 × 6 行；index 0..5 左列，6..11 右列） */
const STAT_NAMES: readonly string[] = Object.freeze([
  '武　力',
  '智　力',
  '等　級',
  '忠　誠',
  '士　氣',
  '疲　勞',
  '名下城數',
  '在職武將',
  '投降殘將',
  '旗　號',
  '勢　力',
  '即位月',
]);

/* ======================================================================
 * §2 面板
 * ==================================================================== */

export interface MonarchPanelOptions {
  /** 取「合併後的存檔視圖」（GameState 存檔 + 君主補丁鍵 + 城歸屬）；每次呼叫都拿最新 */
  save: () => Record<string, unknown>;
  /** `generals.json`（補 STR / INT / LOYAL / level） */
  generals: readonly unknown[];
  /** 劇本 cities（`forceRoster` / `abdicateCandidates` 需要） */
  cities: readonly unknown[];
  /** 各城武將 `{城: [{name,str,int,loyal,status}]}`（cocos 傳 garrison.json 的 officers） */
  officersByCity: () => Record<string, unknown[]>;
  /** 當前歸屬（城名 → 勢力 id） */
  ownerOf: (cityName: string) => string;
  /** 面板改過存檔（讓位）→ 由 CampaignRoot 落盤並刷新頁頭 */
  onCommit: (note: string) => void;
  onClose: () => void;
}

@ccclass('MonarchPanel')
export class MonarchPanel extends Component {
  private opts: MonarchPanelOptions | null = null;
  private built = false;
  private opened = false;
  private registered = false;

  // ---- 繪圖層 ----
  private gMain: Graphics | null = null;
  private gSheet: Graphics | null = null;

  // ---- 屬性卡 Label ----
  private lblTitle: Label | null = null;
  private lblSince: Label | null = null;
  private lblBand: Label | null = null;
  private lblNote: Label | null = null;
  private lblHint: Label | null = null;
  private lblBtnForces: Label | null = null;
  private lblBtnAbd: Label | null = null;
  private lblBtnClose: Label | null = null;
  private statNames: Array<Label | null> = [];
  private statValues: Array<Label | null> = [];

  // ---- 抽屜 ----
  private sheetKind: 'none' | 'forces' | 'detail' | 'abdicate' | 'succession' = 'none';
  private sheetForce = '';
  private sheetPage = 0;
  private sheetRows: SheetRow[] = [];
  private sheetRects: Rect[] = [];
  private lblSheetTitle: Label | null = null;
  private sheetLabels: Array<Label | null> = [];

  // ---- 君主陣亡 → 選繼承人（v17-cocos-monarch） ----
  private successionView: SuccessionPanelView | null = null;
  private successionPick: ((name: string) => void) | null = null;
  private successionPage = 0;

  // ---- 快取 ----
  private generalMap: Map<string, unknown> | null = null;

  /* --------------------------------------------------------------------
   * §2.1 建立 / 生命週期
   * ------------------------------------------------------------------ */

  /** 由 `CampaignRoot` 呼叫：找/建節點，掛組件，綁定選項 */
  static show(parent: Node, options: MonarchPanelOptions): MonarchPanel {
    let node = parent.getChildByName(MONARCH_NODE_NAME);
    if (!node) {
      node = new Node(MONARCH_NODE_NAME);
      node.layer = Layers.Enum.UI_2D;
      node.parent = parent;
      node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    }
    const panel = node.getComponent(MonarchPanel) ?? node.addComponent(MonarchPanel);
    panel.opts = options;
    panel.build();
    return panel;
  }

  protected onLoad(): void {
    this.build();
  }

  protected onDestroy(): void {
    this.unregisterTouch();
  }

  /** 節點層是否已建好（onLoad 與 open() 都可能先到，用 flag 去重） */
  private build(): void {
    if (this.built) return;
    this.built = true;

    // 1) 主 Graphics 必須第一個建立 —— 兄弟序在前 ⇒ 畫在所有 Label 之下
    const gNode = new Node('MonarchPanelBg');
    gNode.parent = this.node;
    gNode.layer = Layers.Enum.UI_2D;
    gNode.setPosition(0, 0, 0);
    gNode.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.gMain = gNode.addComponent(Graphics);

    // 2) 卡片標題
    this.lblTitle = this.makeLabel('', R_TITLE, FONT.title, COLORS.goldLight, 'left');
    this.lblSince = this.makeLabel('', R_SINCE, 19, COLORS.textDim, 'right');
    this.lblBand = this.makeLabel('', R_BAND, 20, COLORS.text, 'left');

    // 3) 12 格屬性
    for (let i = 0; i < STAT_NAMES.length; i += 1) {
      const col = i < 6 ? 0 : 1;
      const row = i < 6 ? i : i - 6;
      const x = R_STATS.x + 6 + col * STAT_COL_W;
      const y = R_STATS.y + 4 + row * STAT_ROW_H;
      this.statNames.push(this.makeLabel(STAT_NAMES[i], { x, y, w: 128, h: STAT_ROW_H - 10 }, 19, COLORS.textDim, 'left'));
      this.statValues.push(
        this.makeLabel('—', { x: x + 126, y, w: STAT_COL_W - 140, h: STAT_ROW_H - 10 }, 24, COLORS.text, 'left'),
      );
    }

    // 4) 摘要 / 提示 / 三顆按鈕
    this.lblNote = this.makeLabel('', R_NOTE, 17, COLORS.textDim, 'left');
    this.lblHint = this.makeLabel('', R_HINT, 15, COLORS.textFaint, 'center');
    this.lblBtnForces = this.makeLabel('勢力一覽', R_BTN_FORCES, 24, COLORS.goldLight, 'center');
    this.lblBtnAbd = this.makeLabel('讓　位', R_BTN_ABD, 24, COLORS.goldLight, 'center');
    this.lblBtnClose = this.makeLabel('關　閉', R_BTN_CLOSE, 24, COLORS.text, 'center');

    // 5) 抽屜（最後建立 ⇒ 蓋住卡片下半部與提示）
    const sNode = new Node('MonarchPanelSheet');
    sNode.parent = this.node;
    sNode.layer = Layers.Enum.UI_2D;
    sNode.setPosition(0, 0, 0);
    sNode.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.gSheet = sNode.addComponent(Graphics);
    this.lblSheetTitle = this.makeLabel('', R_SHEET_TITLE, 20, COLORS.goldLight, 'left');
    for (let i = 0; i < SHEET_ROWS; i += 1) {
      const y = R_SHEET.y + 52 + i * (SHEET_ROW_H + SHEET_ROW_GAP);
      this.sheetLabels.push(
        this.makeLabel('', { x: R_SHEET.x + 22, y, w: R_SHEET.w - 44, h: SHEET_ROW_H }, 17, COLORS.text, 'left'),
      );
    }
  }

  /** 建一個 Label 節點（設計座標矩形 → 節點中心） */
  private makeLabel(text: string, rect: Rect, fontSize: number, color: string, align: 'left' | 'center' | 'right'): Label {
    const node = new Node('MonarchPanelLbl');
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

  get isOpen(): boolean {
    return this.opened;
  }

  /**
   * 打開面板。
   * @param mode `'card'`＝君主屬性卡（頁頭點君主名走這條）；`'forces'`＝直接開勢力一覽抽屜。
   */
  open(mode: 'card' | 'forces' = 'card'): void {
    this.build();
    this.opened = true;
    this.node.active = true;
    this.registerTouch();
    this.sheetKind = 'none';
    this.clearSuccession();
    this.refresh();
    if (mode === 'forces') this.openForces();
  }

  /** 隱藏（不動存檔） */
  hide(): void {
    this.opened = false;
    this.sheetKind = 'none';
    this.clearSuccession();
    this.closeSheet();
    this.unregisterTouch();
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
    input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'MonarchPanel'), this);
    this.registered = true;
  }

  private unregisterTouch(): void {
    if (!this.registered) return;
    input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'MonarchPanel'), this);
    this.registered = false;
  }

  /** 外部（換月 / 攻防後）要求重畫 */
  refresh(): void {
    if (!this.built) return;
    this.applyCard();
    this.applySheet();
    this.drawMain();
    this.drawSheet();
  }

  /* --------------------------------------------------------------------
   * §2.3 資料取值
   * ------------------------------------------------------------------ */

  private save(): Record<string, unknown> {
    const s = this.opts?.save();
    return isRecord(s) ? s : {};
  }

  private officersByCity(): Record<string, unknown[]> {
    const raw = this.opts?.officersByCity();
    if (!isRecord(raw)) return {};
    const out: Record<string, unknown[]> = {};
    for (const key of Object.keys(raw)) {
      const list = raw[key];
      if (Array.isArray(list)) out[key] = list;
    }
    return out;
  }

  private rowOf = (name: string): unknown => {
    if (!this.generalMap) {
      const map = new Map<string, unknown>();
      // 先落常量再 for-of：`for (const x of a ?? [])` 這種「邏輯式當 for-of 頭」的寫法
      // 會讓 Creator 3.8.8 的 plugin-transform-for-of 在 TSUnionType 型別推斷處崩潰。
      const gens = this.opts?.generals ?? [];
      for (const g of gens) {
        if (!isRecord(g)) continue;
        const key = M.str(g.NAME);
        if (key) map.set(key, g);
      }
      this.generalMap = map;
    }
    return this.generalMap.get(name);
  };

  private roster(): M.ForceRow[] {
    return M.forceRoster(this.save(), {
      cities: this.opts?.cities ?? [],
      ownerOf: this.opts?.ownerOf ?? ((): string => ''),
      officersByCity: this.officersByCity(),
    });
  }

  /* --------------------------------------------------------------------
   * §2.4 君主屬性卡
   * ------------------------------------------------------------------ */

  private applyCard(): void {
    const save = this.save();
    const name = M.monarchOf(save);
    const force = M.forceIdOf(save);
    const month = M.intOr(save.month, 1, 1);

    this.setLabel(this.lblTitle, name ? `君主 · ${name}` : '君主 · 未選');
    this.setLabel(this.lblSince, `即位 ${M.monthTag(save.monarchSince ?? 1)}`);
    this.setLabel(this.lblHint, '點「勢力一覽」看全勢力；「讓位」只列本勢力在職武將');

    for (let i = 0; i < this.statValues.length; i += 1) this.setLabel(this.statValues[i], '—');
    if (!name) {
      this.setLabel(this.lblBand, '尚未選定君主（劇本前三城的 KING 都為空）');
      this.setLabel(this.lblNote, '');
      return;
    }

    const st = M.officerStatus(save, { name }, this.rowOf(name));
    const base = isRecord(this.rowOf(name)) ? (this.rowOf(name) as Record<string, unknown>) : {};
    const rows = this.roster();
    const row = rows.find((r) => r.id === force) ?? null;
    const level = M.intOr(base.level, 1, 1, 99);
    const cap = M.troopCapOf(level);

    this.setLabel(this.lblBand, `${force || '未選勢力'}　·　城 ${row ? row.cityCount : 0}　·　將 ${row ? row.officerCount : 0}　·　帶兵上限 ${cap}`);
    const vals: string[] = [
      `${st ? st.str : 0}`,
      `${st ? st.int : 0}`,
      `Lv ${level}`,
      `${st ? st.loyal : 90}`,
      `${st ? st.spirit : 80}`,
      `${st ? st.tire : 0}`,
      `${row ? row.cityCount : 0}`,
      `${row ? row.officerCount : 0}`,
      `${row ? row.surrenderCount : 0}`,
      row && row.flag ? `旗 ${row.flag}` : '—',
      force || '—',
      M.monthTag(save.monarchSince ?? 1),
    ];
    for (let i = 0; i < vals.length; i += 1) this.setLabel(this.statValues[i], vals[i]);
    // 疲勞 ≥60 標紅（網頁側同一閾值語感；純顯示）
    const tired = this.statValues[5];
    if (tired) tired.color = rgba(st && st.tire >= 60 ? COLORS.danger : COLORS.text);

    // 摘要：漂移（有才顯示）+ 殘將 + 存續
    const bits: string[] = [];
    const drift = M.driftText(save);
    if (drift) bits.push(drift);
    if (row && row.surrenderCount) bits.push(`投降殘將 ${row.surrenderCount} 人`);
    if (row && !row.alive) {
      const rec = this.forceRecord(force);
      bits.push(`勢力已亡（${M.monthTag(rec ? rec.endedAt : month)}）`);
    } else if (row) {
      bits.push(`存續中 · 治下 ${row.cityCount} 城 · 在職 ${row.officerCount} 人`);
    }
    if (!bits.length) bits.push('本月無戰報摘要');
    this.setLabel(this.lblNote, bits.join('\n'));
  }

  /** `save.forces[force]`（己方勢力的旗號 / 存續 / endedAt） */
  private forceRecord(force: string): M.ForceRow | null {
    if (!force) return null;
    return this.roster().find((r) => r.id === force) ?? null;
  }

  /* --------------------------------------------------------------------
   * §2.5 抽屜（勢力一覽 / 勢力明細 / 讓位候選）
   * ------------------------------------------------------------------ */

  private openForces(): void {
    this.sheetKind = 'forces';
    this.sheetForce = '';
    this.sheetPage = 0;
    this.rebuildSheet();
  }

  private openDetail(forceId: string): void {
    this.sheetKind = 'detail';
    this.sheetForce = forceId;
    this.sheetPage = 0;
    this.rebuildSheet();
  }

  private openAbdicate(): void {
    this.sheetKind = 'abdicate';
    this.sheetForce = '';
    this.sheetPage = 0;
    this.rebuildSheet();
  }

  private closeSheet(): void {
    this.sheetKind = 'none';
    this.sheetForce = '';
    this.sheetPage = 0;
    this.sheetRows = [];
    this.sheetRects = [];
  }

  /* --------------------------------------------------------------------
   * §2.5b 君主陣亡 → 選繼承人（v17-cocos-monarch）
   * ------------------------------------------------------------------ */

  /**
   * 開「君主陣亡」彈窗。這個抽屜**不可取消**：`onTouch` 在 `sheetKind!=='none'` 時只認行，
   * 三顆按鈕與卡片外的點擊都被吞掉，玩家必須點一位候選、或按「確定：勢力滅亡」，
   * 才會把 `onPick(name)` 交回 `CampaignRoot` 落地（`M.inheritForce` / `M.extinguish`）。
   */
  openSuccession(view: SuccessionPanelView, onPick: (name: string) => void): void {
    this.build();
    this.opened = true;
    this.node.active = true;
    this.registerTouch();
    this.successionView = view;
    this.successionPick = onPick;
    this.successionPage = 0;
    this.sheetForce = '';
    this.sheetKind = 'succession';
    this.applyCard();
    this.rebuildSuccession();
  }

  /** 清掉彈窗狀態（不會放行任何回呼） */
  private clearSuccession(): void {
    this.successionView = null;
    this.successionPick = null;
    this.successionPage = 0;
  }

  /** 候選 5 人/頁 + 翻頁 + 說明；滅亡態則是「殘將散去 + 確定」 */
  private rebuildSuccession(): void {
    const view = this.successionView;
    if (!view) {
      this.sheetRows = [];
      this.sheetRects = [];
      return;
    }
    const cands: SuccessionPanelRow[] = [];
    const tails: SuccessionPanelRow[] = [];
    for (let i = 0; i < view.rows.length; i += 1) {
      const row = view.rows[i];
      if (!row) continue;
      if (row.tone === 'cand') cands.push(row);
      else tails.push(row);
    }
    const per = PAGE_ROWS;
    const pages = Math.max(1, Math.ceil(cands.length / per));
    const page = Math.min(Math.max(0, this.successionPage), pages - 1);
    this.successionPage = page;
    const rows: SheetRow[] = [];
    const stop = Math.min(per, cands.length - page * per);
    for (let i = 0; i < stop; i += 1) {
      const row = cands[page * per + i];
      if (!row) continue;
      const name = row.name;
      rows.push({ text: row.text, act: (): void => this.pickSuccession(name) });
    }
    if (pages > 1) {
      rows.push({ text: `下一頁 ▶（${page + 1}/${pages}）`, act: (): void => this.turnSuccessionPage(pages) });
    }
    for (let i = 0; i < tails.length; i += 1) {
      const row = tails[i];
      if (!row) continue;
      if (row.tone === 'confirm') rows.push({ text: row.text, act: (): void => this.pickSuccession('') });
      else rows.push({ text: row.text, act: null });
    }
    if (!view.extinct) rows.push({ text: '必須選一位，無法取消', act: null });
    this.sheetRows = rows;
    this.sheetTitle = `${view.title}　${view.sub}`;
    this.refresh();
  }

  /** 點候選人（或滅亡態的「確定」）→ 關窗 + 交回 CampaignRoot */
  private pickSuccession(name: string): void {
    const cb = this.successionPick;
    this.sheetKind = 'none';
    this.sheetRows = [];
    this.sheetTitle = '';
    this.clearSuccession();
    this.hide();
    if (cb) cb(name);
  }

  private turnSuccessionPage(pages: number): void {
    this.successionPage = (this.successionPage + 1) % Math.max(1, pages);
    this.rebuildSuccession();
  }

  /** 依當前抽屜種類 + 頁碼重建 sheetRows */
  private rebuildSheet(): void {
    if (this.sheetKind === 'succession') {
      this.rebuildSuccession();
      return;
    }
    const save = this.save();
    const rows: SheetRow[] = [];
    let title = '';

    if (this.sheetKind === 'forces') {
      const list = this.roster().filter((r) => r.id);
      const pages = Math.max(1, Math.ceil(list.length / PAGE_ROWS));
      this.sheetPage = Math.min(this.sheetPage, pages - 1);
      const slice = list.slice(this.sheetPage * PAGE_ROWS, this.sheetPage * PAGE_ROWS + PAGE_ROWS);
      title = `勢力一覽 · ${list.length} 家（頁 ${this.sheetPage + 1}/${pages}）`;
      for (const r of slice) {
        rows.push({
          text: `　　${r.name}　城${r.cityCount}　將${r.officerCount}${r.player ? '　★' : ''}${r.alive ? '' : '　（亡）'}`,
          swatch: M.forceColorOf(r.id),
          act: (): void => this.openDetail(r.id),
        });
      }
      rows.push({
        text: pages > 1 ? '下一頁 ▶' : '（只有一頁）',
        act: pages > 1 ? (): void => this.turnPage(pages) : null,
      });
    } else if (this.sheetKind === 'detail') {
      const detail = M.forceDetail(save, this.sheetForce, {
        cities: this.opts?.cities ?? [],
        ownerOf: this.opts?.ownerOf ?? ((): string => ''),
        officersByCity: this.officersByCity(),
        rowOf: this.rowOf,
      });
      const officers = detail ? detail.officers.filter((o): o is M.OfficerStatus => o !== null) : [];
      const pages = Math.max(1, Math.ceil(officers.length / PAGE_ROWS));
      this.sheetPage = Math.min(this.sheetPage, pages - 1);
      const slice = officers.slice(this.sheetPage * PAGE_ROWS, this.sheetPage * PAGE_ROWS + PAGE_ROWS);
      title = `${this.sheetForce || '未選'} · 武將 ${officers.length} 人（頁 ${this.sheetPage + 1}/${pages}）`;
      for (const o of slice) {
        const fate = o.fate ? `　${M.FATE_TEXT[o.fate as M.FateKind] ?? ''}` : '';
        rows.push({
          text: `${o.name}　武${o.str}　智${o.int}　忠${o.loyal}　士${o.spirit}　疲${o.tire}　${o.statusText}${fate}`,
          act: null,
        });
      }
      rows.push({ text: '◀ 回勢力一覽', act: (): void => this.openForces() });
    } else if (this.sheetKind === 'abdicate') {
      const list = M.abdicateCandidates(save, {
        cities: this.opts?.cities ?? [],
        ownerOf: this.opts?.ownerOf ?? ((): string => ''),
        officersByCity: this.officersByCity(),
      });
      const pages = Math.max(1, Math.ceil(list.length / PAGE_ROWS));
      this.sheetPage = Math.min(this.sheetPage, pages - 1);
      const slice = list.slice(this.sheetPage * PAGE_ROWS, this.sheetPage * PAGE_ROWS + PAGE_ROWS);
      title = `讓位候選 · ${list.length} 人（頁 ${this.sheetPage + 1}/${pages}）`;
      for (const c of slice) {
        rows.push({
          text: `${c.name}（${c.city}）　忠${c.loyal}　武${c.str}　智${c.int}`,
          act: (): void => this.pickAbdicate(c.name),
        });
      }
      rows.push({
        text: pages > 1 ? '下一頁 ▶' : list.length ? '（只有一頁）' : '本勢力沒有可讓位的在職武將',
        act: pages > 1 ? (): void => this.turnPage(pages) : null,
      });
    } else {
      this.sheetRows = [];
      this.sheetRects = [];
      return;
    }

    this.sheetRows = rows;
    this.sheetTitle = title;
    this.refresh();
  }

  private sheetTitle = '';

  private turnPage(pages: number): void {
    this.sheetPage = (this.sheetPage + 1) % Math.max(1, pages);
    this.rebuildSheet();
  }

  /** 讓位：寫 save（monarch / monarchSince / forces[force].king），交給 CampaignRoot 落盤 */
  private pickAbdicate(heir: string): void {
    const save = this.save();
    const res = M.abdicate(save, heir, { month: save.month });
    if (!res.ok) {
      this.setLabel(this.lblNote, `讓位失敗：${res.reason}`);
      return;
    }
    this.closeSheet();
    this.opts?.onCommit(`讓位：${res.from} → ${res.to}`);
    this.refresh();
  }

  private applySheet(): void {
    this.setLabel(this.lblSheetTitle, this.sheetKind === 'none' ? '' : this.sheetTitle);
    for (let i = 0; i < this.sheetLabels.length; i += 1) {
      const row = this.sheetRows[i];
      this.setLabel(this.sheetLabels[i], row ? row.text : '');
    }
  }

  /* --------------------------------------------------------------------
   * §2.6 繪製
   * ------------------------------------------------------------------ */

  private setLabel(label: Label | null, text: string): void {
    if (label) label.string = text;
  }

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

  private drawMain(): void {
    const g = this.gMain;
    if (!g) return;
    g.clear();

    // 全屏遮罩：大地圖完全壓暗（面板是模態）
    this.fillRect(g, { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H }, '#070A0E', 214);

    // 卡片
    this.fillRect(g, R_CARD, COLORS.panel, 250);
    this.strokeRect(g, R_CARD, COLORS.gold, 2, 150);
    // 標題帶
    this.fillRect(g, { x: R_CARD.x, y: R_CARD.y, w: R_CARD.w, h: 64 }, COLORS.panelHi, 250);
    this.hline(g, R_CARD.x, R_CARD.y + 64, R_CARD.w, COLORS.gold, 90, 2);

    // 勢力色條（卡片標題左側 8px）+ 勢力帶底色
    const force = M.forceIdOf(this.save());
    const color = M.forceColorOf(force);
    this.fillRect(g, { x: R_CARD.x + 6, y: R_CARD.y + 10, w: 8, h: 44 }, color, 235);
    this.fillRect(g, R_BAND, COLORS.panelHi, 210);
    this.strokeRect(g, R_BAND, COLORS.line, 1, 160);
    this.fillRect(g, { x: R_BAND.x + 4, y: R_BAND.y + 8, w: 24, h: 24 }, color, 235);

    // 屬性區 2 列 × 6 行
    this.fillRect(g, R_STATS, COLORS.bgDeep, 200);
    this.strokeRect(g, R_STATS, COLORS.line, 1, 190);
    for (let i = 1; i < 6; i += 1) {
      this.hline(g, R_STATS.x + 10, R_STATS.y + i * STAT_ROW_H, R_STATS.w - 20, COLORS.line, 110);
    }
    this.hline(g, R_STATS.x + STAT_COL_W, R_STATS.y + 8, 0, COLORS.line, 0, 1);
    // 中縫
    g.strokeColor = rgba(COLORS.line, 140);
    g.lineWidth = 1;
    g.moveTo(R_STATS.x + STAT_COL_W - HALF_W, HALF_H - R_STATS.y - 8);
    g.lineTo(R_STATS.x + STAT_COL_W - HALF_W, HALF_H - R_STATS.y - R_STATS.h + 8);
    g.stroke();

    // 摘要框
    this.fillRect(g, R_NOTE, COLORS.panelHi, 180);
    this.strokeRect(g, R_NOTE, COLORS.line, 1, 150);

    // 三顆按鈕
    this.fillRect(g, R_BTN_FORCES, COLORS.panelHi, 245);
    this.strokeRect(g, R_BTN_FORCES, COLORS.gold, 2, 150);
    this.fillRect(g, R_BTN_ABD, COLORS.panelHi, 245);
    this.strokeRect(g, R_BTN_ABD, COLORS.gold, 2, 150);
    this.fillRect(g, R_BTN_CLOSE, COLORS.panelHi, 245);
    this.strokeRect(g, R_BTN_CLOSE, COLORS.line, 2, 170);
  }

  private drawSheet(): void {
    const g = this.gSheet;
    if (!g) return;
    g.clear();
    if (this.sheetKind === 'none') return;

    this.fillRect(g, R_SHEET, COLORS.bgDeep, 252);
    this.strokeRect(g, R_SHEET, COLORS.gold, 2, 170);
    this.hline(g, R_SHEET.x + 16, R_SHEET.y + 46, R_SHEET.w - 32, COLORS.gold, 90);

    this.sheetRects = [];
    const last = this.sheetRows.length - 1;
    for (let i = 0; i < SHEET_ROWS; i += 1) {
      const rect: Rect = {
        x: R_SHEET.x + 16,
        y: R_SHEET.y + 52 + i * (SHEET_ROW_H + SHEET_ROW_GAP),
        w: R_SHEET.w - 32,
        h: SHEET_ROW_H,
      };
      this.sheetRects.push(rect);
      if (i > last) continue;
      const cancel = i === last;
      const row = this.sheetRows[i];
      this.fillRect(g, rect, cancel ? COLORS.panel : COLORS.panelHi, 255);
      this.strokeRect(g, rect, cancel ? COLORS.line : COLORS.gold, 1, cancel ? 170 : 90);
      // 勢力色塊：畫在行首（文字用全角空格讓位）
      if (row?.swatch) {
        this.fillRect(g, { x: rect.x + 6, y: rect.y + (SHEET_ROW_H - 26) / 2, w: 26, h: 26 }, row.swatch, 240);
        this.strokeRect(g, { x: rect.x + 6, y: rect.y + (SHEET_ROW_H - 26) / 2, w: 26, h: 26 }, COLORS.black, 1, 120);
      }
    }
  }

  /* --------------------------------------------------------------------
   * §2.7 觸控
   * ------------------------------------------------------------------ */

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    const x = local.x + HALF_W;
    const y = HALF_H - local.y;

    // 抽屜開著時吞掉所有點擊（與 CityPanel 同口徑）
    if (this.sheetKind !== 'none') {
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

    if (inside(R_BTN_CLOSE, x, y)) {
      this.close();
      return;
    }
    if (inside(R_BTN_FORCES, x, y)) {
      this.openForces();
      return;
    }
    if (inside(R_BTN_ABD, x, y)) {
      this.openAbdicate();
      return;
    }
    if (!inside(R_CARD, x, y)) {
      this.close();
    }
  }
}
