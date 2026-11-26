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
  LabelOutline,
  Layers,
  Node,
  UIOpacity,
  UITransform,
} from 'cc';
import { ArtBg } from './ArtLayer';
import { BattleBg } from './BattleBg';
import { battleAudioMark } from './AudioBus';
import type { BattleAudioMark } from './AudioBus';
import { AudioHost } from './AudioHost';
import { BattleHud } from './BattleHud';
import { BattleWeather, ScreenTint } from './BattleWeather';
import { camera, createWorld, normalizeCol, settle, step, QI_MAX, TICK_HZ } from './core/battle';
import { sangoRng } from './core/sango_rng';
import { buildTauntSeq, regionFromCamera, tauntEnabled } from './core/open_taunt';
import type { TauntLine } from './core/open_taunt';
import { installArmyOrders } from './core/army_cmd';
import { applyWise, applyWiseOnBattleStart } from './core/wises';
import type { World } from './core/battle';
import { WEATHER_NAME } from './core/weather';
import type { Weather } from './core/weather';
import { loadGameData } from './DataLoader';
import { GeneralMarkers } from './GeneralMarkers';
import { consumeBattleLaunch, handoffCapture, loadSave, markGeneralGone, persistSave, recordBattleResult, returnGeneralsToCity } from './GameState';
import type { BattleLaunch, DuelCarry } from './GameState';
import { queuePostBattle } from './SurrenderModel';
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
  MAP_ROW_PX,
  MAP_TOP,
  HUD_QI_A,
  HUD_QI_B,
  project,
} from './view/layout';
import { COLORS, FONT_FAMILY } from './view/theme';
import { BattleInput, skillRadius, uiToScreen, worldToScreen } from './BattleInput';
import { buildConsoleUi, skillCellRects } from './BattleConsoleUi';
import type { BattleEffect, FloatTone } from './BattleInput';
import type { CmdBg, CmdText } from './BattleCmdUi';
import { applyTextRole } from './TextRole';
import { makeNineSlice, makePanel, placeDesign } from './UiSkin';
import { guardTouch, installInputResilience } from './InputGuard';

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

// ---------------------------------------------------------------------------
// F-07 出战站位：出征编成页（DeployRoot）把每将的 front/mid/back 掛在 payload 的 `cols`
// （`{ 武將名: 'front'|'mid'|'back' }`）上带进来。`GameState.BattleLoadout` 没有 col 欄位
// （本輪不碰 GameState.ts），`startBattle()` 是 `{ ...loadout }` 展開，額外屬性原樣進
// `BattleLaunch`；這裡補交叉型別把 `cols` 接上，值用 core 的 `normalizeCol()` 收口。
// ---------------------------------------------------------------------------
type BattleLaunchWithCols = BattleLaunch & { cols?: Record<string, unknown> };

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

/**
 * 兵种名 → 圆圈里的那个字。
 *
 * 用的是原作兵种表 `data.troops.names` 的 13 个名字（朴刀/长枪/大刀/弓箭/链锤/飞刀/
 * 武斗/蛮族/铁缒/藤甲/黄巾/弩兵/女兵）。默认取名字里最能代表兵器的那个字：
 * 弓兵用「弓」而不是「箭」、铁缒归「锤」、黄巾取「黄」。查不到就退第一个字。
 */
const TROOP_CHAR: Record<string, string> = {
  朴刀: '刀',
  长枪: '枪',
  大刀: '刀',
  弓箭: '弓',
  链锤: '锤',
  飞刀: '飞',
  武斗: '武',
  蛮族: '蛮',
  铁缒: '锤',
  藤甲: '藤',
  黄巾: '黄',
  弩兵: '弩',
  女兵: '女',
};

function troopCharOf(name: string): string {
  return TROOP_CHAR[name] ?? (name ? name.slice(0, 1) : '兵');
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
  /** 車輪戰：本局已經打到第幾場（第 1 場才演叫陣） */
  private boutNo = 0;
  /** 車輪戰：結算時算好的下一場參數；非 null 時結算面板的按鈕走「續戰」而不是回大地圖 */
  private nextBout: BattleLaunch | null = null;
  /** 車輪戰：下一位上場的武將名（只給結算面板顯示） */
  private nextName: string | null = null;
  /** 車輪戰換將時查武將屬性用（boot 載入的同一份 data） */
  private gameData: Awaited<ReturnType<typeof loadGameData>> | null = null;
  private accumulator = 0;
  private camX = 35;

  /** 开场叫阵（原作 SYSTEM.SO#StartBattle）：B 敵將先喊 → A 我將接話，播完鏡頭回我方主將。 */
  private tauntSeq: TauntLine[] | null = null;
  private tauntI = 0;
  private tauntT = 0;
  private readonly tauntOn = tauntEnabled(BattleRoot.queryValue('taunt'));

  /** 讀 URL / 小遊戲啟動參數裡的一個鍵（取不到回 null）。`?taunt=0` 用它關掉叫陣。 */
  private static queryValue(key: string): string | null {
    try {
      const g = globalThis as unknown as {
        window?: { location?: { search?: string } };
        wx?: { getLaunchOptionsSync?: () => { query?: Record<string, string> }; getEnterOptionsSync?: () => { query?: Record<string, string> } };
      };
      const search = g.window?.location?.search ?? '';
      if (search) {
        const v = new URLSearchParams(search).get(key);
        if (v !== null) return v;
      }
      const query = g.wx?.getLaunchOptionsSync?.()?.query ?? g.wx?.getEnterOptionsSync?.()?.query;
      if (query && query[key] !== undefined) return String(query[key]);
    } catch {
      // 宿主不支持取參數：當作沒帶
    }
    return null;
  }

  private gBase: Graphics | null = null;
  private gA: Graphics | null = null;
  private gB: Graphics | null = null;
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
  /** 全图战场的静态底图（地形/网格/前线），只画一次；单位与标记每帧重画 */
  private gMap: Graphics | null = null;
  /** 原作战场背景（地形平铺 + 远景带）：全图版当静态底图压暗铺在 gMap 之下 */
  private bg: BattleBg | null = null;
  /** 主将标记（三国志13 式：圆头像 + 红血量环 + 绿技力环） */
  private markers: GeneralMarkers | null = null;
  /** 士兵字牌层：每人一个「兵种字 + 圆圈」，字用 Label（Graphics 画不了汉字） */
  private soldierLayer: Node | null = null;
  private soldierLabelsA: Label[] = [];
  private soldierLabelsB: Label[] = [];
  /** 本局双方兵种字（大刀→刀、黄巾→黄…），boot() 里按 world.sides[].troop 查 data.troops.names */
  private troopChar: { A: string; B: string } = { A: '兵', B: '兵' };
  /** 本局主将的军师技生效说明（HUD 用）；空串 = 没用军师技 */
  private wiseNote = '';

  /** 音效总线宿主：AudioSource 池 + 战斗音效编排 + BGM/底噪（见 AudioHost.ts） */
  private audio: AudioHost | null = null;
  /** 战斗音效的上一帧快照；`battleAudioEvents()` 会就地把它的字段推到当前 tick */
  private audioMark: BattleAudioMark | null = null;
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
  /** 控制台实色带：铺在单位层之上、label/HUD/指令台之下（web 的「控制台最后画」口径） */
  private gChrome: Graphics | null = null;

  onLoad(): void {
    installInputResilience();
    this.buildUi();
    // TOUCH_END = 真正的"点"（选技/施放/撤退/重开）；START/MOVE 只喂瞄准预览，
    // 这样拖动手指瞄半径不会误触施放，也保证"结算后点一下重开"只在抬手时发生一次。
    input.on(Input.EventType.TOUCH_START, guardTouch(this, 'onTouchStart', 'BattleRoot'), this);
    input.on(Input.EventType.TOUCH_MOVE, guardTouch(this, 'onTouchMove', 'BattleRoot'), this);
    input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'BattleRoot'), this);
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_START, guardTouch(this, 'onTouchStart', 'BattleRoot'), this);
    input.off(Input.EventType.TOUCH_MOVE, guardTouch(this, 'onTouchMove', 'BattleRoot'), this);
    input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'BattleRoot'), this);
    this.audio?.uninstall();
    this.audio?.dispose();
    this.audio = null;
    this.weatherLayer?.dispose();
    this.weatherLayer = null;
    this.bg?.dispose();
    this.bg = null;
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
    // 开场叫阵：演出期间不推进 step（原作喊话时部队是静止的），镜头由 tickTaunt 硬切
    if (this.tauntSeq) {
      this.tickTaunt(dt);
      this.redraw();
      this.weatherLayer?.update(dt);
      return;
    }
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
      // 車輪戰：輸方名冊還有下一位 → 先不落最終戰果，等玩家在結算面板按「續戰」。
      // 只有打到一方無人可派（或本來就是單將對局）才寫存檔/進戰後處置。
      this.nextBout = this.buildNextBout(this.settlement.winner);
      this.hud?.setSettleNext(this.nextBout ? this.nextName : null);
      if (!this.nextBout) {
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
        // [R242] 我方战后生死必须落库：旧码只把「败方被俘候选」塞进队列，阵亡的人（alive===false）
        // 在 `resolvePostBattle()` 里直接 continue，于是君主战死也不写状态、名册永远「在職」、
        // 失败判定永远不触发（制作人：「这样的话我岂不永远不会触发失败？」）。
        try {
          const aSide = this.world.sides.A;
          const dead: string[] = [];
          if (aSide.general && aSide.general.alive === false) dead.push(String(aSide.general.name ?? ''));
          for (const off of aSide.officers ?? []) {
            const officer = off as { name?: string; alive?: boolean } | undefined;
            if (officer && officer.alive === false) dead.push(String(officer.name ?? ''));
          }
          if (dead.length > 0) markGeneralGone(dead, '死');
          // [R244] 活著的參戰將要還回城：攻城戰的兵團抵達時已被 removeArmy()，
          // recordBattleResult 的 armyId 找不到兵團 ⇒ 不打這一步，這批將打完就人間蒸發。
          const deadSet = new Set(dead.map((n) => n.trim()).filter((n) => !!n));
          const party = (this.launch?.rosterA ?? []).map((n) => String(n ?? '').trim()).filter((n) => !!n);
          const alive = party.filter((n) => !deadSet.has(n));
          if (alive.length > 0) {
            const won = this.settlement.winner === 'A';
            const defend = this.launch?.defend === true;
            const target = won
              ? String(this.launch?.city ?? '')
              : String(this.launch?.home ?? '');
            if (defend) {
              // [R246] 守城戰：這座城本來就是我的，名冊裡正是守城的自己人。
              // 贏了把存活者寫回本城（recordBattleResult 已不再把守城勝當「打下城」）；
              // 輸了城已易手，殘部撤到還握在手裡的第一座城 —— 舊碼 `defend !== true` 把兩種
              // 情況整塊跳過，守城贏／輸都會讓守將從所有列表消失。
              if (won) {
                if (target) returnGeneralsToCity(target, alive);
              } else {
                const refuge = String(loadSave().owned?.[0] ?? '');
                if (refuge) returnGeneralsToCity(refuge, alive);
              }
            } else if (target) {
              // [R245] 勝利用台账交接（清旧主 + 记接管 + 写存活者），敗仗只還人回出發城。
              if (won) handoffCapture(target, alive);
              else returnGeneralsToCity(target, alive);
            }
          }
          const post = this.settlement.post;
          if (this.settlement.winner === 'B' && post) {
            const captured = (post.captures ?? []).map((c) => String((c as { name?: string } | undefined)?.name ?? ''));
            if (captured.length > 0) markGeneralGone(captured, '俘');
            const executed = (post.executed ?? []).map((n) => String(n ?? ''));
            if (executed.length > 0) markGeneralGone(executed, '死');
          }
        } catch {
          /* 存檔壞掉不該讓戰鬥結算崩掉 */
        }
      }
      // 结算相：技能格/突擊/撤退不再有战斗语义，触摸只剩「續戰 / 回大地图」
      this.input.setSettled(true);
    }

    // 全图战场没有镜头：camX 只作为开场叫阵的「我方视角中心」保留，
    // 不再每帧追 camera(world)（整幅 71 行都在屏内，镜头无意义）。
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
      this.gameData = data;
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
      // R115：原作乱数流（`0x450132`，见 core/sango_rng.ts）。web main.js:639 是
      // `roll: sangoRng(cfg.seed ?? 1)` 与 `seed` 同源；Cocos 这里用同一个 seed，
      // 战场的方向抽样 / 先扫哪一侧 / 命中 / AI 选令才与 web 逐位同流（`?seed=` 可复现）。
      const seed = launch?.seed ?? 20261124;
      // F-07：出征編成頁傳來的站位表（按武將名）；沒帶 / 名對不上 / 值不認識 → 中列（與 web 同口徑）。
      const launchCols: Record<string, unknown> = (launch as BattleLaunchWithCols | null)?.cols ?? {};
      const colOf = (name: string | undefined): 'front' | 'mid' | 'back' => normalizeCol(name ? launchCols[name] : undefined);
      const world = createWorld({
        data,
        seed,
        roll: sangoRng(seed),
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
          // F-07 主將站位：編成頁三檔（前/中/後）→ core 落位向敵方偏移 1 格（中列 = 既有落位）。
          col: colOf(launch?.gen),
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
          // F-07 敵方站位：本輪不開放（劇本/敵將沒帶欄位）→ 固定中列，保持既有落位。
          col: 'mid',
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
      // 車輪戰：勝方把上一場的殘血/殘技力帶進這一場（兵數已由 launch.soldiers 帶入）
      this.applyCarry(world, launch);
      this.boutNo += 1;
      // 士兵字牌：本局双方各只有一种兵，字取兵种名（大刀→刀 / 黄巾→黄），每帧复用同一池
      const troopNames = data.troops.names;
      this.troopChar = {
        A: troopCharOf(troopNames[world.sides.A.troop] ?? ''),
        B: troopCharOf(troopNames[world.sides.B.troop] ?? ''),
      };
      // 跨局复用同一场景时，池里的字要跟着兵种换（开局双方各一种兵）
      for (const l of this.soldierLabelsA) l.string = this.troopChar.A;
      for (const l of this.soldierLabelsB) l.string = this.troopChar.B;
      this.settlement = null;
      this.hud?.setSettleNext(null);
      this.accumulator = 0;
      this.camX = camera(world);
      // 背景：全图不再跟镜头，用开局的 camX 定一次视差即可（地形换图时重设）
      this.bg?.setTerrain(world.terrain);
      this.bg?.setCamX(this.camX);
      // 操作层重建：技能格按新 world 的 data 重算，选中/提示/飘字全部清零
      this.input.bind(world);
      this.floaters.length = 0;
      this.lastMessage = '';
      this.messageTick = world.tick;
      // 表现层只读 world 的 terrain/weather，不参与任何战斗判定
      this.weatherLayer?.setWeather(world.weather as Weather);
      this.audioMark = battleAudioMark(world);
      this.audio?.playTerrainBgm(world.terrain);
      // 叫阵放在最后：它要读 createWorld 后的主将位置，并且会把 camX 直接钉到说话方。
      // 車輪戰只有第 1 場演叫陣（後面幾場是回到戰前面板再選人，不再重演開場）。
      if (this.boutNo === 1) this.beginTaunt();
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

  /** 場上還活著的兵數（不含主將） */
  private aliveSoldiers(side: 'A' | 'B'): number {
    const w = this.world;
    if (!w) return 0;
    let n = 0;
    for (const u of w.units) if (u.alive && !u.isGeneral && u.side === side) n += 1;
    return n;
  }

  /** 車輪戰：把上一場勝方的殘血/殘技力蓋到新世界（兵數由 `launch.soldiers` 帶入） */
  private applyCarry(world: World, launch: BattleLaunch | null): void {
    if (!launch) return;
    for (const side of ['A', 'B'] as const) {
      const carry = side === 'A' ? launch.carryA : launch.carryB;
      if (!carry) continue;
      const gen = world.sides[side].general;
      gen.hp = Math.max(1, Math.min(gen.maxHp, Math.round(carry.hp)));
      gen.mp = Math.max(0, Math.min(gen.mpMax, Math.round(carry.mp)));
    }
  }

  /**
   * 車輪戰：算下一場的 launch。
   *
   * 原作戰前是手動淘汰制（打一場回面板、玩家點下一位），所以这里只负责「輸方還有誰」
   * ——輸方名冊的下一位上場，勝方留在場上並帶走殘血/殘兵；平手或一方無人 → null（本戰結束）。
   */
  private buildNextBout(winner: 'A' | 'B' | 'draw'): BattleLaunch | null {
    const l = this.launch;
    const w = this.world;
    if (!l || !w || winner === 'draw') return null;
    const loser: 'A' | 'B' = winner === 'A' ? 'B' : 'A';
    const roster = loser === 'A' ? l.rosterA : l.rosterB;
    if (!roster || roster.length === 0) return null;
    const idx = (loser === 'A' ? l.indexA ?? 0 : l.indexB ?? 0) + 1;
    if (idx >= roster.length) return null;
    const name = roster[idx];
    this.nextName = name;
    const table = this.gameData?.generals as unknown as
      | { NAME?: string; STR?: number; INT?: number }[]
      | undefined;
    const row = table?.find((g) => g.NAME === name);
    const carry: DuelCarry = {
      hp: w.sides[winner].general.hp,
      mp: w.sides[winner].general.mp,
      soldiers: this.aliveSoldiers(winner),
    };
    const next: BattleLaunch = { ...l };
    // 勝方殘兵帶進下一場（原作敗方下場、勝方留場，兵數不重置）
    const carrySoldiers = Math.max(0, Math.floor(carry.soldiers));
    if (loser === 'A') {
      next.indexA = idx;
      next.gen = name;
      if (typeof row?.STR === 'number') next.genStr = row.STR;
      if (typeof row?.INT === 'number') next.genInt = row.INT;
      next.soldiers = l.soldiers;
      next.carryB = carry;
      next.bsoldiers = Math.max(0, Math.min(l.bsoldiers, carrySoldiers));
    } else {
      next.indexB = idx;
      next.bgen = name;
      if (typeof row?.STR === 'number') next.bstr = row.STR;
      if (typeof row?.INT === 'number') next.bint = row.INT;
      next.bsoldiers = l.bsoldiers;
      next.carryA = carry;
      next.soldiers = Math.max(0, Math.min(l.soldiers, carrySoldiers));
    }
    return next;
  }

  // -------------------------------------------------------------------------
  // 开场叫阵：B 敵將先喊 → A 我將接話（原作 SYSTEM.SO#StartBattle @0x2108）
  // 台詞/編號規則在 core/open_taunt.ts（與 web main.js:798-845 同一份），
  // 差別只在這裡是 Cocos：鏡頭直接釘 `camX`（不做插值，硬切才是原作的換機位），
  // 台詞框由 BattleHud.showTaunt() 畫在戰場最底部。
  // -------------------------------------------------------------------------

  /** 主將單位在縱深軸上的位置（格）；找不到回 0。 */
  private generalX(side: 'A' | 'B'): number {
    const w = this.world;
    if (!w) return 0;
    for (let i = 0; i < w.units.length; i += 1) {
      const u = w.units[i];
      if (u.isGeneral && u.side === side) return u.x;
    }
    return 0;
  }

  /** 排一段叫陣；`?taunt=0` 或沒主將時直接不演（回 false）。 */
  private beginTaunt(): boolean {
    const w = this.world;
    this.tauntSeq = null;
    this.tauntI = 0;
    this.tauntT = 0;
    this.hud?.hideTaunt();
    if (!this.tauntOn || !w) return false;
    const ax = this.generalX('A');
    const bx = this.generalX('B');
    const near = regionFromCamera(ax, this.camX);
    const far = regionFromCamera(bx, this.camX);
    const seq = buildTauntSeq({
      near,
      far,
      // 與戰鬥亂數分開：叫陣開/關不能改變 step() 的 rand 序列（同 web main.js:809）
      seed: ((this.launch?.seed ?? 20261124) * 2654435761) >>> 0,
      aName: w.sides.A.general?.name || '',
      bName: w.sides.B.general?.name || '',
    });
    if (seq.length === 0) return false;
    this.tauntSeq = seq;
    this.showTauntLine();
    return true;
  }

  private showTauntLine(): void {
    const seq = this.tauntSeq;
    if (!seq) return;
    const line = seq[this.tauntI];
    if (!line) return;
    const name = line.side === 'B' ? this.world?.sides.B.general?.name : this.world?.sides.A.general?.name;
    this.hud?.showTaunt(name || (line.side === 'B' ? '敵將' : '我將'), line.text, line.side);
  }

  /** 每幀推進叫陣；真正在演的期間回 true（update 用它擋掉 step）。 */
  private tickTaunt(dt: number): boolean {
    const seq = this.tauntSeq;
    if (!seq) return false;
    const line = seq[this.tauntI];
    if (!line) { this.endTaunt(); return false; }
    this.tauntT += dt;
    if (this.tauntT * TICK_HZ < Math.max(30, line.holdTicks)) return true;
    this.tauntT = 0;
    this.tauntI += 1;
    if (this.tauntI < seq.length) {
      // 下一句：全图下不需要切镜头，只换台词框（谁喊话由名字/高亮区分）
      this.showTauntLine();
      return true;
    }
    this.endTaunt();
    return false;
  }

  /** 播完：收台詞框，把 tick 累加器清零。全图下镜头不动。 */
  private endTaunt(): void {
    this.tauntSeq = null;
    this.tauntI = 0;
    this.tauntT = 0;
    this.hud?.hideTaunt();
    this.accumulator = 0;
    this.redraw();
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
      // 車輪戰：名冊還有下一位 → 同一場景換將再開一場（不重載場景、不重演叫陣）
      if (this.nextBout) {
        this.launch = this.nextBout;
        this.nextBout = null;
        this.settlement = null;
        this.input.setSettled(false);
        this.loading = false;
        void this.boot();
        return;
      }
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
    // 原作战场背景（地形/远景）压暗铺最底下；全图版不再跟镜头，camX 开局定一次
    this.bg = new BattleBg(this.node, 0);
    this.bg.node.addComponent(UIOpacity).opacity = 255;
    // 全图战场底（地形渐变 + 71 行网格 + 前线 + 后场色带）：静态画一次，
    // 压在 gBase 之下、背景图之上；单位/标记每帧重画。
    this.gMap = this.makeGraphics('BattleMap');
    this.paintMap();
    // 音频宿主只挂节点、不渲染，放哪一层都行；排在背景之后便于阅读
    this.audio = new AudioHost(this.node);
    this.audio.install();
    this.gBase = this.makeGraphics('BattleBase');
    this.gA = this.makeGraphics('UnitsA');
    this.gB = this.makeGraphics('UnitsB');
    // 士兵字牌层：圆由 gA/gB 画，汉字只能用 Label（200 个池化节点，按存活数显示）
    this.soldierLayer = new Node('SoldierGlyphs');
    this.soldierLayer.layer = Layers.Enum.UI_2D;
    this.soldierLayer.parent = this.node;
    this.soldierLayer.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    this.soldierLayer.setPosition(0, 0, 0);
    // 主将标记：圆头像 + 红/绿双环（见 GeneralMarkers.ts），压在士兵点之上
    this.markers = new GeneralMarkers(this.node);
    this.gFx = this.makeGraphics('Fx');

    // 天气在单位之上（雨雪要落在人身上），但只画在战场带里；初始晴天，boot() 里按地形+月份改
    this.weatherLayer = new BattleWeather(this.node, 0);
    // 全图视野下雪点/雨点和 2px 的小兵点会抢注意力：天气整体压到 35% 不透明度
    this.weatherLayer.node.addComponent(UIOpacity).opacity = 90;

    // 战场角标：全图没有镜头，靠这两处文字告诉玩家哪边是敌方后场
    this.makeLabel('敵 陣', 12, 112, 80, 11, COLORS.enemy, 'left');
    this.makeLabel('我 陣', 12, 982, 80, 11, COLORS.ours, 'left');
    this.makeLabel('前 線', 12, 544, 80, 10, COLORS.goldDim, 'left');

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
    // 战场那 900px 由 gMap 的静态全图底承担；gBase 只铺顶栏/控制台两条不透明带。
    // 有 hud_bar 底图时半透明，让顶栏纹理透出来；没图就纯色（和以前一致）
    this.fillScreenRect(g, 0, 0, DESIGN_W, 100, COLORS.bgDeep, this.artHud?.state === 'ready' ? 186 : 255);
    this.fillScreenRect(g, 0, 999, DESIGN_W, 335, COLORS.bgDeep);

    // HUD 三条资源条的深色底板：两条兵力条（y=56）+ 主将 HP 条（y=76）都落在这块上
    this.fillRoundScreenRect(g, 8, 22, 734, 74, 10, '#05070A', 200);
    g.strokeColor = rgba(COLORS.gold, 46);
    g.lineWidth = 1;
    g.roundRect(8 - HALF_W, HALF_H - 22 - 74, 734, 74, 10);
    g.stroke();
  }

  /**
   * 全图战场底（静态，只在 buildUi 里画一次）。
   *
   * 三国志13 的战场是一整块可见地形；这里没有 3D 地形，用「敌方暗红 / 中央中性 /
   * 我方暗蓝」三段渐变 + 细网格 + 一条金色前线，把 71×14 的方格战场读成一整幅图。
   * 网格刻意压得很淡（alpha 20~54）：全图一屏 71 行，画重了会盖过小兵点。
   */
  private paintMap(): void {
    const g = this.gMap;
    if (!g) return;
    g.clear();

    // 纵向渐变：上（敌阵）偏红 → 中（无人区）中性 → 下（我阵）偏蓝
    const BANDS = 24;
    const bandH = FIELD_H / BANDS;
    // 半透明：下面还压着原作战场背景（地形/远景），留 ~40% 透出来做质感
    const top = new Color(43, 28, 24, 150);
    const mid = new Color(27, 31, 30, 150);
    const bot = new Color(17, 26, 38, 150);
    const mix = (a: Color, b: Color, t: number): Color =>
      new Color(
        Math.round(a.r + (b.r - a.r) * t),
        Math.round(a.g + (b.g - a.g) * t),
        Math.round(a.b + (b.b - a.b) * t),
        Math.round(a.a + (b.a - a.a) * t),
      );
    for (let i = 0; i < BANDS; i += 1) {
      const t = i / (BANDS - 1);
      g.fillColor = t < 0.5 ? mix(top, mid, t * 2) : mix(mid, bot, (t - 0.5) * 2);
      g.rect(-HALF_W, HALF_H - FIELD_TOP - bandH * (i + 1), DESIGN_W, bandH);
      g.fill();
    }

    // 双方后场色带（各 8 行）：给「哪边是家」一个不用读字的提示
    const zoneH = 8 * MAP_ROW_PX;
    this.fillScreenRect(g, 0, FIELD_TOP, DESIGN_W, zoneH, COLORS.enemy, 15);
    this.fillScreenRect(g, 0, FIELD_BOTTOM - zoneH, DESIGN_W, zoneH, COLORS.ours, 17);

    // 车道线（14 条车道、13 条内线）。用 1px 填充矩形而不是 stroke：
    // 这张图上多段描边在当前 Cocos 版本下会整段丢失，填充矩形是稳的。
    for (let gy = 1; gy < GRID_H; gy += 1) {
      this.fillScreenRect(g, gy * LANE_PX, FIELD_TOP, 1, FIELD_H, COLORS.line, 58);
    }

    // 行线：每 5 行一条稍亮的，其余更淡
    for (let gx = 1; gx < GRID_W; gx += 1) {
      this.fillScreenRect(g, 0, MAP_TOP + gx * MAP_ROW_PX, DESIGN_W, 1, COLORS.line, gx % 5 === 0 ? 64 : 24);
    }

    // 前线（worldX=35.5，两军中线）：金色虚线，断 7 空 7
    const frontY = MAP_TOP + 36 * MAP_ROW_PX;
    for (let x = 0; x < DESIGN_W; x += 14) {
      this.fillScreenRect(g, x, frontY, 7, 1, COLORS.gold, 150);
    }

    // 战场边框：把「带」的上下沿收住，避免小兵点飘在渐变里
    this.fillScreenRect(g, 0, FIELD_TOP, DESIGN_W, 1, COLORS.gold, 54);
    this.fillScreenRect(g, 0, FIELD_BOTTOM - 1, DESIGN_W, 1, COLORS.gold, 54);
    this.fillScreenRect(g, 0, FIELD_TOP, 1, FIELD_H, COLORS.gold, 54);
    this.fillScreenRect(g, DESIGN_W - 1, FIELD_TOP, 1, FIELD_H, COLORS.gold, 54);
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
      this.setStatus(
        this.nextBout
          ? '點擊畫面續戰'
          : this.launch?.from === 'campaign'
            ? '點擊返回大地圖'
            : '點擊畫面重開',
      );
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

    // ① 选中格金框（技能格坐标与底栏命中区同源：BattleConsoleUi.skillCellRects）
    const idx = this.input.selected;
    if (idx !== null) {
      const r = skillCellRects(this.input.slots.length)[idx];
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
    const ry = radius * MAP_ROW_PX;
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
      // 顶栏已经有双方兵力条与體/氣条：底卡不再重复「兵/體/技」三行数字
      'CardTroopA',
      'CardHpA',
      'CardSkillA',
      'CardTroopB',
      'CardHpB',
      'CardSkillB',
      'CmdBtnAssault',
      'CmdBtnRetreat',
      'CmdLabelAssault',
      'CmdSubAssault',
      'CmdLabelRetreat',
      'CmdSubRetreat',
      // 技能格改由 BattleConsoleUi 的动态技能行画（按可释放技数出格），HUD 的 8 格让位
      'SkillSlot1',
      'SkillSlot2',
      'SkillSlot3',
      'SkillSlot4',
      'SkillSlot5',
      'SkillSlot6',
      'SkillSlot7',
      'SkillSlot8',
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

    const items = buildConsoleUi(world, this.input.slots, this.input.modeNow);
    const order: string[] = [];
    const alive = new Set<string>();
    for (const item of items) {
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

  /**
   * 士兵 = 小点，主将 = 稍大的点 + 金边（R215 全图口径）。
   *
   * 整幅 71 行压进 900px 后一格只有 11.9px，再画 52px 的小人会把邻格全糊住；
   * 这里只保留「位置 + 阵营」两个信息：A 蓝点、B 红点，半径 2.2px，
   * 下面垫一层 3.1px 的暗底，保证在暖灰/暗红地形上也能读出来。
   * 主将的逻辑点半径 4.6px、外圈金边 6.2px，比小兵大一圈但仍落在真实格点上；
   * 认人的脸由 `GeneralMarkers` 挂在旁边的 63px 圆牌负责（点与 UI 分离）。
   * **没有任何动作帧**：攻击/受击/移动/死亡都只改变点的位置与有无。
   */
  private drawUnits(world: World): void {
    const ga = this.gA;
    const gb = this.gB;
    if (!ga || !gb) return;
    ga.clear();
    gb.clear();

    const visible = (u: World['units'][number]): boolean => {
      if (!u.alive) return false;
      const y = project(u.x, u.y, 0).y;
      return y >= FIELD_TOP && y <= FIELD_BOTTOM;
    };
    /** 士兵圆半径：字形 9px 要塞得下，圆环才看得见（行距 11.94px，略压邻行是有意的） */
    const SOLDIER_R = 7.2;

    // 主将暗底：主将那颗点还要压金边，垫深一点才立得起来
    ga.fillColor = new Color(6, 8, 12, 190);
    gb.fillColor = new Color(6, 8, 12, 190);
    for (const u of world.units) {
      if (!visible(u) || !isGeneral(u)) continue;
      const p = project(u.x, u.y, 0);
      this.dotPath(u.side === 'A' ? ga : gb, p.x - HALF_W, HALF_H - p.y, 6.4);
    }
    ga.fill();
    gb.fill();

    // 士兵：暗底圆（字要压在上面，纯描边在花背景上读不出来）
    ga.fillColor = new Color(8, 11, 17, 210);
    gb.fillColor = new Color(8, 11, 17, 210);
    for (const u of world.units) {
      if (!visible(u) || isGeneral(u)) continue;
      const p = project(u.x, u.y, 0);
      this.dotPath(u.side === 'A' ? ga : gb, p.x - HALF_W, HALF_H - p.y, SOLDIER_R);
    }
    ga.fill();
    gb.fill();

    // 士兵圆圈：阵营色描边（红/蓝一眼分敌我）
    ga.strokeColor = rgba(COLORS.ours, 240);
    gb.strokeColor = rgba(COLORS.enemy, 240);
    ga.lineWidth = 1.5;
    gb.lineWidth = 1.5;
    for (const u of world.units) {
      if (!visible(u) || isGeneral(u)) continue;
      const p = project(u.x, u.y, 0);
      this.dotPath(u.side === 'A' ? ga : gb, p.x - HALF_W, HALF_H - p.y, SOLDIER_R);
    }
    ga.stroke();
    gb.stroke();

    // 主将色点 + 金边：和士兵的「字圈」区分开
    ga.fillColor = rgba(COLORS.ours, 245);
    gb.fillColor = rgba(COLORS.enemy, 245);
    for (const u of world.units) {
      if (!visible(u) || !isGeneral(u)) continue;
      const p = project(u.x, u.y, 0);
      this.dotPath(u.side === 'A' ? ga : gb, p.x - HALF_W, HALF_H - p.y, 4.6);
    }
    ga.fill();
    gb.fill();
    ga.strokeColor = rgba(COLORS.gold, 220);
    gb.strokeColor = rgba(COLORS.gold, 220);
    ga.lineWidth = 1.2;
    gb.lineWidth = 1.2;
    for (const u of world.units) {
      if (!u.alive || !isGeneral(u)) continue;
      const p = project(u.x, u.y, 0);
      if (p.y < FIELD_TOP || p.y > FIELD_BOTTOM) continue;
      this.dotPath(u.side === 'A' ? ga : gb, p.x - HALF_W, HALF_H - p.y, 6.2);
    }
    ga.stroke();
    gb.stroke();

    this.syncSoldierLabels(world);
    this.markers?.draw(world);
  }

  /**
   * 士兵字牌：每个活着的小兵一个「兵种字」Label，池化复用。
   *
   * 100+100 个 Label 在手机上不算轻，所以：字串只在建池时写一次（一局双方各一字），
   * 每帧只改位置与显隐；死掉的兵直接隐藏，不留空节点在场上。
   */
  private syncSoldierLabels(world: World): void {
    if (!this.soldierLayer) return;
    let ia = 0;
    let ib = 0;
    for (const u of world.units) {
      if (!u.alive || isGeneral(u)) continue;
      const p = project(u.x, u.y, 0);
      if (p.y < FIELD_TOP || p.y > FIELD_BOTTOM) continue;
      const label = u.side === 'A' ? this.soldierLabel('A', ia++) : this.soldierLabel('B', ib++);
      label.node.setPosition(p.x - HALF_W, HALF_H - p.y, 0);
      label.node.active = true;
    }
    const hide = (pool: Label[], from: number): void => {
      for (let i = from; i < pool.length; i += 1) pool[i].node.active = false;
    };
    hide(this.soldierLabelsA, ia);
    hide(this.soldierLabelsB, ib);
  }

  /** 懒建字牌（一局最多 100 个/方）。`LabelOutline` 保证 9px 汉字压在土黄底上也清楚。 */
  private soldierLabel(side: 'A' | 'B', index: number): Label {
    const pool = side === 'A' ? this.soldierLabelsA : this.soldierLabelsB;
    while (pool.length <= index) {
      const node = new Node(`Glyph${side}${pool.length}`);
      node.layer = Layers.Enum.UI_2D;
      node.parent = this.soldierLayer;
      node.setPosition(0, 0, 0);
      node.addComponent(UITransform).setContentSize(16, 16);
      const label = node.addComponent(Label);
      label.fontSize = 9;
      label.lineHeight = 9;
      label.color = new Color(248, 250, 255, 245);
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.overflow = Label.Overflow.NONE;
      const outline = node.addComponent(LabelOutline);
      outline.color = new Color(0, 0, 0, 220);
      outline.width = 1;
      label.string = this.troopChar[side];
      pool.push(label);
    }
    return pool[index];
  }

  /**
   * 士兵点：不用 `Graphics.circle`，因为半径 2.2px 时三段折线会退化成方块；
   * 这里显式画十边形，屏幕上看才是「点」而不是「像素块」。
   */
  private dotPath(g: Graphics, x: number, y: number, r: number): void {
    const N = 10;
    for (let i = 0; i < N; i += 1) {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / N;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.close();
  }

  private drawFx(world: World): void {
    const g = this.gFx;
    if (!g) return;
    g.clear();
    for (const fx of world.fx) {
      // core 的 heal fx 把 x 填成了 HP，不是世界坐标；Cocos 壳先不画 heal 圈
      if (fx.kind === 'heal') continue;
      const p = project(fx.x, fx.y, 0);
      if (p.y < FIELD_TOP - 60 || p.y > FIELD_BOTTOM + 60) continue;
      // 全图投影下纵向被压到 1/6，半径圈也必须是椭圆，否则一颗火球会盖掉 5 行
      const rx = Math.max(10, fx.r * LANE_PX);
      const ry = Math.max(6, fx.r * MAP_ROW_PX);
      g.ellipse(p.x - HALF_W, HALF_H - p.y, rx, ry);
    }
    g.strokeColor = rgba(COLORS.gold, 140);
    g.lineWidth = 2;
    g.stroke();
  }
}

