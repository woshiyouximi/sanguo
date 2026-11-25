/**
 * 標題頁（開局第一個畫面）：標題 + `開始新局` / `讀取存檔` / `說明`。
 *
 * 掛在 `Boot` 場景的 Canvas 下（**不新建 .scene**），`BootRoot` 載完資料後呼叫
 * `TitlePanel.show(canvasNode, options)`；節點用完 `destroy()`。
 *
 * 三個子頁面共用一個面板：
 *   title → 標題 + 三顆按鈕
 *   saves → `SaveSlots.ts` 的 10 個槽（`slotLines` 摘要；點一行 `loadFromSlot` + `setActiveSlot`）
 *   help  → 一屏說明（豎屏 / 60Hz / 玩法來源 / 存檔）
 *
 * 版式：750×1334、左上原點；頁頭 0–124、按鈕區底邊 1248（= 1334 − 86）。
 * 四級字號：title 40 / head 22 / body 18 / num 20（`FONT_*` 常量）。
 *
 * 降級：`UiSkin` 的九宮圖載不到時自己畫 Graphics 描邊（`makePanel/makeBtn` 已內建）；
 * `localStorage` 空/壞 → 10 行空槽照畫、點空槽只出提示，不崩。
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
import { addOutline } from './ArtLayer';
import { filledCount, loadFromSlot, readIndex, setActiveSlot, slotLines, slotRecord, SLOT_COUNT, type SlotRecord } from './SaveSlots';
import { matchScenarioIndex, scenarioCards } from './SelectModel';
import { markFreshStart, setRunSelection } from './RunSetup';
import { makeBtn, makeNineSlice, makePanel, placeDesign } from './UiSkin';
import type { GameData } from './types';
import { DESIGN_H, DESIGN_W } from './view/layout';
import { COLORS, FONT_FAMILY } from './view/theme';

const { ccclass } = _decorator;

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/** 四級字號（r88 已鎖；不要從 `theme.FONT` 借，兩套口徑不同） */
const FONT_TITLE = 40;
const FONT_HEAD = 22;
const FONT_BODY = 18;
const FONT_NUM = 20;

/** 頁頭 / 按鈕區（設計座標，左上原點） */
const HEADER_H = 124;
const FOOT_BOTTOM = DESIGN_H - 86; // 1248
const BTN_X = 115;
const BTN_W = 520;
const BTN_H = 88;
const BTN_Y = [944, 1052, 1160];
const BACK = { x: 40, y: FOOT_BOTTOM - 64, w: 220, h: 64 };
const FOOT_HINT = { x: 280, y: FOOT_BOTTOM - 52, w: 430, h: 40 };

/** 存檔列表 */
const LIST_X = 40;
const LIST_W = 670;
const LIST_TOP = 140;
const ROW_H = 80;
const ROW_GAP = 6;

/** 面板子頁 */
export type TitlePage = 'title' | 'saves' | 'help';

/** 標題頁選項 */
export interface TitleOptions {
  data: GameData;
  /** `開始新局` → 劇本選擇 */
  onNewGame: () => void;
  /** 讀檔成功（`loadFromSlot` ok）→ 進大地圖 */
  onEnterCampaign: () => void;
}

interface TitleHit {
  x: number;
  y: number;
  w: number;
  h: number;
  act: 'new' | 'saves' | 'help' | 'back' | 'slot';
  slot: number;
}

/** headless / 報告用的狀態快照 */
export interface TitleDebug {
  opened: boolean;
  page: TitlePage;
  title: string;
  sub: string;
  buttons: number;
  rows: number;
  msg: string;
  labels: string[];
  activeSlot: number;
}

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

@ccclass('TitlePanel')
export class TitlePanel extends Component {
  /** 建立並掛上面板（`parent` 建議是 Canvas；節點名固定 `TitlePanel`） */
  static show(parent: Node, options: TitleOptions): TitlePanel {
    const node = new Node('TitlePanel');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    node.setPosition(0, 0, 0);
    node.parent = parent;
    const panel = node.getComponent(TitlePanel) ?? node.addComponent(TitlePanel);
    panel.init(options);
    return panel;
  }

  private options: TitleOptions | null = null;
  private page: TitlePage = 'title';
  private opened = false;
  private listening = false;
  private msg = '';
  private hits: TitleHit[] = [];
  private titleText = '';
  private subText = '';

  /** 外殼初始化；重複呼叫只會重建畫面 */
  init(options: TitleOptions): void {
    this.options = options;
    this.page = 'title';
    this.msg = '';
    this.opened = true;
    this.build();
    if (!this.listening) {
      input.on(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = true;
    }
  }

  /** 關閉並移除節點（Boot 換面板時呼叫） */
  close(): void {
    this.opened = false;
    if (this.listening) {
      input.off(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = false;
    }
    if (this.node.parent) this.node.parent.removeChild(this.node);
    this.node.destroy();
  }

  onDestroy(): void {
    if (this.listening) {
      input.off(Input.EventType.TOUCH_END, this.onTouch, this);
      this.listening = false;
    }
    this.opened = false;
  }

  /* ------------------------------------------------------------------ */
  /* 觸控                                                               */
  /* ------------------------------------------------------------------ */

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    const transform = this.node.getComponent(UITransform);
    if (!transform) return;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    this.tap(local.x + HALF_W, HALF_H - local.y);
  }

  /** 供 headless 驗證呼叫：設計座標（左上原點）點一下 */
  tap(designX: number, designY: number): void {
    if (!this.opened) return;
    for (let i = this.hits.length - 1; i >= 0; i -= 1) {
      const hit = this.hits[i];
      if (designX >= hit.x && designX <= hit.x + hit.w && designY >= hit.y && designY <= hit.y + hit.h) {
        this.act(hit);
        return;
      }
    }
  }

  private act(hit: TitleHit): void {
    if (hit.act === 'new') {
      // 打「開新局」旗標：同劇本同君主再點一次也要重開（r86 的 P5），由
      // `GameState.initCampaign({fresh})` 消費；這一步失敗也只是沿用舊進度，不影響流程。
      markFreshStart();
      this.options?.onNewGame();
      return;
    }
    if (hit.act === 'saves') {
      this.page = 'saves';
      this.msg = '';
      this.build();
      return;
    }
    if (hit.act === 'help') {
      this.page = 'help';
      this.msg = '';
      this.build();
      return;
    }
    if (hit.act === 'back') {
      this.page = 'title';
      this.msg = '';
      this.build();
      return;
    }
    this.loadSlot(hit.slot);
  }

  /** 點槽位列：空槽只提示；有檔就 `loadFromSlot` + `setActiveSlot` + 進大地圖 */
  private loadSlot(slot: number): void {
    const index = readIndex();
    const record = slotRecord(index, slot);
    if (!record) {
      this.flash(`槽 ${slot} 是空的 · 先按「開始新局」`);
      return;
    }
    const result = loadFromSlot(slot);
    if (!result.ok) {
      this.flash(`槽 ${slot} 讀取失敗：${result.reason}`);
      return;
    }
    setActiveSlot(slot);
    const meta = result.meta;
    const data = this.options ? this.options.data : null;
    const scenarioAt = matchScenarioIndex(data, meta ? meta.scenario : '');
    setRunSelection(scenarioAt >= 0 ? scenarioAt : 0, meta ? meta.monarch : '');
    this.msg = `已讀取槽 ${slot}${meta ? ` · ${meta.monthText}` : ''}`;
    this.options?.onEnterCampaign();
  }

  private flash(text: string): void {
    this.msg = text;
    this.build();
  }

  /* ------------------------------------------------------------------ */
  /* 重畫                                                               */
  /* ------------------------------------------------------------------ */

  private build(): void {
    this.clear();
    this.hits = [];
    this.titleText = '';
    this.subText = '';
    this.drawBackground();
    if (this.page === 'saves') this.buildSaves();
    else if (this.page === 'help') this.buildHelp();
    else this.buildTitle();
    this.drawFooterMessage();
  }

  private clear(): void {
    for (const child of [...this.node.children]) {
      child.parent = null;
      child.destroy();
    }
  }

  private drawBackground(): void {
    const node = new Node('TitleBg');
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(COLORS.bg);
    g.rect(-HALF_W, -HALF_H, DESIGN_W, DESIGN_H);
    g.fill();
    // 頁頭底線 / 底部安全線（與 r88 頁頭 0–124、按鈕區距底 86 同口徑）
    g.strokeColor = rgba(COLORS.goldDim, 120);
    g.lineWidth = 1;
    g.moveTo(-HALF_W, HALF_H - HEADER_H);
    g.lineTo(HALF_W, HALF_H - HEADER_H);
    g.moveTo(-HALF_W, -HALF_H + 86);
    g.lineTo(HALF_W, -HALF_H + 86);
    g.stroke();
  }

  /* ---------------------------- 標題頁 ------------------------------ */

  private buildTitle(): void {
    const cards = scenarioCards(this.options ? this.options.data : null);
    const years = cards.map((card) => card.year);
    const firstYear = years.length ? Math.min(...years) : 184;
    const lastYear = years.length ? Math.max(...years) : 219;
    const maxForces = cards.reduce((max, card) => Math.max(max, card.forceCount), 0);
    const cityCount = cards.length ? cards[0].cityCount : 60;

    this.header('三國群英傳 2 · 豎版', `${firstYear} — ${lastYear} · 5 套劇本 · 直屏 750×1334`);

    const panel = makePanel(this.node, 'frame_panel', 630, 300, { fillAlpha: 150 });
    panel.name = 'TitleEmblem';
    placeDesign(panel, 60, 180, 630, 300);

    const divider = makeNineSlice(panel, 'bar_div', 420, 12);
    divider.setPosition(0, 74, 0);

    const hero = this.labelOn(panel, 'TitleHero', '群 雄 逐 鹿', 0, 26, 560, 56, FONT_TITLE, COLORS.goldLight, 'center');
    addOutline(hero, new Color(6, 8, 12, 220), 1);
    this.labelOn(panel, 'TitleTag', '擇 一 劇 本 · 擇 一 君 主 · 定 一 方 天 下', 0, -38, 600, 32, FONT_HEAD, COLORS.text, 'center');
    this.labelOn(panel, 'TitleMeta', `5 套劇本 · 最多 ${maxForces || 19} 路勢力 · ${cityCount || 60} 座城`, 0, -86, 600, 28, FONT_BODY, COLORS.textDim, 'center');

    // x 是设计坐标左边界（不是中心）：750 宽里 700 宽的文本要居中，左边界必须是 25。
    // 旧值 375 会让文本从屏幕中线开始、右侧被裁掉（r90 截图可见）。
    this.label('TitleLead', '擇劇本 · 選君主 · 入大地圖', 25, 508, 700, 32, FONT_BODY, COLORS.textDim, 'center');
    this.label('TitleHint', '每月：內政 → 出征 → 結算；戰鬥 60Hz 邏輯', 25, 544, 700, 32, FONT_BODY, COLORS.textFaint, 'center');

    // 中段資訊卡（r90 起）：填掉 590–940 之間的空黑，並把「資料來源 / 操作 / 存檔 / 聲明」講清楚。
    const info = makePanel(this.node, 'frame_panel', 630, 300, { fillAlpha: 130 });
    info.name = 'TitleInfo';
    placeDesign(info, 60, 606, 630, 300);
    const rows: [string, string][] = [
      ['資 料', '劇本 5 · 城池 60 · 武將 401 · 法術 110（原作 INI 轉出）'],
      ['操 作', '點城選中 → 底部按鈕；己城開內政，敵城可出征'],
      ['存 檔', '10 槽 · 與網頁版互通（sanguo_*_v1）'],
      ['聲 明', '研究／移植用途，素材與數值版權歸原權利人'],
    ];
    for (let i = 0; i < rows.length; i += 1) {
      const y = 100 - i * 58;
      // `cx` 是 Label 框的**中心**（anchor 0.5）：面板 60..690、中心 375。
      // key 中心 -265（=110，框 68..152，留 8px 内边距）；value 中心 65（=440，框 210..670），
      // 两个框之间留 58px，不再出现「資 料劇本 5」黏在一起（r86 的 P6）。
      this.labelOn(info, `InfoKey_${i}`, rows[i][0], -265, y, 84, 28, FONT_BODY, COLORS.goldLight, 'left');
      const line = this.labelOn(info, `InfoVal_${i}`, rows[i][1], 65, y, 460, 28, FONT_BODY, i === 3 ? COLORS.textFaint : COLORS.textDim, 'left');
      line.overflow = Label.Overflow.SHRINK;
    }

    const buttons = ['開 始 新 局', '讀 取 存 檔', '說 明'];
    const acts: TitleHit['act'][] = ['new', 'saves', 'help'];
    for (let i = 0; i < buttons.length; i += 1) {
      this.button(`Btn_${buttons[i].replace(/ /g, '')}`, buttons[i], { x: BTN_X, y: BTN_Y[i], w: BTN_W, h: BTN_H }, acts[i], i === 0);
    }
  }

  /* ---------------------------- 存檔頁 ------------------------------ */

  private buildSaves(): void {
    const index = readIndex();
    this.header('讀 取 存 檔', `共 ${SLOT_COUNT} 槽 · 已用 ${filledCount(index)} · 點一行載入`);
    this.hint(`目前使用中：槽 ${index.active}`, FOOT_HINT);

    for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
      const record: SlotRecord | null = slotRecord(index, slot);
      const lines = slotLines(record, slot, index.active);
      const y = LIST_TOP + (slot - 1) * (ROW_H + ROW_GAP);
      const row = makePanel(this.node, record ? 'frame_panel' : 'slot_off', LIST_W, ROW_H, {
        fill: true,
        fillAlpha: record ? 150 : 90,
      });
      row.name = `SaveRow_${slot}`;
      placeDesign(row, LIST_X, y, LIST_W, ROW_H);

      const l1 = this.labelOn(row, `SaveRow_${slot}_L1`, lines.l1, 0, 20, LIST_W - 28, 26, FONT_NUM, record ? COLORS.goldLight : COLORS.textFaint, 'left');
      l1.overflow = Label.Overflow.SHRINK;
      this.labelOn(row, `SaveRow_${slot}_L2`, lines.l2, -130, -12, 384, 24, FONT_BODY, record ? COLORS.textDim : COLORS.textFaint, 'left');
      this.labelOn(row, `SaveRow_${slot}_L3`, lines.l3, 190, -12, 260, 24, FONT_BODY, COLORS.textDim, 'right');

      this.hits.push({ x: LIST_X, y, w: LIST_W, h: ROW_H, act: 'slot', slot });
    }

    this.button('Btn_返回', '返 回', BACK, 'back', false);
  }

  /* ---------------------------- 說明頁 ------------------------------ */

  private buildHelp(): void {
    this.header('說 明', '豎版重製 · 操作與資料來源');
    const panel = makePanel(this.node, 'frame_panel', 670, 880, { fillAlpha: 150 });
    panel.name = 'HelpBody';
    placeDesign(panel, 40, 150, 670, 880);

    const lines: [string, number, string][] = [
      ['【畫面】', FONT_HEAD, COLORS.goldLight],
      ['750 × 1334 直屏，左上原點；頁頭 0–124、按鈕區底邊 1248（距底 86）。', FONT_BODY, COLORS.text],
      ['所有面板共用 26 張九宮圖元；圖沒載到就畫 Graphics 描邊，不會白屏。', FONT_BODY, COLORS.textDim],
      ['【節奏】', FONT_HEAD, COLORS.goldLight],
      ['大地圖以「月」推進：內政 → 出征 → 月結；戰鬥邏輯 60Hz。', FONT_BODY, COLORS.text],
      ['【流程】', FONT_HEAD, COLORS.goldLight],
      ['開始新局 → 選劇本（184 黃巾之亂 … 219 三國鼎立，共 5 套）', FONT_BODY, COLORS.text],
      ['→ 選君主（該劇本城池的 KING，含旗下城數；0 城勢力不可選）→ 大地圖。', FONT_BODY, COLORS.text],
      ['【資料】', FONT_HEAD, COLORS.goldLight],
      ['玩法與數值沿用原作 INI：data/*.json 的劇本、城池、武將、兵種、法術。', FONT_BODY, COLORS.text],
      ['存檔 10 槽，鍵名 sanguo_*_v1，可與網頁版互通；讀檔會整組替換目前進度。', FONT_BODY, COLORS.textDim],
      ['【說明】', FONT_HEAD, COLORS.goldLight],
      ['本版為研究／移植用途；原作素材與數值版權歸原權利人。', FONT_BODY, COLORS.textFaint],
    ];
    let cursor = 380;
    for (let i = 0; i < lines.length; i += 1) {
      const [text, size, color] = lines[i];
      const h = size === FONT_HEAD ? 40 : 34;
      this.labelOn(panel, `HelpLine_${i}`, text, 0, cursor, 610, h, size, color, 'left');
      cursor -= size === FONT_HEAD ? 46 : 38;
    }

    this.button('Btn_返回', '返 回', BACK, 'back', false);
    this.hint('按「返回」回標題頁', FOOT_HINT);
  }

  /* ------------------------------------------------------------------ */
  /* 節點工廠                                                           */
  /* ------------------------------------------------------------------ */

  private header(title: string, sub: string): void {
    this.titleText = title;
    this.subText = sub;
    const t = this.label('PageTitle', title, 20, 22, 710, 54, FONT_TITLE, COLORS.goldLight, 'center');
    t.overflow = Label.Overflow.SHRINK;
    addOutline(t, new Color(6, 8, 12, 220), 1);
    const s = this.label('PageSub', sub, 20, 82, 710, 30, FONT_HEAD, COLORS.textDim, 'center');
    s.overflow = Label.Overflow.SHRINK;
  }

  private hint(text: string, rect: { x: number; y: number; w: number; h: number }): void {
    const label = this.label('FootHint', text, rect.x, rect.y, rect.w, rect.h, FONT_BODY, COLORS.textFaint, 'right');
    label.overflow = Label.Overflow.SHRINK;
  }

  private drawFooterMessage(): void {
    if (!this.msg) return;
    const label = this.label('PanelMsg', this.msg, 40, 1042, 670, 44, FONT_BODY, COLORS.gold, 'center');
    label.overflow = Label.Overflow.SHRINK;
  }

  private button(
    name: string,
    text: string,
    rect: { x: number; y: number; w: number; h: number },
    act: TitleHit['act'],
    primary: boolean,
  ): Node {
    const node = makeBtn(this.node, 'plate_btn', text, rect.w, rect.h, {
      fontSize: FONT_HEAD,
      color: primary ? COLORS.goldLight : COLORS.text,
    });
    node.name = name;
    placeDesign(node, rect.x, rect.y, rect.w, rect.h);
    this.hits.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, act, slot: 0 });
    return node;
  }

  /** 根節點上的 Label：`x,y` 是設計座標左緣 / 上緣 */
  private label(
    name: string,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    color: string,
    align: 'left' | 'center' | 'right',
  ): Label {
    return this.labelAt(this.node, name, text, x + w / 2 - HALF_W, HALF_H - (y + h / 2), w, h, size, color, align);
  }

  /** 父節點座標系裡的 Label：`cx,cy` 是 Label 中心（面板內用） */
  private labelOn(
    parent: Node,
    name: string,
    text: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    size: number,
    color: string,
    align: 'left' | 'center' | 'right',
  ): Label {
    return this.labelAt(parent, name, text, cx, cy, w, h, size, color, align);
  }

  private labelAt(
    parent: Node,
    name: string,
    text: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    size: number,
    color: string,
    align: 'left' | 'center' | 'right',
  ): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = parent;
    const transform = node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(Math.max(1, w), Math.max(1, h));
    node.setPosition(cx, cy, 0);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = size;
    label.lineHeight = Math.round(size * 1.35);
    label.color = rgba(color);
    label.horizontalAlign =
      align === 'left'
        ? Label.HorizontalAlign.LEFT
        : align === 'right'
          ? Label.HorizontalAlign.RIGHT
          : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.NONE;
    return label;
  }

  /* ------------------------------------------------------------------ */
  /* 除錯                                                               */
  /* ------------------------------------------------------------------ */

  debug(): TitleDebug {
    return {
      opened: this.opened,
      page: this.page,
      title: this.titleText,
      sub: this.subText,
      buttons: this.hits.filter((hit) => hit.act !== 'slot').length,
      rows: this.hits.filter((hit) => hit.act === 'slot').length,
      msg: this.msg,
      labels: this.collectLabels(),
      activeSlot: readIndex().active,
    };
  }

  private collectLabels(): string[] {
    const out: string[] = [];
    const walk = (node: Node): void => {
      const label = node.getComponent(Label);
      if (label && label.string) out.push(label.string);
      for (const child of node.children) walk(child);
    };
    walk(this.node);
    return out;
  }
}

/** 給 `BootRoot` / headless 用的節點名 */
export const TITLE_PANEL_NODE_NAME = 'TitlePanel';
/** 標題頁三顆按鈕的文字（順序固定，報告與測試都靠它） */
export const TITLE_BUTTONS = ['開 始 新 局', '讀 取 存 檔', '說 明'] as const;
