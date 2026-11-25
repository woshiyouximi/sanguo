/**
 * 武將小人三層圖（BODY / WEAPON / HORSE）—— 原作 `SHAPE\MAJOR` 抽帧的 Cocos 版。
 *
 * 数据来源：`assets/bundles/res/anim/general/index.json`
 *   pages  : unit → { file, w, h, sprites[{name,x,y,w,h,ox,oy}] }
 *   groups : 动作键 → 帧名序列（可重复，表示 hold）
 *   actions: 动作键 → { d, h[], loop }
 *
 * 选帧/锚点逻辑照抄 `game/src/view/generalAtlas.ts`（只读参考实现）：
 *   - 动作：Death / Attack(cd>96) / Walk(坐标变化) / Wait；
 *   - body 键 Wait:1 / Attack:1 带武器槽，Walk/Death 不带；
 *   - 马 H900、武器 W700（`generals.json` 里 Weapon/Horse 全 null → 参考实现取缺省值）；
 *   - 层级 马 → 身体 → 武器；阵亡只画身体，24 tick 后整组隐藏；
 *   - 锚点：左上角 = (unitX - ox, unitY - oy)，oy 是脚底到帧顶的距离。
 *
 * 任何一页缺失都 `hasArt()===false`，BattleRoot 保留原来的金色菱形占位，不报错。
 */
import { Layers, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { HALF_H, HALF_W, loadGeneralAtlas } from './ArtLayer';
import type { GeneralIndex, GeneralSpriteMeta } from './ArtLayer';
import type { Unit, World } from './core/battle';
import { FIELD_BOTTOM, FIELD_TOP, project } from './view/layout';

const SHAPE_OF_TYPE = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', '0'];
const WEAPON_SEQ = 700;
const DEFAULT_HORSE = 900;
const SWING_FROM = 96;
const DEATH_TICKS = 24;
/** 脚底出战场带多少 px 就判「真出画」不再绘制（与 BattleRoot 阴影层 ±40 同口径；web 用 ±80）。 */
const FOOT_CULL_PAD = 40;

type Side = 'A' | 'B';

interface LayerNode {
  node: Node;
  sprite: Sprite;
  box: UITransform;
}

interface SideLayers {
  horse: LayerNode;
  body: LayerNode;
  weapon: LayerNode;
}

function isGeneralUnit(u: Unit): boolean {
  return (u as Unit & { isGeneral?: boolean }).isGeneral === true;
}

function clampShape(type: number | undefined): string {
  const raw = Math.round(Number(type ?? 2));
  const n = Number.isFinite(raw) ? Math.max(1, Math.min(15, raw)) : 2;
  return SHAPE_OF_TYPE[n - 1] ?? '2';
}

function makeLayer(parent: Node, name: string): LayerNode {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  node.parent = parent;
  node.setPosition(0, 0, 0);
  const box = node.addComponent(UITransform);
  box.setAnchorPoint(0.5, 0);
  box.setContentSize(1, 1);
  const sprite = node.addComponent(Sprite);
  sprite.type = Sprite.Type.SIMPLE;
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.enabled = false;
  node.active = false;
  return { node, sprite, box };
}

export class GeneralArt {
  private readonly root: Node;
  private readonly sides: Record<Side, SideLayers>;
  private index: GeneralIndex | null = null;
  private frames: Map<string, SpriteFrame> | null = null;
  private meta = new Map<string, GeneralSpriteMeta>();
  private shapeOf: Record<Side, string> = { A: '2', B: '2' };
  /** 上一幀兩側主將的「貼邊後腳底」螢幕座標；繪製時 BattleRoot 用它畫落地陰影 */
  private lastFoot: Record<Side, { x: number; y: number } | null> = { A: null, B: null };

  constructor(parent: Node) {
    this.root = new Node('GeneralArt');
    this.root.layer = Layers.Enum.UI_2D;
    this.root.parent = parent;
    this.root.setPosition(0, 0, 0);
    this.root.addComponent(UITransform).setContentSize(750, 1334);
    const a = this.makeSide('A');
    const b = this.makeSide('B');
    this.sides = { A: a, B: b };
  }

  hasArt(): boolean {
    return !!this.frames && this.frames.size > 0;
  }

  /** 每局只调一次；shape 从 `world.data.generals` 的 TYPE 推。失败静默回退。 */
  load(world: World, onReady?: () => void): void {
    const aName = world.sides.A.general.name;
    const bName = world.sides.B.general.name;
    this.shapeOf = {
      A: this.shapeOfGeneral(world, aName),
      B: this.shapeOfGeneral(world, bName),
    };
    // 页键沿用原作图集的 unit 名：L{shape}/R{shape} 是左右造型，H 是全部马，
    // W:A 是全部直劍（700..767）。帧名仍是 H900:Wait / W700:Wait。
    const units = [`L${this.shapeOf.A}`, `R${this.shapeOf.B}`, 'H', 'W:A'];
    loadGeneralAtlas('anim/general/index', units, (frames, index) => {
      if (!frames || !index) return;
      this.frames = frames;
      this.index = index;
      for (const key of Object.keys(index.pages)) {
        const page = index.pages[key];
        for (const sp of page.sprites) this.meta.set(sp.name, sp);
      }
      onReady?.();
    });
  }

  /** 画（或隐藏）两侧主将。每帧 redraw 调用；没图时什么都不做。 */
  draw(world: World, camX: number): void {
    if (!this.frames || !this.index) return;
    for (const side of ['A', 'B'] as Side[]) {
      const u = world.units.find((unit) => unit.side === side && isGeneralUnit(unit));
      if (!u) {
        this.hideSide(side);
        continue;
      }
      this.drawSide(world, u, side, camX);
    }
  }

  // -------------------------------------------------------------------------

  private makeSide(side: Side): SideLayers {
    // 顺序必须是 马 → 身体 → 武器（武器压身体，身体压马）
    const prefix = side === 'A' ? 'GenA' : 'GenB';
    const horse = makeLayer(this.root, `${prefix}Horse`);
    const body = makeLayer(this.root, `${prefix}Body`);
    const weapon = makeLayer(this.root, `${prefix}Weapon`);
    return { horse, body, weapon };
  }

  private shapeOfGeneral(world: World, name: string): string {
    const list = world.data.generals ?? [];
    const row = list.find((gen) => gen.NAME === name);
    return clampShape(row?.TYPE);
  }

  private frameOf(group: string, tick: number): { frame: SpriteFrame; meta: GeneralSpriteMeta } | null {
    if (!this.index || !this.frames) return null;
    const names = this.index.groups[group];
    if (!names || names.length === 0) return null;
    const action = this.index.actions[group] ?? {};
    const holds = Array.isArray(action.h) ? action.h : null;
    const step = typeof action.d === 'number' && action.d > 0 ? action.d : 8;
    let total = 0;
    const weights: number[] = [];
    for (let i = 0; i < names.length; i += 1) {
      const hold = holds && typeof holds[i] === 'number' && holds[i] > 0 ? holds[i] : step;
      weights.push(hold);
      total += hold;
    }
    let t = tick;
    if (action.loop === 1 && total > 0) t = ((t % total) + total) % total;
    else t = Math.max(0, Math.min(t, total - 1 || 0));
    let acc = 0;
    let index = names.length - 1;
    for (let i = 0; i < names.length; i += 1) {
      acc += weights[i];
      if (t < acc) {
        index = i;
        break;
      }
    }
    const meta = this.meta.get(names[index]);
    const frame = this.frames.get(names[index]);
    if (!meta || !frame) return null;
    return { frame, meta };
  }

  private drawSide(world: World, u: Unit, side: Side, camX: number): void {
    const layers = this.sides[side];
    const dead = !u.alive;
    const lastHit = typeof u.lastHitTick === 'number' ? u.lastHitTick : world.tick;
    if (dead && world.tick - lastHit > DEATH_TICKS) {
      this.hideSide(side);
      return;
    }
    const moving = u.x !== (u.prevX ?? u.x) || u.y !== (u.prevY ?? u.y);
    const attack = !dead && (u.cd ?? 0) > SWING_FROM;
    let act = 'Wait';
    if (dead) act = 'Death';
    else if (attack) act = 'Attack';
    else if (moving) act = 'Walk';

    const letter = side === 'A' ? 'L' : 'R';
    const shape = this.shapeOf[side];
    const slotSuffix = act === 'Wait' || act === 'Attack' ? `:1` : '';
    const bodyGroup = `${letter}${shape}:${act}${slotSuffix}`;

    let t = world.tick;
    if (dead) t = Math.max(0, world.tick - lastHit);
    else if (attack) t = Math.max(0, 120 - (u.cd ?? 0));

    const body = this.frameOf(bodyGroup, t);
    if (!body) {
      this.hideSide(side);
      return;
    }
    const p = project(u.x, u.y, camX);
    const foot = p.y + 8;
    // 真出带就整组不画（位置信息交给小地图 / 底部主将卡）：主将站在己方阵后，开局两军相距
    // 30~45 行，而一屏只有 12.6 行。过去这里把三层 bbox 硬钳回带内，等于让 45 行外的两个主将
    // 同屏，正是「距离很远却看得见彼此武将」的直接来源。
    // 判据用 p.y 而不是 foot(+8)，与 BattleRoot 阴影层的 ±40 逐字同条件——否则 p.y∈(1032,1040]
    // 会出现「人物不画、影子还在」。
    if (p.y < FIELD_TOP - FOOT_CULL_PAD || p.y > FIELD_BOTTOM + FOOT_CULL_PAD) {
      this.hideSide(side);
      return;
    }
    const parts: { layer: LayerNode; art: { frame: SpriteFrame; meta: GeneralSpriteMeta } }[] = [
      { layer: layers.body, art: body },
    ];

    if (dead) {
      this.place(layers.body, body, p.x, foot);
      layers.weapon.node.active = false;
      layers.horse.node.active = false;
      this.lastFoot[side] = null;
      return;
    }

    const horseAct = attack ? 'Attack' : moving ? 'Walk' : 'Wait';
    const horse = this.frameOf(`H${DEFAULT_HORSE}:${horseAct}`, t);
    const weapon = this.frameOf(`W${WEAPON_SEQ}:${attack ? 'Attack' : 'Wait'}`, t);
    if (horse) parts.push({ layer: layers.horse, art: horse });
    else layers.horse.node.active = false;
    if (weapon) parts.push({ layer: layers.weapon, art: weapon });
    else layers.weapon.node.active = false;

    for (const part of parts) this.place(part.layer, part.art, p.x, foot);
    this.lastFoot[side] = { x: p.x, y: foot };
  }

  /** 該側主將這一幀的「腳底」螢幕座標（設計 px，未做任何貼邊位移；出帶時爲 null）。 */
  footAt(side: Side): { x: number; y: number } | null {
    return this.lastFoot[side];
  }

  private place(layer: LayerNode, art: { frame: SpriteFrame; meta: GeneralSpriteMeta }, sx: number, sy: number): void {
    const w = art.frame.rect.width || art.meta.w;
    const h = art.frame.rect.height || art.meta.h;
    const box = layer.box.contentSize;
    if (box.width !== w || box.height !== h) layer.box.setContentSize(w, h);
    layer.node.setPosition(sx - HALF_W + w / 2 - art.meta.ox, HALF_H - (sy + h - art.meta.oy), 0);
    if (layer.sprite.spriteFrame !== art.frame) layer.sprite.spriteFrame = art.frame;
    if (!layer.sprite.enabled) layer.sprite.enabled = true;
    if (!layer.node.active) layer.node.active = true;
  }

  private hide(layers: SideLayers): void {
    layers.horse.node.active = false;
    layers.body.node.active = false;
    layers.weapon.node.active = false;
  }

  private hideSide(side: Side): void {
    this.hide(this.sides[side]);
    this.lastFoot[side] = null;
  }
}
