/**
 * 劇本選擇 + 君主（勢力）選擇（同一個面板的兩頁）。
 *
 * 為什麼合成一個面板：`Boot` 場景只有一個 Canvas，兩頁之間只是換內容，
 * 合成一個 Component 就不必在兩個 Component 之間傳 `GameData` / 回呼，
 * 也少一組全局 touch 監聽（`input.on` 是全局的，多一個面板就多一份廣播）。
 *
 * 第一頁 `scenario`：5 張劇本卡（名稱 / 年份 / 勢力數 / 城池數 / 地圖前三城），
 * 點卡高亮 → 下一步。第二頁 `force`：該劇本城池 `KING` 去重 + `kings[]` 補 0 城
 * 勢力（盜賊），依「首見順序」排；8 行一頁（750×1334 下不裝 ScrollView，改用
 * 上/下頁 —— 微信小遊戲與 headless mock 都沒有 ScrollView 依賴）。
 *
 * 按「開始」才寫 `RunSetup.setRunSelection(scenarioIndex, playerForce)`，
 * 也就是只有真的要開局時才落 `localStorage`（取消/返回不污染上次選擇）。
 *
 * 版式同 `TitlePanel`：750×1334、頁頭 0–124、按鈕區底邊 1248。
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
import {
  clampPage,
  defaultForceName,
  pageCount,
  pageSlice,
  scenarioCards,
  scenarioForces,
  type ForceRow,
  type ScenarioCard,
} from './SelectModel';
import { playerForce, scenarioIndex, setRunSelection } from './RunSetup';
import { makeBtn, makePanel, placeDesign } from './UiSkin';
import type { GameData } from './types';
import { DESIGN_H, DESIGN_W } from './view/layout';
import { COLORS, FONT_FAMILY } from './view/theme';
import { guardTouch } from './InputGuard';

const { ccclass } = _decorator;

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/** 四級字號（r88 已鎖） */
const FONT_TITLE = 40;
const FONT_HEAD = 22;
const FONT_BODY = 18;
const FONT_NUM = 20;

const HEADER_H = 124;
const FOOT_BOTTOM = DESIGN_H - 86; // 1248
const BACK = { x: 40, y: FOOT_BOTTOM - 64, w: 160, h: 64 };
const NEXT = { x: 460, y: FOOT_BOTTOM - 64, w: 260, h: 64 };
// 提示行放在按钮行**上方**：旧值 y=FOOT_BOTTOM-52（1196）与 NEXT 按钮（1184–1248）重叠，
// r90b 截图可见「選擇只影響新開局…」压在「選 君 主 →」上。
const HINT = { x: 40, y: FOOT_BOTTOM - 116, w: 670, h: 34 };

/** 劇本卡 */
const CARD_X = 40;
const CARD_W = 670;
const CARD_H = 150;
const CARD_TOP = 140;
const CARD_GAP = 10;
/** 已選劇本摘要 */
const SUMMARY = { x: 40, y: 966, w: 670, h: 150 };
/** 君主列 */
const FORCE_X = 40;
const FORCE_W = 670;
const FORCE_H = 106;
const FORCE_TOP = 140;
const FORCE_GAP = 6;
const FORCE_ROWS = 8;
/** 君主分頁列 */
const PAGER_Y = 1060;
const PAGER_H = 56;
const PAGE_LABEL = { x: 200, y: PAGER_Y, w: 350, h: PAGER_H };

export type SelectPage = 'scenario' | 'force';

/** 選項 */
export interface ScenarioSelectOptions {
  data: GameData;
  /** 返回標題頁 */
  onBack: () => void;
  /** 選完 → 進大地圖 */
  onEnterCampaign: () => void;
}

interface SelectHit {
  x: number;
  y: number;
  w: number;
  h: number;
  act: 'card' | 'force' | 'next' | 'prev' | 'back' | 'start' | 'page-prev' | 'page-next';
  index: number;
}

/** headless / 報告用的狀態快照 */
export interface SelectDebug {
  opened: boolean;
  page: SelectPage;
  scenarioIndex: number;
  scenarioName: string;
  forceName: string;
  cards: number;
  forces: number;
  selectable: number;
  rows: number;
  pageIndex: number;
  pages: number;
  msg: string;
  title: string;
  sub: string;
  labels: string[];
  hits: number;
}

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

@ccclass('ScenarioSelect')
export class ScenarioSelect extends Component {
  static show(parent: Node, options: ScenarioSelectOptions): ScenarioSelect {
    const node = new Node('ScenarioSelect');
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    node.setPosition(0, 0, 0);
    node.parent = parent;
    const panel = node.getComponent(ScenarioSelect) ?? node.addComponent(ScenarioSelect);
    panel.init(options);
    return panel;
  }

  private options: ScenarioSelectOptions | null = null;
  private cards: ScenarioCard[] = [];
  private forces: ForceRow[] = [];
  private page: SelectPage = 'scenario';
  private selectedScenario = 0;
  private selectedForce = '';
  private forcePage = 0;
  private opened = false;
  private listening = false;
  private msg = '';
  private hits: SelectHit[] = [];
  private titleText = '';
  private subText = '';

  init(options: ScenarioSelectOptions): void {
    this.options = options;
    this.cards = scenarioCards(options.data);
    const last = scenarioIndex();
    this.selectedScenario = this.cards.length ? Math.max(0, Math.min(this.cards.length - 1, last)) : 0;
    this.refreshForces();
    const remembered = playerForce();
    this.selectedForce = this.forces.some((row) => row.selectable && row.name === remembered)
      ? remembered
      : this.firstSelectableForce();
    this.page = 'scenario';
    this.forcePage = 0;
    this.msg = '';
    this.opened = true;
    this.build();
    if (!this.listening) {
      input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'ScenarioSelect'), this);
      this.listening = true;
    }
  }

  close(): void {
    this.opened = false;
    if (this.listening) {
      input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'ScenarioSelect'), this);
      this.listening = false;
    }
    if (this.node.parent) this.node.parent.removeChild(this.node);
    this.node.destroy();
  }

  onDestroy(): void {
    if (this.listening) {
      input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'ScenarioSelect'), this);
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

  /** headless 用：設計座標（左上原點）點一下 */
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

  private act(hit: SelectHit): void {
    switch (hit.act) {
      case 'card': {
        if (hit.index === this.selectedScenario) return;
        this.selectedScenario = hit.index;
        this.forcePage = 0;
        this.msg = '';
        this.refreshForces();
        this.selectedForce = this.firstSelectableForce();
        this.build();
        return;
      }
      case 'next': {
        if (!this.scenario) {
          this.flash('沒有劇本資料：先檢查 data/scenarios.json');
          return;
        }
        this.page = 'force';
        this.forcePage = 0;
        this.msg = '';
        this.build();
        return;
      }
      case 'prev': {
        this.page = 'scenario';
        this.msg = '';
        this.build();
        return;
      }
      case 'back': {
        this.options?.onBack();
        return;
      }
      case 'page-prev': {
        this.forcePage = clampPage(this.forcePage - 1, this.forces.length, FORCE_ROWS);
        this.build();
        return;
      }
      case 'page-next': {
        this.forcePage = clampPage(this.forcePage + 1, this.forces.length, FORCE_ROWS);
        this.build();
        return;
      }
      case 'force': {
        const row = this.forces[hit.index];
        if (!row) return;
        if (!row.selectable) {
          this.flash(`${row.name} 名下無城（不可選）`);
          return;
        }
        this.selectedForce = row.name;
        this.msg = '';
        this.build();
        return;
      }
      case 'start':
      default: {
        if (!this.scenario || !this.selectedForce) {
          this.flash('先選一副本與一家有城的勢力');
          return;
        }
        setRunSelection(this.selectedScenario, this.selectedForce);
        this.options?.onEnterCampaign();
      }
    }
  }

  private flash(text: string): void {
    this.msg = text;
    this.build();
  }

  private get scenario() {
    return this.cards[this.selectedScenario] ? this.cards[this.selectedScenario] : null;
  }

  private refreshForces(): void {
    const data = this.options ? this.options.data : null;
    const scenario = data && data.scenarios ? data.scenarios[this.selectedScenario] : null;
    this.forces = scenarioForces(scenario);
    this.forcePage = clampPage(this.forcePage, this.forces.length, FORCE_ROWS);
  }

  /** 預設選第一個有城的勢力（與 web 版「0 城不可選」一致）。 */
  private firstSelectableForce(): string {
    const row = this.forces.find((item) => item.selectable);
    return row ? row.name : '';
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
    if (this.page === 'force') this.buildForcePage();
    else this.buildScenarioPage();
    this.drawMsg();
  }

  private clear(): void {
    for (const child of [...this.node.children]) {
      child.parent = null;
      child.destroy();
    }
  }

  private drawBackground(): void {
    const node = new Node('SelectBg');
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(COLORS.bg);
    g.rect(-HALF_W, -HALF_H, DESIGN_W, DESIGN_H);
    g.fill();
    g.strokeColor = rgba(COLORS.goldDim, 120);
    g.lineWidth = 1;
    g.moveTo(-HALF_W, HALF_H - HEADER_H);
    g.lineTo(HALF_W, HALF_H - HEADER_H);
    g.moveTo(-HALF_W, -HALF_H + 86);
    g.lineTo(HALF_W, -HALF_H + 86);
    g.stroke();
  }

  /* ---------------------------- 劇本頁 ------------------------------ */

  private buildScenarioPage(): void {
    this.header('選 擇 劇 本', `${this.cards.length} 套劇本 · 點卡片高亮 · 下一步選君主`);

    for (let i = 0; i < this.cards.length; i += 1) {
      const card = this.cards[i];
      const y = CARD_TOP + i * (CARD_H + CARD_GAP);
      const selected = i === this.selectedScenario;
      // [85_sel] 選中卡不再換 skin：`plate_sel` 在圖集裡近乎無框，選中反而比未選中更「裸」。
      // 卡體一律 frame_panel，選中態另加一層金色描邊（見下方 ScCard_*_Ring），文字同時轉金。
      const panel = makePanel(this.node, 'frame_panel', CARD_W, CARD_H, {
        fill: true,
        fillAlpha: selected ? 200 : 135,
      });
      panel.name = `ScCard_${i}`;
      placeDesign(panel, CARD_X, y, CARD_W, CARD_H);

      if (selected) {
        const ring = new Node(`ScCard_${i}_Ring`);
        const rg = ring.addComponent(Graphics);
        const hw = CARD_W / 2;
        const hh = CARD_H / 2;
        rg.lineWidth = 4;
        rg.strokeColor = rgba(COLORS.gold, 255);
        rg.fillColor = rgba(COLORS.gold, 22);
        rg.rect(-hw + 2, -hh + 2, CARD_W - 4, CARD_H - 4);
        rg.fill();
        rg.stroke();
        placeDesign(ring, CARD_X, y, CARD_W, CARD_H);
      }

      const name = this.labelOn(panel, `ScCard_${i}_Name`, `${i + 1}. ${card.name}`, 0, 47, CARD_W - 40, 34, FONT_HEAD, selected ? COLORS.goldLight : COLORS.text, 'left');
      name.overflow = Label.Overflow.SHRINK;
      const stats = this.labelOn(
        panel,
        `ScCard_${i}_Stats`,
        `${card.year} 年 · ${card.forceCount} 勢力 · ${card.cityCount} 城 · ${card.pathCount} 條道路`,
        0,
        12,
        CARD_W - 40,
        28,
        FONT_BODY,
        selected ? COLORS.gold : COLORS.textDim,
        'left',
      );
      stats.overflow = Label.Overflow.SHRINK;
      const opening = this.labelOn(
        panel,
        `ScCard_${i}_Opening`,
        `地圖前三城：${card.opening.join(' · ') || '—'}`,
        0,
        -24,
        CARD_W - 40,
        28,
        FONT_BODY,
        COLORS.textFaint,
        'left',
      );
      opening.overflow = Label.Overflow.SHRINK;
      this.labelOn(panel, `ScCard_${i}_Dot`, selected ? '已選' : '', 250, 47, 90, 30, FONT_BODY, COLORS.gold, 'right');

      this.hits.push({ x: CARD_X, y, w: CARD_W, h: CARD_H, act: 'card', index: i });
    }

    const card = this.scenario;
    if (card) {
      const summary = makePanel(this.node, 'frame_panel', SUMMARY.w, SUMMARY.h, { fillAlpha: 120 });
      summary.name = 'ScSummary';
      placeDesign(summary, SUMMARY.x, SUMMARY.y, SUMMARY.w, SUMMARY.h);
      this.labelOn(summary, 'ScSummaryTitle', `《${card.name}》${card.year} 年`, 0, 42, 620, 32, FONT_HEAD, COLORS.goldLight, 'left');
      this.labelOn(summary, 'ScSummaryStats', `${card.forceCount} 家勢力 · ${card.cityCount} 座城 · ${card.pathCount} 條道路`, 0, 8, 620, 26, FONT_BODY, COLORS.text, 'left');
      this.labelOn(summary, 'ScSummaryOpen', `地圖前三城：${card.opening.join(' · ') || '—'}`, 0, -26, 620, 26, FONT_BODY, COLORS.textDim, 'left');
    }

    this.button('Btn_返回', '返 回', BACK, 'back', false);
    this.button('Btn_下一步', '選 君 主 →', NEXT, 'next', true);
    this.hint('選擇只影響新開局；讀取存檔會沿用存檔內的劇本', HINT);
  }

  /* ---------------------------- 君主頁 ------------------------------ */

  private buildForcePage(): void {
    const card = this.scenario;
    const selectable = this.forces.filter((row) => row.selectable).length;
    this.header(
      '選 擇 君 主',
      card ? `《${card.name}》${this.forces.length} 家勢力 · 有城 ${selectable} 家 · 點一行選定` : '沒有劇本資料',
    );

    const rows = pageSlice(this.forces, this.forcePage, FORCE_ROWS);
    const start = this.forcePage * FORCE_ROWS;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const globalIndex = start + i;
      const y = FORCE_TOP + i * (FORCE_H + FORCE_GAP);
      const selected = row.name === this.selectedForce;
      const panel = makePanel(this.node, selected && row.selectable ? 'plate_sel' : row.selectable ? 'frame_panel' : 'slot_off', FORCE_W, FORCE_H, {
        fill: true,
        fillAlpha: selected && row.selectable ? 200 : row.selectable ? 140 : 80,
      });
      panel.name = `ForceRow_${globalIndex}`;
      placeDesign(panel, FORCE_X, y, FORCE_W, FORCE_H);

      this.labelOn(
        panel,
        `ForceRow_${globalIndex}_Name`,
        row.selectable ? row.name : `${row.name}（0 城）`,
        0,
        31,
        FORCE_W - 40,
        34,
        FONT_HEAD,
        selected && row.selectable ? COLORS.goldLight : row.selectable ? COLORS.text : COLORS.textFaint,
        'left',
      );
      this.labelOn(
        panel,
        `ForceRow_${globalIndex}_Meta`,
        `勢力 ${row.name}${row.flag ? ` · 旗${row.flag}` : ''} · 起始 ${row.cityCount} 城`,
        0,
        -1,
        FORCE_W - 40,
        26,
        FONT_BODY,
        COLORS.textDim,
        'left',
      );
      const cities =
        row.cities.length > 0
          ? `城池：${row.cities.slice(0, 4).join(' · ')}${row.cities.length > 4 ? ` 等 ${row.cityCount} 城` : ''}`
          : '此劇本名下無城（不可選）';
      this.labelOn(panel, `ForceRow_${globalIndex}_Cities`, cities, 0, -33, FORCE_W - 40, 26, FONT_BODY, COLORS.textFaint, 'left');

      this.hits.push({ x: FORCE_X, y, w: FORCE_W, h: FORCE_H, act: 'force', index: globalIndex });
    }

    this.pager();
    this.button('Btn_返回', '返 回', BACK, 'prev', false);
    this.button('Btn_開始', '開 始 新 局', NEXT, 'start', true);
    this.hint(`第 ${this.forcePage + 1}/${this.pages()} 頁 · 共 ${this.forces.length} 家`, HINT);
  }

  private pager(): void {
    this.button('Btn_上頁', '上 一 頁', { x: 40, y: PAGER_Y, w: 140, h: PAGER_H }, 'page-prev', false);
    this.button('Btn_下頁', '下 一 頁', { x: 570, y: PAGER_Y, w: 140, h: PAGER_H }, 'page-next', false);
    const label = this.label('PageLabel', `第 ${this.forcePage + 1} / ${this.pages()} 頁`, PAGE_LABEL.x, PAGE_LABEL.y, PAGE_LABEL.w, PAGE_LABEL.h, FONT_NUM, COLORS.textDim, 'center');
    label.overflow = Label.Overflow.SHRINK;
  }

  private pages(): number {
    return pageCount(this.forces.length, FORCE_ROWS);
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

  private drawMsg(): void {
    if (!this.msg) return;
    const label = this.label('PanelMsg', this.msg, 40, 1122, 670, 44, FONT_BODY, COLORS.gold, 'center');
    label.overflow = Label.Overflow.SHRINK;
  }

  private button(
    name: string,
    text: string,
    rect: { x: number; y: number; w: number; h: number },
    act: 'next' | 'prev' | 'back' | 'start' | 'page-prev' | 'page-next',
    primary: boolean,
  ): Node {
    const node = makeBtn(this.node, 'plate_btn', text, rect.w, rect.h, {
      fontSize: FONT_HEAD,
      color: primary ? COLORS.goldLight : COLORS.text,
    });
    node.name = name;
    placeDesign(node, rect.x, rect.y, rect.w, rect.h);
    this.hits.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, act, index: 0 });
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

  debug(): SelectDebug {
    const card = this.scenario;
    return {
      opened: this.opened,
      page: this.page,
      scenarioIndex: this.selectedScenario,
      scenarioName: card ? card.name : '',
      forceName: this.selectedForce,
      cards: this.cards.length,
      forces: this.forces.length,
      selectable: this.forces.filter((row) => row.selectable).length,
      rows: this.hits.filter((hit) => hit.act === 'force').length,
      pageIndex: this.forcePage,
      pages: this.pages(),
      msg: this.msg,
      title: this.titleText,
      sub: this.subText,
      labels: this.collectLabels(),
      hits: this.hits.length,
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

/** 節點名（Boot / 測試用） */
export const SCENARIO_SELECT_NODE_NAME = 'ScenarioSelect';
