/**
 * Cocos Creator 3.8 视图壳：持有一个与引擎无关的 World，按固定 60Hz（`TICK_HZ`）推进，
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
  director,
  EventTouch,
  Graphics,
  input,
  Input,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  UIOpacity,
  UITransform,
} from 'cc';
import { ArtBg, loadUnitAtlas } from './ArtLayer';
import { battleAudioMark } from './AudioBus';
import type { BattleAudioMark } from './AudioBus';
import { AudioHost } from './AudioHost';
import { BattleBg } from './BattleBg';
import { BattleHud } from './BattleHud';
import { BattleWeather, ScreenTint } from './BattleWeather';
import { camera, createWorld, settle, step, QI_MAX, TICK_HZ } from './core/battle';
import { installArmyOrders } from './core/army_cmd';
import { applyWise, applyWiseOnBattleStart } from './core/wises';
import type { World } from './core/battle';
import { WEATHER_NAME } from './core/weather';
import type { Weather } from './core/weather';
import { loadGameData } from './DataLoader';
import { GeneralArt } from './GeneralArt';
import { consumeBattleLaunch, loadSave, persistSave, recordBattleResult } from './GameState';
import type { BattleLaunch } from './GameState';
import { queuePostBattle } from './SurrenderModel';
import { hasForceSchema, pickUnitFrames } from './UnitFrames';
import type { UnitsGroups } from './UnitFrames';
import {
  DESIGN_H,
  DESIGN_W,
  FIELD,
  FIELD_BOTTOM,
  FIELD_CENTER_Y,
  FIELD_H,
  FIELD_TOP,
  GRID_H,
  GRID_W,
  LANE_PX,
  ROW_PX,
  HUD_QI_A,
  HUD_QI_B,
  project,
} from './view/layout';
import { COLORS, FONT_FAMILY } from './view/theme';
import { BattleInput, skillRadius, skillSlotRects, uiToScreen, worldToScreen } from './BattleInput';
import type { BattleEffect, FloatTone } from './BattleInput';
import { actionGaugeOf, buildCmdUi, generalUnitOf } from './BattleCmdUi';
import type { CmdBg, CmdText } from './BattleCmdUi';
import { applyTextRole } from './TextRole';
import { makeNineSlice, makePanel, placeDesign } from './UiSkin';

const { ccclass, property } = _decorator;

/**
 * 指令台规格里由「底部主将卡」接管的三条文本。
 *
 * `BattleCmdUi.buildCmdUi()` 仍会产出 `gen.stats`（`武 x · 智 y · 行 a/b`）、`gen.hp`、`gen.mp`
 * —— 它是纯数据层、web 侧也用同一套口径，不该在这里删。但竖版把 `武/智` 与 `兵/技` 挪进了
 * 控制台上沿的两块主将卡（原作版式），而 `cmdRoot` 建在 `hud` 之后（压在 HUD 上），
 * 不按 id 过滤的话，12px 的旧行会正好压在新卡的四裸数字上。
 */
const CARD_TAKEOVER_IDS: ReadonlySet<string> = new Set(['gen.stats', 'gen.hp', 'gen.mp']);

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;

/** 技能飘字存活 tick 数（45 tick = 1.5s，与 core 的 `SKILL_MARK_TTL` 同值） */
const FLOATER_TTL = 45;
/** 操作提示在屏幕上停留的 tick 数（5s 后自己消失，不抢 HUD 消息栏） */
const MESSAGE_TTL = 150;
/** 飘字池容量：一次施放只出一条，8 条足够覆盖连放 */
const FLOATER_POOL = 8;

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
  private launch: BattleLaunch | null = null;
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
  private labelStatus: Label | null = null;

  /**
   * 战斗页 HUD / 结算面板（九宫图 + 4 级字级，见 BattleHud.ts）。
   *
   * 它只读 `world` / `settlement`，不碰战斗判定；原来压在控制台里的两行 General 文本
   * （labelGeneral）已拆进 HUD 的主将信息块 / 消息栏 / 右上元信息。
   */
  private hud: BattleHud | null = null;

  /** HUD 顶栏底图（bg/hud_bar）；缺图时 HUD 只用 Graphics 深色底板 */
  private artHud: ArtBg | null = null;
  /** 单位帧图集（anim/atlas_00 + anim/atlas）；null = 没图或加载失败 → 继续画方块 */
  private unitFrames: { back: SpriteFrame[]; front: SpriteFrame[] } | null = null;
  /** 兵种图集（anim/units_00 + anim/units）里的弓/弩拉弓帧；兵种 3/11 时替换 atlas 帧 */
  private archerFrames: { back: SpriteFrame[]; front: SpriteFrame[] } | null = null;
  /**
   * 原作 FORCE 士兵图集（`anim/units` 的 `groups.<兵種>`）：13 兵種 × 2 陣營。
   * 有它時 A 側用 `back`（M 藍軍）、B 側用 `front`（N 紅軍），直接換幀而不是染紅；
   * 沒有（舊 AI 圖集）就退回 `unitFrames`/`archerFrames` 的 walk_back / walk_front。
   */
  private forceAtlas: { groups: UnitsGroups; frames: Map<string, SpriteFrame> } | null = null;
  /** 按 `side:troop` 緩存選好的 SpriteFrame 數組（每局只算一次，換兵種才重算） */
  private forceCache = new Map<string, { walk: SpriteFrame[]; attack: SpriteFrame[]; hold: number }>();
  /** 本局主将的军师技生效说明（HUD 用）；空串 = 没用军师技 */
  private wiseNote = '';
  private unitLayer: Node | null = null;
  private unitPool: { node: Node; sprite: Sprite; box: UITransform }[] = [];
  /** 主将三层图（anim/general：马→身体→武器）；没图时保持 gGeneral 的金色菱形 */
  private generalArt: GeneralArt | null = null;

  /** 音效总线宿主：AudioSource 池 + 战斗音效编排 + BGM/底噪（见 AudioHost.ts） */
  private audio: AudioHost | null = null;
  /** 战斗音效的上一帧快照；`battleAudioEvents()` 会就地把它的字段推到当前 tick */
  private audioMark: BattleAudioMark | null = null;
  /** 战场背景（res/bg/orig：地面平铺 + 三条视差带）；ready 之后顶掉 gBase 的渐变底 */
  private bg: BattleBg | null = null;
  private weatherLayer: BattleWeather | null = null;
  private tint: ScreenTint | null = null;

  /**
   * 战场操作状态机（见 BattleInput.ts）：技能格选技 → 瞄准 → 施放、突擊提示、撤退。
   *
   * 逻辑之所以不写在本类：本类挂 `cc`，没法在 Node 里单测；
   * BattleInput 不引 `cc`，`work/cocos_binput/input_assert.mjs` 直接编译它跑断言。
   */
  private input = new BattleInput();
  /** 瞄准层：选中格金框 + 半径椭圆。压在 HUD 之上（buildUi 里在 hud 之后创建） */
  private gAim: Graphics | null = null;
  /** 操作提示（「氣力不足…」/「全軍撤退。」）：战场下沿一行，TTL 到点自己消失 */
  private labelToast: Label | null = null;
  /** 「全軍撤退」标记：内核 `requestRetreat()` 不写 world.log，所以这里自己画 */
  private labelBanner: Label | null = null;
  /** 提示条底衬（见 buildUi 的注释：金字直接压地面读不出来） */
  private gToastBg: Graphics | null = null;
  /** 瞄准点上方那行「技能名 · 點擊施放」（web battleView.drawAim 的同款） */
  private labelAim: Label | null = null;
  /** 飘字池（Label 复用）：施放后 +N / -N / MISS 往上飘并淡出 */
  private floaterLabels: Label[] = [];
  private floaters: { x: number; y: number; text: string; tone: FloatTone; born: number }[] = [];
  /** 提示去重：只在文案变化时重置 MESSAGE_TTL 的计时 */
  private lastMessage = '';
  private messageTick = 0;

  /**
   * 指令台（web battleView 的「6 颗第一层 + 第二层 6 行 + 突擊/撤退 chip + 主将数值」）。
   *
   * 规格全部来自 `BattleCmdUi.buildCmdUi(world, opts)`（纯数据、只读 world），
   * 这里只做「规格 → 九宫节点 + Label」的通用渲染与复用（见 `syncCmdUi`）。
   */
  private cmdRoot: Node | null = null;
  /** id → 节点（bg 与 text 共用一个池；menu 收起后节点留着，只是 active=false） */
  private cmdNodes = new Map<string, { node: Node; label: Label | null; opacity: UIOpacity | null }>();
  /** 指令台的节点顺序签名：只在展开/收起时变 → 变了才重排 siblingIndex */
  private cmdOrder = '';
  /** 被新指令台取代的 BattleHud 老控件：refresh 每帧会把它们重新激活，所以要每帧再关一次 */
  private legacyHidden: Node[] = [];
  /** 主将行动条（战场上的 46 帧量程细条，画在主将脚下；口径见 BattleCmdUi.actionGaugeOf） */
  private gGauge: Graphics | null = null;
  /** 控制台实色带：铺在单位层之上、label/HUD/指令台之下（web 的「控制台最后画」口径） */
  private gChrome: Graphics | null = null;

  onLoad(): void {
    this.buildUi();
    // TOUCH_END = 真正的"点"（选技/施放/撤退/重开）；START/MOVE 只喂瞄准预览，
    // 这样拖动手指瞄半径不会误触施放，也保证"结算后点一下重开"只在抬手时发生一次。
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouch, this);
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouch, this);
    this.audio?.uninstall();
    this.audio?.dispose();
    this.audio = null;
    this.bg?.dispose();
    this.bg = null;
    this.weatherLayer?.dispose();
    this.weatherLayer = null;
    this.tint?.dispose();
    this.tint = null;
  }

  protected async start(): Promise<void> {
    if (this.autoStart) await this.boot();
  }

  update(dt: number): void {
    if (!this.world) {
      this.redrawBase();
      this.weatherLayer?.update(dt);
      this.audio?.update(dt);
      this.tint?.update();
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
      // 第 5 参把 core 算好的战绩传回去：`settle()` 已在 `world.record` 基线上调过
      // `updateRecord()`（battle.ts:1636），存档直接采信，避免同一场记两次。
      recordBattleResult(
        this.launch?.city ?? null,
        this.settlement.winner,
        this.launch?.armyId ?? null,
        this.launch?.defend === true,
        this.settlement.record,
      );
      // 战后处置（招降/斩首/释放）：core 的 settle() 已经把候选放在 `settlement.post`，
      // 这里必须落进存档，否则回到大地图时筹码池是空的、招降面板永远不弹
      // （SurrenderPanel.showIfNeeded 见存档里没有候选就直接返回 null）。
      // 两个 CampaignSave 声明（GameState.ts / types.ts）字段兼容但名义类型不同，
      // 这里按结构互转（SurrenderModel 只读写 captured/executed 两个数组，见 boxOf）。
      queuePostBattle(loadSave() as unknown as Parameters<typeof queuePostBattle>[0], this.settlement.post);
      persistSave();
      // 结算相：技能格/突擊/撤退不再有战斗语义，触摸只剩「点画面重开」
      this.input.setSettled(true);
    }

    const target = camera(this.world);
    this.camX += (target - this.camX) * Math.min(1, dt * 5);
    // 背景只吃镜头位移：地面相位 + 三条带的视差都在 BattleBg 内部算
    this.bg?.setCamX(this.camX);

    // 瞄准相但还没有落点（刚点下技能格）：先把光圈摆到战场中央，
    // 之后 TOUCH_MOVE 再跟手；否则玩家点完技能格看不到任何范围提示。
    if (this.input.selectedSlot && this.input.aim === null) {
      this.input.moveAim(DESIGN_W / 2, FIELD_CENTER_Y, this.camX);
    }

    this.redraw();
    // 表现层在 redraw 之后推进：天气/闪白是纯视觉，音效有「2 声/tick + 同名 60ms」的预算
    this.weatherLayer?.update(dt);
    this.syncAudio(dt);
  }

  /**
   * 音效总线的每帧泵：把「上一 tick → 当前 tick」的战场差异转成事件，交给 AudioHost 播。
   *
   * 分工照 web 的 main.js:129-160：
   *   - `battleAudioEvents()` 只记账、不推 sink（一次 tick 内可能几十条）；
   *   - `AudioHost.pump()` 按 `SFX_PER_TICK=2` 的预算挑前两条、其余计进 `stats.throttled`。
   * 闪白/亮度是 `SYSTEM.SO`（0x131/0x12F）的产物，由 AudioHost 记账，这里每帧刷到 ScreenTint。
   */
  private syncAudio(dt: number): void {
    const host = this.audio;
    if (!host) return;
    if (this.world) {
      if (!this.audioMark) this.audioMark = battleAudioMark(this.world);
      host.pump(this.world, this.audioMark);
    }
    host.update(dt);
    this.tint?.setBrightness(host.getBrightness());
    this.tint?.setFlash(host.getFlash());
    this.tint?.update();
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
      // 大地图/编成进来时带 BattleLaunch；直接打开 Battle 场景则用默认关羽 vs 张角。
      const launch = this.launch ?? consumeBattleLaunch();
      this.launch = launch;
      // 数据表里的兵种/阵形是名字数组；数字下标只在这个壳里出现，core 仍只认 GameData。
      // 地形与月份：web 侧是 `?terrain=N` + `save.month`（main.js:598/694）。
      // 两者一起决定天气，规则在 core/weather.ts 的 weatherOf()，本文件只负责传进去。
      const terrain = launch?.terrain ?? 0;
      const save = loadSave();
      const month = save.month;
      // 战绩基线：`settle()` 会在这个基线上累加（`BattleRecord`，core/battle.ts:242）。
      // 不传就等于每局从 0 起算 —— 连胜永远是 1，所以必须从存档接。
      const record = {
        wins: save.wins,
        losses: save.losses,
        streak: save.streak,
        bestStreak: save.bestStreak,
      };
      const world = createWorld({
        data,
        seed: launch?.seed ?? 20261124,
        terrain,
        month,
        // 天气：`?weather=N` 直给（web main.js 同款）；不给则仍由 month+terrain 推（battle.ts:524）
        weather: launch?.weather,
        // 战绩基线（上面的存档值）
        record,
        // 援军：web 是 `?rfrom=&rratio=` 组出的 ReinforceConfig[]（core/strategy.ts:840）
        reinforce: launch?.reinforce,
        a: {
          troop: launch?.troop ?? 2, // 大刀（id=2）
          formation: launch?.form ?? 0, // 方形
          soldiers: launch?.soldiers ?? 100,
          morale: 60,
          // 每侧军师技：core 的 SideConfig.strategy（battle.ts:206），web 是 `cfg.wise`
          strategy: launch?.wise ?? null,
          general: launch
            ? { name: launch.gen, str: launch.genStr ?? 80, int: launch.genInt ?? 60, level: launch.genLevel ?? 6 }
            : { name: '關羽', str: 97, int: 75, level: 6 },
        },
        b: {
          troop: launch?.btroop ?? 10, // 黃巾
          formation: launch?.bform ?? 3, // 雁形
          soldiers: launch?.bsoldiers ?? 100,
          morale: 60,
          // 敵方軍師技：web 是 `cfg.bWise`（main.js:578）
          strategy: launch?.bwise ?? null,
          general: {
            // 守城/攻城主将：web 走 `bgen=` 传敌方主将名，缺省才是「守將」
            name: launch?.bgen ?? (launch ? '守將' : '張角'),
            str: launch?.bstr ?? 70,
            int: launch?.bint ?? 88,
            level: 5,
          },
        },
        aiSides: { B: true },
      });
      // R147 部队指令的位移改写器：web main.js:713 在 createWorld 之后紧接 installArmyOrders(world)，
      // 少了这一行，「全軍待機 / 前軍前進 / 後退」只在命令字与 HUD 上生效、士兵照样自己往前冲
      // （`step()` 内部只认 `world.armyOrderAdjust` 这个钩子，见 core/battle.ts:382-385）。
      installArmyOrders(world);
      // 军师技必须在 createWorld 之后施加：core 的 wiseBonus() 读的是 world.wises，
      // 世界里没有这个字段时 applyWise 会写进去（见 core/wises.ts 的 WiseCarrier）。
      this.wiseNote = '';
      if (launch && launch.wise != null) {
        const applied = applyWise(world, 'A', launch.wise);
        this.wiseNote = applied.ok ? (applied.note ?? '已生效') : `${applied.note ?? '未生效'}`;
        if (!applied.ok) console.warn('[BattleRoot] applyWise 失敗：', launch.wise, applied.note);
      }
      // B（AI）侧：web 在 createWorld 之后调 applyWiseOnBattleStart(world, d)（main.js:655），
      // 由它按敌方 WISESKILL + 等级自动发动；同 world 幂等，且不会覆盖玩家自己挑的 A 侧。
      const autoWise = applyWiseOnBattleStart(world, data);
      if (autoWise.length > 0) {
        this.wiseNote = this.wiseNote || autoWise.map((w) => w.name).join('、');
      }
      this.world = world;
      this.settlement = null;
      this.accumulator = 0;
      this.camX = camera(world);
      // 操作层重建：技能格按新 world 的 data 重算，选中/提示/飘字全部清零
      this.input.bind(world);
      this.floaters.length = 0;
      this.lastMessage = '';
      this.messageTick = world.tick;
      // 主将三层图：要等 world.data（generals.TYPE）才能算造型，所以放在 createWorld 之后
      this.generalArt?.load(world, () => {
        if (this.world) this.redraw();
      });
      // 表现层只读 world 的 terrain/weather，不参与任何战斗判定
      this.bg?.setTerrain(world.terrain);
      this.bg?.setCamX(this.camX);
      this.weatherLayer?.setWeather(world.weather as Weather);
      this.audioMark = battleAudioMark(world);
      this.audio?.playTerrainBgm(world.terrain);
      this.audio?.playBattleAmbience(world.terrain);
      // labelStatus 现在只有 360px 宽（控制台左上角），长句会被 SHRINK 压得看不清。
      // 战斗中这一行说"怎么打"，结算后由 redraw() 改成"点哪返回"。
      this.setStatus(`${WEATHER_NAME[world.weather] ?? '晴'} · ${TICK_HZ}Hz · 點技能格施放`);
      this.redraw();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus(`載入失敗：${msg}`);
      console.error('[BattleRoot]', err);
    } finally {
      this.loading = false;
    }
  }

  // -------------------------------------------------------------------------
  // 触摸：技能格选技 / 选目标 / 突擊 / 撤退 / 结算重开
  // -------------------------------------------------------------------------

  /**
   * 触摸点 → 设计坐标（750×1334，左上原点）。
   *
   * `event.getUILocation()` 在 3.8 web 上给的是**设计单位、左下原点**：
   * 实测在 876×1368 的 canvas 上点设计点 (sx,sy)，拿到的是
   * `ux = sx`、`uy = 1334 - sy`（宽屏多出来的左右黑边已经落在负 x，不用另算 offset）。
   * 所以这里就是 `sx = ui.x`、`sy = 1334 - ui.y`；之前写成 `ui.x + 375 / 667 - ui.y`
   * 会把所有点击**右移 375、上移/下移 667**（2026-11-25 真机点击实测：点技能格落进了战场），
   * 断言里 G14 专门锁这条换算。
   */
  private toScreen(event: EventTouch): { sx: number; sy: number } {
    const p = event.getUILocation();
    return uiToScreen(p.x, p.y);
  }

  private onTouchStart(event: EventTouch): void {
    if (this.loading || this.settlement || !this.world) return;
    const p = this.toScreen(event);
    this.input.moveAim(p.sx, p.sy, this.camX);
  }

  private onTouchMove(event: EventTouch): void {
    if (this.loading || this.settlement || !this.world) return;
    const p = this.toScreen(event);
    this.input.moveAim(p.sx, p.sy, this.camX);
  }

  /**
   * 触摸分发（c04 审计的"战场上不能放技/不能撤退"就是这里缺的）。
   *
   * 相位：
   *   loading        → 什么都不做
   *   settlement     → 只有"重开/回大地图"；落在技能格/按钮/消息栏上**不触发**（误触重开）
   *   无 world       → 点一下开战（保留原来的语义）
   *   fighting       → 技能格 / 突擊 / 撤退 / 战场点
   */
  private onTouch(event: EventTouch): void {
    if (this.loading) return;
    const p = this.toScreen(event);

    if (this.settlement) {
      const hit = this.input.hitTest(p.sx, p.sy, this.camX);
      if (!hit || hit.type !== 'restart') return;
      if (this.launch?.from === 'campaign') {
        // 三屏闭环：从大地图打进来的战斗，结算后回大地图；直接打开 Battle 场景才重开。
        director.loadScene('Campaign');
        return;
      }
      void this.boot();
      return;
    }

    if (!this.world) {
      void this.boot();
      return;
    }

    this.applyEffects(this.input.tap(p.sx, p.sy, this.camX));
    this.redraw();
  }

  /** 状态机吐出来的副作用：技能音 + 飘字（气力/技力/伤害都由内核 `cast()` 落账） */
  private applyEffects(effects: readonly BattleEffect[]): void {
    const tick = this.world?.tick ?? 0;
    for (const e of effects) {
      if (e.kind === 'magic') {
        // `playMagic` 吃的是 3 位特效目录号（`MAGIC.fx_dir_primary`），不是技能 SEQUENCE：
        // 见 AudioHost.MAGIC_SFX 的表键（'001'→'m001snd01'）。
        this.audio?.playMagic(e.dir, 0.7);
        continue;
      }
      this.floaters.push({ ...e.floater, born: tick });
      if (this.floaters.length > FLOATER_POOL) this.floaters.splice(0, this.floaters.length - FLOATER_POOL);
    }
  }

  // -------------------------------------------------------------------------
  // 舞台
  // -------------------------------------------------------------------------

  private buildUi(): void {
    this.buildArt();
    // 战场背景在 gBase 之下：它负责「战场那 900px」的真实底图，
    // gBase 在它之上画网格/兵力条，顶栏与控制台用不透明色盖住越界的地面图。
    this.bg = new BattleBg(this.node, 0);
    // 音频宿主只挂节点、不渲染，放哪一层都行；排在背景之后便于阅读
    this.audio = new AudioHost(this.node);
    this.audio.install();
    this.gBase = this.makeGraphics('BattleBase');
    this.gA = this.makeGraphics('UnitsA');
    this.gB = this.makeGraphics('UnitsB');
    this.gGeneral = this.makeGraphics('Generals');
    this.gFx = this.makeGraphics('Fx');
    // 主将行动条（46 帧量程）：跟着主将在战场里走，必须压在单位之上、HUD 之下
    this.gGauge = this.makeGraphics('GeneralGauge');

    // 单位精灵层：在方块层之上、Label 之下；图集没加载成功就一直空着
    this.unitLayer = new Node('UnitSprites');
    this.unitLayer.layer = Layers.Enum.UI_2D;
    this.unitLayer.parent = this.node;
    this.unitLayer.setPosition(0, 0, 0);
    this.unitLayer.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);

    // 主将三层图：在士兵精灵之上、天气/文字之下；图到之前整组隐藏
    this.generalArt = new GeneralArt(this.node);

    // 天气在单位之上（雨雪要落在人身上），但只画在战场带里；初始晴天，boot() 里按地形+月份改
    this.weatherLayer = new BattleWeather(this.node, 0);

    // 控制台/顶栏实色带：位置卡在「单位/天气之后、状态字/HUD/指令台之前」，
    // 让走到底边的士兵被控制台盖住、站在最上沿的士兵被顶栏盖住
    //（web 的顺序是 drawUnits → 顶栏/控制台，见 paintChromeBand 的注释）。
    this.gChrome = this.makeGraphics('BattleChrome');
    // 顶栏底图（`bg/hud_bar` 木纹）原本在整棵树最底层，会被上面这条实带整个盖掉；
    // 把它抬到实带之上、状态字/HUD 之下：实带先盖住越界的士兵，木纹再叠回来。
    // （setSiblingIndex 会先摘后插，此刻 chrome 是最后一个子节点，插到它的下标即「紧挨其右」。）
    this.artHud?.node.setSiblingIndex(this.gChrome.node.getSiblingIndex());

    this.labelA = this.makeLabel('我軍', 16, 38, 280, 18, COLORS.text, 'left');
    this.labelB = this.makeLabel('敵軍', 734, 38, 280, 18, COLORS.text, 'right');
    // 顶栏正中的倒计时不再是这里的 `00:00` Label：原作是「金框中文字牌」，
    // 已整体交给 `BattleHud` 的 `HudClock`（牌面 + 26px 中文数字，见 BattleHud.updateClock）。
    // 那块牌子在 10..58，探出这块深色面板的上沿，横竖都比一行秒数像原作。
    // 控制台顶部一行的状态字（載入 n/8 / 天氣 · 60Hz / 點擊畫面重開）。
    // 原来在 y=1308（正好压在新加的下分隔线上），现在让位给九宫控制台：12px、左对齐、定宽。
    this.labelStatus = this.makeLabel('', 16, 1004, 360, 12, COLORS.textDim, 'left', true);

    // HUD（九宫控制台 + 结算面板）在顶栏文字之后、ScreenTint 之前：
    // 结算遮罩要盖住战场但保留顶栏兵力条，所以它只能压在顶栏 Label 之上构建。
    this.hud = new BattleHud(this.node);
    this.hud.load(() => {
      if (this.world) this.redraw();
    });

    // 指令台层：6 颗第一层 / 第二层 6 行 / 2 个 chip / 主将数值。
    // 它必须压在 HUD 之上（HUD 的老突擊/撤退按钮与它重叠，见 hideLegacyConsole），
    // 但要在瞄准层之下 —— 所以建在 hud 之后、gAim 之前。
    this.cmdRoot = new Node('BattleCmdUi');
    this.cmdRoot.parent = this.node;
    this.cmdRoot.layer = Layers.Enum.UI_2D;
    this.cmdRoot.setPosition(0, 0, 0);
    this.cmdRoot.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.hideLegacyConsole();

    // 操作层（必须在 hud 之后建 = 盖在 HUD 之上；BattleHud 一行不改）：
    //   瞄准框/半径椭圆 → 提示 → 撤退标记 → 技能名 → 飘字池
    this.gAim = this.makeGraphics('BattleAim');
    // 提示条的底衬：不加这块，13px 的金字直接压在土黄地面和小兵身上，实测读不出来
    // （r90e_10_cast.png 里「命療術：回復 0 點體力。」与地面/我軍尾兵糊在一起）。
    this.gToastBg = this.makeGraphics('BattleToastBg');
    this.labelToast = this.makeLabel('', 375, 977, 700, 13, COLORS.goldLight, 'center', true);
    this.labelBanner = this.makeLabel('', 375, 936, 400, 22, COLORS.gold, 'center', true);
    this.labelAim = this.makeLabel('', 375, 540, 400, 13, COLORS.goldLight, 'center', true);
    this.labelToast.node.active = false;
    this.labelBanner.node.active = false;
    this.labelAim.node.active = false;
    for (let i = 0; i < FLOATER_POOL; i += 1) {
      const label = this.makeLabel('', 375, 540, 160, 16, COLORS.enemyLight, 'center', true);
      label.node.active = false;
      this.floaterLabels.push(label);
    }

    // 闪白/亮度盖在最上层（SYSTEM.SO 的 0x131/0x12F 的直接结果）
    this.tint = new ScreenTint(this.node);
  }

  /**
   * HUD 顶栏底图。buildUi() 里最先建（siblingIndex 0），稍后在 `gChrome` 建好之后
   * 会被抬到实带之上（见 buildUi 里那句 setSiblingIndex）——底图必须先让实带盖住士兵。
   */
  private buildArt(): void {
    // cover=true：`bg/hud_bar` 是 1024×256（宽高比 4:1），HUD 是 750×100（7.5:1）。
    // 不 cover 会把它纵向压到 53%，木纹被拉扁；cover 只裁掉上下多余的部分。
    const hud = new ArtBg(this.node, 'BattleHudBar', { x: 0, y: 0, w: DESIGN_W, h: 100 }, true);
    hud.node.setSiblingIndex(0);
    const opacity = hud.node.getComponent(UIOpacity) ?? hud.node.addComponent(UIOpacity);
    opacity.opacity = 150; // 压淡，字还是要能读
    hud.load('bg/hud_bar');
    this.artHud = hud;
    void this.loadUnitArt();
  }

  /** 帧图集：51 帧（attack_front / walk_back / walk_front，各 17 帧，80×104）。失败就保持方块。 */
  private async loadUnitArt(): Promise<void> {
    loadUnitAtlas('anim/atlas_00', 'anim/atlas', (frames, page) => {
      if (!frames || !page) return; // 已经在 ArtLayer 里 warn 过
      const pick = (prefix: string): SpriteFrame[] => {
        const list: SpriteFrame[] = [];
        for (let i = 0; i < 17; i += 1) {
          const frame = frames.get(`${prefix}_f${String(i).padStart(3, '0')}`);
          if (frame) list.push(frame);
        }
        return list;
      };
      // 我方 A 背视（走 back），敌方 B 正对镜头（走 front）——与 web battleView 同源
      const back = pick('walk_back');
      const front = pick('walk_front');
      if (back.length === 0 || front.length === 0) {
        console.warn('[BattleRoot] 圖集缺少 walk_back/walk_front，單位保持方塊');
        return;
      }
      this.unitFrames = { back, front };
      if (this.world) this.redraw();
    });
    // 兵種圖集（`bundles/res/anim/units*`）。兩代格式：
    //  - 原作 FORCE 版（`groups.<兵種>.back/front`，13 兵種 × 2 陣營）→ 走 forceAtlas，
    //    我方 A 取 `back`（M 藍軍）、敵方 B 取 `front`（N 紅軍），**換幀不染色**；
    //  - 舊 AI 版（只有 `archer_back_f000..016`）→ 退回弓/弩拉弓幀的老路。
    loadUnitAtlas('anim/units_00', 'anim/units', (frames, page, groups) => {
      if (!frames || !page) return;
      if (hasForceSchema(groups)) {
        this.forceAtlas = { groups: groups as UnitsGroups, frames };
        this.forceCache.clear();
        console.log('[BattleRoot] 兵種圖集為原作 FORCE 版：按陣營取背視/正視幀（M 藍軍 / N 紅軍）');
        if (this.world) this.redraw();
        return;
      }
      const pick = (prefix: string): SpriteFrame[] => {
        const list: SpriteFrame[] = [];
        for (let i = 0; i < 17; i += 1) {
          const frame = frames.get(`${prefix}_f${String(i).padStart(3, '0')}`);
          if (frame) list.push(frame);
        }
        return list;
      };
      const back = pick('archer_back');
      const front = pick('archer_front');
      if (back.length === 0 || front.length === 0) {
        console.warn('[BattleRoot] units 圖集缺少 archer_back/archer_front，弓兵仍用 walk 幀');
        return;
      }
      this.archerFrames = { back, front };
      if (this.world) this.redraw();
    });
  }

  private makeGraphics(name: string): Graphics {
    const node = new Node(name);
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
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
    shrink = false,
  ): Label {
    const node = new Node(`Label_${text || 'status'}`);
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(width, Math.round(fontSize * (shrink ? 2.6 : 3)));
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
    label.overflow = shrink ? Label.Overflow.SHRINK : Label.Overflow.NONE;
    if (shrink) label.enableWrapText = false;
    // 屏幕坐标（左上原点）→ Cocos UI 局部坐标（中心原点、y 向上）。
    // Label 的 left/right 是对齐到自己的 UITransform 框；节点锚点是 0.5，
    // 所以 sx 是框的边时要换成框中心，否则文字会偏出半个宽度。
    const centerX = align === 'left' ? sx + width / 2 : align === 'right' ? sx - width / 2 : sx;
    const x = centerX - HALF_W;
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
    // 背景层（BattleBg）ready 之后，战场那 900px 交给 res/bg/orig 的真实底图，
    // gBase 只保留顶栏/控制台底色与网格；没图（首帧、缺资源）就退回原来的纯色渐变。
    const bgReady = this.bg?.ready === true;
    if (!bgReady) this.fillScreenRect(g, 0, 0, DESIGN_W, DESIGN_H, COLORS.bg);
    // 有 hud_bar 底图时半透明，让顶栏纹理透出来；没图就纯色（和以前一致）
    this.fillScreenRect(g, 0, 0, DESIGN_W, 100, COLORS.bgDeep, this.artHud?.state === 'ready' ? 186 : 255);
    this.fillScreenRect(g, 0, 999, DESIGN_W, 335, COLORS.bgDeep);
    // 战场地面：自上而下的暖灰渐变。原来是一整块 #11161D，而图集里的将士是深蓝黑袍，
    // 压在同色纯底上几乎看不见；提亮地面后轮廓才出来（不改任何战斗数据，只改底色）。
    const BANDS = 6;
    const bandH = FIELD_H / BANDS;
    for (let i = 0; i < BANDS && !bgReady; i += 1) {
      const t = i / (BANDS - 1);
      g.fillColor = new Color(
        Math.round(40 - 26 * t),
        Math.round(46 - 28 * t),
        Math.round(54 - 32 * t),
        255,
      );
      g.rect(-HALF_W, HALF_H - FIELD_TOP - bandH * (i + 1) - 0.5, DESIGN_W, bandH + 1);
      g.fill();
    }

    // HUD 三条资源条的深色底板：两条兵力条（y=56）+ 主将 HP 条（y=76）都落在这块上
    this.fillRoundScreenRect(g, 8, 22, 734, 74, 10, '#05070A', 200);
    g.strokeColor = rgba(COLORS.gold, 46);
    g.lineWidth = 1;
    g.roundRect(8 - HALF_W, HALF_H - 22 - 74, 734, 74, 10);
    g.stroke();
  }

  private fillRoundScreenRect(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    color: string,
    alpha = 255,
  ): void {
    g.fillColor = rgba(color, alpha);
    g.roundRect(x - HALF_W, HALF_H - y - h, w, h, radius);
    g.fill();
  }

  private redraw(): void {
    const world = this.world;
    const gBase = this.gBase;
    const gChrome = this.gChrome;
    if (!world || !gBase || !gChrome) return;

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

    // HUD 兵力条（Label 显示数字，条用 Graphics 补）。
    // 注意：这几条画在「顶栏 chrome 带」之上（`paintChromeBand` 之后），否则会被实带盖掉 ——
    // 真机第二轮就是这么丢的（顶栏只剩数字、蓝/红血条整条不见）。
    const a = world.sides.A;
    const b = world.sides.B;
    this.drawUnits(world);
    this.drawFx(world);
    // 单位层之上再铺顶栏/控制台实带（web 是「先画单位、后画顶栏与控制台」，单位走进这两块
    // 高度就会被盖住；Cocos 的底色画在最底层的 gBase 上，不补这一下，单位会浮上来
    // 把状态栏/指令台的文字压花——真机 h01/h02 第一版就是这么花的）。
    this.paintChromeBand();
    this.drawBar(gChrome, 16, 56, 280, a.aliveCount / Math.max(1, a.start), COLORS.ours);
    this.drawBar(gChrome, 454, 56, 280, b.aliveCount / Math.max(1, b.start), COLORS.enemy);
    this.drawBar(gChrome, 16, 76, 180, a.general.hp / Math.max(1, a.general.maxHp), COLORS.heal);
    this.drawBar(gChrome, 554, 76, 180, b.general.hp / Math.max(1, b.general.maxHp), COLORS.heal);
    // 氣条（y=86，3px）：控制台里那三条资源条拆掉后（主将卡让位给原作的四裸数字），
    // 體/氣 按 web 的口径留在顶栏 —— 坐标就是 `view/layout` 现成的 HUD_QI_A / HUD_QI_B。
    this.drawBar(gChrome, HUD_QI_A.x, HUD_QI_A.y, HUD_QI_A.w, a.general.qi / QI_MAX, COLORS.gold, HUD_QI_A.h);
    this.drawBar(gChrome, HUD_QI_B.x, HUD_QI_B.y, HUD_QI_B.w, b.general.qi / QI_MAX, COLORS.gold, HUD_QI_B.h);

    // `world.status` / `world.fled` 是 R38 撤退的状态码（0 在场 / 2 撤退 / 3 被俘）：
    // 撤退令一下就要让玩家看见，否则「我方已经跑了」在 HUD 上毫无反馈。
    const aState = world.status.A === 3 ? '  被俘' : world.fled.A ? '  撤退' : '';
    const bState = world.status.B === 3 ? '  被俘' : world.fled.B ? '  撤退' : '';
    if (this.labelA) this.labelA.string = `我軍  ${a.aliveCount}/${a.start}${aState}`;
    // 敵方主將名必須在屏幕上（web 從 `bgen=` 拿到的就是它）；只寫「敵軍」兩個字，
    // 玩家打完也不知道對面是誰，驗收截圖也無從判斷守將到底傳沒傳對。
    if (this.labelB) this.labelB.string = `${b.aliveCount}/${b.start}  敵軍 ${b.general.name}${bState}`;
    // 倒计时已换成 BattleHud 顶栏的金框中文字牌（见 buildUi 里的注释），这里不再写秒数。
    // 主将信息 / 技能栏 / 消息栏 / 结算面板：全部交给 BattleHud（只读 world+settlement）。
    // 原来这里那两行 General 文本（我/敵 …）已被 HUD 的主将信息块 + 消息栏取代。
    if (this.hud) {
      this.hud.refresh(world, this.settlement, this.launch, this.wiseNote);
    }
    if (this.settlement) {
      // 明细（勝負/擊殺/法術/用時/連勝）由结算面板逐行承担，这里只留一句下一步提示。
      this.setStatus(this.launch?.from === 'campaign' ? '點擊返回大地圖' : '點擊畫面重開');
    }

    // 指令台（6 颗 / 第二层 / chip / 主将数值）每帧按 world 重算：可用性以内核为准，UI 只显示
    this.syncCmdUi(world);

    // 操作层（瞄准框、提示、撤退标记、飘字）画在最后：它必须压在 HUD 之上
    this.drawAim();
    this.syncInputUi();
  }

  /**
   * 瞄准预览（web `battleView.drawAim` 的移植）：
   * 选中格描金框 + 以落点为中心的半径椭圆 + 上方「技能名 · 點擊施放」。
   *
   * 与 web 的差别只有"虚线"：Cocos 的 Graphics 没有 dash，这里用细实线 + 半透明，
   * 视觉意图（告诉玩家这一发会扫到多大范围）一致。
   */
  private drawAim(): void {
    const g = this.gAim;
    if (!g) return;
    g.clear();
    const slot = this.input.selectedSlot;
    const world = this.world;
    if (!world || this.settlement || !slot) {
      if (this.labelAim) this.labelAim.node.active = false;
      return;
    }

    // ① 选中格金框（技能格坐标与 HUD/命中区同源：BattleInput.skillSlotRects）
    const idx = this.input.selected;
    if (idx !== null) {
      const r = skillSlotRects(this.input.slots.length)[idx];
      if (r) {
        g.strokeColor = rgba(COLORS.gold, 235);
        g.lineWidth = 3;
        g.rect(r.x - HALF_W, HALF_H - r.y - r.h, r.w, r.h);
        g.stroke();
      }
    }

    // ② 半径预览：命療術是纯己方技（内核会强制改写到主将位置），不给半径
    const aim = this.input.aim;
    if (!aim || slot.kind === 'heal') {
      if (this.labelAim) this.labelAim.node.active = false;
      return;
    }
    const p = worldToScreen(this.camX, aim.gx, aim.gy);
    // 中心点**先**画：Graphics 的 fill() 会把当前路径里所有子路径一起填掉，
    // 放在 rect/ellipse 之后会把技能格和半径圈整个涂成金色。
    g.fillColor = rgba(COLORS.gold, 220);
    g.circle(p.sx - HALF_W, HALF_H - p.sy, 5);
    g.fill();
    const radius = skillRadius(slot.kind);
    const rx = radius * LANE_PX;
    const ry = radius * ROW_PX;
    g.strokeColor = rgba(COLORS.gold, 200);
    g.lineWidth = 2;
    g.ellipse(p.sx - HALF_W, HALF_H - p.sy, rx, ry);
    g.stroke();

    // ③ 技能名 + 操作提示（放在椭圆上沿之上，避免压住落点）
    if (this.labelAim) {
      this.labelAim.string = `${slot.name} · 點擊施放`;
      this.labelAim.node.active = true;
      this.labelAim.node.setPosition(p.sx - HALF_W, HALF_H - (p.sy - ry - 14), 0);
    }
  }

  /** 提示 / 撤退标记 / 飘字的每帧刷新（纯 Label 写入，不碰 world） */
  private syncInputUi(): void {
    const tick = this.world?.tick ?? 0;
    const msg = this.input.message;
    if (msg !== this.lastMessage) {
      this.lastMessage = msg;
      this.messageTick = tick;
    }

    if (this.labelToast) {
      const show = msg.length > 0 && !this.settlement && tick - this.messageTick < MESSAGE_TTL;
      this.labelToast.node.active = show;
      if (show) this.labelToast.string = msg;
      // 底衬：与提示同生共死，位置锁死（960..998 这条带在战场下沿、控制台上沿之间）
      if (this.gToastBg) {
        const g = this.gToastBg;
        g.clear();
        if (show) {
          g.fillColor = new Color(8, 10, 14, 176);
          g.rect(-HALF_W, HALF_H - 998, DESIGN_W, 38);
          g.fill();
          g.strokeColor = rgba(COLORS.gold, 90);
          g.lineWidth = 1;
          g.moveTo(-HALF_W, HALF_H - 960);
          g.lineTo(HALF_W, HALF_H - 960);
          g.stroke();
        }
      }
    }

    if (this.labelBanner) {
      const banner = this.input.banner;
      const show = banner !== null && !this.settlement;
      this.labelBanner.node.active = show;
      if (show) this.labelBanner.string = banner;
    }

    // 飘字：从落点往上飘 + 线性淡出（`SKILL_MARK_TTL` 45 tick）
    for (let i = 0; i < this.floaterLabels.length; i += 1) {
      const label = this.floaterLabels[i];
      const f = this.floaters[i];
      if (!label) continue;
      if (!f) {
        label.node.active = false;
        continue;
      }
      const age = tick - f.born;
      if (age < 0 || age > FLOATER_TTL || this.settlement) {
        label.node.active = false;
        continue;
      }
      const p = worldToScreen(this.camX, f.x, f.y);
      label.string = f.text;
      label.color = rgba(
        f.tone === 'heal' ? COLORS.heal : f.tone === 'hit' ? COLORS.enemyLight : COLORS.textDim,
      );
      label.node.active = true;
      label.node.setPosition(p.sx - HALF_W, HALF_H - (p.sy - 40 - age * 0.9), 0);
      const opacity = label.node.getComponent(UIOpacity) ?? label.node.addComponent(UIOpacity);
      opacity.opacity = Math.max(0, Math.round(255 * (1 - age / FLOATER_TTL)));
    }
    if (this.floaters.length > 0) {
      this.floaters = this.floaters.filter((f) => tick - f.born <= FLOATER_TTL && tick >= f.born);
    }
  }

  // -------------------------------------------------------------------------
  // 指令台（web battleView 的控制台 → BattleCmdUi 的规格 → 九宫节点 + Label）
  // -------------------------------------------------------------------------

  /**
   * 新指令台接管了控制台右半部与主将数值行，BattleHud 里这些老控件必须让位：
   * 老的 `CmdBtnAssault{528,1124,204,84}` / `CmdBtnRetreat{528,1220,204,84}`
   * 与第一层第 2/3 行（x 524..732、y 1124..1302）整块重叠，不关就是两套按钮叠在一起。
   *
   * 只按名字找节点 + `active=false`，**不改 BattleHud.ts 一行**（那个文件不在本任务改动面）。
   * 保留：头像/等级/主将名/在陣陣亡/三条 bar（HudBars 是 Graphics）/技能格 SkillSlot1..8
   * （HUD 已用 skillSlotRects 自适应 8 格）/消息栏/分隔线/HudMeta。
   */
  private hideLegacyConsole(): void {
    const root = this.hud?.root;
    if (!root) return;
    const kill = new Set([
      'GeneralStats',
      'HpValue',
      'MpValue',
      'CmdBtnAssault',
      'CmdBtnRetreat',
      'CmdLabelAssault',
      'CmdSubAssault',
      'CmdLabelRetreat',
      'CmdSubRetreat',
    ]);
    const hits: Node[] = [];
    const walk = (node: Node): void => {
      if (kill.has(node.name)) {
        node.active = false;
        hits.push(node);
        return;
      }
      for (const child of node.children) walk(child);
    };
    walk(root);
    this.legacyHidden = hits;
  }

  /** 规格表 → 节点：按 id 复用，缺的现建（第二层/选中层只在需要时出现），顺序即 z 序 */
  private syncCmdUi(world: World): void {
    const root = this.cmdRoot;
    if (!root) return;
    // BattleHud.refresh() 每帧都会把老控件的 active 写回 true（syncArt），这里每帧再关一次
    for (const node of this.legacyHidden) node.active = false;

    const model = buildCmdUi(world, {
      menuOpen: this.input.armyMenuNow,
      mode: this.input.modeNow,
      skillCount: this.input.slots.length,
    });
    const order: string[] = [];
    const alive = new Set<string>();
    for (const item of model.items) {
      if (CARD_TAKEOVER_IDS.has(item.id)) continue;
      order.push(item.id);
      alive.add(item.id);
      const rec = this.cmdNodes.get(item.id);
      if (!rec) {
        this.buildCmdItem(item);
        continue;
      }
      rec.node.active = true;
      if (item.kind === 'bg') {
        placeDesign(rec.node, item.rect.x, item.rect.y, item.rect.w, item.rect.h);
        if (rec.opacity) rec.opacity.opacity = item.alpha;
      } else if (rec.label) {
        this.paintCmdText(rec.label, item);
      }
    }
    // 收起第二层后 army.* 不再出现在规格里 → 节点留着但隐藏，下次展开不用重建
    for (const [id, rec] of this.cmdNodes) if (!alive.has(id)) rec.node.active = false;

    // z 序 = 规格顺序（面板必须盖住第一层第 2/3 行）；只在顺序变化时重排
    const sig = order.join('|');
    if (sig !== this.cmdOrder) {
      this.cmdOrder = sig;
      for (let i = 0; i < order.length; i += 1) this.cmdNodes.get(order[i]!)?.node.setSiblingIndex(i);
    }
    this.drawGeneralGauge(world);
  }

  private buildCmdItem(item: CmdBg | CmdText): void {
    const root = this.cmdRoot;
    if (!root) return;
    if (item.kind === 'bg') {
      // 面板/菜单行要实色底衬（九宫中间镂空，底下的第一层按钮会透出来）
      const node =
        item.fillAlpha != null
          ? makePanel(root, item.skin, item.rect.w, item.rect.h, {
              fillAlpha: item.fillAlpha,
              ...(item.fillColor ? { fillColor: item.fillColor } : {}),
            })
          : makeNineSlice(root, item.skin, item.rect.w, item.rect.h);
      node.name = `Cmd_${item.id}`;
      placeDesign(node, item.rect.x, item.rect.y, item.rect.w, item.rect.h);
      const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
      opacity.opacity = item.alpha;
      this.cmdNodes.set(item.id, { node, label: null, opacity });
      return;
    }
    const node = new Node(`Cmd_${item.id}`);
    node.parent = root;
    node.layer = Layers.Enum.UI_2D;
    node.addComponent(UITransform).setContentSize(Math.max(1, item.w), Math.round(item.size * 3));
    const label = node.addComponent(Label);
    label.fontFamily = FONT_FAMILY;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    // 必须是 SHRINK/CLAMP：`Overflow.NONE` 会忽略 horizontalAlign、永远居中于节点，
    // 那样第二层的行标签（web 左对齐 x=538）和 `體/技`（右对齐 x=358）都会错位。
    // SHRINK 只在文字超宽时缩字号，正好当「按盒子对齐」用。
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    // 字级：只借 role 的描边/行高策略，字号按 web 的 9~24px 逐条给（传 size 就不再吃 role 的默认字号）
    applyTextRole(label, item.size >= 13 ? 'body' : 'num', item.size);
    this.paintCmdText(label, item);
    const boxX =
      item.align === 'left' ? item.x + item.w / 2 : item.align === 'right' ? item.x - item.w / 2 : item.x;
    node.setPosition(boxX - HALF_W, HALF_H - item.y, 0);
    this.cmdNodes.set(item.id, { node, label, opacity: null });
  }

  /** 文案/颜色/粗体/对齐每帧可写；位置不变（规格里的坐标是常量，第二层收起也不动） */
  private paintCmdText(label: Label, item: CmdText): void {
    label.string = item.text;
    label.fontSize = item.size;
    label.lineHeight = Math.round(item.size * 1.45);
    label.color = rgba(item.color);
    label.isBold = item.bold;
    label.horizontalAlign =
      item.align === 'left'
        ? Label.HorizontalAlign.LEFT
        : item.align === 'right'
          ? Label.HorizontalAlign.RIGHT
          : Label.HorizontalAlign.CENTER;
  }

  /**
   * 主将行动条：web `battleView.ts:1309-1316` 的 50×3 细条 + 一条刻度线。
   *
   * 量程用 `actionGaugeOf()`（主将 46 帧，`mark` = 40/46），所以刻度线永远偏右 ——
   * 玩家能看出「主将这一轮被拉慢了」。主将阵亡/结算后整条清掉。
   */
  private drawGeneralGauge(world: World): void {
    const g = this.gGauge;
    if (!g) return;
    g.clear();
    if (this.settlement) return;
    const gu = generalUnitOf(world, 'A');
    if (!gu || !gu.alive) return;
    const gauge = actionGaugeOf(gu);
    const p = worldToScreen(this.camX, gu.x, gu.y);
    const x = p.sx - 25;
    const y = p.sy - 10;
    this.fillScreenRect(g, x, y, 50, 3, COLORS.line, 220);
    if (gauge.ratio > 0) this.fillScreenRect(g, x, y, 50 * gauge.ratio, 3, COLORS.gold);
    // 40/46 那道刻度：web 用 1px 白线，这里给 1×5 的短柱，缩小时也看得见
    this.fillScreenRect(g, x + 50 * gauge.mark, y - 1, 1, 5, COLORS.white, 200);
  }

  /**
   * chrome 实色带：顶栏 0..104 + 控制台 999..1334。
   *
   * web 的绘制顺序是「战场 → 士兵 → 特效 → 顶栏/控制台」，所以单位既走不到控制台上面、
   * 也不会压花顶栏；Cocos 这边两者的底色都画在最底层的 `gBase` 上，士兵精灵在
   * `gA/gB/UnitSprites` 层、位置更靠上，于是会浮到它们上面把字压花
   * （真机 h01/h02 第一版可见：底边一排蓝兵压在「晴 · 30Hz」上、前排枪兵插进「我軍 96/100」）。
   * 这里在单位层之上补两条同色实带，把顺序拉回 web 的口径；label/HUD/指令台都在它们之上。
   *
   * 顶带 104 高 = 顶栏 100 + 4（单位脚底锚点、头顶还高约 60px，所以要多盖一点），
   * 底边那道 1px 金线就是 web 顶栏的下边框（`battleView.ts` 顶栏绘制里的 gold 分隔）。
   */
  private paintChromeBand(): void {
    const g = this.gChrome;
    if (!g) return;
    g.clear();
    // 顶栏：比 HUD 顶栏本身高 4px，压住站在场地最上沿的士兵头顶
    this.fillScreenRect(g, 0, 0, DESIGN_W, 104, '#080A0E', 235);
    this.fillScreenRect(g, 0, 103, DESIGN_W, 1, COLORS.gold, 96);
    // 控制台：不透明（web drawConsole 是整块不透明底）
    this.fillScreenRect(g, 0, 999, DESIGN_W, DESIGN_H - 999, COLORS.bgDeep, 255);
  }

  /**
   * 顶栏细条。`h` 默认 4（兵力/體力条的既有高度）；氣条按 `HUD_QI_A/B` 的 3px 传进来。
   */
  private drawBar(g: Graphics, x: number, y: number, w: number, ratio: number, color: string, h = 4): void {
    this.fillScreenRect(g, x, y, w, h, COLORS.line);
    const filled = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    if (filled > 0) this.fillScreenRect(g, x, y, w * filled, h, color);
  }

  private drawUnits(world: World): void {
    const ga = this.gA;
    const gb = this.gB;
    const gg = this.gGeneral;
    if (!ga || !gb || !gg) return;
    ga.clear();
    gb.clear();
    gg.clear();

    // 有帧图集就用 Sprite 画单位（脚底锚点 + 走路帧）；没图/加载失败继续画原来的矢量方块
    if (this.unitFrames || this.forceAtlas) {
      this.drawUnitSprites(world);
      this.generalArt?.draw(world, this.camX);
      return;
    }

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
      if (general && !this.generalArt?.hasArt()) {
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
    // 图集没到时才需要菱形；到了就由 GeneralArt 画三层
    this.generalArt?.draw(world, this.camX);
  }

  /** 从对象池取第 index 个单位精灵（首次用到才建节点，上限就是同屏存活数）。 */
  private spriteAt(index: number): { node: Node; sprite: Sprite; box: UITransform } {
    const cached = this.unitPool[index];
    if (cached) return cached;
    const node = new Node(`Unit_${index}`);
    node.layer = Layers.Enum.UI_2D;
    node.parent = this.unitLayer ?? this.node;
    node.setPosition(0, 0, 0);
    const box = node.addComponent(UITransform);
    box.setAnchorPoint(0.5, 0.5);
    box.setContentSize(32, 42);
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.enabled = false;
    node.active = false;
    const slot = { node, sprite, box };
    this.unitPool[index] = slot;
    return slot;
  }

  /**
   * 用 `anim/atlas_00` 的 walk 幀画单位（80×104 单帧，按脚底对齐）。
   * 只读 World 的 x/y/side，不碰任何战斗数据；帧序按 tick 取模，60Hz 下 6 tick 一帧。
   *
   * 帧集优先级（与 web `battleView.drawSoldier` 同序）：
   *   FORCE 兵種圖集（A=`back` M 藍軍 / B=`front` N 紅軍）→ 舊 units 弓/弩幀 → atlas walk 幀。
   * **不叠任何 tint**：紅軍是圖集裡另一套調色盤的像素（project/63 §6.3）。
   */
  private drawUnitSprites(world: World): void {
    const art = this.unitFrames;
    if (!art && !this.forceAtlas) return;
    // 兵種 3（弓箭）/ 11（弩兵）用 units 圖集的拉弓幀，其餘兵種仍用 atlas 的 walk 幀
    const isArcher = (troop: number): boolean => troop === 3 || troop === 11;
    /** 某一側這一局該用哪組幀：先 FORCE 兵種組，再退回老兩套 */
    const setOf = (side: 'A' | 'B'): { walk: SpriteFrame[]; hold: number; force: boolean } | null => {
      const troop = world.sides[side].troop;
      const force = this.forceSet(side, troop);
      // force=true 表示這組幀來自 FORCE 兵種圖集（每幀自帶該兵種畫布高），落屏要按 1:1
      if (force && force.walk.length > 0) return { walk: force.walk, hold: force.hold, force: true };
      const legacy = this.archerFrames && isArcher(troop) ? this.archerFrames : art;
      if (!legacy) return null;
      return { walk: side === 'A' ? legacy.back : legacy.front, hold: 3, force: false };
    };
    const setA = setOf('A');
    const setB = setOf('B');
    let used = 0;
    // 落地阴影：画在方块层（gA/gB，正好在精灵层之下），把小人「钉」在地面上。
    // 同色路径先累积成一批再 fill()，避免每个单位一次 draw call。
    const shadowA = this.gA;
    const shadowB = this.gB;
    if (shadowA) shadowA.fillColor = new Color(4, 6, 10, 120);
    if (shadowB) shadowB.fillColor = new Color(4, 6, 10, 120);
    for (const u of world.units) {
      if (!u.alive) continue;
      const g = u.side === 'A' ? shadowA : shadowB;
      if (!g) continue;
      const p = project(u.x, u.y, this.camX);
      if (p.y < FIELD_TOP - 40 || p.y > FIELD_BOTTOM + 40) continue;
      const r = isGeneral(u) ? 16 : 12;
      // 主将贴边显示时（GeneralArt 的场内钳制）阴影也跟着贴，别让人物和影子分家
      const pinned = isGeneral(u) && this.generalArt?.hasArt() ? this.generalArt.footAt(u.side) : null;
      const sx = pinned ? pinned.x : p.x;
      const sy = pinned ? pinned.y : p.y + 8;
      g.ellipse(sx - HALF_W, HALF_H - sy, r, r * 0.42);
    }
    shadowA?.fill();
    shadowB?.fill();
    for (const u of world.units) {
      if (!u.alive) continue;
      // 主将有图集时由 GeneralArt 画三层，这里别再叠一个 72px 的 walk 帧
      if (isGeneral(u) && this.generalArt?.hasArt()) continue;
      const p = project(u.x, u.y, this.camX);
      if (p.y < FIELD_TOP - 40 || p.y > FIELD_BOTTOM + 40) continue;
      const set = u.side === 'A' ? setA : setB;
      if (!set || set.walk.length === 0) continue;
      const frames = set.walk;
      const phase = Math.floor(world.tick / Math.max(1, set.hold));
      // 敵方錯開相位，兩軍不會像同步體操（同 web：+8）
      const index = u.side === 'A' ? phase % frames.length : (phase + 8) % frames.length;
      const frame = frames[index] ?? frames[0];
      const slot = this.spriteAt(used);
      used += 1;
      const general = isGeneral(u);
      // 落屏高度（設計像素）：
      //   FORCE 兵種圖集 → 按幀畫布高 1:1（鏈錘 94 / 朴刀 74 / 弩 70 …），螢幕上還原本來的高矮，
      //     與 web `battleView.ts` 的「幀畫布寬 1:1」同一口徑（project/189）；
      //   老 atlas.json（80×104 單幀）/ 主將 → 舊口徑 52 / 72。
      // 曾經一律壓成 52：所有兵種同高，兵種間的高矮差被抹平，很難看出「這是哪個兵」。
      const h = general ? 72 : (set.force ? Math.max(1, Math.round(frame.rect.height)) : 52);
      // 兩套圖集單幀尺寸不同（atlas 80×104 / units 弓兵另有一檔），按幀自己的長寬比算寬度
      const ratio = frame.rect.height > 0 ? frame.rect.width / frame.rect.height : 80 / 104;
      const w = Math.round(h * ratio);
      const size = slot.box.contentSize;
      if (size.width !== w || size.height !== h) slot.box.setContentSize(w, h);
      // 脚底锚点：地块中心再往下 8px 当作脚，精灵中心抬 h/2
      slot.node.setPosition(p.x - HALF_W, HALF_H - (p.y + 8) + h / 2, 0);
      if (slot.sprite.spriteFrame !== frame) slot.sprite.spriteFrame = frame;
      if (!slot.sprite.enabled) slot.sprite.enabled = true;
      if (!slot.node.active) slot.node.active = true;
    }
    for (let i = used; i < this.unitPool.length; i += 1) {
      const slot = this.unitPool[i];
      if (slot.node.active) slot.node.active = false;
    }
  }

  /**
   * 取「某側某兵種」的 FORCE 幀數組（按 `side:troop` 緩存）。
   * 沒有 FORCE 圖集 / 兵種沒有組 → null，調用方退老兩套。
   */
  private forceSet(side: 'A' | 'B', troop: number): { walk: SpriteFrame[]; attack: SpriteFrame[]; hold: number } | null {
    const force = this.forceAtlas;
    if (!force) return null;
    const key = `${side}:${troop}`;
    const cached = this.forceCache.get(key);
    if (cached) return cached;
    const picked = pickUnitFrames(force.groups, troop, side, (name) => force.frames.has(name));
    if (!picked) return null;
    const map = (names: string[]): SpriteFrame[] => {
      const out: SpriteFrame[] = [];
      for (const name of names) {
        const frame = force.frames.get(name);
        if (frame) out.push(frame);
      }
      return out;
    };
    const set = { walk: map(picked.walk), attack: map(picked.attack), hold: picked.hold };
    if (set.walk.length === 0) return null;
    this.forceCache.set(key, set);
    return set;
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
