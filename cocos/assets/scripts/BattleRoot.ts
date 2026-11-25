/**
 * Cocos Creator 3.8 视图壳：持有一个与引擎无关的 World，按固定 30Hz 推进，
 * 每帧用 Graphics 把战场重画成矢量块，HUD 用 Label。
 *
 * 边界（必须守住）：
 *   - 战斗规则全部在 assets/scripts/core/battle.ts，本文件不判定胜负、不结算伤害；
 *   - 本文件只做"读 World → 画"和"把 dt 攒成 tick"；
 *   - 将来接图集/Spine 时，替换 drawUnits()/drawFx() 即可，World 与 core 不动。
 *
 * 用法：新建 2D 场景 → Canvas 节点挂本组件（设计分辨率 750×1334）→ 运行。
 */
import {
  _decorator,
  Color,
  Component,
  Graphics,
  input,
  Input,
  Label,
  Node,
  UITransform,
} from 'cc';
import { camera, createWorld, settle, step, TICK_HZ } from './core/battle';
import type { World } from './core/battle';
import { loadGameData } from './DataLoader';
import {
  DESIGN_H,
  DESIGN_W,
  FIELD,
  FIELD_BOTTOM,
  FIELD_H,
  FIELD_TOP,
  GRID_H,
  GRID_W,
  LANE_PX,
  ROW_PX,
  project,
} from './view/layout';
import { COLORS, FONT_FAMILY } from './view/theme';

const { ccclass, property } = _decorator;

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

/** core 把主将塞进 units 时用的是 `as Unit & {isGeneral:true}`，类型上 Unit 只有 false。 */
function isGeneral(u: World['units'][number]): boolean {
  return (u as unknown as { isGeneral?: boolean }).isGeneral === true;
}

@ccclass('BattleRoot')
export class BattleRoot extends Component {
  @property({ tooltip: '进入场景后自动开战；关掉则等一次点击' })
  autoStart = true;

  private world: World | null = null;
  private settlement: ReturnType<typeof settle> | null = null;
  private loading = false;
  private accumulator = 0;
  private camX = 35;

  private gBase: Graphics | null = null;
  private gA: Graphics | null = null;
  private gB: Graphics | null = null;
  private gGeneral: Graphics | null = null;
  private gFx: Graphics | null = null;

  private labelA: Label | null = null;
  private labelB: Label | null = null;
  private labelTick: Label | null = null;
  private labelGeneral: Label | null = null;
  private labelStatus: Label | null = null;

  onLoad(): void {
    this.buildUi();
    input.on(Input.EventType.TOUCH_END, this.onTouch, this);
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_END, this.onTouch, this);
  }

  protected async start(): Promise<void> {
    if (this.autoStart) await this.boot();
  }

  update(dt: number): void {
    if (!this.world) {
      this.redrawBase();
      return;
    }

    // dt 夹紧：切后台/首帧可能给一个巨大的 dt，绝不允许一次补几百 tick
    this.accumulator += Math.min(dt, 0.1);
    const stepDt = 1 / TICK_HZ;
    let steps = 0;
    while (this.accumulator >= stepDt && steps < 5) {
      step(this.world);
      this.accumulator -= stepDt;
      steps += 1;
      if (this.world.over) break;
    }
    if (steps === 5) this.accumulator = 0;

    if (this.world.over && !this.settlement) {
      this.settlement = settle(this.world);
      this.accumulator = 0;
    }

    const target = camera(this.world);
    this.camX += (target - this.camX) * Math.min(1, dt * 5);

    this.redraw();
  }

  // -------------------------------------------------------------------------
  // 数据 / 世界
  // -------------------------------------------------------------------------

  private async boot(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.setStatus('載入 data/*.json …');
    try {
      const data = await loadGameData((done, total) => this.setStatus(`載入 ${done}/${total}`));
      // 数据表里的兵种/阵形是名字数组；数字下标只在这个壳里出现，core 仍只认 GameData。
      const world = createWorld({
        data,
        seed: 20261124,
        a: {
          troop: 2, // 大刀（id=2）
          formation: 0, // 方形
          soldiers: 100,
          morale: 60,
          general: { name: '關羽', str: 97, int: 75, level: 6 },
        },
        b: {
          troop: 10, // 黃巾
          formation: 3, // 雁形
          soldiers: 100,
          morale: 60,
          general: { name: '張角', str: 70, int: 88, level: 5 },
        },
        aiSides: { B: true },
      });
      this.world = world;
      this.settlement = null;
      this.accumulator = 0;
      this.camX = camera(world);
      this.setStatus('固定 30Hz 邏輯 · 點擊畫面（結束後）重開');
      this.redraw();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus(`載入失敗：${msg}`);
      console.error('[BattleRoot]', err);
    } finally {
      this.loading = false;
    }
  }

  private onTouch(): void {
    if (this.loading) return;
    if (!this.world || this.settlement) void this.boot();
  }

  // -------------------------------------------------------------------------
  // 舞台
  // -------------------------------------------------------------------------

  private buildUi(): void {
    this.gBase = this.makeGraphics('BattleBase');
    this.gA = this.makeGraphics('UnitsA');
    this.gB = this.makeGraphics('UnitsB');
    this.gGeneral = this.makeGraphics('Generals');
    this.gFx = this.makeGraphics('Fx');

    this.labelA = this.makeLabel('我軍', 16, 38, 280, 18, COLORS.text, 'left');
    this.labelB = this.makeLabel('敵軍', 734, 38, 280, 18, COLORS.text, 'right');
    this.labelTick = this.makeLabel('00:00', 375, 38, 200, 22, COLORS.gold, 'center');
    this.labelGeneral = this.makeLabel('', 16, 1032, 300, 17, COLORS.text, 'left');
    this.labelStatus = this.makeLabel('', 375, 1308, 700, 14, COLORS.textDim, 'center');
  }

  private makeGraphics(name: string): Graphics {
    const node = new Node(name);
    node.parent = this.node;
    node.setPosition(0, 0, 0);
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    return node.addComponent(Graphics);
  }

  private makeLabel(
    text: string,
    sx: number,
    sy: number,
    width: number,
    fontSize: number,
    color: string,
    align: 'left' | 'center' | 'right',
  ): Label {
    const node = new Node(`Label_${text || 'status'}`);
    node.parent = this.node;
    node.addComponent(UITransform).setContentSize(width, fontSize * 3);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontFamily = FONT_FAMILY;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.45);
    label.color = rgba(color);
    label.horizontalAlign =
      align === 'left'
        ? Label.HorizontalAlign.LEFT
        : align === 'right'
          ? Label.HorizontalAlign.RIGHT
          : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.NONE;
    // 屏幕坐标（左上原点）→ Cocos UI 局部坐标（中心原点、y 向上）
    const x = sx - HALF_W;
    const y = HALF_H - sy;
    node.setPosition(x, y, 0);
    return label;
  }

  private setStatus(text: string): void {
    if (this.labelStatus) this.labelStatus.string = text;
  }

  // -------------------------------------------------------------------------
  // 绘制：全部屏幕坐标（750×1334，左上原点），落到 Graphics 时统一翻转 y
  // -------------------------------------------------------------------------

  private fillScreenRect(g: Graphics, x: number, y: number, w: number, h: number, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(x - HALF_W, HALF_H - y - h, w, h);
    g.fill();
  }

  private redrawBase(): void {
    const g = this.gBase;
    if (!g) return;
    g.clear();
    this.fillScreenRect(g, 0, 0, DESIGN_W, DESIGN_H, COLORS.bg);
    this.fillScreenRect(g, 0, 0, DESIGN_W, 100, COLORS.bgDeep);
    this.fillScreenRect(g, 0, 999, DESIGN_W, 335, COLORS.bgDeep);
    this.fillScreenRect(g, 0, FIELD_TOP, DESIGN_W, FIELD_H, COLORS.field);
  }

  private redraw(): void {
    const world = this.world;
    const gBase = this.gBase;
    if (!world || !gBase) return;

    this.redrawBase();

    // 战场网格：横线按可见 worldX 区间画，竖线固定 15 条
    gBase.strokeColor = rgba(COLORS.line, 150);
    gBase.lineWidth = 1;
    const half = FIELD_H / 2 / ROW_PX;
    const from = Math.max(0, Math.floor(this.camX - half));
    const to = Math.min(GRID_W - 1, Math.ceil(this.camX + half));
    for (let gx = from; gx <= to; gx += 1) {
      const sy = project(gx, 0, this.camX).y - ROW_PX / 2;
      if (sy < FIELD_TOP || sy > FIELD_BOTTOM) continue;
      gBase.moveTo(-HALF_W, HALF_H - sy);
      gBase.lineTo(HALF_W, HALF_H - sy);
    }
    for (let gy = 0; gy <= GRID_H; gy += 1) {
      const sx = gy * LANE_PX - HALF_W;
      gBase.moveTo(sx, HALF_H - FIELD_BOTTOM);
      gBase.lineTo(sx, HALF_H - FIELD_TOP);
    }
    gBase.stroke();

    // HUD 兵力条（Label 显示数字，条用 Graphics 补）
    const a = world.sides.A;
    const b = world.sides.B;
    this.drawBar(gBase, 16, 56, 280, a.aliveCount / Math.max(1, a.start), COLORS.ours);
    this.drawBar(gBase, 454, 56, 280, b.aliveCount / Math.max(1, b.start), COLORS.enemy);
    this.drawBar(gBase, 16, 76, 180, a.general.hp / Math.max(1, a.general.maxHp), COLORS.heal);
    this.drawBar(gBase, 554, 76, 180, b.general.hp / Math.max(1, b.general.maxHp), COLORS.heal);

    this.drawUnits(world);
    this.drawFx(world);

    const tick = world.tick / TICK_HZ;
    if (this.labelA) this.labelA.string = `我軍  ${a.aliveCount}/${a.start}`;
    if (this.labelB) this.labelB.string = `${b.aliveCount}/${b.start}  敵軍`;
    if (this.labelTick) {
      this.labelTick.string = this.settlement
        ? '戰鬥結束'
        : `${tick.toFixed(1)}s`;
    }
    if (this.labelGeneral) {
      const gen = a.general;
      this.labelGeneral.string =
        `${gen.name}  Lv.${gen.level}   武力 ${gen.str}   智力 ${gen.int}\n` +
        `HP ${Math.ceil(gen.hp)}/${gen.maxHp}   MP ${Math.floor(gen.mp)}   技能：命療術 / 半月斬 / 落月箭 / 神鬼亂舞`;
    }
    if (this.settlement) {
      const win = this.settlement.winner === 'A' ? '勝利' : this.settlement.winner === 'B' ? '敗退' : '平手';
      this.setStatus(`${win} · 擊殺 ${this.settlement.kills} · 用時 ${this.settlement.durationSec}s · 點擊畫面重開`);
    }
  }

  private drawBar(g: Graphics, x: number, y: number, w: number, ratio: number, color: string): void {
    this.fillScreenRect(g, x, y, w, 4, COLORS.line);
    const filled = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    if (filled > 0) this.fillScreenRect(g, x, y, w * filled, 4, color);
  }

  private drawUnits(world: World): void {
    const ga = this.gA;
    const gb = this.gB;
    const gg = this.gGeneral;
    if (!ga || !gb || !gg) return;
    ga.clear();
    gb.clear();
    gg.clear();

    // 同一颜色的所有块只 fill 一次，减少 Graphics 的 draw call
    for (const u of world.units) {
      if (!u.alive) continue;
      const p = project(u.x, u.y, this.camX);
      if (p.y < FIELD_TOP - 40 || p.y > FIELD_BOTTOM + 40) continue;
      const g = u.side === 'A' ? ga : gb;
      const cx = p.x - HALF_W;
      const cy = HALF_H - p.y;
      const general = isGeneral(u);
      const w = general ? 30 : 18;
      const h = general ? 38 : 26;
      g.rect(cx - w / 2, cy - h / 2, w, h);
      // 朝向缺口：A 朝上（本地 +y），B 朝下（本地 -y）
      const dir = u.side === 'A' ? 1 : -1;
      g.moveTo(cx - w * 0.28, cy + (dir * h) / 2);
      g.lineTo(cx + w * 0.28, cy + (dir * h) / 2);
      g.lineTo(cx, cy + (dir * h) / 2 + dir * (h * 0.34));
      g.close();
      if (general) {
        gg.moveTo(cx, cy + 10);
        gg.lineTo(cx + 7, cy);
        gg.lineTo(cx, cy - 10);
        gg.lineTo(cx - 7, cy);
        gg.close();
      }
    }

    ga.fillColor = rgba(COLORS.ours, 235);
    ga.fill();
    gb.fillColor = rgba(COLORS.enemy, 235);
    gb.fill();
    gg.fillColor = rgba(COLORS.gold, 245);
    gg.fill();
  }

  private drawFx(world: World): void {
    const g = this.gFx;
    if (!g) return;
    g.clear();
    for (const fx of world.fx) {
      // core 的 heal fx 把 x 填成了 HP，不是世界坐标；Cocos 壳先不画 heal 圈
      if (fx.kind === 'heal') continue;
      const p = project(fx.x, fx.y, this.camX);
      if (p.y < FIELD_TOP - 60 || p.y > FIELD_BOTTOM + 60) continue;
      const r = Math.max(10, fx.r * LANE_PX);
      g.circle(p.x - HALF_W, HALF_H - p.y, r);
    }
    g.strokeColor = rgba(COLORS.gold, 140);
    g.lineWidth = 2;
    g.stroke();
  }
}
