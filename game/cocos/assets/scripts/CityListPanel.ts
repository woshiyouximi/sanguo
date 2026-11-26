/**
 * CityListPanel.ts — 城池列表畫面（掛在既有場景 Canvas 下，不新建 .scene）。
 *
 * 對齊 web 版 campaign.html 的「列表」檔（地圖 / 列表兩個 tab，#viewList）：
 *   表頭：城名 / 勢力 / 太守 / 守軍 / 預備 / 金錢 / 關係
 *   60 城分 4 頁，每頁 15 行（固定 15 組行節點，翻頁只改文字）
 *   篩選：全部 / 己方 / 敵方 / 無主（三種計數和 = 60）
 *   排序：城名 / 勢力（同勢力時按城名；code-point 比較）
 *   點一行 → onPick(cityName)（lead 接到大地圖的 selected），本面板不自動關閉
 *
 * 版式（750×1334，左上原點；沿用 r88 幾何）：
 *   頁頭 0–124、篩選帶 124–228、表 228–1112、分頁 1120–1164、
 *   返回按鈕 1184–1248（底邊 1334 − 86）、提示 1262–1286。
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
import { addVeil, HALF_H, HALF_W } from './ArtLayer';
import {
  CITY_FILTERS,
  CITY_PAGE_SIZE,
  CityList,
  filterLabelOf,
  sortLabelOf,
  type CityFilter,
  type CityListCityLike,
  type CityListGeneralLike,
  type CityListSaveLike,
  type CityListState,
  type CitySortKey,
} from './CityList';
import { makeBtn, makeNineSlice, placeDesign } from './UiSkin';
import { COLORS, FONT_FAMILY } from './view/theme';
import { guardTouch } from './InputGuard';

const { ccclass } = _decorator;

export const CITY_LIST_NODE_NAME = 'CityListPanel';

export interface DesignRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SCREEN: DesignRect = { x: 0, y: 0, w: 750, h: 1334 };
const TABLE: DesignRect = { x: 14, y: 228, w: 722, h: 884 };
const ROW_Y0 = 272;
const ROW_H = 56;
const FILTER_X0 = 18;
const FILTER_W = 164;
const FILTER_H = 44;
const FILTER_STEP = 174;
const SORT_Y = 184;
const SORT_W = 100;
const SORT_H = 36;

export const CITY_LIST_LAYOUT = {
  screen: SCREEN,
  header: { x: 0, y: 0, w: 750, h: 124 } as DesignRect,
  title: { x: 24, y: 16, w: 540, h: 58 } as DesignRect,
  sub: { x: 24, y: 78, w: 560, h: 28 } as DesignRect,
  close: { x: 598, y: 34, w: 126, h: 52 } as DesignRect,
  filterBand: { x: 0, y: 124, w: 750, h: 104 } as DesignRect,
  filterY: 136,
  filterW: FILTER_W,
  filterH: FILTER_H,
  sortLabel: { x: 300, y: 188, w: 158, h: 28 } as DesignRect,
  sortName: { x: 474, y: SORT_Y, w: SORT_W, h: SORT_H } as DesignRect,
  sortForce: { x: 584, y: SORT_Y, w: SORT_W, h: SORT_H } as DesignRect,
  table: TABLE,
  tableHead: { x: TABLE.x, y: TABLE.y, w: TABLE.w, h: 44 } as DesignRect,
  rowY0: ROW_Y0,
  rowH: ROW_H,
  pagination: { x: 0, y: 1112, w: 750, h: 60 } as DesignRect,
  prev: { x: 18, y: 1120, w: 110, h: 44 } as DesignRect,
  page: { x: 150, y: 1120, w: 450, h: 44 } as DesignRect,
  next: { x: 622, y: 1120, w: 110, h: 44 } as DesignRect,
  back: { x: 195, y: 1184, w: 360, h: 64 } as DesignRect,
  foot: { x: 75, y: 1262, w: 600, h: 24 } as DesignRect,
} as const;

type Align = 'left' | 'center' | 'right';

export interface CityListColumn {
  key: string;
  label: string;
  x: number;
  w: number;
  align: Align;
}

/** 表頭與行共用同一組欄位幾何。 */
export const CITY_LIST_COLUMNS: readonly CityListColumn[] = [
  { key: 'name', label: '城名', x: 26, w: 150, align: 'left' },
  { key: 'force', label: '勢力', x: 180, w: 150, align: 'left' },
  { key: 'major', label: '太守', x: 334, w: 88, align: 'left' },
  { key: 'troops', label: '守軍', x: 426, w: 74, align: 'right' },
  { key: 'prep', label: '預備', x: 504, w: 74, align: 'right' },
  { key: 'money', label: '金錢', x: 582, w: 72, align: 'right' },
  { key: 'relation', label: '關係', x: 660, w: 70, align: 'center' },
];

export interface CityListPanelOptions {
  save?: CityListSaveLike;
  cities?: readonly CityListCityLike[];
  generals?: readonly CityListGeneralLike[];
  filter?: CityFilter;
  sort?: CitySortKey;
  selected?: string | null;
  /** 點一行的回調；lead 接到大地圖 selected。 */
  onPick?: ((cityName: string) => void) | null;
  onClose?: (() => void) | null;
}

export interface CityListHit {
  name: string;
  rect: DesignRect;
  act: () => void;
}

export interface CityListDebug {
  opened: boolean;
  filter: string;
  sort: string;
  dir: number;
  page: number;
  pages: number;
  total: number;
  counts: CityListState['counts'];
  pageRows: string[];
  selected: string | null;
  sub: string;
  pageText: string;
  tabLabels: string[];
  sortLabels: string[];
  rowTexts: string[][];
  visibleRows: number;
  hitNames: string[];
  nodeCount: number;
  childCount: number;
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function hex(value: string, alpha = 255): Color {
  const text = (value || '').replace('#', '').trim();
  let full = text;
  if (full.length === 3) full = full.split('').map((c) => c + c).join('');
  else if (full.length < 6) full = full.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return new Color(r, g, b, alpha);
}

function countNodes(root: Node): number {
  let total = 1;
  for (const child of root.children) total += countNodes(child);
  return total;
}

function filterRect(index: number): DesignRect {
  return {
    x: FILTER_X0 + index * FILTER_STEP,
    y: CITY_LIST_LAYOUT.filterY,
    w: FILTER_W,
    h: FILTER_H,
  };
}

function rowRect(index: number): DesignRect {
  return { x: TABLE.x, y: ROW_Y0 + index * ROW_H, w: TABLE.w, h: ROW_H };
}

/* ------------------------------------------------------------------ */
/* CityListPanel                                                       */
/* ------------------------------------------------------------------ */

@ccclass('CityListPanel')
export class CityListPanel extends Component {
  private built = false;
  private opened = false;

  private readonly model = new CityList({}, [], []);
  private saveData: CityListSaveLike = {};
  private g: Graphics | null = null;

  private titleLabel: Label | null = null;
  private subLabel: Label | null = null;
  private pageLabel: Label | null = null;
  private footLabel: Label | null = null;
  private emptyLabel: Label | null = null;
  private tabLabels: Label[] = [];
  private tabActive: Node | null = null;
  private sortLabels: Label[] = [];
  private sortMarker: Node | null = null;
  private prevLabel: Label | null = null;
  private nextLabel: Label | null = null;
  private rowCells: Label[][] = [];
  private headLabels: Label[] = [];

  private hits: CityListHit[] = [];
  private onPickCb: ((cityName: string) => void) | null = null;
  private onCloseCb: (() => void) | null = null;

  /* ---------------------------------------------------------------- */
  /* 靜態入口                                                         */
  /* ---------------------------------------------------------------- */

  static show(parent: Node, options: CityListPanelOptions = {}): CityListPanel {
    let node = parent.getChildByName(CITY_LIST_NODE_NAME);
    if (!node) {
      node = new Node(CITY_LIST_NODE_NAME);
      node.layer = Layers.Enum.UI_2D;
    }
    if (node.parent !== parent) node.parent = parent;
    let panel = node.getComponent(CityListPanel);
    if (!panel) panel = node.addComponent(CityListPanel);
    panel.build();
    panel.open(options);
    return panel;
  }

  static hide(parent: Node): void {
    const node = parent.getChildByName(CITY_LIST_NODE_NAME);
    const panel = node ? node.getComponent(CityListPanel) : null;
    panel?.close();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** 給 lead 直接改存檔後重畫（例如攻城成功後）。 */
  refreshWith(save: CityListSaveLike, cities?: readonly CityListCityLike[]): this {
    this.saveData = save;
    this.model.setSave(save, cities);
    this.refresh();
    return this;
  }

  get list(): CityList {
    return this.model;
  }

  /* ---------------------------------------------------------------- */
  /* 生命週期                                                         */
  /* ---------------------------------------------------------------- */

  build(): void {
    if (this.built) return;
    this.built = true;
    const root = this.node;
    root.layer = Layers.Enum.UI_2D;
    let transform = root.getComponent(UITransform);
    if (!transform) transform = root.addComponent(UITransform);
    transform.setContentSize(SCREEN.w, SCREEN.h);

    // 1) 深底（全屏矩形是 addVeil 雙倍偏移 bug 的不動點）。
    addVeil(root, 'CityListBg', SCREEN, new Color(9, 12, 17, 255));

    // 2) 表格九宮（在 Graphics 之下，讓行高亮畫在框內）。
    const tableFrame = makeNineSlice(root, 'frame_panel', TABLE.w, TABLE.h);
    tableFrame.name = 'CityListTableFrame';
    placeDesign(tableFrame, TABLE.x, TABLE.y, TABLE.w, TABLE.h);

    // 3) Graphics 層：底、表頭、行底、選中高亮、分隔線。
    const frame = new Node('CityListFrame');
    frame.layer = Layers.Enum.UI_2D;
    frame.parent = root;
    const frameTransform = frame.addComponent(UITransform);
    frameTransform.setContentSize(SCREEN.w, SCREEN.h);
    frame.setPosition(0, 0);
    this.g = frame.addComponent(Graphics);

    // 4) 頁頭。
    this.titleLabel = this.makeLabel('CityListTitle', '城池一覽', CITY_LIST_LAYOUT.title, 40, COLORS.goldLight, {
      align: 'left',
      bold: true,
      lineHeight: 48,
    });
    this.subLabel = this.makeLabel('CityListSub', '', CITY_LIST_LAYOUT.sub, 22, COLORS.textDim, {
      align: 'left',
    });

    const close = makeBtn(root, 'plate_btn', '關 閉', CITY_LIST_LAYOUT.close.w, CITY_LIST_LAYOUT.close.h, {
      fontSize: 22,
      color: COLORS.textDim,
    });
    close.name = 'CityListClose';
    placeDesign(close, CITY_LIST_LAYOUT.close.x, CITY_LIST_LAYOUT.close.y, CITY_LIST_LAYOUT.close.w, CITY_LIST_LAYOUT.close.h);

    // 5) 篩選 tab（底牌 + 活動牌 + 文字）。
    for (let i = 0; i < CITY_FILTERS.length; i += 1) {
      const rect = filterRect(i);
      const plate = makeNineSlice(root, 'plate_sq', rect.w, rect.h);
      plate.name = `CityListFilterPlate${i}`;
      placeDesign(plate, rect.x, rect.y, rect.w, rect.h);
    }
    this.tabActive = makeNineSlice(root, 'plate_sel', FILTER_W, FILTER_H);
    this.tabActive.name = 'CityListFilterActive';
    placeDesign(this.tabActive, filterRect(0).x, filterRect(0).y, FILTER_W, FILTER_H);

    for (let i = 0; i < CITY_FILTERS.length; i += 1) {
      const rect = filterRect(i);
      this.tabLabels.push(
        this.makeLabel(
          `CityListFilterLabel${i}`,
          CITY_FILTERS[i].label,
          { x: rect.x, y: rect.y + 6, w: rect.w, h: 32 },
          18,
          COLORS.textDim,
          { align: 'center' }
        )
      );
    }

    // 6) 排序（標籤 + 兩個 chip + 活動牌）。
    this.makeLabel('CityListSortCaption', '排序', CITY_LIST_LAYOUT.sortLabel, 18, COLORS.textFaint, {
      align: 'right',
    });
    for (const [key, rect] of [
      ['name', CITY_LIST_LAYOUT.sortName],
      ['force', CITY_LIST_LAYOUT.sortForce],
    ] as const) {
      const plate = makeNineSlice(root, 'plate_sq', rect.w, rect.h);
      plate.name = `CityListSortPlate_${key}`;
      placeDesign(plate, rect.x, rect.y, rect.w, rect.h);
    }
    this.sortMarker = makeNineSlice(root, 'plate_sel', SORT_W, SORT_H);
    this.sortMarker.name = 'CityListSortActive';
    placeDesign(
      this.sortMarker,
      CITY_LIST_LAYOUT.sortName.x,
      CITY_LIST_LAYOUT.sortName.y,
      SORT_W,
      SORT_H
    );
    for (const [key, rect] of [
      ['name', CITY_LIST_LAYOUT.sortName],
      ['force', CITY_LIST_LAYOUT.sortForce],
    ] as const) {
      this.sortLabels.push(
        this.makeLabel(
          `CityListSortLabel_${key}`,
          key === 'name' ? '城名' : '勢力',
          { x: rect.x, y: rect.y + 4, w: rect.w, h: 28 },
          18,
          COLORS.textDim,
          { align: 'center' }
        )
      );
    }

    // 7) 表頭。
    for (const col of CITY_LIST_COLUMNS) {
      this.headLabels.push(
        this.makeLabel(
          `CityListHead_${col.key}`,
          col.label,
          { x: col.x, y: TABLE.y + 4, w: col.w, h: 36 },
          18,
          COLORS.textDim,
          { align: col.align }
        )
      );
    }

    // 8) 15 行 × 7 欄（固定節點，翻頁只改文字）。
    for (let i = 0; i < CITY_PAGE_SIZE; i += 1) {
      const y = ROW_Y0 + i * ROW_H;
      const cells: Label[] = [];
      for (const col of CITY_LIST_COLUMNS) {
        cells.push(
          this.makeLabel(
            `CityListRow${i}_${col.key}`,
            '',
            { x: col.x, y: y + 8, w: col.w, h: 40 },
            18,
            COLORS.text,
            { align: col.align, overflow: Label.Overflow.SHRINK }
          )
        );
      }
      this.rowCells.push(cells);
    }

    this.emptyLabel = this.makeLabel(
      'CityListEmpty',
      '此篩選下沒有城池',
      { x: 250, y: 640, w: 250, h: 40 },
      22,
      COLORS.textFaint,
      { align: 'center' }
    );

    // 9) 分頁。
    const prev = makeBtn(root, 'plate_btn', '上一頁', CITY_LIST_LAYOUT.prev.w, CITY_LIST_LAYOUT.prev.h, {
      fontSize: 18,
      color: COLORS.textDim,
    });
    prev.name = 'CityListPrev';
    placeDesign(prev, CITY_LIST_LAYOUT.prev.x, CITY_LIST_LAYOUT.prev.y, CITY_LIST_LAYOUT.prev.w, CITY_LIST_LAYOUT.prev.h);
    this.prevLabel = prev.getChildByName('Label_上一頁')?.getComponent(Label) ?? null;

    const next = makeBtn(root, 'plate_btn', '下一頁', CITY_LIST_LAYOUT.next.w, CITY_LIST_LAYOUT.next.h, {
      fontSize: 18,
      color: COLORS.textDim,
    });
    next.name = 'CityListNext';
    placeDesign(next, CITY_LIST_LAYOUT.next.x, CITY_LIST_LAYOUT.next.y, CITY_LIST_LAYOUT.next.w, CITY_LIST_LAYOUT.next.h);
    this.nextLabel = next.getChildByName('Label_下一頁')?.getComponent(Label) ?? null;

    this.pageLabel = this.makeLabel('CityListPage', '', CITY_LIST_LAYOUT.page, 20, COLORS.text, {
      align: 'center',
    });

    // 10) 返回大地圖（底邊 1248 = 1334 − 86）。
    const back = makeBtn(root, 'plate_btn', '返 回 地 圖', CITY_LIST_LAYOUT.back.w, CITY_LIST_LAYOUT.back.h, {
      fontSize: 22,
      color: COLORS.goldLight,
    });
    back.name = 'CityListBack';
    placeDesign(back, CITY_LIST_LAYOUT.back.x, CITY_LIST_LAYOUT.back.y, CITY_LIST_LAYOUT.back.w, CITY_LIST_LAYOUT.back.h);

    this.footLabel = this.makeLabel(
      'CityListFoot',
      '點一行選城 · 回大地圖即可查看',
      CITY_LIST_LAYOUT.foot,
      16,
      COLORS.textFaint,
      { align: 'center' }
    );

    this.node.active = false;
  }

  open(options: CityListPanelOptions = {}): this {
    this.build();
    if (options.save !== undefined) this.saveData = options.save;
    if (options.cities !== undefined || options.generals !== undefined) {
      this.model.setSave(this.saveData, options.cities);
      if (options.generals !== undefined) this.model.setGenerals(options.generals);
    } else if (options.save !== undefined) {
      this.model.setSave(this.saveData);
    }
    if (options.filter !== undefined) this.model.setFilter(options.filter);
    if (options.sort !== undefined) this.model.setSort(options.sort, 1);
    if (options.selected !== undefined) this.model.setSelected(options.selected);
    this.onPickCb = options.onPick ?? null;
    this.onCloseCb = options.onClose ?? null;

    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.refresh();
    if (!this.opened) {
      this.opened = true;
      input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'CityListPanel'), this);
    }
    return this;
  }

  close(): void {
    if (this.opened) {
      this.opened = false;
      input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'CityListPanel'), this);
    }
    this.node.active = false;
    this.onCloseCb?.();
  }

  onDestroy(): void {
    if (this.opened) {
      this.opened = false;
      input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'CityListPanel'), this);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 公開操作（headless 測試直接呼叫）                                  */
  /* ---------------------------------------------------------------- */

  setFilter(filter: CityFilter): this {
    this.model.setFilter(filter);
    this.refresh();
    return this;
  }

  setSort(key: CitySortKey): this {
    this.model.toggleSort(key);
    this.refresh();
    return this;
  }

  nextPage(): this {
    this.model.nextPage();
    this.refresh();
    return this;
  }

  prevPage(): this {
    this.model.prevPage();
    this.refresh();
    return this;
  }

  pick(name: string): string | null {
    const picked = this.model.pick(name);
    if (!picked) return null;
    this.refresh();
    this.onPickCb?.(picked);
    return picked;
  }

  /* ---------------------------------------------------------------- */
  /* 畫面                                                             */
  /* ---------------------------------------------------------------- */

  private refresh(): void {
    if (!this.built) return;
    const state = this.model.state;

    if (this.subLabel) {
      this.subLabel.string =
        `共 ${state.total} 城 · 己方 ${state.counts.ours} · 敵方 ${state.counts.enemy} · 無主 ${state.counts.neutral}`;
    }
    for (let i = 0; i < CITY_FILTERS.length; i += 1) {
      const item = CITY_FILTERS[i];
      const active = state.filter === item.key;
      if (this.tabLabels[i]) {
        this.tabLabels[i].string = item.label;
        this.tabLabels[i].color = hex(active ? COLORS.goldLight : COLORS.textDim);
      }
    }
    const activeFilterIndex = Math.max(
      0,
      CITY_FILTERS.findIndex((item) => item.key === state.filter)
    );
    if (this.tabActive) {
      const rect = filterRect(activeFilterIndex);
      placeDesign(this.tabActive, rect.x, rect.y, rect.w, rect.h);
    }

    const sortName = state.sort === 'name' ? sortLabelOf('name', state.dir) : '城名';
    const sortForce = state.sort === 'force' ? sortLabelOf('force', state.dir) : '勢力';
    if (this.sortLabels[0]) {
      this.sortLabels[0].string = sortName;
      this.sortLabels[0].color = hex(state.sort === 'name' ? COLORS.goldLight : COLORS.textDim);
    }
    if (this.sortLabels[1]) {
      this.sortLabels[1].string = sortForce;
      this.sortLabels[1].color = hex(state.sort === 'force' ? COLORS.goldLight : COLORS.textDim);
    }
    if (this.sortMarker) {
      const rect = state.sort === 'force' ? CITY_LIST_LAYOUT.sortForce : CITY_LIST_LAYOUT.sortName;
      placeDesign(this.sortMarker, rect.x, rect.y, rect.w, rect.h);
    }

    for (let i = 0; i < CITY_PAGE_SIZE; i += 1) {
      const row = state.pageRows[i] ?? null;
      const cells = this.rowCells[i];
      if (!cells) continue;
      for (let c = 0; c < CITY_LIST_COLUMNS.length; c += 1) {
        const label = cells[c];
        const col = CITY_LIST_COLUMNS[c];
        label.node.active = row !== null;
        if (!row) {
          label.string = '';
          continue;
        }
        if (col.key === 'name') {
          label.string = row.name;
          label.color = hex(
            row.relation === 'ours' ? COLORS.oursLight : row.relation === 'enemy' ? COLORS.enemyLight : COLORS.textDim
          );
        } else if (col.key === 'force') {
          label.string = row.force;
          label.color = hex(row.relation === 'neutral' ? COLORS.textFaint : COLORS.text);
        } else if (col.key === 'major') {
          label.string = row.major;
          label.color = hex(COLORS.textDim);
        } else if (col.key === 'relation') {
          label.string = row.relationText;
          label.color = hex(
            row.relation === 'ours' ? COLORS.ok : row.relation === 'enemy' ? COLORS.enemyLight : COLORS.textFaint
          );
        } else {
          label.string =
            col.key === 'troops'
              ? String(row.troops)
              : col.key === 'prep'
                ? String(row.prep)
                : String(row.money);
          label.color = hex(COLORS.text);
        }
      }
    }

    if (this.emptyLabel) this.emptyLabel.node.active = state.pageRows.length === 0;

    if (this.pageLabel) {
      const start = state.pageRows.length === 0 ? 0 : state.page * CITY_PAGE_SIZE + 1;
      const end = state.page * CITY_PAGE_SIZE + state.pageRows.length;
      this.pageLabel.string = `第 ${state.page + 1} / ${state.pages} 頁 · ${start}–${end} 筆`;
    }
    if (this.prevLabel) {
      this.prevLabel.color = hex(state.page <= 0 ? COLORS.textFaint : COLORS.text);
    }
    if (this.nextLabel) {
      this.nextLabel.color = hex(state.page >= state.pages - 1 ? COLORS.textFaint : COLORS.text);
    }

    this.drawStatic(state);
    this.rebuildHits(state);
  }

  private drawStatic(state: CityListState): void {
    const g = this.g;
    if (!g) return;
    g.clear();

    this.paint(SCREEN, '#090C11', 255);
    this.paint(CITY_LIST_LAYOUT.header, '#0D1117', 255);
    this.paint(CITY_LIST_LAYOUT.filterBand, '#0B0F15', 255);
    this.paint(CITY_LIST_LAYOUT.pagination, '#090C11', 255);
    this.paint(TABLE, '#0B0E13', 236);
    this.paint(CITY_LIST_LAYOUT.tableHead, '#151B24', 255);

    this.line(0, 123, 750, 123, COLORS.gold, 110);
    this.line(0, 227, 750, 227, COLORS.line, 180);
    this.line(TABLE.x, ROW_Y0, TABLE.x + TABLE.w, ROW_Y0, COLORS.gold, 80);
    this.line(0, 1112, 750, 1112, COLORS.line, 180);

    for (let i = 0; i < CITY_PAGE_SIZE; i += 1) {
      const rect = rowRect(i);
      const row = state.pageRows[i] ?? null;
      if (i % 2 === 0 && row) this.paint(rect, '#10151C', 210);
      if (row && state.selected === row.name) {
        this.paint(rect, COLORS.gold, 30);
        this.paint({ x: rect.x, y: rect.y, w: 3, h: rect.h }, COLORS.gold, 220);
      }
      this.line(TABLE.x + 10, rect.y + ROW_H, TABLE.x + TABLE.w - 10, rect.y + ROW_H, COLORS.line, 80);
    }

    // 選中列若在當前頁，於表頭左側加一個小三角提示。
    const selectedOnPage = state.pageRows.some((row) => row.name === state.selected);
    if (selectedOnPage) {
      this.paint({ x: TABLE.x + 4, y: TABLE.y + 12, w: 4, h: 20 }, COLORS.gold, 220);
    }
  }

  private rebuildHits(state: CityListState): void {
    const hits: CityListHit[] = [];
    for (let i = 0; i < CITY_FILTERS.length; i += 1) {
      const filter = CITY_FILTERS[i].key;
      hits.push({
        name: `filter:${filter}`,
        rect: filterRect(i),
        act: () => this.setFilter(filter),
      });
    }
    for (const [key, rect] of [
      ['name', CITY_LIST_LAYOUT.sortName],
      ['force', CITY_LIST_LAYOUT.sortForce],
    ] as const) {
      hits.push({
        name: `sort:${key}`,
        rect,
        act: () => this.setSort(key),
      });
    }
    for (let i = 0; i < state.pageRows.length; i += 1) {
      const row = state.pageRows[i];
      hits.push({
        name: `row:${row.name}`,
        rect: rowRect(i),
        act: () => this.pick(row.name),
      });
    }
    hits.push({ name: 'prev', rect: CITY_LIST_LAYOUT.prev, act: () => this.prevPage() });
    hits.push({ name: 'next', rect: CITY_LIST_LAYOUT.next, act: () => this.nextPage() });
    hits.push({ name: 'close', rect: CITY_LIST_LAYOUT.close, act: () => this.close() });
    hits.push({ name: 'back', rect: CITY_LIST_LAYOUT.back, act: () => this.close() });
    this.hits = hits;
  }

  /* ---------------------------------------------------------------- */
  /* 輸入                                                             */
  /* ---------------------------------------------------------------- */

  tap(x: number, y: number): boolean {
    for (const hit of this.hits) {
      const r = hit.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        hit.act();
        return true;
      }
    }
    return false;
  }

  private onTouch(event: EventTouch): void {
    if (!this.opened) return;
    const ui = event.getUILocation();
    const local = this.node
      .getComponent(UITransform)!
      .convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    this.tap(local.x + HALF_W, HALF_H - local.y);
  }

  /* ---------------------------------------------------------------- */
  /* 除錯                                                             */
  /* ---------------------------------------------------------------- */

  debug(): CityListDebug {
    const state = this.model.state;
    let visibleRows = 0;
    const rowTexts = this.rowCells.map((cells) => {
      if (cells[0]?.node.active) visibleRows += 1;
      return cells.map((label) => label.string);
    });
    return {
      opened: this.opened,
      filter: state.filter,
      sort: state.sort,
      dir: state.dir,
      page: state.page,
      pages: state.pages,
      total: state.total,
      counts: state.counts,
      pageRows: state.pageRows.map((row) => row.name),
      selected: state.selected,
      sub: this.subLabel?.string ?? '',
      pageText: this.pageLabel?.string ?? '',
      tabLabels: this.tabLabels.map((label) => label.string),
      sortLabels: this.sortLabels.map((label) => label.string),
      rowTexts,
      visibleRows,
      hitNames: this.hits.map((hit) => hit.name),
      nodeCount: countNodes(this.node),
      childCount: this.node.children.length,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 私有：Graphics / Label                                            */
  /* ---------------------------------------------------------------- */

  private paint(rect: DesignRect, color: string, alpha: number): void {
    const g = this.g;
    if (!g) return;
    g.fillColor = hex(color, alpha);
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.fill();
  }

  private line(x1: number, y1: number, x2: number, y2: number, color: string, alpha: number): void {
    const g = this.g;
    if (!g) return;
    g.strokeColor = hex(color, alpha);
    g.lineWidth = 1;
    g.moveTo(x1 - HALF_W, HALF_H - y1);
    g.lineTo(x2 - HALF_W, HALF_H - y2);
    g.stroke();
  }

  private makeLabel(
    name: string,
    text: string,
    rect: DesignRect,
    fontSize: number,
    color: string,
    opts: { align?: Align; bold?: boolean; lineHeight?: number; overflow?: number } = {}
  ): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.node;
    const transform = node.addComponent(UITransform);
    transform.setContentSize(rect.w, rect.h);
    node.setPosition(rect.x + rect.w / 2 - HALF_W, HALF_H - (rect.y + rect.h / 2));
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = fontSize;
    label.lineHeight = opts.lineHeight ?? Math.round(fontSize * 1.42);
    label.color = hex(color);
    label.horizontalAlign =
      opts.align === 'left'
        ? Label.HorizontalAlign.LEFT
        : opts.align === 'right'
          ? Label.HorizontalAlign.RIGHT
          : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = opts.overflow ?? Label.Overflow.SHRINK;
    label.enableWrapText = false;
    label.isBold = opts.bold === true;
    return label;
  }
}
