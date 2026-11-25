/**
 * 九宫皮肤验证页（SkinLab）—— 只在 URL 带 `?skinlab=1` 时自己叠到 `Campaign` 场景上。
 *
 * 为什么是"自己叠"而不是挂在场景里：`Campaign.scene` 里的组件靠 uuid 引用脚本，
 * 新脚本的 uuid 要 Creator 首次导入才生成，手写场景引用会把工程弄坏；而
 * `CampaignRoot.ts` 这段时间另有同学在改版式，不能碰。所以本文件用**模块顶层的副作用**
 * 监听 `Director.EVENT_AFTER_SCENE_LAUNCH`：Creator 会 import 工程内所有脚本，
 * 这一幕就跑一次；只有带参数时才往 Canvas 下塞一层 SkinLab（在 CampaignRoot 之外、之上）。
 *
 * 页面内容（给 lead 构建后截图用）：
 *  - 26 张图元各占一格，格内 4 档：①1:1 原尺寸 ②宽拉伸 84×50 ③扁 84×20 ④窄高 40×50；
 *    图标走 ①16 ②32 ③48 ④64。同一张图在 4 档下角饰不变、四边不露缝 = 九宫切对了。
 *  - 每格左上角标注 key + insets + 源图尺寸。
 *  - 底部：缺图降级（故意传一个不存在的 key）、`makePanel` / `makeBtn` 成品样子。
 *
 * 不进正式包的开销：只有 26 张 PNG 的 SpriteFrame（约 20 KB 源图），且不带参数时
 * 一行绘制都不执行。
 */
import {
  _decorator,
  Color,
  Component,
  Director,
  director,
  Graphics,
  Label,
  Layers,
  Node,
  UITransform,
} from 'cc';
import { COLORS, FONT_FAMILY } from './view/theme';
import {
  makeBtn,
  makeNineSlice,
  makePanel,
  placeDesign,
  SKIN_ORDER,
  specOf,
} from './UiSkin';

const { ccclass } = _decorator;

const W = 750;
const H = 1334;

/** 版面：两列 × 13 行，每格 366×86 */
const MARGIN = 6;
const GAP = 6;
const CELL_W = Math.floor((W - MARGIN * 2 - GAP) / 2);
const CELL_H = 86;
const ROW_TOP = 54;
/** 格内 4 个样本槽（相对格左上角），槽宽 84 */
const SLOT_W = 84;
const SLOT_X = [4, 92, 180, 268];

function hex(color: string, alpha = 255): Color {
  const c = new Color().fromHEX(color);
  c.a = Math.max(0, Math.min(255, Math.round(alpha)));
  return c;
}

/** 造一个锚点居中的 UI 节点 */
function uiNode(parent: Node, name: string, w: number, h: number): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  const transform = node.addComponent(UITransform);
  transform.setAnchorPoint(0.5, 0.5);
  transform.setContentSize(Math.max(1, w), Math.max(1, h));
  node.parent = parent;
  return node;
}

/** 设计坐标左上原点的一段文字 */
function text(
  parent: Node,
  content: string,
  x: number,
  y: number,
  w: number,
  size: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
): Label {
  const h = Math.round(size * 1.5);
  const node = uiNode(parent, `T_${content.slice(0, 12) || 'empty'}`, w, h);
  placeDesign(node, x, y, w, h);
  const label = node.addComponent(Label);
  label.string = content;
  label.fontFamily = FONT_FAMILY;
  label.fontSize = size;
  label.lineHeight = h;
  label.color = hex(color);
  label.horizontalAlign =
    align === 'left'
      ? Label.HorizontalAlign.LEFT
      : align === 'right'
        ? Label.HorizontalAlign.RIGHT
        : Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.NONE;
  label.enableOutline = true;
  label.outlineColor = hex('#000000', 150);
  label.outlineWidth = 1;
  return label;
}

@ccclass('SkinLab')
export class SkinLab extends Component {
  protected onLoad(): void {
    // 只在 ?skinlab=1 时工作：万一在编辑器里把它挂到 Canvas 上，也不会挡游戏画面
    if (!skinLabEnabled()) {
      this.node.active = false;
      return;
    }
    try {
      this.build();
    } catch (e) {
      console.warn(`[SkinLab] 構建失敗：${String(e)}`);
    }
  }

  /** 整页（幂等：重复调用会先清空自己） */
  build(): void {
    this.node.removeAllChildren();
    const root = this.node;
    const bg = uiNode(root, 'LabBg', W, H);
    const g = bg.addComponent(Graphics);
    g.fillColor = hex('#0E1116', 246);
    g.rect(-W / 2, -H / 2, W, H);
    g.fill();
    // 顶部一条暗金细线，确认整页确实盖在最上层
    g.strokeColor = hex(COLORS.goldDim, 200);
    g.lineWidth = 1;
    g.rect(-W / 2 + 2, -H / 2 + 2, W - 4, H - 4);
    g.stroke();

    text(root, 'SKIN LAB · 26 张原作图元 / SLICED 九宫', MARGIN, 8, 500, 16, COLORS.gold);
    text(
      root,
      '每格四档：1:1 原尺寸 ／ 84×50 宽拉伸 ／ 84×20 扁 ／ 40×50 窄高（角饰不变、边不露缝 = 切对了）',
      MARGIN,
      30,
      730,
      10,
      COLORS.textDim,
    );

    for (let i = 0; i < SKIN_ORDER.length; i++) {
      const key = SKIN_ORDER[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * (CELL_W + GAP);
      const y = ROW_TOP + row * CELL_H;
      this.buildCell(key, x, y);
    }

    this.buildFooter(ROW_TOP + Math.ceil(SKIN_ORDER.length / 2) * CELL_H + 8);
  }

  /** 一格：标注 + 4 档样本 */
  private buildCell(key: string, x: number, y: number): void {
    const spec = specOf(key);
    if (!spec) return;
    const [t, r, b, l] = spec.insets;
    text(this.node, key, x + 4, y, 220, 11, COLORS.goldLight);
    text(
      this.node,
      `in ${t},${r},${b},${l}   src ${spec.size[0]}×${spec.size[1]}${spec.tile ? '   TILED' : ''}`,
      x + 120,
      y,
      240,
      9,
      COLORS.textDim,
      'right',
    );

    const top = y + 16;
    if (spec.icon) {
      const sizes = [16, 32, 48, 64];
      for (let i = 0; i < sizes.length; i++) {
        const s = sizes[i];
        const node = makeNineSlice(this.node, key, s, s);
        placeDesign(node, x + SLOT_X[i] + (SLOT_W - s) / 2, top + Math.max(0, (50 - s) / 2), s, s);
      }
      return;
    }

    // ① 1:1（太大就等比缩进 84×50）
    const nw = spec.size[0];
    const nh = spec.size[1];
    const k = Math.min(1, 84 / nw, 50 / nh);
    const aw = Math.max(1, Math.round(nw * k));
    const ah = Math.max(1, Math.round(nh * k));
    const a = makeNineSlice(this.node, key, aw, ah);
    placeDesign(a, x + SLOT_X[0] + (SLOT_W - aw) / 2, top + (50 - ah) / 2, aw, ah);

    // ② 宽拉伸 84×50
    const b1 = makeNineSlice(this.node, key, SLOT_W, 50);
    placeDesign(b1, x + SLOT_X[1], top, SLOT_W, 50);

    // ③ 扁 84×20（最容易暴露九宫没起作用：中间被压扁、角饰糊掉）
    const c = makeNineSlice(this.node, key, SLOT_W, 20);
    placeDesign(c, x + SLOT_X[2], top + 15, SLOT_W, 20);

    // ④ 窄高 40×50（比 inset×2 还窄时，引擎把角按比例缩，见 report）
    const d = makeNineSlice(this.node, key, 40, 50);
    placeDesign(d, x + SLOT_X[3] + (SLOT_W - 40) / 2, top, 40, 50);
  }

  /** 页脚：降级演示 + 成品面板/按钮 */
  private buildFooter(y: number): void {
    text(this.node, '降级（不存在的 key 走 Graphics 描边，不崩）', MARGIN, y, 300, 9, COLORS.textDim);
    const bad = makeNineSlice(this.node, '__missing_demo__', 180, 40);
    placeDesign(bad, MARGIN, y + 14, 180, 40);

    text(this.node, 'makePanel(frame_panel) + makeBtn(plate_btn)', MARGIN + 200, y, 400, 9, COLORS.textDim);
    const panel = makePanel(this.node, 'frame_panel', 300, 70);
    placeDesign(panel, MARGIN + 200, y + 14, 300, 70);
    const btn = makeBtn(this.node, 'plate_btn', '確 定', 150, 44);
    placeDesign(btn, MARGIN + 216, y + 27, 150, 44);

    text(
      this.node,
      '?skinlab=1 才加载本页；正式包不受影响',
      MARGIN,
      y + 90,
      500,
      9,
      COLORS.textDim,
    );
  }
}

/* ------------------------------------------------------------------------- *
 * 挂载：模块副作用（不依赖场景/组件引用）
 * ------------------------------------------------------------------------- */

interface MiniHost {
  getLaunchOptionsSync?: () => { query?: Record<string, string> } | undefined;
  getEnterOptionsSync?: () => { query?: Record<string, string> } | undefined;
}

/** 读 `?skinlab=1`：浏览器看 location.search，小游戏看启动参数；取不到就当没开 */
function skinLabEnabled(): boolean {
  try {
    const g = globalThis as unknown as {
      window?: { location?: { search?: string } };
      wx?: MiniHost;
      tt?: MiniHost;
    };
    const search = g.window?.location?.search ?? '';
    if (/(?:^\?|&)skinlab=1(?:&|$)/.test(search)) return true;
    for (const host of [g.wx, g.tt]) {
      if (!host) continue;
      const query =
        host.getLaunchOptionsSync?.()?.query ?? host.getEnterOptionsSync?.()?.query ?? undefined;
      if (query && String(query.skinlab ?? '') === '1') return true;
    }
  } catch {
    // 宿主不支持 / 权限异常：当作没开
  }
  return false;
}

function canvasNode(): Node | null {
  const scene = director.getScene();
  if (!scene) return null;
  const byName = scene.getChildByName('Canvas');
  if (byName) return byName;
  for (const child of scene.children) {
    if (child.getComponent(UITransform)) return child;
  }
  return null;
}

/** 往当前场景的 Canvas 下挂一层 SkinLab（已挂过就跳过） */
export function mountSkinLab(): boolean {
  const host = canvasNode();
  if (!host) return false;
  if (host.getChildByName('SkinLab')) return true;
  const node = new Node('SkinLab');
  node.layer = Layers.Enum.UI_2D;
  const transform = node.addComponent(UITransform);
  transform.setAnchorPoint(0.5, 0.5);
  transform.setContentSize(W, H);
  node.parent = host;
  node.setSiblingIndex(host.children.length - 1);
  node.addComponent(SkinLab);
  return true;
}

director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
  if (!skinLabEnabled()) return;
  if (!mountSkinLab()) console.warn('[SkinLab] 找不到 Canvas，跳過掛載');
});

// 兜底：脚本可能在首帧之后才被 import（热重载 / 动态 import），这时 EVENT 已经过了
if (skinLabEnabled()) {
  director.once(Director.EVENT_AFTER_UPDATE, () => {
    mountSkinLab();
  });
}
