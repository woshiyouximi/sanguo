/**
 * 战场上的主将标记（《三国志13》式）：逻辑点 + 挂在旁边的圆形头像 UI。
 *
 * 全图战场把 71 行压进 900px，一格纵深只剩 ≈11.9px。主将如果只画一个点，
 * 玩家分不清是谁；如果把人像直接压成 12px 的圆，又认不出脸。所以拆成两层：
 *
 * - **逻辑点**：主将真正的 x/y，画成比小兵稍大的圆点（`BattleRoot.drawUnits`），
 *   攻击/受击/移动只改这个点，和士兵同一套表现；
 * - **头像 UI**：挂在点旁边（朝屏幕外侧偏移 48px）的 63px 圆牌，
 *   红环 = 血量、绿环 = 技力，中间是圆形裁切的原作 FACE。
 *
 * 偏移方向按车道选：左半场挂左、右半场挂右，并夹在战场带内；中间有一条细连线
 * 指回逻辑点，避免「点归点、牌归牌」看不出对应关系。
 *
 * 本文件不碰任何战斗判定，只读 `World` 的 `units` / `sides[side].general`。
 */
import {
  Color,
  Graphics,
  Label,
  Layers,
  MaskComponent as Mask,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
} from 'cc';
import { loadFrameCached } from './ArtLayer';
import { generalUnitOf } from './BattleCmdUi';
import type { World } from './core/battle';
import { loadPortrait } from './Portrait';
import { applyTextRole } from './TextRole';
import { DESIGN_H, DESIGN_W, FIELD_BOTTOM, LANE_PX, MAP_TOP, project } from './view/layout';
import { COLORS, FONT_FAMILY, sideColor, sideLight } from './view/theme';

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/** 头像圆牌外径（设计 px）：76px，比一格车道 53.6px 宽一圈，脸能看清。 */
export const CARD_R = 38;
/** 牌面从逻辑点往屏幕外侧挪的距离 */
export const CARD_OFFSET = 48;
const SIDE_R = 38;
const HP_R = 33.5;
const HP_W = 5.5;
const MP_R = 27;
const MP_W = 4;
const FACE_R = 21.5;

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

interface Slot {
  side: 'A' | 'B';
  faceNode: Node;
  face: Sprite;
  fallback: Label;
  name: Label;
  loadedFor: string;
}

/** 一侧的主将标记（环画在一个全屏 Graphics 上，头像/名字是独立节点）。 */
export class GeneralMarkers {
  private readonly g: Graphics;
  private readonly slots: Slot[] = [];

  constructor(parent: Node) {
    const node = new Node('GeneralMarkers');
    node.layer = Layers.Enum.UI_2D;
    node.parent = parent;
    node.setPosition(0, 0, 0);
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.g = node.addComponent(Graphics);

    for (const side of ['B', 'A'] as const) {
      const faceNode = new Node(`GeneralFace${side}`);
      faceNode.layer = Layers.Enum.UI_2D;
      faceNode.parent = parent;
      faceNode.setPosition(0, 0, 0);
      const box = faceNode.addComponent(UITransform);
      box.setContentSize(FACE_R * 2, FACE_R * 2);
      const mask = faceNode.addComponent(Mask);
      mask.type = Mask.Type.GRAPHICS_ELLIPSE;

      const inner = new Node('Face');
      inner.layer = Layers.Enum.UI_2D;
      inner.parent = faceNode;
      inner.setPosition(0, 0, 0);
      // 原作 FACE 是 100×120：按圆形直径铺满宽度、上下各溢出一点，圆形裁掉
      inner.addComponent(UITransform).setContentSize(FACE_R * 2, Math.round(FACE_R * 2 * 1.2));
      const face = inner.addComponent(Sprite);
      face.type = Sprite.Type.SIMPLE;
      face.sizeMode = Sprite.SizeMode.CUSTOM;
      face.enabled = false;

      const fallback = this.makeLabel(parent, `GeneralFallback${side}`, 18, COLORS.goldLight);
      fallback.node.active = false;
      const name = this.makeLabel(parent, `GeneralName${side}`, 12, sideLight(side));
      name.isBold = true;
      name.node.active = false;

      this.slots.push({ side, faceNode, face, fallback, name, loadedFor: '' });
    }
  }

  private makeLabel(parent: Node, name: string, size: number, color: string): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.parent = parent;
    node.setPosition(0, 0, 0);
    node.addComponent(UITransform).setContentSize(160, Math.round(size * 2.4));
    const label = node.addComponent(Label);
    label.fontFamily = FONT_FAMILY;
    label.fontSize = size;
    label.lineHeight = Math.round(size * 1.4);
    label.color = rgba(color);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.NONE;
    if (size <= 12) applyTextRole(label, 'badge', size);
    return label;
  }

  /** 每帧画：连线 + 圆牌 + 头像位置 + 名字；两将靠近时把牌错开。`world` 只读。 */
  draw(world: World): void {
    const g = this.g;
    g.clear();

    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      const pose = this.pose(world, slot);
      if (!pose) {
        slot.faceNode.active = false;
        slot.fallback.node.active = false;
        slot.name.node.active = false;
        continue;
      }
      this.drawPose(pose);
    }
  }

  /**
   * 算出「逻辑点 + 牌心」的位置。牌固定挂在自己一侧：**我方永远在点左边、
   * 敌方永远在点右边**，不随车道/距离换边，也不因为两将贴身而互相推开 ——
   * 两个逻辑点该贴多近就贴多近，牌只是两侧的 UI，看起来才是「相持对战」。
   */
  private pose(world: World, slot: Slot) {
    const gu = generalUnitOf(world, slot.side);
    if (!gu || !gu.alive) return null;
    const gen = world.sides[slot.side].general;
    const p = project(gu.x, gu.y, 0);
    const dir = slot.side === 'A' ? -1 : 1;
    const lo = CARD_R + 6;
    const hi = DESIGN_W - CARD_R - 6;
    const cardX = Math.max(lo, Math.min(hi, p.x + dir * CARD_OFFSET));
    return { slot, gen, px: p.x, py: p.y, dir, cardX, cardY: p.y - 2 };
  }

  private drawPose(pose: NonNullable<ReturnType<GeneralMarkers['pose']>>): void {
    const { slot, gen, px, py, cardX, cardY } = pose;
    this.ensureFace(slot, gen.name);
    const g = this.g;

    // 连线：逻辑点边缘 → 圆牌边缘，说明「这张脸对应这个点」
    const d = cardX >= px ? 1 : -1;
    g.strokeColor = rgba(COLORS.gold, 165);
    g.lineWidth = 1.2;
    g.moveTo(px + d * 8, py);
    g.lineTo(cardX - d * CARD_R, cardY);
    g.stroke();

    const cx = cardX - HALF_W;
    const cy = HALF_H - cardY;

    // 牌底阴影
    g.fillColor = new Color(0, 0, 0, 110);
    g.circle(cx, cy + 2, CARD_R + 1.5);
    g.fill();

    // 阵营外环
    g.strokeColor = rgba(sideColor(slot.side), 210);
    g.lineWidth = 2.5;
    g.circle(cx, cy, SIDE_R);
    g.stroke();

    // 血量环：暗底整圈 + 红色进度弧（从 12 点顺时针）
    g.strokeColor = rgba('#3A1E1B', 240);
    g.lineWidth = HP_W;
    g.circle(cx, cy, HP_R);
    g.stroke();
    this.arc(g, cx, cy, HP_R, HP_W, gen.hp / Math.max(1, gen.maxHp), COLORS.enemy);

    // 技力环：内圈绿色
    g.strokeColor = rgba('#17301F', 240);
    g.lineWidth = MP_W;
    g.circle(cx, cy, MP_R);
    g.stroke();
    this.arc(g, cx, cy, MP_R, MP_W, gen.mp / Math.max(1, gen.mpMax), COLORS.heal);

    // 头像底 + 金细边
    g.fillColor = new Color(9, 11, 15, 245);
    g.circle(cx, cy, FACE_R + 3);
    g.fill();
    g.strokeColor = rgba(COLORS.gold, 185);
    g.lineWidth = 1;
    g.circle(cx, cy, FACE_R + 1.5);
    g.stroke();

    // 头像节点
    slot.faceNode.setPosition(cx, cy, 0);
    slot.faceNode.active = true;
    slot.fallback.node.setPosition(cx, cy, 0);
    slot.fallback.string = (gen.name || '將').slice(0, 1);

    // 名字：牌面下方（贴到底时改到上方）
    const below = cardY + CARD_R + 11;
    const ny = below < FIELD_BOTTOM - 12 ? below : cardY - CARD_R - 11;
    slot.name.node.active = true;
    slot.name.node.setPosition(cx, HALF_H - ny, 0);
    slot.name.string = gen.name;
    slot.name.color = rgba(gen.alive ? sideLight(slot.side) : COLORS.textFaint);
  }

  /** 从 12 点方向顺时针的进度弧（Cocos 的 arc() 方向在 3.8 上不稳，这里自己折线）。 */
  private arc(g: Graphics, cx: number, cy: number, r: number, width: number, ratio: number, color: string): void {
    const p = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    if (p <= 0) return;
    g.strokeColor = rgba(color, 245);
    g.lineWidth = width;
    const steps = Math.max(6, Math.ceil(64 * p));
    for (let i = 0; i <= steps; i += 1) {
      const a = Math.PI / 2 - (Math.PI * 2 * p * i) / steps;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  /** 肖像降级链：full → thumb → hero → 名字首字圆盘。 */
  private ensureFace(slot: Slot, name: string): void {
    if (slot.loadedFor === name) return;
    slot.loadedFor = name;
    slot.face.enabled = false;
    slot.face.spriteFrame = null;
    slot.fallback.node.active = true;
    loadPortrait(
      {
        apply: (frame: SpriteFrame | null): boolean => {
          if (!frame || slot.loadedFor !== name) {
            slot.face.enabled = false;
            slot.fallback.node.active = true;
            return false;
          }
          slot.face.spriteFrame = frame;
          slot.face.enabled = true;
          slot.fallback.node.active = false;
          return true;
        },
      },
      name,
      'full',
      loadFrameCached,
    );
  }
}
