/**
 * 天气表现层（Cocos 侧）—— 配合 `core/weather.ts`（数值）与 `AudioBus`（音效）。
 *
 * web 侧天气是 CSS/DOM 的雨雪粒子层；Cocos 侧没有 DOM，也不想为这层再引贴图，
 * 所以用**一个 Graphics 每帧重画**：
 *   - 雨：斜线段（`stroke`，110 条），整体随风左偏，落出战场带就回绕到顶；
 *   - 雪：小圆点（`fill`，70 个），带横向正弦漂移，比雨慢 10 倍；
 *   - 雾：7 条横向半透明带，缓慢上下浮动 + 透明度呼吸；
 *   - 晴：清空，不画。
 *
 * 位置全部是「时间 + 序号」的确定性哈希，不存粒子状态：同一个 `weather` + 同一个 `t`
 * 画出来的东西逐帧可复现（截图验收/回归对比都靠这个）。
 *
 * 只画在战场带（`FIELD_TOP .. FIELD_TOP+FIELD_H`）里：上下各留 100px 余量，超出的部分
 * 由 `gBase` 的不透明顶栏与控制台盖住，所以不需要 Mask。
 *
 * 同文件还导出 `ScreenTint`：闪白（`0x131/0x110`）与画面亮度（`0x12F`，0..16）的可见结果。
 * 这两个是 SYSTEM.SO 的产物，web 侧用 CSS filter/overlay 做，Cocos 侧同样走 Graphics。
 */
import { Color, Graphics, Layers, Node, UITransform } from 'cc';
import { FIELD_H, FIELD_TOP } from './view/layout';
import type { Weather } from './core/weather';

const HALF_W = 375;
const HALF_H = 667;
/** 雨丝条数 */
export const RAIN_COUNT = 110;
/** 雪片个数 */
export const SNOW_COUNT = 70;
/** 雾带条数 */
export const FOG_BANDS = 7;

/** 设计坐标（左上原点）→ 节点局部坐标（设计与屏幕同尺寸，中心在 (375, 667)） */
function lx(x: number): number {
  return x - HALF_W;
}
function ly(y: number): number {
  return HALF_H - y;
}

/** 确定性哈希：`i` → [0,1)。不用随机数，保证同一帧可复现。 */
function hash(i: number): number {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export class BattleWeather {
  readonly node: Node;
  private readonly g: Graphics;
  private weather: Weather = 0;
  private t = 0;
  private dirty = true;

  constructor(parent: Node, weather: Weather = 0) {
    this.node = new Node('BattleWeather');
    this.node.layer = Layers.Enum.UI_2D;
    this.node.parent = parent;
    const transform = this.node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(HALF_W * 2, FIELD_H);
    this.node.setPosition(0, 667 - (FIELD_TOP + FIELD_H / 2), 0);
    this.g = this.node.addComponent(Graphics);
    this.setWeather(weather);
  }

  get weatherId(): Weather {
    return this.weather;
  }

  setWeather(weather: Weather): void {
    if (weather === this.weather) return;
    this.weather = weather;
    this.dirty = true;
    if (weather === 0) this.g.clear();
  }

  /** 每帧调；`dt` 秒。 */
  update(dt: number): void {
    if (this.weather === 0) return;
    this.t += Math.max(0, Math.min(0.1, dt));
    this.dirty = true;
    this.redraw();
  }

  dispose(): void {
    this.node.destroy();
  }

  private redraw(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const g = this.g;
    g.clear();
    const top = FIELD_TOP;
    const span = FIELD_H + 200; // 上下各 100 的余量
    const t = this.t;

    if (this.weather === 1) {
      // 雨
      g.strokeColor = new Color(178, 200, 232, 150);
      g.lineWidth = 2;
      const wind = -46; // px/s，向左
      for (let i = 0; i < RAIN_COUNT; i += 1) {
        const sx = hash(i * 3 + 1);
        const sy = hash(i * 3 + 2);
        const sd = hash(i * 3 + 3);
        const speed = 780 + 620 * sd;
        const px = ((sx * 750 + wind * t) % 750 + 750) % 750;
        const py = top - 100 + (((sy * span + speed * t) % span) + span) % span;
        const len = 18 + 14 * sd;
        g.moveTo(lx(px), ly(py));
        g.lineTo(lx(px - 5), ly(py + len));
      }
      g.stroke();
      return;
    }

    if (this.weather === 2) {
      // 雪
      g.fillColor = new Color(245, 248, 255, 205);
      for (let i = 0; i < SNOW_COUNT; i += 1) {
        const sx = hash(i * 5 + 11);
        const sy = hash(i * 5 + 12);
        const sd = hash(i * 5 + 13);
        const speed = 46 + 74 * sd;
        const drift = Math.sin(t * 0.9 + sx * 6.283) * 26;
        const px = ((sx * 750 + drift) % 750 + 750) % 750;
        const py = top - 100 + (((sy * span + speed * t) % span) + span) % span;
        g.circle(lx(px), ly(py), 1.6 + 2.2 * sd);
      }
      g.fill();
      return;
    }

    if (this.weather === 3) {
      // 雾
      const bandH = FIELD_H / FOG_BANDS;
      for (let i = 0; i < FOG_BANDS; i += 1) {
        const seed = hash(i * 7 + 3);
        const bob = Math.sin(t * 0.35 + seed * 6.283) * 12;
        const alpha = Math.round((0.055 + 0.045 * (0.5 + 0.5 * Math.sin(t * 0.5 + seed * 6.283))) * 255);
        g.fillColor = new Color(206, 214, 228, alpha);
        const y0 = top + i * bandH + bob;
        g.rect(lx(0), ly(y0 + bandH), HALF_W * 2, bandH);
        g.fill();
      }
    }
  }
}

/**
 * 闪白与画面亮度的可见结果。
 *
 *  - `brightness` 0..16（16 = 正常）：黑幕 alpha = (16 - level) / 16；
 *  - `flash` 0..1：白幕 alpha = flash * 0.55（`AllRush` 的 0.55 就是这个量级）。
 *
 * 两者在同一个 Graphics 上按「黑幕 + 白幕」两次 fill，透明叠加顺序与 web 一致（白在最上）。
 */
export class ScreenTint {
  readonly node: Node;
  private readonly g: Graphics;
  private brightness = 16;
  private flash = 0;
  private lastBlack = -1;
  private lastWhite = -1;

  constructor(parent: Node) {
    this.node = new Node('ScreenTint');
    this.node.layer = Layers.Enum.UI_2D;
    this.node.parent = parent;
    const transform = this.node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(HALF_W * 2, HALF_H * 2);
    this.node.setPosition(0, 0, 0);
    this.g = this.node.addComponent(Graphics);
  }

  setBrightness(level: number): void {
    this.brightness = Number.isFinite(level) ? Math.max(0, Math.min(16, level)) : 16;
  }

  setFlash(strength: number): void {
    this.flash = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  }

  /** 每帧调。只有 alpha 真的变了才重画（静止时零开销）。 */
  update(): void {
    const black = Math.round(((16 - this.brightness) / 16) * 255);
    const white = Math.round(this.flash * 0.55 * 255);
    if (black === this.lastBlack && white === this.lastWhite) return;
    this.lastBlack = black;
    this.lastWhite = white;
    const g = this.g;
    g.clear();
    if (black > 0) {
      g.fillColor = new Color(0, 0, 0, black);
      g.rect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2);
      g.fill();
    }
    if (white > 0) {
      g.fillColor = new Color(255, 255, 255, white);
      g.rect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2);
      g.fill();
    }
  }

  dispose(): void {
    this.node.destroy();
  }
}
