/**
 * EndingPanel.ts — 結局畫面（掛在任何既有場景的 Canvas 下，不新建 .scene）。
 *
 * 版式（750×1334，左上原點）：
 *   頁頭      0–124      小字 kicker + 大標題（title 40）
 *   正文面板  176–476    3 段結局段落（body 18，lineHeight 32）
 *   統計      516–612    用時 / 城數 / 武將 / 擊破勢力（head 22 + num 20）
 *   印章      640–772    plate_sel 132×132，文字「統一」/「滅亡」
 *   收束語    790–824
 *   史官曰    930–1026
 *   「終」    1050–1094
 *   重新開始  1184–1248  （底邊 = 1334 − 86，與月令按鈕同底線）
 *
 * 無資源降級：bg/map_bg 失敗 → map/chinamap → 全失敗用 Graphics 畫地圖剪影；
 * UiSkin 九宮失敗時 makeNineSlice/makePanel 自帶 Graphics 描邊，不會白屏。
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
import { addVeil, ArtBg, HALF_H, HALF_W } from './ArtLayer';
import {
  clearRunStorage,
  endingOf,
  endingSignature,
  formatDuration,
  type EndingCityLike,
  type EndingGeneralLike,
  type EndingSaveLike,
  type EndingState,
  type StorageLike,
} from './EndingModel';
import { makeBtn, makeNineSlice, makePanel, placeDesign } from './UiSkin';
import { COLORS, FONT_FAMILY } from './view/theme';
import { guardTouch } from './InputGuard';

const { ccclass } = _decorator;

export const ENDING_NODE_NAME = 'EndingPanel';

export interface DesignRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SCREEN: DesignRect = { x: 0, y: 0, w: 750, h: 1334 };

/** 全部設計座標集中在這裡，方便報告引用與版式對齊。 */
export const ENDING_LAYOUT = {
  screen: SCREEN,
  header: { x: 0, y: 0, w: 750, h: 124 } as DesignRect,
  kicker: { x: 55, y: 52, w: 640, h: 28 } as DesignRect,
  title: { x: 45, y: 82, w: 660, h: 60 } as DesignRect,
  rule: { x: 315, y: 152, w: 120, h: 2 } as DesignRect,
  bodyPanel: { x: 55, y: 176, w: 640, h: 300 } as DesignRect,
  body: { x: 77, y: 196, w: 596, h: 260 } as DesignRect,
  statX0: 17,
  statY: 516,
  statW: 170,
  statH: 96,
  statGap: 12,
  seal: { x: 309, y: 640, w: 132, h: 132 } as DesignRect,
  epithet: { x: 55, y: 790, w: 640, h: 34 } as DesignRect,
  coda: { x: 95, y: 930, w: 560, h: 96 } as DesignRect,
  endMark: { x: 255, y: 1050, w: 240, h: 44 } as DesignRect,
  restart: { x: 195, y: 1184, w: 360, h: 64 } as DesignRect,
  foot: { x: 75, y: 1262, w: 600, h: 24 } as DesignRect,
} as const;

export interface EndingPanelOptions {
  /** 由 lead 接：清完存檔後回標題頁（Boot 場景）。 */
  onRestart?: (() => void) | null;
  onClose?: (() => void) | null;
  /** 測試可注入假 storage；省略時用 sys.localStorage。 */
  storage?: StorageLike | null;
}

export interface EndingHit {
  name: string;
  rect: DesignRect;
  act: () => void;
}

export interface EndingDebug {
  opened: boolean;
  signature: string;
  kind: string;
  reason: string;
  label: string;
  title: string;
  kicker: string;
  body: string;
  epithet: string;
  seal: string;
  statLabels: string[];
  statValues: string[];
  stats: EndingState['stats'] | null;
  mapState: string;
  restarts: number;
  clearedKeys: string[];
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

function safeLocalStorage(): StorageLike | null {
  try {
    return (sys.localStorage as unknown as StorageLike) ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* EndingPanel                                                         */
/* ------------------------------------------------------------------ */

@ccclass('EndingPanel')
export class EndingPanel extends Component {
  private built = false;
  private opened = false;
  private state: EndingState | null = null;

  private bg: ArtBg | null = null;
  private g: Graphics | null = null;
  private mapState: 'pending' | 'ready' | 'failed' = 'pending';
  private triedChinaMap = false;

  private kickerLabel: Label | null = null;
  private titleLabel: Label | null = null;
  private bodyLabel: Label | null = null;
  private sealLabel: Label | null = null;
  private epithetLabel: Label | null = null;
  private codaLabel: Label | null = null;
  private endMarkLabel: Label | null = null;
  private footLabel: Label | null = null;
  private statLabels: Label[] = [];
  private statValues: Label[] = [];
  private hits: EndingHit[] = [];

  private onRestartCb: (() => void) | null = null;
  private onCloseCb: (() => void) | null = null;
  private storage: StorageLike | null = null;

  private restarts = 0;
  private clearedKeys: string[] = [];

  /* ---------------------------------------------------------------- */
  /* 靜態入口                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * 冪等：同一父節點下只會有一個 EndingPanel；重複呼叫會重用並刷新。
   */
  static show(parent: Node, state: EndingState, options: EndingPanelOptions = {}): EndingPanel {
    let node = parent.getChildByName(ENDING_NODE_NAME);
    if (!node) {
      node = new Node(ENDING_NODE_NAME);
      node.layer = Layers.Enum.UI_2D;
    }
    if (node.parent !== parent) node.parent = parent;
    let panel = node.getComponent(EndingPanel);
    if (!panel) panel = node.addComponent(EndingPanel);
    panel.build();
    panel.open(state, options);
    return panel;
  }

  /** lead 在 CampaignRoot.start() 末尾呼叫：沒結束就回 null，不會建節點。 */
  static showIfEnded(
    parent: Node,
    save: EndingSaveLike,
    cities: readonly unknown[],
    generals: readonly unknown[],
    options: EndingPanelOptions = {}
  ): EndingPanel | null {
    const state = endingOf(
      save,
      cities as readonly EndingCityLike[],
      generals as readonly EndingGeneralLike[]
    );
    if (!state) return null;
    const node = parent.getChildByName(ENDING_NODE_NAME);
    const existing = node ? node.getComponent(EndingPanel) : null;
    if (existing && existing.isOpen && existing.currentState?.signature === state.signature) {
      return existing;
    }
    return EndingPanel.show(parent, state, options);
  }

  static hide(parent: Node): void {
    const node = parent.getChildByName(ENDING_NODE_NAME);
    const panel = node ? node.getComponent(EndingPanel) : null;
    panel?.close();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  get currentState(): EndingState | null {
    return this.state;
  }

  get signature(): string {
    return endingSignature(this.state);
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

    // 1) 背景：地圖 → 失敗再試中國地圖 → 都失敗畫剪影。
    this.bg = new ArtBg(root, 'EndingBg', SCREEN, true);
    this.bg.load('bg/map_bg', () => this.onBackgroundDone());

    // 2) Graphics 層（剪影 / 漸層 / 裂痕 / 光暈 / 金線）。
    const frame = new Node('EndingFrame');
    frame.layer = Layers.Enum.UI_2D;
    frame.parent = root;
    const frameTransform = frame.addComponent(UITransform);
    frameTransform.setContentSize(SCREEN.w, SCREEN.h);
    frame.setPosition(0, 0);
    this.g = frame.addComponent(Graphics);

    // 3) 暗幕（全屏矩形是 addVeil 雙倍偏移 bug 的不動點，安全）。
    addVeil(root, 'EndingVeil', SCREEN, new Color(5, 7, 10, 196));

    // 4) 正文面板（九宮 frame_panel；無圖時 UiSkin 自己描邊）。
    const bodyPanel = makePanel(root, 'frame_panel', ENDING_LAYOUT.bodyPanel.w, ENDING_LAYOUT.bodyPanel.h, {
      fill: true,
      fillColor: '#0B0E13',
      fillAlpha: 214,
    });
    bodyPanel.name = 'EndingBodyPanel';
    placeDesign(
      bodyPanel,
      ENDING_LAYOUT.bodyPanel.x,
      ENDING_LAYOUT.bodyPanel.y,
      ENDING_LAYOUT.bodyPanel.w,
      ENDING_LAYOUT.bodyPanel.h
    );

    // 5) 文字。
    this.kickerLabel = this.makeLabel(
      'EndingKicker',
      '',
      ENDING_LAYOUT.kicker,
      22,
      COLORS.gold,
      { align: 'center' }
    );
    this.titleLabel = this.makeLabel(
      'EndingTitle',
      '',
      ENDING_LAYOUT.title,
      40,
      COLORS.goldLight,
      { align: 'center', bold: true, lineHeight: 48 }
    );
    this.bodyLabel = this.makeLabel('EndingBody', '', ENDING_LAYOUT.body, 18, COLORS.text, {
      align: 'left',
      lineHeight: 32,
      overflow: Label.Overflow.CLAMP,
    });
    this.epithetLabel = this.makeLabel(
      'EndingEpithet',
      '',
      ENDING_LAYOUT.epithet,
      22,
      COLORS.textDim,
      { align: 'center' }
    );
    this.codaLabel = this.makeLabel('EndingCoda', '', ENDING_LAYOUT.coda, 18, COLORS.textDim, {
      align: 'center',
      lineHeight: 30,
    });
    this.endMarkLabel = this.makeLabel(
      'EndingEndMark',
      '— 終 —',
      ENDING_LAYOUT.endMark,
      22,
      COLORS.goldDim,
      { align: 'center' }
    );
    this.footLabel = this.makeLabel(
      'EndingFoot',
      '',
      ENDING_LAYOUT.foot,
      16,
      COLORS.textFaint,
      { align: 'center' }
    );

    // 6) 四格統計。
    const statHeads = ['用時', '城數', '武將', '擊破勢力'];
    for (let i = 0; i < 4; i += 1) {
      const x = ENDING_LAYOUT.statX0 + i * (ENDING_LAYOUT.statW + ENDING_LAYOUT.statGap);
      const cell = makeNineSlice(root, 'plate_sq', ENDING_LAYOUT.statW, ENDING_LAYOUT.statH);
      cell.name = `EndingStatCell${i}`;
      placeDesign(cell, x, ENDING_LAYOUT.statY, ENDING_LAYOUT.statW, ENDING_LAYOUT.statH);
      const head = this.makeLabel(
        `EndingStatHead${i}`,
        statHeads[i],
        { x, y: ENDING_LAYOUT.statY + 10, w: ENDING_LAYOUT.statW, h: 26 },
        22,
        COLORS.textDim,
        { align: 'center' }
      );
      const value = this.makeLabel(
        `EndingStatValue${i}`,
        '',
        { x, y: ENDING_LAYOUT.statY + 38, w: ENDING_LAYOUT.statW, h: 46 },
        20,
        COLORS.goldLight,
        { align: 'center', bold: true }
      );
      this.statLabels.push(head);
      this.statValues.push(value);
    }

    // 7) 印章（plate_sel 九宮 + 兩行大字）。
    const seal = makeNineSlice(root, 'plate_sel', ENDING_LAYOUT.seal.w, ENDING_LAYOUT.seal.h);
    seal.name = 'EndingSeal';
    placeDesign(seal, ENDING_LAYOUT.seal.x, ENDING_LAYOUT.seal.y, ENDING_LAYOUT.seal.w, ENDING_LAYOUT.seal.h);
    this.sealLabel = this.makeLabel(
      'EndingSealText',
      '',
      { x: ENDING_LAYOUT.seal.x + 6, y: ENDING_LAYOUT.seal.y + 8, w: ENDING_LAYOUT.seal.w - 12, h: ENDING_LAYOUT.seal.h - 16 },
      40,
      COLORS.goldLight,
      { align: 'center', bold: true, lineHeight: 44 }
    );

    // 8) 重新開始（底邊 1248 = 1334 − 86）。
    const btn = makeBtn(root, 'plate_btn', '重新開始', ENDING_LAYOUT.restart.w, ENDING_LAYOUT.restart.h, {
      fontSize: 22,
      color: COLORS.goldLight,
    });
    btn.name = 'EndingRestart';
    placeDesign(btn, ENDING_LAYOUT.restart.x, ENDING_LAYOUT.restart.y, ENDING_LAYOUT.restart.w, ENDING_LAYOUT.restart.h);
    const btnLabel = btn.getChildByName('Label_重新開始');
    if (btnLabel) btnLabel.name = 'EndingRestartLabel';

    this.hits = [
      {
        name: 'restart',
        rect: ENDING_LAYOUT.restart,
        act: () => this.restart(),
      },
    ];

    this.node.active = false;
  }

  open(state: EndingState, options: EndingPanelOptions = {}): this {
    this.build();
    this.state = state;
    this.onRestartCb = options.onRestart ?? null;
    this.onCloseCb = options.onClose ?? null;
    if (options.storage !== undefined) this.storage = options.storage;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.refresh();
    if (!this.opened) {
      this.opened = true;
      input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'EndingPanel'), this);
    }
    return this;
  }

  close(): void {
    if (this.opened) {
      this.opened = false;
      input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'EndingPanel'), this);
    }
    this.node.active = false;
    this.onCloseCb?.();
  }

  onDestroy(): void {
    if (this.opened) {
      this.opened = false;
      input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'EndingPanel'), this);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 畫面刷新                                                         */
  /* ---------------------------------------------------------------- */

  private refresh(): void {
    if (!this.built || !this.state) return;
    const state = this.state;
    const unify = state.kind === 'unify';
    const accent = unify ? COLORS.goldLight : COLORS.enemyLight;

    if (this.kickerLabel) {
      this.kickerLabel.string = state.kicker;
      this.kickerLabel.color = hex(COLORS.gold);
    }
    if (this.titleLabel) {
      this.titleLabel.string = state.title;
      this.titleLabel.color = hex(accent);
    }
    if (this.bodyLabel) {
      this.bodyLabel.string = state.paragraphs.map((line) => `　　${line}`).join('\n');
      this.bodyLabel.color = hex(unify ? COLORS.text : '#E4D8D2');
    }
    if (this.sealLabel) {
      this.sealLabel.string = state.label === '統一' ? '統\n一' : '滅\n亡';
      this.sealLabel.color = hex(accent);
    }
    if (this.epithetLabel) {
      this.epithetLabel.string = state.epithet;
      this.epithetLabel.color = hex(unify ? COLORS.gold : COLORS.enemyLight);
    }
    if (this.codaLabel) {
      this.codaLabel.string = unify
        ? `後世修史，書曰：某年某月，天下復歸一統。\n${state.monarch} 之名，遂列於本紀。`
        : `後世修史，書曰：某年某月，${state.monarch}之國亡。\n其地入於他人，其民改奉新主。`;
    }
    if (this.footLabel) {
      this.footLabel.string = '此局已結 · 重新開始將清除本局進度';
    }
    if (this.statLabels.length === 4 && this.statValues.length === 4) {
      this.statLabels[0].string = '用時';
      this.statLabels[1].string = '城數';
      this.statLabels[2].string = '武將';
      this.statLabels[3].string = '擊破勢力';
      this.statValues[0].string = formatDuration(state.stats);
      this.statValues[1].string = `${state.stats.cityCount} / 60`;
      this.statValues[2].string = String(state.stats.generalCount);
      this.statValues[3].string = String(state.stats.brokenForces);
      for (const value of this.statValues) value.color = hex(accent);
    }
    this.drawFrame();
  }

  private drawFrame(): void {
    const g = this.g;
    if (!g || !this.state) return;
    const unify = this.state.kind === 'unify';
    g.clear();

    if (this.mapState !== 'ready') this.drawSilhouette(g);

    // 全局色調：統一是暖金，滅亡是暗紅。
    this.paint(SCREEN, unify ? COLORS.gold : COLORS.enemyDark, unify ? 8 : 44);

    // 頁首與頁尾漸層。
    for (let i = 0; i < 4; i += 1) {
      this.paint({ x: 0, y: i * 24, w: 750, h: 24 }, '#05070A', 120 - i * 22);
    }
    for (let i = 0; i < 8; i += 1) {
      this.paint({ x: 0, y: 1100 + i * 30, w: 750, h: 30 }, '#05070A', 18 + i * 12);
    }

    // 頁首金線與標題下的短線。
    this.paint({ x: 0, y: 123, w: 750, h: 1 }, COLORS.gold, 110);
    this.paint(ENDING_LAYOUT.rule, COLORS.gold, unify ? 190 : 120);
    this.line(315, 158, 360, 158, COLORS.goldDim, 80);
    this.line(390, 158, 435, 158, COLORS.goldDim, 80);

    // 四角金線。
    const corner = COLORS.goldDim;
    this.line(18, 18, 60, 18, corner, 140);
    this.line(18, 18, 18, 60, corner, 140);
    this.line(732, 18, 690, 18, corner, 140);
    this.line(732, 18, 732, 60, corner, 140);
    this.line(18, 1316, 60, 1316, corner, 140);
    this.line(18, 1316, 18, 1274, corner, 140);
    this.line(732, 1316, 690, 1316, corner, 140);
    this.line(732, 1316, 732, 1274, corner, 140);

    // 印章光暈 / 光芒（統一）或裂痕（滅亡）。
    const sealCx = 375;
    const sealCy = ENDING_LAYOUT.seal.y + ENDING_LAYOUT.seal.h / 2;
    if (unify) {
      this.circle(sealCx, sealCy, 86, COLORS.gold, 26, true);
      this.circle(sealCx, sealCy, 96, COLORS.gold, 90, false);
      for (let i = 0; i < 16; i += 1) {
        const angle = (Math.PI * 2 * i) / 16;
        const x1 = sealCx + Math.cos(angle) * 104;
        const y1 = sealCy + Math.sin(angle) * 104;
        const x2 = sealCx + Math.cos(angle) * 120;
        const y2 = sealCy + Math.sin(angle) * 120;
        this.line(x1, y1, x2, y2, COLORS.gold, 54);
      }
    } else {
      this.circle(sealCx, sealCy, 88, COLORS.enemy, 20, true);
      this.circle(sealCx, sealCy, 98, COLORS.enemy, 70, false);
      const cracks: number[][] = [
        [375, 196, 250, 360],
        [375, 196, 520, 340],
        [250, 360, 210, 520],
        [520, 340, 570, 520],
        [210, 520, 290, 700],
        [570, 520, 500, 720],
        [290, 700, 340, 860],
        [500, 720, 450, 900],
      ];
      for (const [x1, y1, x2, y2] of cracks) {
        this.line(x1, y1, x2, y2, COLORS.enemy, 70, 2);
      }
    }

    // 史官曰前的分隔。
    this.line(255, 1104, 495, 1104, COLORS.goldDim, 90);
    this.line(325, 1104, 375, 1104, COLORS.gold, 160);
    this.line(375, 1104, 425, 1104, COLORS.gold, 160);
  }

  private drawSilhouette(g: Graphics): void {
    const main: number[][] = [
      [120, 520], [150, 448], [212, 392], [286, 366], [352, 338], [420, 342],
      [486, 306], [548, 318], [598, 364], [628, 432], [640, 506], [618, 574],
      [642, 646], [610, 720], [568, 792], [512, 860], [446, 918], [382, 944],
      [330, 928], [286, 958], [232, 906], [196, 836], [166, 760], [138, 676],
      [112, 600],
    ];
    const northEast: number[][] = [
      [556, 306], [614, 268], [664, 286], [684, 330], [654, 374], [598, 378], [566, 344],
    ];
    const islandSouth: number[][] = [
      [354, 992], [396, 982], [412, 1012], [386, 1038], [348, 1024],
    ];
    const islandEast: number[][] = [
      [600, 768], [626, 790], [620, 840], [596, 858], [584, 812],
    ];

    g.fillColor = hex(COLORS.panelHi, 168);
    for (const shape of [main, northEast, islandSouth, islandEast]) {
      g.moveTo(shape[0][0] - HALF_W, HALF_H - shape[0][1]);
      for (let i = 1; i < shape.length; i += 1) {
        g.lineTo(shape[i][0] - HALF_W, HALF_H - shape[i][1]);
      }
      g.close();
      g.fill();
    }

    // 海岸線。
    g.strokeColor = hex(COLORS.goldDim, 110);
    g.lineWidth = 2;
    g.moveTo(main[0][0] - HALF_W, HALF_H - main[0][1]);
    for (let i = 1; i < main.length; i += 1) {
      g.lineTo(main[i][0] - HALF_W, HALF_H - main[i][1]);
    }
    g.close();
    g.stroke();

    // 經緯線。
    for (let x = 75; x <= 675; x += 75) this.line(x, 210, x, 1130, COLORS.goldDim, 9);
    for (let y = 210; y <= 1130; y += 75) this.line(40, y, 710, y, COLORS.goldDim, 9);

    // 幾個城點。
    const dots: number[][] = [
      [300, 520], [360, 470], [430, 520], [500, 450], [390, 620],
      [330, 700], [470, 700], [540, 620], [250, 620], [450, 800],
    ];
    for (const [x, y] of dots) this.circle(x, y, 3, COLORS.gold, 90, true);
  }

  /* ---------------------------------------------------------------- */
  /* 重開                                                             */
  /* ---------------------------------------------------------------- */

  restart(): void {
    const storage = this.storage ?? safeLocalStorage();
    this.clearedKeys = clearRunStorage(storage);
    this.restarts += 1;
    const callback = this.onRestartCb;
    if (callback) callback();
    else this.close();
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

  debug(): EndingDebug {
    return {
      opened: this.opened,
      signature: endingSignature(this.state),
      kind: this.state?.kind ?? '',
      reason: this.state?.reason ?? '',
      label: this.state?.label ?? '',
      title: this.titleLabel?.string ?? '',
      kicker: this.kickerLabel?.string ?? '',
      body: this.bodyLabel?.string ?? '',
      epithet: this.epithetLabel?.string ?? '',
      seal: (this.sealLabel?.string ?? '').replace(/\n/g, ''),
      statLabels: this.statLabels.map((label) => label.string),
      statValues: this.statValues.map((label) => label.string),
      stats: this.state?.stats ?? null,
      mapState: this.mapState,
      restarts: this.restarts,
      clearedKeys: this.clearedKeys.slice(),
      hitNames: this.hits.map((hit) => hit.name),
      nodeCount: countNodes(this.node),
      childCount: this.node.children.length,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 私有：背景 / Graphics 小工具                                      */
  /* ---------------------------------------------------------------- */

  private onBackgroundDone(): void {
    if (!this.bg) return;
    this.mapState = this.bg.state;
    if (this.mapState === 'failed' && !this.triedChinaMap) {
      this.triedChinaMap = true;
      this.bg.node.active = true;
      this.bg.load('map/chinamap', () => this.onBackgroundDone());
    }
    this.drawFrame();
  }

  private paint(rect: DesignRect, color: string, alpha: number): void {
    const g = this.g;
    if (!g) return;
    g.fillColor = hex(color, alpha);
    g.rect(rect.x - HALF_W, HALF_H - rect.y - rect.h, rect.w, rect.h);
    g.fill();
  }

  private line(x1: number, y1: number, x2: number, y2: number, color: string, alpha: number, width = 1): void {
    const g = this.g;
    if (!g) return;
    g.strokeColor = hex(color, alpha);
    g.lineWidth = width;
    g.moveTo(x1 - HALF_W, HALF_H - y1);
    g.lineTo(x2 - HALF_W, HALF_H - y2);
    g.stroke();
  }

  private circle(cx: number, cy: number, radius: number, color: string, alpha: number, fill: boolean): void {
    const g = this.g;
    if (!g) return;
    if (fill) {
      g.fillColor = hex(color, alpha);
      g.circle(cx - HALF_W, HALF_H - cy, radius);
      g.fill();
    } else {
      g.strokeColor = hex(color, alpha);
      g.lineWidth = 2;
      g.circle(cx - HALF_W, HALF_H - cy, radius);
      g.stroke();
    }
  }

  private makeLabel(
    name: string,
    text: string,
    rect: DesignRect,
    fontSize: number,
    color: string,
    opts: { align?: 'left' | 'center' | 'right'; bold?: boolean; lineHeight?: number; overflow?: number } = {}
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
    label.enableWrapText = true;
    label.isBold = opts.bold === true;
    return label;
  }
}
