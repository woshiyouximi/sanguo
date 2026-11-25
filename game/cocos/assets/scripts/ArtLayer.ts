/**
 * 美术接入薄层（Cocos Creator 3.8）—— 只做「画一张图」，不含任何游戏逻辑。
 *
 * 全部美术资源都在自定义 bundle「res」的 `assets/bundles/res/` 下：
 *   bg/map_bg     大地图氛围衬底（832×1216，cover）
 *   map/chinamap  真正的地图（1280×960，城市坐标就是这幅图的像素坐标）
 *   map/city_1..4 城点图元（人口四分档）+ map/point 光标
 *   bg/policy/*   内政页朝堂远景 + 预烘柔焦地面
 *   anim/general  武将小人图集（原作 PAK 抽帧，BODY/WEAPON/HORSE 三层）
 *   bg/deploy_bg  出征编成底图
 *   bg/hud_bar    战斗 HUD 顶栏
 *   hero/<繁名>   主将立绘（webp，路径要 encodeURIComponent）
 *   anim/atlas_00 + anim/atlas  单位帧图集（80×104 帧，attack_front / walk_back / walk_front）
 *
 * 设计原则（对应 project/24_Cocos美术接入.md）：
 *  1. 所有加载异步，失败一律 `console.warn` + 返回 null，**绝不抛异常、绝不留白块**；
 *     调用方拿不到图就继续用它原来的 Graphics 占位。
 *  2. 图片节点创建时就摆好位置，图到了才 `spriteFrame = frame`，所以不会闪。
 *  3. 坐标口径与其它脚本一致：设计 750×1334、左上原点，落到节点 `x-375 / 667-y`。
 */
import {
  Asset,
  Color,
  Graphics,
  ImageAsset,
  JsonAsset,
  Label,
  Layers,
  Node,
  Rect,
  Size,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Vec2,
} from 'cc';
import { getResBundle } from './DataLoader';

export const HALF_W = 375;
export const HALF_H = 667;

/** 设计坐标矩形（左上原点） */
export interface DesignRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 设计坐标 → 节点局部坐标（锚点 0.5，锚点在矩形中心） */
function placeNode(node: Node, r: DesignRect): UITransform {
  const transform = node.addComponent(UITransform);
  transform.setAnchorPoint(0.5, 0.5);
  transform.setContentSize(Math.max(1, r.w), Math.max(1, r.h));
  node.setPosition(r.x + r.w / 2 - HALF_W, HALF_H - (r.y + r.h / 2), 0);
  return transform;
}

function newLayerNode(parent: Node, name: string): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  node.parent = parent;
  return node;
}

/**
 * 本文件专用的资源加载：必须走 `load(path, type, onProgress, onComplete)` 四参形式。
 *
 * 为什么不用 `DataLoader.loadRes`：它传的是 `load(path, type, cb)` 三参，引擎把第三参
 * 当成 onProgress，完成回调永远不触发（实测 `ArtSprite.state` 一直停在 'pending'，
 * 缩略立绘因此永远不显示）。资源多的屏（编成 12 格）会全部卡住，只有单张的屏看不出来。
 */
function loadAsset<T extends Asset>(
  path: string,
  type: new () => T,
  cb: (err: Error | null, asset: T | null) => void,
): void {
  void getResBundle().then((bundle) => {
    bundle.load(path, type, null, (err: Error | null, asset: T) => cb(err, asset ?? null));
  });
}

/**
 * 把一张图加载成 SpriteFrame。
 *
 * 为什么不用 `loadRes(path, SpriteFrame)` 就完事：仓库里 hero 的 `.meta` 是
 * `importer:"image"` + `userData.type:"texture"`，**没有 spriteFrame 子资产**，
 * 直接要 SpriteFrame 会失败。所以先拿 ImageAsset 自己包一层 SpriteFrame
 * （这条路对所有 image 资源都成立），失败再退回 SpriteFrame。
 */
export function loadFrame(path: string, cb: (frame: SpriteFrame | null) => void): void {
  loadAsset(path, ImageAsset, (err, image) => {
    if (image) {
      try {
        const texture = new Texture2D();
        texture.image = image;
        const frame = new SpriteFrame();
        frame.texture = texture;
        cb(frame);
        return;
      } catch (e) {
        console.warn(`[ArtLayer] ${path} 包 SpriteFrame 失敗：${String(e)}`);
      }
    } else if (err) {
      console.warn(`[ArtLayer] load('${path}', ImageAsset) 失敗：${err.message}`);
    }
    loadAsset(path, SpriteFrame, (err2, frame) => {
      if (frame) {
        cb(frame);
        return;
      }
      console.warn(`[ArtLayer] load('${path}') 失敗，回退佔位：${err2?.message ?? 'no asset'}`);
      cb(null);
    });
  });
}

/**
 * 一张「底图」：创建时是空节点（不占渲染），图到了才显示。
 * `state` 供调用方决定要不要继续画 Graphics 占位。
 */
export class ArtBg {
  readonly node: Node;
  readonly sprite: Sprite;
  private readonly transform: UITransform;
  private readonly base: DesignRect;
  private readonly cover: boolean;
  state: 'pending' | 'ready' | 'failed' = 'pending';

  constructor(parent: Node, name: string, rect: DesignRect, cover = false) {
    this.node = newLayerNode(parent, name);
    this.transform = placeNode(this.node, rect);
    this.base = { ...rect };
    this.cover = cover;
    this.sprite = this.node.addComponent(Sprite);
    this.sprite.type = Sprite.Type.SIMPLE;
    this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.sprite.enabled = false; // 图到之前不渲染，避免白色空框
  }

  load(path: string, onReady?: () => void): void {
    loadFrame(path, (frame) => {
      if (!frame) {
        this.state = 'failed';
        this.node.active = false;
        onReady?.();
        return;
      }
      const size = frame.originalSize;
      if (this.cover && size.width > 0 && size.height > 0) {
        // cover：等比放大到把 base 矩形填满，多出来的部分溢出屏幕，不拉伸。
        const scale = Math.max(this.base.w / size.width, this.base.h / size.height);
        this.transform.setContentSize(size.width * scale, size.height * scale);
      }
      this.sprite.spriteFrame = frame;
      this.sprite.enabled = true;
      this.state = 'ready';
      onReady?.();
    });
  }
}

/**
 * 蒙版矩形在**节点局部坐标**里的位置：以节点原点（= 矩形中心）为中心，尺寸不变。
 *
 * 这里是 `addVeil()` 双倍偏移 bug 的根治点（r88 报告，`project/118_Cocos版式对齐.md` §5）：
 * 老代码先用 `placeNode()` 把节点摆到矩形中心（**第一次**换算），接着又在局部坐标里画
 * `(rect.x - HALF_W, HALF_H - rect.y - rect.h)` —— 那是「节点位于父节点原点」时才成立的写法，
 * 等于把「设计坐标 → 本地坐标」的位移算了**两次**，实际画出来的设计矩形是
 *   `{ x: 2*rect.x + rect.w/2 - 375, y: 2*rect.y + rect.h/2 - 667, w, h }`。
 * 只有正好以屏幕中心为中心的矩形（例如 `{0, 0, 750, 1334}` 整屏蒙版，它是该换算的不动点）
 * 才碰巧正确，所以这个 bug 一直只在地图蒙版上暴露。
 *
 * 修法：局部坐标里**只画以原点为中心的矩形**，一次位移都不做。
 */
export function veilLocalRect(rect: DesignRect): { x: number; y: number; w: number; h: number } {
  return { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h };
}

/** 半透明蒙版：用 Graphics 画矩形（比再塞一张 1×1 白图省事，也不用额外资源）。 */
export function addVeil(parent: Node, name: string, rect: DesignRect, color: Color, radius = 0): Graphics {
  const node = newLayerNode(parent, name);
  placeNode(node, rect); // 唯一一次「设计 → 本地」换算：节点中心 = rect 中心
  const g = node.addComponent(Graphics);
  g.fillColor = color;
  const local = veilLocalRect(rect); // 局部坐标下相对节点原点画，别再套一次位移
  if (radius > 0) g.roundRect(local.x, local.y, local.w, local.h, radius);
  else g.rect(local.x, local.y, local.w, local.h);
  g.fill();
  return g;
}

/** 一张 Sprite 图层（先把节点摆好，图到了再赋值）。 */
export class ArtSprite {
  readonly node: Node;
  readonly sprite: Sprite;
  private readonly transform: UITransform;
  private readonly fit: 'stretch' | 'contain';
  /** 调用方希望它显示吗（图可能还没到）。图到齐后据此决定是否 node.active。 */
  private wantVisible = false;
  state: 'pending' | 'ready' | 'failed' = 'pending';

  constructor(parent: Node, name: string, rect: DesignRect, fit: 'stretch' | 'contain' = 'stretch') {
    this.node = newLayerNode(parent, name);
    this.transform = placeNode(this.node, rect);
    this.fit = fit;
    this.sprite = this.node.addComponent(Sprite);
    this.sprite.type = Sprite.Type.SIMPLE;
    this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.sprite.enabled = false;
  }

  /** 直接给已经拿到的 frame（例如 atlas 里切出来的一帧）。 */
  apply(frame: SpriteFrame | null, size?: { w: number; h: number }): boolean {
    if (!frame) {
      this.state = 'failed';
      this.node.active = false;
      return false;
    }
    if (size) this.transform.setContentSize(size.w, size.h);
    else if (this.fit === 'contain') {
      const s = frame.originalSize;
      if (s.width > 0 && s.height > 0) {
        const cur = this.transform.contentSize;
        const scale = Math.min(cur.width / s.width, cur.height / s.height);
        this.transform.setContentSize(s.width * scale, s.height * scale);
      }
    }
    this.sprite.spriteFrame = frame;
    this.sprite.enabled = true;
    this.state = 'ready';
    // 关键：drawGenGrid 这类调用方是在图到达之前就 setVisible(true) 的，
    // 那时 state 还是 'pending'，节点被关掉了；图到了必须按 wantVisible 恢复。
    if (this.wantVisible) this.node.active = true;
    return true;
  }

  load(path: string, onReady?: (ok: boolean) => void): void {
    loadFrame(path, (frame) => {
      const ok = this.apply(frame);
      onReady?.(ok);
    });
  }

  /** 立绘专用：`hero/<繁名>`。本地 bundle 的 key 是原样中文，但 web 版 URL 编码过，
   *  两种都试一次，谁先成都算成；全失败就隐藏节点（不留白块）。 */
  loadHero(name: string, onReady?: (ok: boolean) => void): void {
    loadFrame(`hero/${name}`, (frame) => {
      if (frame) {
        // 必须先把 apply 的结果取出来再传：写成 `onReady?.(this.apply(frame))` 时
        // TS 编译成 `onReady == null || onReady(this.apply(frame))`，onReady 为空的
        // 调用方（编成缩略图就是这样调的）会短路，apply 根本不执行 —— 图也就永远不显示。
        const ok = this.apply(frame);
        onReady?.(ok);
        return;
      }
      const encoded = encodeURIComponent(name);
      if (encoded === name) {
        this.apply(null);
        onReady?.(false);
        return;
      }
      loadFrame(`hero/${encoded}`, (frame2) => {
        const ok = this.apply(frame2);
        onReady?.(ok);
      });
    });
  }

  setPosition(designX: number, designY: number): void {
    const size = this.transform.contentSize;
    this.node.setPosition(designX + size.width / 2 - HALF_W, HALF_H - (designY + size.height / 2), 0);
  }

  setVisible(visible: boolean): void {
    this.wantVisible = visible;
    this.node.active = visible && this.state === 'ready';
  }
}

/** 给 Label 加 1px 深色描边（底图上来之后，小字必须描边才看得清）。 */
export function addOutline(label: Label, color = new Color(6, 8, 12, 235), width = 1): void {
  // 用 3.8 的 Label 内建描边：老的 LabelOutline 组件会刷 deprecated 警告
  label.enableOutline = true;
  label.outlineColor = color;
  label.outlineWidth = width;
}

/** 单位帧图集：`anim/atlas.json` 是自定义格式（pages[].sprites[]，左上原点像素坐标）。 */
export interface AtlasPage {
  file: string;
  w: number;
  h: number;
  sprites: { name: string; x: number; y: number; w: number; h: number }[];
}

export function buildAtlasFrames(page: AtlasPage, texture: Texture2D): Map<string, SpriteFrame> {
  const frames = new Map<string, SpriteFrame>();
  const texW = texture.width || page.w;
  const texH = texture.height || page.h;
  for (const s of page.sprites) {
    const frame = new SpriteFrame();
    frame.texture = texture;
    // meta 里的 y 是「图集自上而下的行号」，但我们用 ImageAsset 手工建 Texture2D，
    // 上传时行 0 落在纹理坐标下端（等价于整张图上下翻转），所以这里**不要**再翻 y。
    // 实测：rect.y = s.y 能正确取到该帧；按 texH - s.y - s.h 翻的话落在空白区（整屏无小人）。
    frame.rect = new Rect(s.x, s.y, s.w, s.h);
    frame.originalSize = new Size(s.w, s.h);
    frame.offset = new Vec2(0, 0);
    frames.set(s.name, frame);
  }
  // 纹理尺寸和 json 声明的 page 不一致时（被压过），按比例纠一次。
  if (texW !== page.w || texH !== page.h) {
    const sx = texW / page.w;
    const sy = texH / page.h;
    for (const s of page.sprites) {
      const frame = frames.get(s.name);
      if (frame) frame.rect = new Rect(s.x * sx, s.y * sy, s.w * sx, s.h * sy);
    }
  }
  return frames;
}

/**
 * 加载 `anim/atlas` / `anim/units` 帧图集。成功回调 (frames, page, groups)；
 * 任何一步失败回调全 null 并 warn。供 BattleRoot 用；不改变任何战斗数据结构。
 *
 * **支持多页**（`pages[]` 每页一张 PNG，每页 ≤2048，绕開微信小游戏纹理上限）：
 * 逐页 `loadFrame` → `buildAtlasFrames` → 帧名全局唯一的 SpriteFrame **合并进同一个 Map**，
 * 所以调用方（`BattleRoot`）拿到的仍是「一次回调、一张帧表」，per-frame 贴图由
 * `SpriteFrame.texture` 自己带着，画的时候不需要知道页码。今天 web/cocos 都是单页
 * （2048×1730），行为与改造前逐字节一致。
 *
 * `groups` 是 json 顶层的 `groups` 原样（`units.json` 的 FORCE 造型按兵種分組，
 * 每組 `back`=M 藍軍 / `front`=N 紅軍；`atlas.json` 没有这个键 → null）。
 * 回调的 `page` 是第 0 页（老调用方只拿它判 null，语义不变）。
 */
export function loadUnitAtlas(
  imagePath: string,
  jsonPath: string,
  cb: (
    frames: Map<string, SpriteFrame> | null,
    page: AtlasPage | null,
    groups: Record<string, unknown> | null,
  ) => void,
): void {
  loadAsset(jsonPath, JsonAsset, (err, json) => {
    const doc = json?.json as { pages?: AtlasPage[]; groups?: Record<string, unknown> } | undefined;
    const groups = doc?.groups && typeof doc.groups === 'object' && !Array.isArray(doc.groups) ? doc.groups : null;
    const pages = Array.isArray(doc?.pages) ? doc.pages.filter((p) => !!p && Array.isArray(p.sprites)) : [];
    if (pages.length === 0) {
      console.warn(`[ArtLayer] 圖集索引缺失：${jsonPath}${err ? `（${err.message}）` : ''}，戰鬥回退方塊`);
      cb(null, null, groups);
      return;
    }
    let left = pages.length;
    let failed = false;
    let dupNames = 0;
    const frames = new Map<string, SpriteFrame>();
    const done = (): void => {
      if (failed) return;
      if (dupNames > 0) console.warn(`[ArtLayer] 圖集跨頁幀名重複 ${dupNames} 個：${jsonPath}（保留先出現的頁）`);
      cb(frames.size > 0 ? frames : null, pages[0], groups);
    };
    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      const path = unitPageImagePath(i, page, imagePath, jsonPath);
      loadFrame(path, (frame) => {
        if (failed) return;
        if (!frame || !frame.texture) {
          console.warn(`[ArtLayer] 單位圖集貼圖缺失：${path}，戰鬥回退方塊`);
          failed = true;
          cb(null, null, groups);
          return;
        }
        try {
          const map = buildAtlasFrames(page, frame.texture as unknown as Texture2D);
          map.forEach((value, key) => {
            if (frames.has(key)) dupNames += 1;
            else frames.set(key, value);
          });
        } catch (e) {
          console.warn(`[ArtLayer] 切幀失敗：${String(e)}，戰鬥回退方塊`);
          failed = true;
          cb(null, null, groups);
          return;
        }
        left -= 1;
        if (left === 0) done();
      });
    }
  });
}

/**
 * 第 `i` 页的贴图资源路径。第 0 页用调用方给的 `firstPath`（与单页时代完全一致，
 * 不猜路径）；第 1 页起按 json 的 `page.file` + json 所在目录推（units.json 与
 * units_00.png / units_01.png 同目录 → `anim/units_01`）；`page.file` 缺失时把
 * `firstPath` 结尾的 `_00` 换成 `_0i` 兜底。
 */
function unitPageImagePath(i: number, page: AtlasPage, firstPath: string, jsonPath: string): string {
  if (i === 0) return firstPath;
  const file = typeof page.file === 'string' ? page.file.trim().replace(/\.png$/i, '') : '';
  if (file) {
    const slash = jsonPath.lastIndexOf('/');
    const dir = slash >= 0 ? jsonPath.slice(0, slash) : '';
    return dir ? `${dir}/${file}` : file;
  }
  return firstPath.replace(/_(\d{2})$/, `_${String(i).padStart(2, '0')}`);
}

/* ==========================================================================
 * anim/general：武将小人图集（BODY / WEAPON / HORSE 分页，帧带 ox/oy 锚点）
 * ========================================================================== */

export interface GeneralSpriteMeta {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 原作锚点：左上角 = (unitX - ox, unitY - oy)，oy 是「脚底到帧顶」的距离 */
  ox: number;
  oy: number;
}

export interface GeneralPageMeta {
  file: string;
  w: number;
  h: number;
  sprites: GeneralSpriteMeta[];
}

export interface GeneralGroupMeta {
  /** 帧间隔 tick；null/缺省 = 8 */
  d?: number | null;
  /** 逐帧 hold tick；缺省全用 d */
  h?: number[];
  loop?: number;
}

export interface GeneralIndex {
  pages: Record<string, GeneralPageMeta>;
  groups: Record<string, string[]>;
  actions: Record<string, GeneralGroupMeta>;
}

/**
 * 按 unit 名加载若干页（L0/L1…/R0…/H900/W700）。任意一页失败都整体回退 null，
 * 调用方保留 Graphics 占位 —— 与 loadUnitAtlas 的降级口径一致。
 */
export function loadGeneralAtlas(
  indexPath: string,
  units: string[],
  cb: (frames: Map<string, SpriteFrame> | null, index: GeneralIndex | null) => void,
): void {
  loadAsset(indexPath, JsonAsset, (err, json) => {
    const index = json?.json as GeneralIndex | undefined;
    if (!index || !index.pages || !index.groups || !index.actions) {
      console.warn(`[ArtLayer] 武將索引缺失：${indexPath}${err ? `（${err.message}）` : ''}，主將回退菱形`);
      cb(null, null);
      return;
    }
    const wanted: string[] = [];
    for (const unit of units) {
      if (unit && wanted.indexOf(unit) < 0) wanted.push(unit);
    }
    if (wanted.length === 0) {
      cb(null, null);
      return;
    }
    let left = wanted.length;
    let failed = false;
    const frames = new Map<string, SpriteFrame>();
    const done = (): void => {
      if (failed) return;
      cb(frames.size > 0 ? frames : null, index);
    };
    for (const unit of wanted) {
      const page = index.pages[unit];
      if (!page || !Array.isArray(page.sprites)) {
        console.warn(`[ArtLayer] 武將圖集缺頁：${unit}，主將回退菱形`);
        failed = true;
        cb(null, null);
        return;
      }
      const path = `anim/general/${page.file.replace(/\.png$/i, '')}`;
      loadFrame(path, (frame) => {
        if (failed) return;
        if (!frame || !frame.texture) {
          console.warn(`[ArtLayer] 武將圖集貼圖缺失：${path}，主將回退菱形`);
          failed = true;
          cb(null, null);
          return;
        }
        try {
          const atlasPage: AtlasPage = { file: page.file, w: page.w, h: page.h, sprites: page.sprites };
          const map = buildAtlasFrames(atlasPage, frame.texture as unknown as Texture2D);
          map.forEach((value, key) => frames.set(key, value));
        } catch (e) {
          console.warn(`[ArtLayer] 武將切幀失敗：${String(e)}，主將回退菱形`);
          failed = true;
          cb(null, null);
          return;
        }
        left -= 1;
        if (left === 0) done();
      });
    }
  });
}
