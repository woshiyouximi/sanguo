/**
 * 戰後招降面板（全屏彈層，照 web `game/web/campaign.html` 的 `#surrenderSheet`）。
 *
 * 視覺與行為基準是 web（截圖 `work/play86/shots/06f_招降面板.png`、`06g_招降一人.png`、
 * `06h_招降完成.png`），但**只抄行為不抄渲染**：
 *
 *  - 逐將一張卡：頭像 + 名 + `武 / 智 / 忠誠 / 義理` + 一行理由 + 三顆按鈕（招降 / 斬首 / 釋放）；
 *  - 底部三顆批量鍵「剩餘全部招降 / 全部斬首 / 全部釋放」，與 web 同義（見 `bulkOf()`）；
 *  - **沒有關閉鍵、點背景也關不掉**（web `#surrenderSheet` 刻意不給 `.x` / `data-close`：
 *    沒決策完不讓回大地圖，`campaign.html:1387/1393/2650`）；
 *  - 決策落庫後面板停在「處理完畢」態，只剩一顆「完 成」——web 是關浮層 + 大地圖 notice，
 *    Cocos 這裡沒有 `notice()` 可用，把同一句提示留在面板上（文案逐字取自
 *    `SurrenderModel.finishOf().text`），點「完 成」才收。
 *
 * 一個判定都不在本檔：卡面欄位、按鈕可用性、批量映射、落庫全部在 `SurrenderModel.ts`
 * （純函式，`work/cocos_surrender/model_assert.mjs` 直接斷言），本檔只做節點 + 命中矩形。
 *
 * 全部節點由代碼創建，不依賴預製體。座標口徑同 `CampaignRoot` / `ItemsPanel`：
 * 設計 750×1334、左上原點，落到 Cocos UI 時 `x-375 / 667-y`。
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
import { addOutline, ArtSprite, loadFrame } from './ArtLayer';
import * as GameState from './GameState';
import { loadPortrait } from './Portrait';
import {
  BULK_TEXT,
  KING_CHIP,
  bulkEnabled,
  bulkOf,
  decideOf,
  finishOf,
  footText,
  leftOf,
  openOf,
  saveOf,
  subText,
  viewsOf,
} from './SurrenderModel';
import type {
  BulkMode,
  CardAction,
  SurrenderOutcome,
  SurrenderState,
  SurrenderView,
} from './SurrenderModel';
import type { GameData } from './types';
import { COLORS, FONT_FAMILY } from './view/theme';

const { ccclass } = _decorator;

const HALF_W = 375;
const HALF_H = 667;
const DESIGN_W = 750;
const DESIGN_H = 1334;

/**
 * 面板標題 —— 逐字照原作：`武 將 招 降`（四字之间一个半角空格，原作就是字距撑开的四字牌）。
 *
 * `SurrenderModel.PANEL_TITLE` 是共用数据层（同一字符串 web 侧还在用），本轮只允许改
 * Cocos 这块 UI（`project/180_战斗HUD对齐.md` 指定的唯一落点），所以在视图侧本地覆盖。
 */
const PANEL_TITLE_TEXT = '武 將 招 降';

/** 一頁畫幾張卡（卡片固定 150 高，5 張 + 4 條 8px 縫 = 782，正好落在 240–1022）。 */
export const PER_PAGE = 5;
export const CARD_H = 150;
export const CARD_GAP = 8;

/* ------------------------------------------------------------------------- */
/* 卡片上的十項欄位（web `campaign.html:4844-4881 surFields()` 的同口徑）        */
/* ------------------------------------------------------------------------- */

/**
 * 十項欄位的**順序**（逐項照抄 web `surFields()`：等級 / 士氣 / 疲勞 / 武力 / 智力 /
 * 忠誠 / 武器 / 物品 / 勝場數 / 敗場數）。web 是 CSS grid 兩欄、按行填充，所以
 * 奇數位的欄位在右欄、偶數位在左欄（`等級 士氣` 一行、`疲勞 武力` 一行…）。
 */
export const SUR_FIELD_KEYS = [
  '等級',
  '士氣',
  '疲勞',
  '武力',
  '智力',
  '忠誠',
  '武器',
  '物品',
  '勝場數',
  '敗場數',
] as const;

/**
 * 一格欄位：`value === null` 表示**這個端拿不到這筆資料**，渲染成灰色「—」。
 *
 * web 的 `surFields()` 也是同一套語義（`null` → `<b class="none">—</b>`）。
 * [R197] 十欄全部由 `SurrenderView` 帶真值進來（`level/morale/tire/weapon/item/
 * wins/losses`，見 `core/roster.ts` 的 `surrenderCardExtras()`）：存檔有記錄就畫
 * 真值，沒有就 `null` → 灰「—」，**不拿 0 / 60 之類的缺省冒充**。
 */
export interface SurFieldCell {
  readonly key: string;
  readonly value: string | null;
}

/** 數值欄位：有限數 → 四捨五入的字串（web `int()` 同口徑）；`null`/`undefined` → null。 */
function cellNum(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? String(Math.round(value)) : null;
}

/** 文字欄位：去空白，空串與佔位符 `---` / `—` 都算「沒有」（web `text()` 同口徑）。 */
function cellText(value: string | null | undefined): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' || text === '---' || text === '—' ? null : text;
}

/**
 * 把一張卡的 `SurrenderView` 攤成十項欄位（null = 灰「—」，见 `SurFieldCell`）。
 *
 * 逐項照抄 web `campaign.html:4917-4960 surFields()`：
 *  - 等級/士氣/疲勞/武力/智力/忠誠 = `int()`（有限數四捨五入）；
 *  - 武器/物品 = `text()`（空串與 `---`/`—` 算沒有）；
 *  - 勝場數 = `rec ? rec.w : null`；
 *  - 敗場數 = `(rec || lossNow) ? (rec ? rec.l : 0) + lossNow : null` —— 面板是「戰後
 *    處置」開的，這一場先現算進去（web `lossNow = surBattleReal ? 1 : 0`），落帳時
 *    `finishOf()` 再把它寫進 `save.generalRecord`（+1 敗）。
 */
export function surFieldCells(view: SurrenderView): SurFieldCell[] {
  const lossNow = view.lossNow === true ? 1 : 0;
  const hasRecord = view.wins !== undefined || view.losses !== undefined;
  return [
    { key: '等級', value: cellNum(view.level) },
    { key: '士氣', value: cellNum(view.morale) },
    { key: '疲勞', value: cellNum(view.tire) },
    { key: '武力', value: cellNum(view.str) },
    { key: '智力', value: cellNum(view.int) },
    { key: '忠誠', value: cellNum(view.loyal) },
    { key: '武器', value: cellText(view.weapon) },
    { key: '物品', value: cellText(view.item) },
    { key: '勝場數', value: cellNum(view.wins) },
    { key: '敗場數', value: hasRecord || lossNow ? cellNum((view.losses ?? 0) + lossNow) : null },
  ];
}

/**
 * 兩欄 grid 的幾何（設計座標，相對卡片左上角）。
 *
 * web 是 `.sgen .fld{grid-template-columns:1fr 1fr;gap:1px 14px;margin-top:6px;
 * font-size:14px;line-height:1.5}`，但 web 的卡比這版高（150 高要塞名字 + 10 欄 +
 * 理由 + 三顆按鈕），所以字從 14 收到 11、行距 16：5 行 = 80 落在 cardY+27..107，
 * 每欄 = 鍵 44 + 值 116（欄位起點 160 / 330，檔位徽標從 500 起，不會撞）。
 */
export const FIELD_LAYOUT = {
  /** 第一行相對 cardY 的偏移 */
  top: 27,
  /** 行距（= 11px × 1.42 的行高，正好不觸發 SHRINK 縮字） */
  rowH: 16,
  keyW: 44,
  valW: 116,
  /** 鍵與值的字號（同 web 的 `.k` / `b` 只差顏色，不差字號） */
  size: 11,
  /** 兩欄的 x（相對設計座標原點） */
  colX: [160, 330] as const,
} as const;

/** `Rect` 用 `view/layout` 的口徑（左上原點設計座標）。 */
export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 面板版式（設計座標）。改這裡就等於改版式；`hits` 與繪製都從這張表算。
 *
 * 750×1334 縱向：彈層 26/96/698×1084 ─ 標題 116–156 ─ 副標 160–198 ─ 翻頁 202–234 ─
 * 卡片 240–1022 ─ 提示 1036–1072 ─ 批量鍵 1080–1138。
 */
export const LAYOUT = {
  screen: { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H },
  sheet: { x: 26, y: 96, w: 698, h: 1084 },
  title: { x: 26, y: 116, w: 698, h: 40 },
  sub: { x: 46, y: 160, w: 658, h: 38 },
  prev: { x: 40, y: 202, w: 120, h: 32 },
  pageNo: { x: 170, y: 202, w: 410, h: 32 },
  next: { x: 590, y: 202, w: 120, h: 32 },
  cards: { x: 40, y: 240, w: 670, h: PER_PAGE * CARD_H + (PER_PAGE - 1) * CARD_GAP },
  msg: { x: 46, y: 1036, w: 658, h: 36 },
  bulk: { x: 40, y: 1080, w: 214, h: 58, gap: 10 },
  finish: { x: 40, y: 1080, w: 670, h: 58 },
} as const;

/** 面板節點名（`show()` 用它做單例查找；headless 也按這個名字數節點）。 */
export const SURRENDER_NODE_NAME = 'SurrenderPanel';

/* ------------------------------------------------------------------------- */
/* 小工具                                                                                                                                      */
/* ------------------------------------------------------------------------- */

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ------------------------------------------------------------------------- */
/* 節點                                                                                                                                        */
/* ------------------------------------------------------------------------- */

interface Hit {
  rect: PanelRect;
  label: string;
  act: () => void;
}

/** `debug()` 的輸出：給 headless 驗證（`work/cocos_surrender/panel_headless.mjs`）與報告用。 */
export interface SurrenderDebug {
  opened: boolean;
  done: boolean;
  /** 全部卡數 */
  cards: number;
  /** 待決張數 */
  left: number;
  pages: number;
  page: number;
  /** 當前頁真的畫出來的卡名（按顺序） */
  visible: string[];
  /** 當前頁可點的按鈕數（灰掉的「招降」不算） */
  buttons: number;
  /** 已決策表（名字 → 處置） */
  picks: Record<string, string>;
  hits: number;
  msg: string;
  sub: string;
  title: string;
  bulkEnabled: boolean;
  canFinish: boolean;
  /** 頭像最後命中的層級（`full/thumb/hero/none`；headless 裡資源不存在所以是 none） */
  portraitVia: string[];
  /**
   * 當前頁每張卡的十項欄位（`鍵 值` 用 ` · ` 拼成一行；拿不到的顯示「—」）。
   * 給 `work/cocos_hud2/hud_assert.mjs` / `work/cocos_surrender/panel_headless.mjs` 斷言用。
   */
  fields: string[];
}

export interface SurrenderPanelOptions {
  /** `CampaignRoot.save`（`GameState.CampaignSave`）；型別上只要求是物件，內部轉規則層的寬鬆型 */
  save: object;
  data: GameData;
  /** 招降入城的城名（web 的 `home`）；不給就用 `save.lastPost.city` → `save.owned[0]` */
  home?: string;
  atCity?: readonly string[];
  mine?: readonly string[];
  king?: string;
  /** 落庫後回呼（`CampaignRoot` 用它 `refresh()` 重畫大地圖；戰報由呼叫方 push） */
  onDone?: ((outcome: SurrenderOutcome) => void) | null;
}

@ccclass('SurrenderPanel')
export class SurrenderPanel extends Component {
  /**
   * 開面板（沒有俘虜就直接返回 `null`，**連節點都不建**）。
   *
   * 這是給 `CampaignRoot` 三行補丁用的入口：`showIfNeeded(node, {save, data, home})`。
   */
  static showIfNeeded(parent: Node, options: SurrenderPanelOptions): SurrenderPanel | null {
    const save = saveOf(options.save);
    const state = openOf(save, options.data, homeOf(save, options.home), {
      atCity: options.atCity,
      mine: options.mine,
      king: options.king,
    });
    if (!state) return null;
    return SurrenderPanel.show(parent, options, state);
  }

  /** 建/復用面板節點並打開。`state` 可外部給（`showIfNeeded` 已經算過一次）。 */
  static show(
    parent: Node,
    options: SurrenderPanelOptions,
    state: SurrenderState | null = null,
  ): SurrenderPanel {
    const node = parent.getChildByName(SURRENDER_NODE_NAME) ?? new Node(SURRENDER_NODE_NAME);
    if (!node.parent) {
      node.layer = Layers.Enum.UI_2D;
      node.parent = parent;
    }
    let panel = node.getComponent(SurrenderPanel);
    if (!panel) panel = node.addComponent(SurrenderPanel);
    panel.onDoneCb = options.onDone ?? null;
    panel.build();
    if (!state) {
      const save = saveOf(options.save);
      state = openOf(save, options.data, homeOf(save, options.home), {
        atCity: options.atCity,
        mine: options.mine,
        king: options.king,
      });
    }
    if (state) panel.open(state);
    // 面板永遠壓在最上層（CampaignRoot 的節點是在 onLoad 建的，這是 start() 才建的）
    const top = node.parent ? node.parent.children.length - 1 : 0;
    if (top >= 0) node.setSiblingIndex(top);
    return panel;
  }

  /* ---- 生命週期 ---- */

  private built = false;
  private opened = false;
  private listening = false;
  private onDoneCb: ((outcome: SurrenderOutcome) => void) | null = null;

  /* ---- 狀態 ---- */

  private state: SurrenderState | null = null;
  private page = 0;
  /** 落庫後留在面板上的提示（`finishOf().text`，逐字取 web 的 `戰 後 處 置完成：…`） */
  private outcomeText = '';
  private hits: Hit[] = [];
  /** 每格頭像當前掛的是誰（避免每幀重載）；`name → via` 記在 `portraitVia` 裡給 debug 用 */
  private portraitFor: string[] = [];
  private portraitVia: string[] = [];

  /* ---- 節點 ---- */

  private g: Graphics | null = null;
  private labelTitle: Label | null = null;
  private labelSub: Label | null = null;
  private labelPrev: Label | null = null;
  private labelPage: Label | null = null;
  private labelNext: Label | null = null;
  private portraits: ArtSprite[] = [];
  private labelsName: Label[] = [];
  private labelsTier: Label[] = [];
  /** 十項欄位的「鍵」與「值」：`labelsFieldKey[i][k]` / `labelsFieldVal[i][k]`，k = 0..9 */
  private labelsFieldKey: Label[][] = [];
  private labelsFieldVal: Label[][] = [];
  private labelsReason: Label[] = [];
  private labelsPick: Label[] = [];
  private labelsBtn: Label[][] = [];
  private labelMsg: Label | null = null;
  private labelsBulk: Label[] = [];
  private labelFinish: Label | null = null;

  constructor() {
    super();
    for (let i = 0; i < PER_PAGE; i += 1) {
      this.portraitFor.push('');
      this.portraitVia.push('none');
    }
  }

  /* ----------------------------------------------------------------------- */
  /* 對外 API                                                                */
  /* ----------------------------------------------------------------------- */

  get isOpen(): boolean {
    return this.opened;
  }

  /** 建節點樹（冪等）。由 `show()` 呼叫；測試裡也可以直接叫。 */
  build(): void {
    if (this.built) return;
    this.built = true;

    const root = this.node;
    root.layer = Layers.Enum.UI_2D;
    const transform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(DESIGN_W, DESIGN_H);

    // 蒙版：整屏壓暗（web 的 `.sheet-scrim`）
    const veil = new Node('SurVeil');
    veil.layer = Layers.Enum.UI_2D;
    veil.parent = root;
    const veilBox = veil.addComponent(UITransform);
    veilBox.setAnchorPoint(0.5, 0.5);
    veilBox.setContentSize(DESIGN_W, DESIGN_H);
    const veilG = veil.addComponent(Graphics);
    veilG.fillColor = new Color(6, 8, 12, 214);
    veilG.rect(-HALF_W, -HALF_H, DESIGN_W, DESIGN_H);
    veilG.fill();

    this.g = this.makeGraphics('SurFrame');

    this.labelTitle = this.makeLabel('SurTitle', PANEL_TITLE_TEXT, LAYOUT.title, 28, COLORS.goldLight, 'center');
    addOutline(this.labelTitle, new Color(6, 8, 12, 220), 1);
    this.labelSub = this.makeLabel('SurSub', '', LAYOUT.sub, 15, COLORS.textDim, 'center', Label.Overflow.SHRINK);
    this.labelSub.lineHeight = 19;
    this.labelPrev = this.makeLabel('SurPrev', '◀ 上頁', LAYOUT.prev, 14, COLORS.textDim, 'center');
    this.labelPage = this.makeLabel('SurPage', '', LAYOUT.pageNo, 13, COLORS.textDim, 'center');
    this.labelNext = this.makeLabel('SurNext', '下頁 ▶', LAYOUT.next, 14, COLORS.textDim, 'center');

    for (let i = 0; i < PER_PAGE; i += 1) {
      const cardY = LAYOUT.cards.y + i * (CARD_H + CARD_GAP);
      this.portraits.push(new ArtSprite(root, `SurPortrait${i}`, this.portraitRect(cardY), 'contain'));
      // 名（一行，20px）+ 檔位徽標 + 十項欄位（兩欄 5 行）+ 理由（10px 一行）+ 按鈕。
      // web 的卡更高（`.nm` / `.fld` / `.rs` 三層自然排開），150 高的卡只能把字收小：
      // name 3..32、欄位 27..107、理由 106..120、按鈕 120..148（逐段見 FIELD_LAYOUT 註釋）。
      this.labelsName.push(this.makeLabel(`SurName${i}`, '', { x: 160, y: cardY + 3, w: 330, h: 29 }, 20, COLORS.text, 'left'));
      this.labelsTier.push(this.makeLabel(`SurTier${i}`, '', this.tierRect(cardY), 15, COLORS.goldLight, 'center'));
      const keyRow: Label[] = [];
      const valRow: Label[] = [];
      for (let k = 0; k < SUR_FIELD_KEYS.length; k += 1) {
        // CSS grid 是**按行**填充：k=0 在左欄第一行、k=1 在右欄第一行、k=2 回到左欄第二行…
        const col = k % 2;
        const row = (k - col) / 2;
        const y = cardY + FIELD_LAYOUT.top + row * FIELD_LAYOUT.rowH;
        const x = FIELD_LAYOUT.colX[col]!;
        keyRow.push(
          this.makeLabel(
            `SurFieldK${i}_${k}`,
            SUR_FIELD_KEYS[k]!,
            { x, y, w: FIELD_LAYOUT.keyW, h: FIELD_LAYOUT.rowH },
            FIELD_LAYOUT.size,
            COLORS.textDim,
            'left',
          ),
        );
        valRow.push(
          this.makeLabel(
            `SurFieldV${i}_${k}`,
            '',
            { x: x + FIELD_LAYOUT.keyW, y, w: FIELD_LAYOUT.valW, h: FIELD_LAYOUT.rowH },
            FIELD_LAYOUT.size,
            COLORS.text,
            'left',
          ),
        );
      }
      this.labelsFieldKey.push(keyRow);
      this.labelsFieldVal.push(valRow);
      this.labelsReason.push(
        this.makeLabel(`SurReason${i}`, '', { x: 160, y: cardY + 106, w: 480, h: 14 }, 10, COLORS.textFaint, 'left', Label.Overflow.SHRINK),
      );
      this.labelsReason[this.labelsReason.length - 1].lineHeight = 17;
      this.labelsPick.push(this.makeLabel(`SurPick${i}`, '', this.pickRect(cardY), 17, COLORS.goldLight, 'center'));
      const row: Label[] = [];
      for (let a = 0; a < 3; a += 1) {
        row.push(this.makeLabel(`SurBtn${i}_${a}`, '', this.btnRect(cardY, a), 17, COLORS.text, 'center'));
      }
      this.labelsBtn.push(row);
    }

    this.labelMsg = this.makeLabel('SurMsg', '', LAYOUT.msg, 15, COLORS.textDim, 'center', Label.Overflow.SHRINK);
    this.labelMsg.lineHeight = 20;
    for (let i = 0; i < 3; i += 1) {
      this.labelsBulk.push(this.makeLabel(`SurBulk${i}`, '', this.bulkRect(i), 17, COLORS.text, 'center'));
    }
    this.labelFinish = this.makeLabel('SurFinish', '完 成', LAYOUT.finish, 21, COLORS.goldLight, 'center');
    addOutline(this.labelFinish, new Color(6, 8, 12, 220), 1);

    this.node.active = false;
  }

  /** 開面板（`state` 由 `SurrenderModel.openOf()` 建好）。 */
  open(state: SurrenderState): void {
    if (!this.built) this.build();
    this.state = state;
    this.page = 0;
    for (let i = 0; i < PER_PAGE; i += 1) {
      this.portraitFor[i] = '';
      this.portraitVia[i] = 'none';
    }
    this.opened = true;
    this.node.active = true;
    if (!this.listening) {
      input.on(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = true;
    }
    this.refresh();
  }

  /** 關（節點保留，下次 `show()` 直接複用）。 */
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.node.active = false;
    if (this.listening) {
      input.off(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = false;
    }
  }

  /** 給 headless / 報告用的狀態快照。 */
  debug(): SurrenderDebug {
    const state = this.state;
    const views = state ? this.pageViews() : [];
    let buttons = 0;
    for (const view of views) {
      for (const btn of view.buttons) if (btn.enabled) buttons += 1;
      if (!view.done && view.isKing) buttons += 0; // 君主不給按鈕
    }
    return {
      opened: this.opened,
      done: !!state?.done,
      cards: state ? state.cards.length : 0,
      left: state ? leftOf(state) : 0,
      pages: state ? this.pageCount() : 0,
      page: this.page,
      visible: views.map((v) => v.name),
      buttons,
      picks: state ? { ...state.picks } : {},
      hits: this.hits.length,
      msg: this.labelMsg ? this.labelMsg.string : '',
      sub: this.labelSub ? this.labelSub.string : '',
      title: this.labelTitle ? this.labelTitle.string : '',
      bulkEnabled: !!state && bulkEnabled(state),
      canFinish: !!state?.done,
      portraitVia: this.portraitVia.slice(),
      fields: views.map((view) => surFieldCells(view).map((cell) => `${cell.key} ${cell.value ?? '—'}`).join(' · ')),
    };
  }

  /** 供 headless 驗證呼叫：模擬一次點擊（設計座標，左上原點）。 */
  tap(x: number, y: number): boolean {
    for (const hit of this.hits) {
      const rect = hit.rect;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        hit.act();
        return true;
      }
    }
    return false;
  }

  /** 命中矩形（設計座標），headless 用它斷言「三顆按鈕各畫出來了」。 */
  get hitList(): ReadonlyArray<{ rect: PanelRect; label: string }> {
    return this.hits.map((hit) => ({ rect: hit.rect, label: hit.label }));
  }

  /* ----------------------------------------------------------------------- */
  /* 繪製                                                                    */
  /* ----------------------------------------------------------------------- */

  private pageCount(): number {
    const n = this.state ? this.state.cards.length : 0;
    return Math.max(1, Math.ceil(n / PER_PAGE));
  }

  private pageViews(): SurrenderView[] {
    const state = this.state;
    if (!state) return [];
    const all = viewsOf(state);
    const start = this.page * PER_PAGE;
    const out: SurrenderView[] = [];
    for (let i = start; i < start + PER_PAGE && i < all.length; i += 1) out.push(all[i]);
    return out;
  }

  private refresh(): void {
    const state = this.state;
    if (!state) return;
    const pages = this.pageCount();
    if (this.page >= pages) this.page = pages - 1;
    if (this.page < 0) this.page = 0;

    this.hits = [];
    const views = this.pageViews();
    const g = this.g;

    if (g) {
      g.clear();
      // 彈層底板 + 細描邊
      this.fillRect(g, LAYOUT.sheet, '#11151B', 250);
      this.strokeRect(g, LAYOUT.sheet, COLORS.goldDim, 210, 2);
      // 標題下的分隔線
      this.hline(g, 158, 46, 658, COLORS.line, 255);
      this.hline(g, 199, 46, 658, COLORS.line, 180);
      this.hline(g, 1028, 46, 658, COLORS.line, 180);
    }

    this.labelTitle!.string = PANEL_TITLE_TEXT;
    this.labelSub!.string = subText(state);
    this.labelPage!.string = `第 ${this.page + 1} / ${pages} 頁`;
    const multi = pages > 1;
    this.labelPrev!.node.active = multi;
    this.labelNext!.node.active = multi;
    this.labelPage!.node.active = multi;
    if (multi) {
      this.labelPrev!.color = rgba(this.page > 0 ? COLORS.textDim : COLORS.textFaint);
      this.labelNext!.color = rgba(this.page < pages - 1 ? COLORS.textDim : COLORS.textFaint);
      if (this.page > 0) this.addHit('prev', LAYOUT.prev, () => this.flip(-1));
      if (this.page < pages - 1) this.addHit('next', LAYOUT.next, () => this.flip(1));
    }

    // 逐卡
    for (let i = 0; i < PER_PAGE; i += 1) {
      const view: SurrenderView | undefined = views[i];
      const cardY = LAYOUT.cards.y + i * (CARD_H + CARD_GAP);
      const nodes: Node[] = [
        this.portraits[i].node,
        this.labelsName[i].node,
        this.labelsTier[i].node,
        ...this.labelsFieldKey[i].map((label) => label.node),
        ...this.labelsFieldVal[i].map((label) => label.node),
        this.labelsReason[i].node,
        this.labelsPick[i].node,
      ];
      const btnNodes = this.labelsBtn[i].map((label) => label.node);
      if (!view) {
        for (const node of nodes) node.active = false;
        for (const node of btnNodes) node.active = false;
        continue;
      }
      for (const node of nodes) node.active = true;
      this.paintCard(i, view, cardY);
    }

    // 底部提示 + 批量鍵 / 完成
    this.labelMsg!.string = state.done ? (this.outcomeText || footText(state)) : footText(state);
    this.labelMsg!.color = rgba(state.done ? COLORS.goldLight : COLORS.textDim);
    const bulk = bulkEnabled(state);
    for (let i = 0; i < 3; i += 1) {
      const mode = BULK_OF[i];
      this.labelsBulk[i].node.active = !state.done;
      this.labelsBulk[i].string = BULK_TEXT[mode];
      this.labelsBulk[i].color = rgba(bulk ? COLORS.text : COLORS.textFaint);
      if (bulk) this.addHit(`bulk:${mode}`, this.bulkRect(i), () => this.onBulk(mode));
    }
    this.labelFinish!.node.active = state.done;
    if (state.done) this.addHit('finish', LAYOUT.finish, () => this.close());

    if (g) this.paintChrome(g, state);
  }

  private paintCard(index: number, view: SurrenderView, cardY: number): void {
    const g = this.g;
    const cardRect: PanelRect = { x: LAYOUT.cards.x, y: cardY, w: LAYOUT.cards.w, h: CARD_H };
    const done = view.done;
    if (g) {
      this.fillRect(g, cardRect, done ? '#0E1218' : '#171C24', 255);
      const edge = view.cls === 'king' ? COLORS.textFaint : view.cls === 'must' ? COLORS.ok : view.cls === 'roll' ? COLORS.gold : COLORS.enemy;
      this.strokeRect(g, cardRect, done ? COLORS.line : edge, done ? 180 : 235, 1);
      // 檔位徽標底
      this.fillRect(g, this.tierRect(cardY), done ? '#161A20' : '#0F1520', 235);
      this.strokeRect(g, this.tierRect(cardY), done ? COLORS.line : edge, 200, 1);
      // 頭像底（圖沒到也能看出「這裡是頭像」）
      this.fillRect(g, this.portraitRect(cardY), '#0C1016', 255);
      this.strokeRect(g, this.portraitRect(cardY), COLORS.line, 160, 1);
      // 按鈕底
      if (view.done) {
        this.fillRect(g, this.pickRect(cardY), '#141A22', 255);
        this.strokeRect(g, this.pickRect(cardY), COLORS.goldDim, 200, 1);
      } else if (view.isKing) {
        this.fillRect(g, this.pickRect(cardY), '#141A22', 255);
        this.strokeRect(g, this.pickRect(cardY), COLORS.textFaint, 200, 1);
      } else {
        for (let a = 0; a < view.buttons.length; a += 1) {
          const btn = view.buttons[a];
          const rect = this.btnRect(cardY, a);
          this.fillRect(g, rect, btn.enabled ? '#1B2330' : '#12161C', 255);
          this.strokeRect(g, rect, btn.enabled ? (btn.act === 'recruit' ? COLORS.ok : btn.act === 'kill' ? COLORS.enemy : COLORS.gold) : COLORS.line, btn.enabled ? 220 : 140, 1);
        }
      }
    }

    // 頭像（Portrait.ts 五級回落：face/full → face/thumb → hero → hero(encoded) → 隱藏）
    if (this.portraitFor[index] !== view.name) {
      this.portraitFor[index] = view.name;
      this.portraitVia[index] = 'none';
      const slot = index;
      loadPortrait(
        this.portraits[slot],
        view.name,
        'full',
        loadFrame,
        (result) => {
          this.portraitVia[slot] = result.via;
        },
        true,
      );
    }

    this.labelsName[index].string = view.name;
    this.labelsTier[index].string = view.tierText;
    this.labelsTier[index].color = rgba(
      view.cls === 'king' ? COLORS.textFaint : view.cls === 'must' ? COLORS.ok : view.cls === 'roll' ? COLORS.gold : COLORS.enemy,
    );
    // 十項欄位：值為 null（這個端拿不到）→ 灰「—」，值有數 → 正常字色（web `.k` / `b` / `b.none` 三色）
    const cells = surFieldCells(view);
    for (let k = 0; k < cells.length; k += 1) {
      const cell = cells[k]!;
      const keyLabel = this.labelsFieldKey[index]![k]!;
      keyLabel.string = cell.key;
      keyLabel.color = rgba(COLORS.textDim);
      const valLabel = this.labelsFieldVal[index]![k]!;
      valLabel.string = cell.value ?? '—';
      valLabel.color = rgba(cell.value === null ? COLORS.textFaint : COLORS.text);
    }
    this.labelsReason[index].string = view.reason;
    this.labelsReason[index].color = rgba(view.recruitable ? COLORS.textDim : COLORS.textFaint);

    const picked = view.done || view.isKing;
    this.labelsPick[index].node.active = picked;
    if (picked) {
      this.labelsPick[index].string = view.done ? view.pickText : KING_CHIP;
      this.labelsPick[index].color = rgba(view.done ? COLORS.goldLight : COLORS.textFaint);
    }

    const row = this.labelsBtn[index];
    for (let a = 0; a < row.length; a += 1) {
      const btn = view.buttons[a];
      const label = row[a];
      const rect = this.btnRect(cardY, a);
      if (!btn) {
        label.node.active = false;
        continue;
      }
      label.node.active = true;
      label.string = btn.text;
      label.color = rgba(btn.enabled ? COLORS.text : COLORS.textFaint);
      if (btn.enabled) this.addHit(`card:${index}:${btn.act}`, rect, () => this.onDecide(index, btn.act));
    }
  }

  /** 章節框（標題/副標/翻頁/底部按鈕的底與邊）。 */
  private paintChrome(g: Graphics, state: SurrenderState): void {
    const done = state.done;
    if (!done) {
      for (let i = 0; i < 3; i += 1) {
        const rect = this.bulkRect(i);
        const on = bulkEnabled(state);
        this.fillRect(g, rect, on ? '#1B2330' : '#12161C', 255);
        this.strokeRect(g, rect, on ? (i === 0 ? COLORS.ok : i === 1 ? COLORS.enemy : COLORS.gold) : COLORS.line, on ? 220 : 140, 1);
      }
    } else {
      this.fillRect(g, LAYOUT.finish, '#1B2330', 255);
      this.strokeRect(g, LAYOUT.finish, COLORS.gold, 235, 2);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* 操作                                                                    */
  /* ----------------------------------------------------------------------- */

  private flip(delta: number): void {
    const pages = this.pageCount();
    const next = this.page + delta;
    if (next < 0 || next >= pages) return;
    this.page = next;
    this.refresh();
  }

  private onDecide(index: number, act: CardAction): void {
    const state = this.state;
    if (!state) return;
    const view = this.pageViews()[index];
    if (!view) return;
    if (!decideOf(state, view.name, act)) return;
    if (allPicked(state)) {
      this.finish();
      return;
    }
    this.refresh();
  }

  private onBulk(mode: BulkMode): void {
    const state = this.state;
    if (!state) return;
    bulkOf(mode, state);
    this.finish();
  }

  /** 落庫：`applySurrender` + `save.lastPost` + 存檔 + 提示（web `finishSurrender()`）。 */
  private finish(): void {
    const state = this.state;
    if (!state) return;
    const outcome = finishOf(state);
    if (!outcome) return;
    this.outcomeText = outcome.text;
    try {
      // web 對應 `autosave()`：決策必須落盤，否則退回大地圖就丟了
      GameState.persistSave();
    } catch (err) {
      console.warn(`[SurrenderPanel] 存檔失敗（決策仍在記憶體）：${message(err)}`);
    }
    this.page = 0;
    this.refresh();
    const cb = this.onDoneCb;
    if (cb) cb(outcome);
  }

  /* ----------------------------------------------------------------------- */
  /* 觸控                                                                    */
  /* ----------------------------------------------------------------------- */

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    this.tap(local.x + HALF_W, HALF_H - local.y);
  }

  /* ----------------------------------------------------------------------- */
  /* 幾何 / 建節點                                                           */
  /* ----------------------------------------------------------------------- */

  private portraitRect(cardY: number): PanelRect {
    return { x: LAYOUT.cards.x + 12, y: cardY + 12, w: 94, h: 126 };
  }

  private tierRect(cardY: number): PanelRect {
    return { x: 500, y: cardY + 12, w: 110, h: 26 };
  }

  /** 十項欄位佔掉 cardY+27..107，理由與按鈕只能壓在下面 41px 裡（見 `FIELD_LAYOUT`）。 */
  private pickRect(cardY: number): PanelRect {
    return { x: 160, y: cardY + 120, w: 210, h: 28 };
  }

  private btnRect(cardY: number, index: number): PanelRect {
    const w = 150;
    const gap = 8;
    return { x: 160 + index * (w + gap), y: cardY + 120, w, h: 28 };
  }

  private bulkRect(index: number): PanelRect {
    const { x, y, w, h, gap } = LAYOUT.bulk;
    return { x: x + index * (w + gap), y, w, h };
  }

  private centerOf(rect: PanelRect): { x: number; y: number } {
    return { x: rect.x + rect.w / 2 - HALF_W, y: HALF_H - (rect.y + rect.h / 2) };
  }

  private makeGraphics(name: string): Graphics {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    return node.addComponent(Graphics);
  }

  private makeLabel(
    name: string,
    text: string,
    rect: PanelRect,
    fontSize: number,
    color: string,
    align: 'left' | 'center' | 'right',
    overflow: number = Label.Overflow.NONE,
  ): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    const transform = node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(Math.max(1, rect.w), Math.max(1, rect.h));
    const p = this.centerOf(rect);
    node.setPosition(p.x, p.y, 0);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.42);
    label.color = rgba(color);
    label.horizontalAlign =
      align === 'left' ? Label.HorizontalAlign.LEFT : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = overflow;
    if (overflow === Label.Overflow.NONE && align !== 'center') label.overflow = Label.Overflow.SHRINK;
    return label;
  }

  private fillRect(g: Graphics, rect: PanelRect, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.fill();
  }

  private strokeRect(g: Graphics, rect: PanelRect, color: string, alpha = 255, width = 1): void {
    g.strokeColor = rgba(color, alpha);
    g.lineWidth = width;
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.stroke();
  }

  private hline(g: Graphics, y: number, x: number, w: number, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(x - HALF_W, HALF_H - y, w, 1);
    g.fill();
  }

  private addHit(label: string, rect: PanelRect, act: () => void): void {
    this.hits.push({ rect, label, act });
  }
}

/* ------------------------------------------------------------------------- */
/* 模組級常數 / 小工具                                                        */
/* ------------------------------------------------------------------------- */

/** 批量鍵的順序（左→右：招降 / 斬首 / 釋放，與 web `#surAllRecruit…` 一致）。 */
const BULK_OF: BulkMode[] = ['recruit', 'kill', 'release'];

function allPicked(state: SurrenderState): boolean {
  for (const card of state.cards) if (!state.picks[card.name]) return false;
  return state.cards.length > 0;
}

/**
 * 招降入城的城名：`opts.home` → `save.lastPost.city` → `save.owned[0]`。
 *
 * `CampaignRoot` 沒有「剛打完的那座城」的公開欄位（守城戰在 Deploy 場景結算，
 * 只留下 `recordBattleResult()` 改過的 `owned`），所以這裡按 web 的兜底順序退：
 * 先看上一場招降記錄（`lastPost.city`），再看第一座我方城。
 */
function homeOf(save: object, given?: string): string {
  if (given) return String(given);
  const box = save as unknown as Record<string, unknown>;
  const lastPost = box.lastPost;
  if (lastPost && typeof lastPost === 'object') {
    const city = String((lastPost as Record<string, unknown>).city ?? '');
    if (city) return city;
  }
  const owned = box.owned;
  if (Array.isArray(owned) && owned.length) return String(owned[0] ?? '');
  return '';
}


