/**
 * 原作图元九宫皮肤（Cocos Creator 3.8.8）—— 纯数据表 + 节点工厂。
 *
 * 为什么要有这一层：Cocos 版的面板/按钮原来是 `Graphics` 手绘细线 + 系统字，
 * 看着"平、暗、硬"；web 版用的是原作 `MENU` 图元做 CSS `border-image` 九宫。
 * 这里把 web 已经验证过的 26 张图元搬进 bundle「res」的 `ui/`，用引擎的
 * `Sprite.Type.SLICED` 复刻同一套九宫，接页面只需要换一个函数名。
 *
 * 三条设计约束（都是踩过的坑，改之前先看）：
 *  1. **必须 SLICED，不要 TILED**：`TILED` 在非整数倍缩放下按 `ceil` 补格、
 *     末尾一列被裁，接缝处会露 1px 的暗线（`tiled.ts` 的 `updateVerts` 用
 *     `coefU/coefV` 取整），而 `SLICED` 的四边按源图像素等比缩放，绝不会露缝。
 *  2. **资源加载失败一律降级成 Graphics 描边，绝不抛**（跟 `ArtLayer` 同一口径）：
 *     九宫皮肤只是"更好看"，缺图不能把页面搞崩；而且 bundle 首次导入是 lead
 *     构建时才跑，运行期完全可能拿不到图。
 *  3. **纯数据与渲染解耦**：`SKINS` / `sliceInsetsOf()` / `nineGridRects()` 全是
 *     纯函数，可以在 node 里 import 后直接断言（见 work/cocos_skin/skin_assert.mjs）；
 *     只有 `makeNineSlice()` 往下才碰 `Node` / `Sprite`。
 *
 * 坐标口径与仓库其它脚本一致：设计 750×1334、左上原点；工厂造出来的节点锚点
 * (0.5,0.5)、尺寸就是传入的 w×h、位置在父节点原点，摆位交给 `placeDesign()`。
 *
 * insets 全部取 web 侧 `border-image` 的 **slice 值**（不是 border-width），
 * 因为 Cocos 的 SLICED 角尺寸就等于 insets，只有用源图像素才能 1:1 切在原作
 * 角饰的边界上。各图元的出处见每条 `note`。
 */
import {
  Color,
  Graphics,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec2,
} from 'cc';
import { HALF_H, HALF_W, loadFrame } from './ArtLayer';
import { COLORS, FONT, FONT_FAMILY } from './view/theme';

/** bundle「res」里 26 张图元所在目录（`assets/bundles/res/ui/`，加载路径不带扩展名） */
export const SKIN_DIR = 'ui';

/** 四边内缩，顺序 **上 右 下 左**，单位 = 源图像素 */
export type Inset4 = [number, number, number, number];

/** 一张九宫皮肤的登记项 */
export interface NineSliceSpec {
  /** 逻辑 key，也是文件名（`resources.load('ui/' + key)`） */
  key: string;
  /** bundle 内加载路径，如 `ui/frame_panel` */
  src: string;
  /** 九宫内缩 [上,右,下,左]，源图像素；全 0 = 整图拉伸/平铺 */
  insets: Inset4;
  /** 源图像素尺寸 [宽,高]，纯数据（给断言与 SkinLab 排版用，不读文件） */
  size: [number, number];
  /** true = 横向平铺（`Sprite.Type.TILED`），默认 SLICED */
  tile?: boolean;
  /** web 侧 CSS `border-image ... / Npx` 的 border-width，只作记录，不参与渲染 */
  webBorder?: number;
  /** 图标（不做九宫，`Sprite.Type.SIMPLE`）：兵符 / 金元宝 */
  icon?: boolean;
  /** 出处与取舍备注 */
  note?: string;
}

/** web `.sec` 面板底：`rgba(16,20,26,.72)`（`game/web/items.html:32`） */
export const PANEL_FILL = '#10141A';
export const PANEL_FILL_ALPHA = 184;

/* ------------------------------------------------------------------------- *
 * 一、纯数据：26 张图元
 * ------------------------------------------------------------------------- */

/**
 * insets 来源（web 侧已在线上跑过的值）：
 *  frame_panel `items.html:35`  `border-image: ... 8 / 8px`
 *  plate_btn   `items.html:153` / `deploy.html:117`  `16 / 10px`
 *  plate_sq    `items.html:41,53,69,93,127` / `deploy.html:52,64,72`  `12 / 6px`
 *  plate_sel   `items.html:109`  `12 / 8px`
 *  bar_div     `items.html:25,89,101,149` / `deploy.html:25,111`  `100% 11px no-repeat` → 只横向拉伸
 *  gem_gold / force_01..13  `center/contain` → 图标
 *  sep         `index.html:92`  `111px 12px repeat-x` → 横向平铺
 *  port/slot/slot_off/msg/cmd_off/cmd_on  `index.html:101/108/118/126/135/143`  `14/14/8/10/14/16`
 */
export const SKINS: Record<string, NineSliceSpec> = {
  frame_panel: {
    key: 'frame_panel',
    src: 'ui/frame_panel',
    insets: [8, 8, 8, 8],
    size: [241, 73],
    webBorder: 8,
    note: '原作 E1_D 窗口框 241×73：藏青外框 + 4px 金线 + 暗红内框；web 九宫 slice 8 / 描边 8px',
  },
  plate_btn: {
    key: 'plate_btn',
    src: 'ui/plate_btn',
    insets: [16, 16, 16, 16],
    size: [308, 40],
    webBorder: 10,
    note: '原作 D3_2H 空按钮牌 308×40：双线金框 + 四角十字；web 九宫 slice 16 / 描边 10px（角被压到 10px 显示）',
  },
  plate_sq: {
    key: 'plate_sq',
    src: 'ui/plate_sq',
    insets: [12, 12, 12, 12],
    size: [64, 68],
    webBorder: 6,
    note: '原作 D0_B 方格框 64×68：斜切金角；web 九宫 slice 12 / 描边 6px（头像框）',
  },
  plate_sel: {
    key: 'plate_sel',
    src: 'ui/plate_sel',
    insets: [12, 12, 12, 12],
    size: [100, 120],
    webBorder: 8,
    note: '原作选中牌 100×120：红金四角卷云；web 九宫 slice 12 / 描边 8px',
  },
  bar_div: {
    key: 'bar_div',
    src: 'ui/bar_div',
    insets: [0, 0, 0, 0],
    size: [111, 12],
    tile: false,
    note: '原作分隔横条 111×12；web 是 `100% 11px no-repeat`（拉伸）。注意它跟 sep.png 逐像素相同、末列全黑，' +
      '平铺会每 111px 露一道暗缝，所以这里走拉伸；真要平铺把 tile 改 true（节点高必须正好 12）',
  },
  gem_gold: {
    key: 'gem_gold',
    src: 'ui/gem_gold',
    insets: [0, 0, 0, 0],
    size: [22, 22],
    icon: true,
    note: '金元宝图标 22×22，web 用 `center/contain`',
  },
  slot: {
    key: 'slot',
    src: 'ui/slot',
    insets: [14, 14, 14, 14],
    size: [34, 34],
    webBorder: 14,
    note: '战场格子 34×34，四角括号；web `border-image slice 14 / 14px`',
  },
  slot_off: {
    key: 'slot_off',
    src: 'ui/slot_off',
    insets: [8, 8, 8, 8],
    size: [22, 22],
    webBorder: 8,
    note: '禁用格 22×22，细一圈；web slice 8 / 8px',
  },
  cmd_on: {
    key: 'cmd_on',
    src: 'ui/cmd_on',
    insets: [16, 16, 16, 16],
    size: [38, 38],
    webBorder: 16,
    note: '命令键按下 38×38，红金粗角；web slice 16 / 16px',
  },
  cmd_off: {
    key: 'cmd_off',
    src: 'ui/cmd_off',
    insets: [14, 14, 14, 14],
    size: [34, 34],
    webBorder: 14,
    note: '命令键常态 34×34；web slice 14 / 14px',
  },
  port: {
    key: 'port',
    src: 'ui/port',
    insets: [14, 14, 14, 14],
    size: [34, 34],
    webBorder: 14,
    note: '武将头像框 34×34；web slice 14 / 14px',
  },
  msg: {
    key: 'msg',
    src: 'ui/msg',
    insets: [10, 10, 10, 10],
    size: [26, 26],
    webBorder: 10,
    note: '消息气泡框 26×26；web slice 10 / 10px',
  },
  sep: {
    key: 'sep',
    src: 'ui/sep',
    insets: [0, 0, 0, 0],
    size: [111, 12],
    tile: true,
    note: '横向分隔线 111×12；web `111px 12px repeat-x`，这里用 TILED（节点高保持 12 才是真重复）',
  },
};

/** 13 个兵种兵符（原作 FORCE 图标，16×16，只有 force_05 是 16×17） */
const FORCE_KEYS = [
  'force_01',
  'force_02',
  'force_03',
  'force_04',
  'force_05',
  'force_06',
  'force_07',
  'force_08',
  'force_09',
  'force_10',
  'force_11',
  'force_12',
  'force_13',
] as const;

for (let i = 0; i < FORCE_KEYS.length; i++) {
  const key = FORCE_KEYS[i];
  SKINS[key] = {
    key,
    src: `ui/${key}`,
    insets: [0, 0, 0, 0],
    size: [16, i === 4 ? 17 : 16],
    icon: true,
    note: '兵种兵符图标（原作 FORCE），web 用 `center/contain`',
  };
}

/** 推荐绘制顺序：框 → 按钮牌 → 战场图元 → 图标（SkinLab 也按这个顺序排） */
export const SKIN_ORDER: string[] = [
  'frame_panel',
  'plate_btn',
  'plate_sq',
  'plate_sel',
  'bar_div',
  'sep',
  'slot',
  'slot_off',
  'cmd_on',
  'cmd_off',
  'port',
  'msg',
  'gem_gold',
  ...FORCE_KEYS,
];

/** 已登记的 key（26 个，顺序同 SKIN_ORDER） */
export function skinKeys(): string[] {
  return SKIN_ORDER.slice();
}

/** 查表；未知 key 返回 null（调用方必须能接受） */
export function specOf(key: string): NineSliceSpec | null {
  return Object.prototype.hasOwnProperty.call(SKINS, key) ? SKINS[key] : null;
}

/** 是否需要切片（有 insets 且不是图标 / 不是纯平铺） */
export function isSliced(key: string): boolean {
  const s = specOf(key);
  return !!s && !s.icon && (s.insets[0] > 0 || s.insets[1] > 0 || s.insets[2] > 0 || s.insets[3] > 0);
}

/* ------------------------------------------------------------------------- *
 * 二、纯几何：九宫落在 w×h 上到底是哪 9 块
 * ------------------------------------------------------------------------- */

/**
 * 把登记的 insets 换算成「目标尺寸下真正画出来的四边宽度」。
 *
 * 与引擎 `sliced.ts::updateVertexData` 完全同构：节点比 `左+右` 还窄时，引擎按
 * `xScale = width / (left+right)` 把两条侧边**等比缩**（clamp 到 1，永不放大），
 * 中间留 0；这跟 CSS `border-image` 在盒子小于边框时的行为一致。所以这里
 * 不需要手工夹取，只是把这个式子暴露出来给断言/标注用。
 *
 * 返回值保证 `l + r <= w`、`t + b <= h`，因此 9 宫矩形一定铺满且不越界。
 */
export function sliceInsetsOf(key: string, w: number, h: number): Inset4 {
  const s = specOf(key);
  const t = s ? s.insets[0] : 0;
  const r = s ? s.insets[1] : 0;
  const b = s ? s.insets[2] : 0;
  const l = s ? s.insets[3] : 0;
  const width = w > 0 ? w : 1;
  const height = h > 0 ? h : 1;
  const xs = l + r > 0 ? Math.min(1, width / (l + r)) : 1;
  const ys = t + b > 0 ? Math.min(1, height / (t + b)) : 1;
  return [t * ys, r * xs, b * ys, l * xs];
}

/** 设计空间（左上原点）里的一个矩形 */
export interface SliceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 目标尺寸下的 9 块矩形，顺序 = 行优先（0..2 行 × 0..2 列），左上角是第 0 块。
 * 三条竖边之和恒等于 w、三条横边之和恒等于 h（断言就是这么验的）。
 */
export function nineGridRects(key: string, w: number, h: number): SliceRect[] {
  const [t, r, b, l] = sliceInsetsOf(key, w, h);
  const xs: [number, number, number, number] = [0, l, w - r, w];
  const ys: [number, number, number, number] = [0, t, h - b, h];
  const out: SliceRect[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out.push({
        x: xs[col],
        y: ys[row],
        w: xs[col + 1] - xs[col],
        h: ys[row + 1] - ys[row],
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- *
 * 三、渲染层：SpriteFrame 缓存 → 工厂
 * ------------------------------------------------------------------------- */

/** 已加载帧（同一个 key 只建一次纹理：`loadFrame` 每次都会新建 Texture2D） */
const frameCache = new Map<string, SpriteFrame>();
/** 正在加载的 key：并发请求排队，避免 SkinLab 一次要 26 张时重复建纹理 */
const pending = new Map<string, ((frame: SpriteFrame | null) => void)[]>();
/** 同一个 key 只 warn 一次，别把 console 刷满 */
const warned = new Set<string>();

function warnOnce(msg: string): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(msg);
}

/**
 * 加载一张皮肤的 SpriteFrame，并把 insets 按登记值写回帧上。
 *
 * 为什么要自己写 insets：Creator 导入 PNG 时生成的 `.meta` 里 inset 默认是 0，
 * 我们**不手写 .meta**（uuid 归 Creator 生成），所以九宫的四边必须运行期补上。
 * `SpriteFrame.insetLeft` 的 setter 内部会重算 `uvSliced`，所以在这个位置写是安全的。
 *
 * 回调可能在**同步**返回（命中缓存）也可能异步；失败回调 `null`，从不抛。
 */
export function loadSkinFrame(key: string, cb: (frame: SpriteFrame | null) => void): void {
  const cached = frameCache.get(key);
  if (cached) {
    cb(cached);
    return;
  }
  const queue = pending.get(key);
  if (queue) {
    queue.push(cb);
    return;
  }
  const s = specOf(key);
  if (!s) {
    warnOnce(`[UiSkin] 未知皮肤 key「${key}」`);
    cb(null);
    return;
  }
  pending.set(key, [cb]);
  loadFrame(s.src, (frame) => {
    const waiters = pending.get(key) ?? [];
    pending.delete(key);
    if (frame) {
      applyInsets(frame, s);
      frameCache.set(key, frame);
    } else {
      warnOnce(`[UiSkin] 皮肤「${key}」加载失败（${s.src}），降级 Graphics 描边`);
    }
    for (const fn of waiters) fn(frame);
  });
}

/** 丢掉缓存（换 bundle / 热重载后用；正常流程不需要） */
export function clearSkinCache(): void {
  frameCache.clear();
  pending.clear();
  warned.clear();
}

function applyInsets(frame: SpriteFrame, s: NineSliceSpec): void {
  frame.insetTop = s.insets[0];
  frame.insetRight = s.insets[1];
  frame.insetBottom = s.insets[2];
  frame.insetLeft = s.insets[3];
}

function hex(color: string, alpha = 255): Color {
  const c = new Color().fromHEX(color);
  c.a = Math.max(0, Math.min(255, Math.round(alpha)));
  return c;
}

/** 造一个锚点居中、尺寸 w×h、挂在 parent 下的 UI 节点 */
function newNode(parent: Node, name: string, w: number, h: number): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  const transform = node.addComponent(UITransform);
  transform.setAnchorPoint(0.5, 0.5);
  transform.setContentSize(Math.max(1, w), Math.max(1, h));
  node.parent = parent;
  return node;
}

/** 加载失败时的降级画法：深底 + 1px 暗金描边（不是白块，也不是什么都不画） */
function drawFallback(node: Node, w: number, h: number): void {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  g.lineWidth = 1;
  g.fillColor = hex(PANEL_FILL, PANEL_FILL_ALPHA);
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  g.strokeColor = hex(COLORS.goldDim, 210);
  g.rect(-width / 2, -height / 2, width, height);
  g.stroke();
}

/**
 * 九宫底图（面板框 / 按钮底 / 格子 / 图标都走它）。
 *
 * - `Sprite.SizeMode.CUSTOM`：尺寸只听节点 UITransform 的，不被帧的 originalSize 覆盖；
 * - `Sprite.Type.SLICED`：四边按源图像素切，中间拉伸，缩放不露缝（TILED 会露）；
 * - 图还没到 / 加载失败：`Graphics` 描边顶上，绝不留白块、绝不抛。
 *
 * 返回的节点锚点 (0.5,0.5)、尺寸 w×h，位置在父节点原点；摆位用 `placeDesign()`。
 */
export function makeNineSlice(parent: Node, key: string, w: number, h: number): Node {
  const node = newNode(parent, `Skin_${key}`, w, h);
  const s = specOf(key);
  const sprite = node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.trim = false;

  if (!s) {
    warnOnce(`[UiSkin] 未知皮肤 key「${key}」，降级 Graphics 描边`);
    drawFallback(node, w, h);
    return node;
  }

  if (s.icon) {
    sprite.type = Sprite.Type.SIMPLE;
  } else if (s.tile) {
    sprite.type = Sprite.Type.TILED;
  } else {
    sprite.type = Sprite.Type.SLICED;
  }

  loadSkinFrame(key, (frame) => {
    // 异步回来时节点可能已经被销毁（切页面 / 关弹窗），这时什么都别碰
    if (!node.isValid) return;
    if (!frame) {
      drawFallback(node, w, h);
      return;
    }
    sprite.spriteFrame = frame;
  });
  return node;
}

/** 按钮字色 / 字号可调，其余走缺省 */
export interface BtnOpts {
  /** 字号，缺省按高度推（h*0.42，夹在 12..24） */
  fontSize?: number;
  /** 文字颜色，缺省 `COLORS.text` */
  color?: string;
  /** 左右内边距（文字框宽度 = w - 2*pad），缺省 8 */
  pad?: number;
}

/**
 * 九宫按钮：九宫底 + 居中 Label（1px 深色描边 + 1px 投影）。
 *
 * 描边/投影用 3.8 的 `Label.enableOutline / enableShadow`（跟 `ArtLayer.addOutline`
 * 一致），而不是自 3.8.2 起 deprecated 的 `LabelOutline` / `LabelShadow` 组件 ——
 * 那两个组件内部只是把同名属性打开，视觉等价但会刷 deprecation 警告。
 *
 * 注意：这里**不挂 `Button` 组件**（仓库现有页面都是自己接 touch 事件），
 * 需要按压反馈的话调用方 `node.addComponent(Button)` 即可。
 */
export function makeBtn(
  parent: Node,
  key: string,
  label: string,
  w: number,
  h: number,
  opts: BtnOpts = {},
): Node {
  const node = makeNineSlice(parent, key, w, h);
  node.name = `Btn_${label || key}`;
  const pad = opts.pad ?? 8;
  const fontSize = opts.fontSize ?? Math.max(FONT.tiny, Math.min(FONT.h2, Math.round(h * 0.42)));
  const textNode = newNode(node, `Label_${label || 'empty'}`, Math.max(1, w - pad * 2), h);
  const text = textNode.addComponent(Label);
  text.string = label;
  text.fontFamily = FONT_FAMILY;
  text.fontSize = fontSize;
  text.lineHeight = Math.round(fontSize * 1.25);
  text.color = hex(opts.color ?? COLORS.text);
  text.horizontalAlign = Label.HorizontalAlign.CENTER;
  text.verticalAlign = Label.VerticalAlign.CENTER;
  text.overflow = Label.Overflow.NONE;
  text.enableOutline = true;
  text.outlineColor = hex('#06080C', 235);
  text.outlineWidth = 1;
  text.enableShadow = true;
  text.shadowColor = hex('#000000', 160);
  text.shadowOffset = new Vec2(0, -1);
  text.shadowBlur = 1;
  return node;
}

/** 面板：深底 + 九宫边框（对应 web `.sec` = `background: rgba(16,20,26,.72)` + `::before` 八宫框） */
export interface PanelOpts {
  /** 是否画深底，缺省 true；纯描边框（如浮在立绘上）传 false */
  fill?: boolean;
  /** 底色，缺省 `PANEL_FILL` */
  fillColor?: string;
  /** 底色不透明度 0..255，缺省 184（= .72） */
  fillAlpha?: number;
}

export function makePanel(
  parent: Node,
  key: string,
  w: number,
  h: number,
  opts: PanelOpts = {},
): Node {
  const node = newNode(parent, `Panel_${key}`, w, h);
  if (opts.fill !== false) {
    const g = node.addComponent(Graphics);
    g.fillColor = hex(opts.fillColor ?? PANEL_FILL, opts.fillAlpha ?? PANEL_FILL_ALPHA);
    g.rect(-Math.max(1, w) / 2, -Math.max(1, h) / 2, Math.max(1, w), Math.max(1, h));
    g.fill();
  }
  const frame = makeNineSlice(node, key, w, h);
  frame.name = `Frame_${key}`;
  return node;
}

/**
 * 按设计坐标（750×1334、左上原点）摆一个 w×h 的节点 —— 口径同 `ArtLayer`。
 * 例：`placeDesign(makePanel(root, 'frame_panel', 340, 200), 20, 88, 340, 200)`。
 */
export function placeDesign(node: Node, x: number, y: number, w: number, h: number): void {
  node.setPosition(x + w / 2 - HALF_W, HALF_H - (y + h / 2), 0);
}
