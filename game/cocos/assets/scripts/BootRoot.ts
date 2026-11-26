/**
 * 启动屏（Cocos Creator 3.8）：整个工程唯一的入口场景。
 *
 * 职责只有三件，别往这里塞业务：
 *   1. 把 `resources/data/*.json` 里 core 要的 8 张表读进内存（DataLoader 有模块级缓存，
 *      后面 Campaign/Deploy/Battle 再调 loadGameData() 会直接拿到同一个 Promise）；
 *   2. 读完挂标题页（`TitlePanel`）——新增的開局三殼入口，不再直接跳大地图；
 *   3. 標題頁 / 劇本選擇 / 君主選擇都只是同一 Canvas 上的面板，選完才
 *      `director.loadScene(nextScene)`。
 *
 * 失败（缺文件 / JSON 坏）时不清屏：把错误印在状态行，点一下重试。
 *
 * 用法：新建空场景 → Canvas 节点挂本组件（Canvas 自带 UITransform，本脚本不再加）。
 * 节点全部由代码创建，不需要拖任何东西进属性面板。
 */
import {
  _decorator,
  Color,
  Component,
  director,
  Graphics,
  input,
  Input,
  Label,
  Layers,
  Node,
  UITransform,
} from 'cc';
import { loadGameData } from './DataLoader';
import { loadScenarioLevels } from './ScenarioLevels';
// 只为了让它顶层执行（Cocos 按需执行模块，没人 import 的脚本不会跑）：
// `?skinlab=1` 时它会自己往 Campaign 场景上挂一个图元验证层，平时 node.active=false 不挡画面。
import './SkinLab';
import { preloadMagicProgram } from './shim/host';
import { ScenarioSelect } from './ScenarioSelect';
import { setScenarioCount } from './RunSetup';
import { TitlePanel } from './TitlePanel';
import type { GameData } from './types';
import { DESIGN_H, DESIGN_W } from './view/layout';
import { COLORS, FONT_FAMILY } from './view/theme';
import { guardTouch, installInputResilience } from './InputGuard';

const { ccclass, property } = _decorator;

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

type BootState = 'idle' | 'loading' | 'failed' | 'ready';

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

@ccclass('BootRoot')
export class BootRoot extends Component {
  @property({ tooltip: '資料載入完跳哪個場景；字串必須與 .scene 檔名完全一致' })
  nextScene = 'Campaign';

  private g: Graphics | null = null;
  private labelStatus: Label | null = null;
  private baseNode: Node | null = null;
  private state: BootState = 'idle';
  private data: GameData | null = null;
  private title: TitlePanel | null = null;
  private select: ScenarioSelect | null = null;

  onLoad(): void {
    installInputResilience();
    this.buildUi();
    input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'BootRoot'), this);
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'BootRoot'), this);
  }

  protected async start(): Promise<void> {
    await this.boot();
  }

  // -------------------------------------------------------------------------
  // 舞台
  // -------------------------------------------------------------------------

  private buildUi(): void {
    const node = new Node('BootBase');
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
    node.setPosition(0, 0, 0);
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    const g = node.addComponent(Graphics);
    this.g = g;
    this.baseNode = node;

    g.fillColor = rgba(COLORS.bg);
    g.rect(-HALF_W, -HALF_H, DESIGN_W, DESIGN_H);
    g.fill();

    this.makeLabel('三國群英傳 · 豎版重製', 375, 560, 700, 34, COLORS.goldLight, 'center');
    this.labelStatus = this.makeLabel('啓動中…', 375, 640, 700, 18, COLORS.textDim, 'center');
  }

  private makeLabel(
    text: string,
    cx: number,
    cy: number,
    width: number,
    fontSize: number,
    color: string,
    align: 'left' | 'center' | 'right',
  ): Label {
    const node = new Node(`Label_${text || 'boot'}`);
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
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
    // 与三个 Root 同一套坐标口径：设计坐标 750×1334、左上原点。
    const centerX = align === 'left' ? cx + width / 2 : align === 'right' ? cx - width / 2 : cx;
    node.setPosition(centerX - HALF_W, HALF_H - cy, 0);
    return label;
  }

  // -------------------------------------------------------------------------
  // 数据
  // -------------------------------------------------------------------------

  private async boot(): Promise<void> {
    if (this.state === 'loading') return;
    this.state = 'loading';
    this.setStatus('載入 data/*.json …');
    try {
      const data = await loadGameData((done, total) => this.setStatus(`載入 ${done}/${total}`));
    // R85：分劇本起始等級表（levels_by_scenario.json）。缺檔只 warn，退回 BaseEXP 反推的 Lv2。
    await loadScenarioLevels();
      // 军师技/法术脚本（MAGIC.SO 虚拟机）必须在开战前预热：core 的 initMagicProgram()
      // 是浏览器 API（location/fetch）实现，Cocos/微信下由 shim/host.ts 垫一层再调。
      this.setStatus('載入 magic_so.bin …');
      const magicOk = await preloadMagicProgram();
      setScenarioCount(data.scenarios.length);
      this.data = data;
      this.state = 'ready';
      this.setStatus(
        `就緒：武將 ${data.generals.length} · 劇本 ${data.scenarios.length} · 法術 ${magicOk ? 'OK' : '降級'}`,
      );
      this.showTitle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state = 'failed';
      this.setStatus(`載入失敗：${msg}（點擊重試）`);
      console.error('[BootRoot]', err);
    }
  }

  // -------------------------------------------------------------------------
  // 開局三殼：標題 → 劇本 → 君主 → 大地圖
  // -------------------------------------------------------------------------

  private showTitle(): void {
    if (!this.data) return;
    this.closeSelect();
    if (this.title) return;
    if (this.baseNode) this.baseNode.active = false;
    this.title = TitlePanel.show(this.node, {
      data: this.data,
      onNewGame: () => this.openSelect(),
      onEnterCampaign: () => this.enterCampaign(),
    });
  }

  private openSelect(): void {
    if (!this.data) return;
    this.closeTitle();
    this.closeSelect();
    this.select = ScenarioSelect.show(this.node, {
      data: this.data,
      onBack: () => this.showTitle(),
      onEnterCampaign: () => this.enterCampaign(),
    });
  }

  private enterCampaign(): void {
    this.closeSelect();
    this.closeTitle();
    director.loadScene(this.nextScene);
  }

  private closeTitle(): void {
    if (this.title) {
      this.title.close();
      this.title = null;
    }
  }

  private closeSelect(): void {
    if (this.select) {
      this.select.close();
      this.select = null;
    }
  }

  private onTouch(): void {
    // 成功后已经在标题页/切场景，这里只在失败态生效：loadGameData 失败会清缓存，重试是安全的。
    if (this.state === 'failed') void this.boot();
  }

  private setStatus(text: string): void {
    if (this.labelStatus) this.labelStatus.string = text;
  }
}
