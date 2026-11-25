/**
 * 战场背景（Cocos 侧）—— 移植自 `F:\sanguo\game\src\view\battleBg.ts`（318 行）。
 *
 * web 侧画的是 Canvas2D 的「地面平铺 + 三条视差带 + 上下压暗」：
 *   assets/bg/orig/floor<NN>.png  地面，256×256 一块，按 `camPx % 256` 滚动
 *   assets/bg/orig/bg<NN>.png     远景带（视差 0.05，宽 730/880/1000）
 *   assets/bg/orig/mg<NN>.png     中景带（视差 0.1333）
 *   assets/bg/orig/fg<NN>.png     近景带（视差 0.2）
 *
 * Cocos 侧的三处等价做法（都是「能被 tsc 验、也能被 Creator 的常规渲染器验」的路径）：
 *  1. **地面平铺**不用 `Sprite.Type.TILED`（无法在本机验证引擎的 tiling 语义），改用
 *     3 列 × 6 行共 18 个 SIMPLE sprite，整块节点按 `-((camPx % 256 + 256) % 256)`
 *     纵向平移 —— 覆盖 900 高的战场 + 一格的余量，永远不会露缝。
 *     （越出战场带的部分由上层 `gBase` 的不透明顶栏/控制台盖住，见 `BattleRoot.redrawBase()`。）
 *  2. **视差带**用 3 个 SIMPLE sprite，横向位置完全复刻 `layerX()`：
 *     `slack = max(0, 自然宽 - 750)`，`pan = clamp(rate*camPx, -slack/2, slack/2)`，
 *     左边缘 = `-slack/2 + pan`。
 *  3. **上下压暗**（顶 60px 0.30→0、底 110px 0→0.30）用 Graphics 分 8 段阶梯近似
 *     —— Cocos 的 Graphics 没有线性渐变。
 *
 * 与 web 的差异：不含 `?bgmode=` / `?bgbench=1` 那套调试分支（`battleBgTick`、
 * `benchOnce`、`debugBgState`），Cocos 侧不需要帧率基准。
 *
 * 图层顺序：本类自己是一个节点，调用方要把它插在 `gBase` **之下**、HUD 顶栏 **之上**。
 */
// 註：3.8.8 的構建產物只導出 `MaskComponent`，`Mask` 退化成 `removed:!0` 的廢棄別名，
// 在 ES 模組命名空間裡是 `undefined` → `addComponent(undefined)` 拋 Error 3804，Battle 場景黑屏。
// 這裡用別名導入（`MaskComponent as Mask`），代碼其餘部分不用改。證據：project/74。
import { Color, Graphics, Layers, MaskComponent as Mask, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { loadFrame } from './ArtLayer';
import { FIELD_H, FIELD_TOP, ROW_PX } from './view/layout';

/** 视差带高度（设计 px） */
export const BAND_H = 100;
/** 视差带纵向拉伸（web 的 `BAND_SCALE`） */
export const BAND_SCALE = 1.04;
/** 地面贴图一块的边长 */
export const FLOOR_PX = 256;
/** 三条视差带（web 私有常量，这里导出便于测试/报告引用） */
export const RATE_BG = 0.05;
export const RATE_MG = 0.1333;
export const RATE_FG = 0.2;
/** 地形套数：`terrains.json` 里 floor/bg/mg/fg 各 12 张 */
export const TERRAIN_COUNT = 12;

const FLOOR_COLS = 3;
/**
 * 地面行数：贴图边长 256，滚动相位 0..255 向下平移，最上一行的上边缘也必须
 * 始终 ≥ 战场带上边缘（450），故行数取 6（中心 -450..830），比「刚好铺满 900」多两行。
 */
const FLOOR_ROWS = 6;
const HALF_W = 375;
const FIELD_CENTER_DESIGN_Y = FIELD_TOP + FIELD_H / 2;

interface TerrainArt {
  floor: SpriteFrame | null;
  bg: SpriteFrame | null;
  mg: SpriteFrame | null;
  fg: SpriteFrame | null;
}

function bandNode(parent: Node, name: string): { node: Node; sprite: Sprite } {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  node.parent = parent;
  const transform = node.addComponent(UITransform);
  transform.setAnchorPoint(0.5, 0.5);
  transform.setContentSize(1, 1);
  const sprite = node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.enabled = false;
  return { node, sprite };
}

/** `bg/orig/<kind><NN>`（不带扩展名：bundle 里路径就是资源名） */
export function origPath(kind: 'floor' | 'bg' | 'mg' | 'fg', terrain: number): string {
  const id = ((Math.trunc(terrain) % TERRAIN_COUNT) + TERRAIN_COUNT) % TERRAIN_COUNT;
  return `bg/orig/${kind}${id < 10 ? `0${id}` : id}`;
}

export class BattleBg {
  readonly node: Node;

  private readonly floorRoot: Node;
  private readonly floorTiles: Sprite[] = [];
  private readonly bgBand: { node: Node; sprite: Sprite };
  private readonly mgBand: { node: Node; sprite: Sprite };
  private readonly fgBand: { node: Node; sprite: Sprite };
  private readonly vignette: Graphics;

  private readonly cache = new Map<number, TerrainArt>();
  private art: TerrainArt | null = null;
  private terrain = -1;
  private camX = 0;
  private camPx = 0;
  private token = 0;
  private bandWidths = { bg: 0, mg: 0, fg: 0 };
  private loaded = 0;

  constructor(parent: Node, terrain = 0) {
    this.node = new Node('BattleBg');
    this.node.layer = Layers.Enum.UI_2D;
    this.node.parent = parent;
    const transform = this.node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(HALF_W * 2, FIELD_H);
    // 设计坐标（左上原点）→ 节点坐标：x - 375 / 667 - y
    this.node.setPosition(0, 667 - FIELD_CENTER_DESIGN_Y, 0);

    // 地面：3×5 个 SIMPLE sprite，整块一起纵向平移。
    // 平移的是 clip 里的子节点，clip 自己是静止的矩形遮罩 —— 遮罩必须挂在不动的那一层，
    // 否则遮罩跟着内容一起走就起不到裁剪作用（地面按 256 滚动，必然越出战场带上下边界）。
    const clip = new Node('FloorClip');
    clip.layer = Layers.Enum.UI_2D;
    clip.parent = this.node;
    const clipTransform = clip.addComponent(UITransform);
    clipTransform.setAnchorPoint(0.5, 0.5);
    clipTransform.setContentSize(HALF_W * 2, FIELD_H);
    clip.setPosition(0, 0, 0);
    const mask = clip.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;

    this.floorRoot = new Node('Floor');
    this.floorRoot.layer = Layers.Enum.UI_2D;
    this.floorRoot.parent = clip;
    const floorTransform = this.floorRoot.addComponent(UITransform);
    floorTransform.setAnchorPoint(0.5, 0.5);
    floorTransform.setContentSize(HALF_W * 2, FIELD_H);
    for (let r = 0; r < FLOOR_ROWS; r += 1) {
      for (let c = 0; c < FLOOR_COLS; c += 1) {
        const tile = new Node(`Floor${r}_${c}`);
        tile.layer = Layers.Enum.UI_2D;
        tile.parent = this.floorRoot;
        const t = tile.addComponent(UITransform);
        t.setAnchorPoint(0.5, 0.5);
        t.setContentSize(FLOOR_PX, FLOOR_PX);
        // 局部原点 = 战场带中心；行向上排（-450 起，每 256 一行）
        tile.setPosition(-256 + FLOOR_PX * c, -FIELD_H / 2 + FLOOR_PX * r, 0);
        const sprite = tile.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.enabled = false;
        this.floorTiles.push(sprite);
      }
    }

    // 三条视差带：都贴在战场带顶部
    this.bgBand = bandNode(this.node, 'BandBg');
    this.mgBand = bandNode(this.node, 'BandMg');
    this.fgBand = bandNode(this.node, 'BandFg');
    for (const band of [this.bgBand, this.mgBand, this.fgBand]) {
      band.node.setPosition(0, FIELD_H / 2 - (BAND_H * BAND_SCALE) / 2, 0);
    }

    // 上下压暗（Graphics 阶梯近似）
    const vNode = new Node('Vignette');
    vNode.layer = Layers.Enum.UI_2D;
    vNode.parent = this.node;
    const vTransform = vNode.addComponent(UITransform);
    vTransform.setAnchorPoint(0.5, 0.5);
    vTransform.setContentSize(HALF_W * 2, FIELD_H);
    this.vignette = vNode.addComponent(Graphics);
    this.drawVignette();

    this.setTerrain(terrain);
  }

  /** 背景是否已经可以顶替「纯色渐变」：地面或任意一条视差带到位即算。 */
  get ready(): boolean {
    return this.loaded > 0;
  }

  get terrainId(): number {
    return this.terrain;
  }

  /** 换地形：已缓存则同步切，否则异步载入 4 张图。 */
  setTerrain(terrain: number): void {
    const id = ((Math.trunc(terrain) % TERRAIN_COUNT) + TERRAIN_COUNT) % TERRAIN_COUNT;
    if (id === this.terrain) return;
    this.terrain = id;
    const cached = this.cache.get(id);
    if (cached) {
      this.art = cached;
      this.applyArt();
      return;
    }
    const art: TerrainArt = { floor: null, bg: null, mg: null, fg: null };
    this.cache.set(id, art);
    this.art = art;
    this.applyArt();
    const token = ++this.token;
    const kinds = ['floor', 'bg', 'mg', 'fg'] as const;
    for (const kind of kinds) {
      loadFrame(origPath(kind, id), (frame) => {
        if (token !== this.token || this.terrain !== id) return;
        art[kind] = frame;
        this.loaded += frame ? 1 : 0;
        this.applyArt();
      });
    }
  }

  /** 每帧（或镜头变化时）调：`camX` 是逻辑列坐标，与 `view/layout.project()` 同一口径。 */
  setCamX(camX: number): void {
    if (!Number.isFinite(camX) || camX === this.camX) return;
    this.camX = camX;
    this.camPx = camX * ROW_PX;
    // 地面：相位回绕，永远不露缝
    const phase = ((this.camPx % FLOOR_PX) + FLOOR_PX) % FLOOR_PX;
    this.floorRoot.setPosition(0, -phase, 0);
    this.layoutBands();
  }

  setVisible(visible: boolean): void {
    this.node.active = visible;
  }

  dispose(): void {
    this.node.destroy();
  }

  // ── 内部 ────────────────────────────────────────────────────────────

  private applyArt(): void {
    const art = this.art;
    if (!art) return;
    if (art.floor) {
      for (const sprite of this.floorTiles) {
        sprite.spriteFrame = art.floor;
        sprite.enabled = true;
      }
    }
    this.applyBand(this.bgBand, art.bg, 'bg');
    this.applyBand(this.mgBand, art.mg, 'mg');
    this.applyBand(this.fgBand, art.fg, 'fg');
  }

  private applyBand(band: { node: Node; sprite: Sprite }, frame: SpriteFrame | null, key: 'bg' | 'mg' | 'fg'): void {
    if (!frame) return;
    band.sprite.spriteFrame = frame;
    band.sprite.enabled = true;
    const natural = frame.originalSize;
    const w = natural.width > 0 ? natural.width : HALF_W;
    this.bandWidths[key] = w;
    const transform = band.node.getComponent(UITransform);
    transform?.setContentSize(w, BAND_H * BAND_SCALE);
    this.layoutBands();
  }

  /** 复刻 web 的 `layerX(img, rate, camPx)`。 */
  private layerX(width: number, rate: number): number {
    const slack = Math.max(0, width - HALF_W * 2);
    const pan = Math.max(-slack / 2, Math.min(slack / 2, rate * this.camPx));
    return -slack / 2 + pan;
  }

  private layoutBands(): void {
    const pairs: { band: { node: Node; sprite: Sprite }; key: 'bg' | 'mg' | 'fg'; rate: number }[] = [
      { band: this.bgBand, key: 'bg', rate: RATE_BG },
      { band: this.mgBand, key: 'mg', rate: RATE_MG },
      { band: this.fgBand, key: 'fg', rate: RATE_FG },
    ];
    for (const item of pairs) {
      const width = this.bandWidths[item.key];
      if (!width) continue;
      const left = this.layerX(width, item.rate);
      // 设计坐标左边缘 → 节点局部 x（锚点 0.5）
      const localX = left + width / 2 - HALF_W;
      item.band.node.setPosition(localX, FIELD_H / 2 - (BAND_H * BAND_SCALE) / 2, 0);
    }
  }

  /** 顶 60px 0.30→0、底 110px 0→0.30，各切 8 段（Graphics 无渐变）。 */
  private drawVignette(): void {
    const g = this.vignette;
    g.clear();
    const bottom = -FIELD_H / 2;
    const top = FIELD_H / 2;
    const slices = 8;
    const topH = 60;
    const bottomH = 110;
    for (let i = 0; i < slices; i += 1) {
      const t0 = i / slices;
      const t1 = (i + 1) / slices;
      const a0 = 0.3 * (1 - t0);
      const a1 = 0.3 * (1 - t1);
      const alpha = Math.round(((a0 + a1) / 2) * 255);
      g.fillColor = new Color(8, 10, 14, alpha);
      // 从顶边往下：第 i 段覆盖 [top - topH*t1, top - topH*t0]
      g.rect(-HALF_W, top - topH * t1, HALF_W * 2, topH * (t1 - t0) + 0.5);
      g.fill();
      // 从底边往上
      g.fillColor = new Color(8, 10, 14, alpha);
      g.rect(-HALF_W, bottom + bottomH * t1 - bottomH * (t1 - t0), HALF_W * 2, bottomH * (t1 - t0) + 0.5);
      g.fill();
    }
  }
}
