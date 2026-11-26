/**
 * 出征编成屏（Cocos Creator 3.8）。
 *
 * 对齐 `game/web/deploy.html`：
 *   - 主将候选人 = **出發城**（web 的 `?from` / `takeDeployFrom()`）的存檔運行時人事
 *     （`OfficersOfCity.officersOfCity(save, home, …)`，与物品页/内政页同一个唯一入口；
 *     存檔還沒人事紀錄才退回劇本表 `city_by_times`），太守优先、再按武+智降序，取前 12；
 *   - 敌方（目標城）的守將/守軍/敵情才從目標城算：`cityGarrisonTroops` / `resolveEnemyIntel`
 *     / `takeDeployEnemy()`——「出發城」與「目標城」不能混用（實機回報：從平原打樂陵，
 *     主將卡卻顯示守方黃巾的張角那一列）；
 *   - 兵种/阵形按该将的 `UseForce` / `BattleArray` 做白名单：**没学的格子置灰「未學」且点不到**；
 *   - 军师技一栏取 `listWisdomChoices()`（等级默认 20，同 web 的 `qs.lv || 20`），
 *     选中值随 loadout 传下去，进战斗后由 `applyWise(world,'A',seq)` 生效；
 *   - 兵力用滑杆，上限 `min(等级×5, 100)`（= web 的 `SOLDIER_CAP`）；
 *   - 相剋净加值 = 我方对敌 − 敌方对我方（兵种 ±68、阵形 ±25）；
 *   - 敵方主将/兵力取 `battleSetup()`（garrison.json 优先，缺表退回按人口推算）；
 *   - 「出征」把参数交给 GameState.startBattle → Battle 场景。
 *
 * 立绘：web 图在 `game/web/assets/hero/<姓名>.png`。Cocos 里走 `ArtLayer.loadFrame`
 * （bundles/res/hero/<姓名>），失败再退回 `heroBaseUrl` 的远程 http。
 */
import {
  _decorator,
  assetManager,
  Color,
  Component,
  director,
  EventTouch,
  Graphics,
  ImageAsset,
  input,
  Input,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  sys,
  Texture2D,
  UITransform,
  Vec3,
} from 'cc';
import { addOutline, addVeil, ArtBg, ArtSprite, loadFrame } from './ArtLayer';
import { latchTap } from './InputLatch';
import { guardTouch, installInputResilience } from './InputGuard';
import { isGate } from './CityModel';
import { loadGameData } from './DataLoader';
// 漸層近似（w5-render）：Cocos 沒有 CSS gradient，用多段色帶逼近
import { Band, edgeBands, gridWeave, lightGrid, topSheen, vBands } from './Draw';
import { cityGarrisonTroops, resolveEnemyIntel } from './EnemyIntel';
import type { EnemyIntel } from './EnemyIntel';
import { garrisonOf } from './core/garrison';
import type { GarrisonData } from './core/garrison';
// F-07 站位型別：直接吃 core 的 `GeneralCol`（'front'|'mid'|'back'），不複製第二份聯合型別
import type { GeneralCol } from './core/battle';
// 兵力兩欄（project/170）：帶兵上限 `troopCapOf()` 與騎兵上限 `cavalryCapOf()` 互不包含，
// 上陣總數是兩欄之和（原作 `unit+0x5C` ← `unit+0x58`，`project/168` §4）。
import { troopColumnsOf } from './core/levels';
import { defaultFormationOf, defaultTroopOf, formationsOf, troopsOf } from './core/unlock';
// R94 出陣隊列：與 web 的 deploy.html / campaign.html 用**同一份** game/src/core/deploy_queue.ts
// （本目錄 core/deploy_queue.ts 是 work/deployq/sync_r94_subset.mjs 的同步副本）。
// 原作 Obj3 部隊池每隊 5 個武將槽（docs/07b §6，+0x010..+0x020），順序即出陣序；軍師技
// seq 3「後選出陣」（Execute 34）放開的是開戰前重排前 3 槽（project/109 §5.3、project/162）。
import {
  DEPLOY_FIELD_SLOTS,
  DEPLOY_SLOTS,
  hasQueue,
  makeSlot,
  moveSlot,
  queueOf,
  saveQueue,
  setGeneral,
  setTroop,
  setTroops,
} from './core/deploy_queue';
import type { DeployQueue, DeployQueueSave } from './core/deploy_queue';
import { listWisdomChoices, WISE_UNIMPLEMENTED, wiseHintOf } from './core/wises';
// [Bug A] 城市駐將的唯一入口（純邏輯、零 cc 依賴）：出發城名單要走**存檔運行時人事**，
// 不是 generals.json 的靜態 `CITY`（那張是第 1 劇本快照，黃巾之亂的張角會被當成平原守將）。
import * as O from './OfficersOfCity';
import * as GameState from './GameState';
import type { BattleLoadout, CampaignCity, CampaignGeneral, CampaignScenario, DeploySiege } from './GameState';
import type { GameData } from './types';
import { DESIGN_H, DESIGN_W } from './view/layout';
import { COLORS, FONT_FAMILY } from './view/theme';
import { applyTextRole, applyTextRoles } from './TextRole';
import { makeNineSlice, placeDesign } from './UiSkin';
import { scenarioLevelOf } from './ScenarioLevels';
// [P0-2] 劇本號的執行期來源：與 `CampaignRoot.start()` 的 `runScenarioIndex()` 同一份 RunSetup
// （ScenarioLevels 也在用它；本頁不再恆取第 1 劇本）
import { playerForce as runPlayerForce, scenarioIndex as runScenarioIndex } from './RunSetup';

const { ccclass, property } = _decorator;

const HALF_W = DESIGN_W / 2;
const HALF_H = DESIGN_H / 2;
const GEN_COLS = 6;
const TROOP_COLS = 5;
const FORM_COLS = 5;
const WISE_COLS = 4;
const WISE_MAX = 8;

/** 网格几何（设计坐标 y 从上往下） */
const GEN_X = 24;
const GEN_Y = 344;
const GEN_W = 104;
const GEN_H = 52;
const TROOP_X = 24;
const TROOP_Y = 508;
const CELL_W = 130;
const CELL_H = 52;
const FORM_Y = 732;
const WISE_X = 24;
const WISE_Y = 896;
const WISE_W = 169;
const WISE_H = 44;
const SLIDER_X0 = 24;
const SLIDER_X1 = 726;
const SLIDER_Y = 1062;
/**
 * 兩欄滑桿（project/170）：步兵欄走左段、騎兵欄走右段，
 * 共用兵力卡的同一行高度——加第二欄不佔新的一行（下面還有快捷鈕與出陣順序窄條）。
 */
const INF_SLIDER_X1 = 340;
const CAV_SLIDER_X0 = 400;
const QUICK_Y = 1104;
/** 出陣順序窄條：夾在兵力快捷鈕（1104+42）與底欄（1194）之間 */
const QUEUE_Y = 1150;
const QUEUE_ROW_H = 96;

/* ------------------------------------------------------------------ *
 * F-07 前 / 中 / 後列（站位）
 *
 * 與 web `deploy.html:540-571` **同一個 localStorage 鍵、同一份格式**：
 *   `sanguo_deploy_cols_v1` = `{ 武將名: 'front'|'mid'|'back' }`
 * 為什麼按武將名另存、不塞進 `deployQueue`：`core/deploy_queue.ts` 的 `saveQueue()` 只寫回
 * `{general,troop,troops}` 三欄，額外欄位會被剝掉；web 也是這樣繞開的（`COL_BY_NAME`）。
 * 出征時把整份站位表掛在 payload 的 `cols` 欄位帶進戰鬥（web 走 URL 的 `cols=`）——
 * 不新造傳參機制，見 `march()` / `BattleRoot.boot()`。
 * ------------------------------------------------------------------ */
const COL_KEY = 'sanguo_deploy_cols_v1';
const COL_LABEL: Record<GeneralCol, string> = { front: '前', mid: '中', back: '後' };
const COL_ORDER: readonly GeneralCol[] = ['front', 'mid', 'back'];

/**
 * 兵種下標 → 原作單字（web deploy.html 的 `TROOP_CHARS` 同一張表）。
 * 隊列裡存單字（刀/槍/…）而不是全名，這樣 web 與 Cocos 讀同一個 `deployQueue` 不會一邊顯示
 * 「朴刀」一邊顯示「刀」。朴刀與大刀共用「刀」，故 0 與 2 都是刀。
 */
const TROOP_CHARS = ['刀', '槍', '刀', '弓', '鍊', '飛', '武', '蠻', '鐵', '籐', '賊', '弩', '女'];
/** 點擊循環用的去重兵種字（朴刀/大刀共用「刀」，循環裡只出現一次） */
const TROOP_CYCLE = ['刀', '槍', '弓', '鍊', '飛', '武', '蠻', '鐵', '籐', '賊', '弩', '女'];

/* ------------------------------------------------------------------ *
 * 九宮底板規格（w5-cocos-skin）
 *
 * 下面兩組矩形**全部由上面那組幾何常量推導**（各分區實際內容的外接框 + 8px 邊距），
 * 不新增、不移動任何內容座標：格子的 x/y 仍由 `GEN_Y`/`TROOP_Y`/`FORM_Y`/`WISE_Y`
 * 現算，九宮只是畫在它們**下面**的一層框。
 * ------------------------------------------------------------------ */

interface SkinSlot {
  name: string;
  key: string;
  rect: { x: number; y: number; w: number; h: number };
}

/** 六個分區卡片：主將（立繪+屬性）/ 武將格 / 兵種 / 陣形 / 軍師技 / 兵力 */
const SECTION_CARDS: readonly SkinSlot[] = [
  { name: 'SkinCardMain', key: 'frame_panel', rect: { x: 16, y: 136, w: 718, h: 166 } },
  { name: 'SkinCardGen', key: 'frame_panel', rect: { x: 16, y: 336, w: 718, h: 128 } },
  { name: 'SkinCardTroop', key: 'frame_panel', rect: { x: 16, y: 500, w: 718, h: 188 } },
  { name: 'SkinCardForm', key: 'frame_panel', rect: { x: 16, y: 724, w: 718, h: 132 } },
  { name: 'SkinCardWise', key: 'frame_panel', rect: { x: 16, y: 884, w: 718, h: 116 } },
  { name: 'SkinCardPower', key: 'frame_panel', rect: { x: 16, y: 1040, w: 718, h: 120 } },
];

/** 立繪框 + 底部兩顆大按鈕（矩形照抄 `draw()` 裡畫立繪底板與 `drawFooter()` 的既有值） */
const FIXED_PLATES: readonly SkinSlot[] = [
  { name: 'SkinPortraitPlate', key: 'plate_sq', rect: { x: 24, y: 150, w: 120, h: 150 } },
  { name: 'SkinBackPlate', key: 'plate_btn', rect: { x: 24, y: 1210, w: 330, h: 84 } },
  { name: 'SkinGoPlate', key: 'plate_btn', rect: { x: 396, y: 1210, w: 330, h: 84 } },
];

/** 格子數量（與建 Label 的迴圈一致：12 將 / 13 兵種 / 9 陣形 / 8 軍師技） */
const GEN_PLATES = 12;
const TROOP_PLATES = 13;
const FORM_PLATES = 9;
const WISE_PLATES = WISE_MAX;


/** 数据表里的武将行比 `types.ts` 的 `General` 多几个字段（见 core/garrison.ts 同名字段） */
type GeneralRow = CampaignGeneral & {
  city_by_times?: unknown;
  status_by_times?: unknown;
};

interface MatrixRow {
  name: string;
  vs: number[];
}

type ButtonKind = 'gen' | 'troop' | 'form' | 'wise' | 'slide' | 'quick' | 'back' | 'go'
  | 'queue' | 'qup' | 'qdn' | 'qtr' | 'qclose'
  // F-07 站位三檔：'qcol' = 出陣順序面板每槽（index = slot*3 + 檔位）；'mcol' = 主將區右上角
  | 'qcol' | 'mcol';

interface ButtonRect {
  kind: ButtonKind;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 出征 payload 的站位擴展（F-07）。
 *
 * `GameState.BattleLoadout` 沒有 col 欄位（也不能改：本輪不碰 GameState.ts），但
 * `startBattle()` 內部是 `{ ...loadout, city, seed, from }` 物件展開 —— 額外屬性會原樣進
 * `BattleLaunch`。所以型別上補一個交叉型別、執行期靠展開保留，BattleRoot 讀 `launch.cols`
 * 即可。與 web 的 `cols=關羽:front,...` URL 參數是同一個 payload 語義。
 */
type BattleLoadoutWithCols = BattleLoadout & { cols: Record<string, GeneralCol> };

interface WiseOption {
  seq: number | null;
  name: string;
  hint: string;
  dim: boolean;
}

function rgba(hex: string, alpha = 255): Color {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, alpha);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * 数多值字段的个数。
 *
 * `types.ts` 把 `SKILL` / `WISESKILL` 声明成 `Array<[number, number]>`，但
 * `generals.json` 里实际存的是 `"40, 110"` 这种逗号串。两种都吃。
 */
function countList(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'string') return value.split(',').filter((part) => part.trim() !== '').length;
  return 0;
}

function bonus(matrix: readonly MatrixRow[], attack: number, defend: number): number {
  const row = matrix[attack];
  if (!row || !Array.isArray(row.vs)) return 0;
  return row.vs[defend] ?? 0;
}

/** `city_by_times` / `status_by_times` 取第 index 个剧本（index = 本局剧本号 `this.scenIdx`） */
function timeAt(value: unknown, index: number): string {
  if (!Array.isArray(value)) return typeof value === 'string' ? value : '';
  const item = value[index];
  return typeof item === 'string' ? item : '';
}

@ccclass('DeployRoot')
export class DeployRoot extends Component {
  @property({ tooltip: '立绘 HTTP 根目录；留空则从 bundles/res/hero/<姓名> 读' })
  heroBaseUrl = '';

  private gBase: Graphics | null = null;
  private gUi: Graphics | null = null;
  private portrait: Sprite | null = null;
  private portraitFrame: SpriteFrame | null = null;
  private portraitCache = new Map<string, SpriteFrame>();
  /** 候选条缩略立绘（12 个）与它们当前挂的姓名，避免每帧 refresh 都重加载 */
  private genThumbs: ArtSprite[] = [];
  private genThumbKey: string[] = [];
  /** 编成底图（bg/deploy_bg）；缺图时保持隐藏，Graphics 兜底照旧 */
  private artBg: ArtBg | null = null;

  private labelTitle: Label | null = null;
  private labelTarget: Label | null = null;
  private labelGenName: Label | null = null;
  private labelGenStats: Label | null = null;
  private labelGenSkill: Label | null = null;
  private labelIntel: Label | null = null;
  private labelSoldier: Label | null = null;
  private labelHint: Label | null = null;
  private genLabels: Label[] = [];
  /** 候選卡右上角的勾選框（✓ = 已隨軍） */
  private pickLabels: Label[] = [];
  private troopLabels: Label[] = [];
  private troopLockLabels: Label[] = [];
  private formLabels: Label[] = [];
  private formLockLabels: Label[] = [];
  private wiseLabels: Label[] = [];
  private quickLabels: Label[] = [];
  private actionLabels: Label[] = [];

  private data: GameData | null = null;
  private targetCity: CampaignCity | null = null;
  /** 出發城（web 的 `?from`）：主将池按这座城出的人筛 */
  private home = '';
  /**
   * [P0-2] 本局劇本號：`RunSetup.scenarioIndex()` 在 `start()` 取一次，
   * 與 `CampaignRoot.scenIdx` 同源。劇本表 / 守軍 / 敵情 / 武將所屬城都按它讀。
   */
  private scenIdx = 0;
  private garrison = 0;
  /**
   * 敵方主將/兵力的**唯一來源**：大地圖發起時由 `EnemyIntel.resolveEnemyIntel()` 算好、
   * 經 `GameState.setDeployEnemy()` 傳進來；直接打開 Deploy 場景時才在這裏現算。
   * 不再用 `battleSetup()` 的裸返回，否則空城會顯示「守將 武 0 / 智 0」。
   */
  private intel: EnemyIntel | null = null;
  /** 守城戰：非空表示這一場是敵軍來襲，值是來襲部隊的 id */
  private defenseArmyId: string | null = null;
  /** 來襲部隊的出發城（守城戰時 labelTarget 用） */
  private defenseFrom = '';
  /**
   * [R231] 攻城戰前準備：非空表示玩家是「兵團已抵達城下」進來的。
   *
   * 這份快照由 `CampaignRoot.startArrivalSiege()` / 大地圖「攻城」寫入，參戰部隊就是
   * 剛抵達的那支兵團（主將/隨軍/兵數/armyId），本屏不能換將換兵，只能選陣形/兵種/
   * 軍師技/站位/出陣順序；按「出 戰」直接進 Battle。`null` = 既有的派兵/守城戰模式。
   */
  private siege: DeploySiege | null = null;
  private generals: CampaignGeneral[] = [];
  private selectedGen = 0;
  private troop = 0;
  private form = 0;
  private soldiers = 100;
  private soldierCap = 100;
  /** 騎兵欄（`unit+0x58` 的另一半）：上限 `cavalryCapOf(level)`，與步兵欄互不包含 */
  private cavalry = 0;
  private cavalryCap = 0;
  /** 拖拽中的是哪一欄：0 = 步兵、1 = 騎兵 */
  private dragColumn = 0;
  private wise: number | null = null;
  private wiseOptions: WiseOption[] = [{ seq: null, name: '不 用', hint: '不發動軍師技', dim: false }];
  private lockedTroops: boolean[] = [];
  private lockedForms: boolean[] = [];
  private troopNames: string[] = [];
  private formNames: string[] = [];
  private troopMatrix: MatrixRow[] = [];
  private formMatrix: MatrixRow[] = [];
  private buttons: ButtonRect[] = [];
  private dragging = false;
  private hintText = '';
  private loaded = false;

  /* ---- 出陣順序（R94）---- */

  /** 5 槽，順序即出陣序；第 1 槽＝主將。資料真身是存檔的 `deployQueue`（v3 可選字段）。 */
  private queue: DeployQueue = [];
  /** 是否展開調序面板（模態：展開時吃掉全部觸摸） */
  private queueOpen = false;
  private queueLabels: Label[] = [];
  private queueTroopLabels: Label[] = [];
  private queueTitle: Label | null = null;
  private queueHint: Label | null = null;
  private queueClose: Label | null = null;
  /** 出陣順序面板独立图层：与主界面 Label 分层，避免被卡片/选择框盖住 */
  private queueLayer: Node | null = null;
  private queueGfx: Graphics | null = null;

  /* ---- F-07 前 / 中 / 後列（站位） ---- */

  /**
   * 每將站位，按武將名列存（`COL_KEY`）。**不**塞進 `queue` 的槽位：`saveQueue()` 只寫回
   * `{general,troop,troops}`，額外欄位會被剝掉 —— web 也是同一個繞法（`COL_BY_NAME`）。
   * 預設空表 ⇒ `colOf()` 一律回 mid（= 既有落位）。
   */
  private cols: Record<string, GeneralCol> = {};
  /** 武將卡右上角的「前/中/後」角標（12 個） */
  private genColLabels: Label[] = [];
  /** 出陣順序面板每槽第二行的三檔鈕（5 槽 × 3 檔） */
  private queueColLabels: Label[] = [];
  /** 主將區右上角三檔鈕的文字（3 個） */
  private mainColLabels: Label[] = [];

  /* ---- 九宮底板（w5-cocos-skin） ---- */

  private skinLayer: Node | null = null;
  private skinNodes = new Map<string, Node>();
  private genPlates: Node[] = [];
  private troopPlates: Node[] = [];
  private formPlates: Node[] = [];
  private wisePlates: Node[] = [];
  /** 四類格子的選中疊層（`plate_sel`）：只有四角有裝飾，疊在格子上不會糊掉格名 */
  private selGen: Node | null = null;
  private selTroop: Node | null = null;
  private selForm: Node | null = null;
  private selWise: Node | null = null;

  onLoad(): void {
    installInputResilience();
    // 底图/蒙版先建 → siblingIndex 0/1，永远在 Graphics 与 Label 之下
    this.buildArt();
    this.gBase = this.makeGraphics('DeployBase');
    this.gUi = this.makeGraphics('DeployUi');
    // 九宮底板層：晚於兩塊 Graphics、早於所有 Label/立繪 → 永遠墊在字下面
    this.buildSkin();

    this.labelTitle = this.makeLabel('出 征 編 成', 375, 40, 500, 32, COLORS.goldLight, 'center');
    this.labelTarget = this.makeLabel('', 24, 88, 700, 18, COLORS.textDim, 'left');

    this.portrait = this.makePortrait();

    this.labelGenName = this.makeLabel('—', 180, 158, 300, 26, COLORS.text, 'left');
    this.labelGenStats = this.makeLabel('—', 180, 196, 520, 18, COLORS.textDim, 'left');
    this.labelGenSkill = this.makeLabel('—', 180, 228, 520, 17, COLORS.textDim, 'left');
    // 敵情压缩成两行放在立绘右侧，把下方整条竖带让给军师技/兵力滑杆。
    this.labelIntel = this.makeLabel('—', 180, 266, 540, 16, COLORS.textDim, 'left');
    this.labelIntel.lineHeight = 23;
    addOutline(this.labelIntel, new Color(6, 8, 12, 200), 1);

    // F-07 主將區右上角的三檔站位鈕（文字在 drawMainCols() 裡擺）
    for (let i = 0; i < COL_ORDER.length; i += 1) {
      this.mainColLabels.push(this.makeLabel('', 0, 0, 70, 15, COLORS.textDim, 'center'));
    }

    this.makeSectionLabel('主 將', 24, 312);
    this.makeSectionLabel('兵 種（相剋 ±68 · 未學置灰）', 24, 480);
    this.makeSectionLabel('陣 形（相剋 ±25 · 未學置灰）', 24, 704);
    this.makeSectionLabel('軍 師 技', 24, 868);
    this.makeSectionLabel('兵 力', 24, 1016);

    // 兩欄讀數（步 / 騎 / 合計）貼在兵力卡上緣、靠右，與 web `deploy.html` 的 `#numtotal` 同一句口徑
    this.labelSoldier = this.makeLabel('步 100/100 · 騎 0/0 = 100 兵', 724, 1016, 460, 18, COLORS.goldLight, 'right');
    this.labelHint = this.makeLabel('', 375, 1300, 700, 15, COLORS.textDim, 'center');

    for (let i = 0; i < 12; i += 1) {
      this.genLabels.push(this.makeLabel('', 0, 0, GEN_W, 16, COLORS.textDim, 'center'));
      // 勾選框的 ✓（14px 格；drawGenGrid() 裡按 queue 成員設字/色）
      this.pickLabels.push(this.makeLabel('', 0, 0, 14, 13, COLORS.bgDeep, 'center'));
      // F-07：卡片右上角「前/中/後」角標（12px，右對齊；drawGenGrid() 裡按 colOf() 換字）
      this.genColLabels.push(this.makeLabel('', 0, 0, 30, 12, COLORS.textFaint, 'right'));
      const thumb = new ArtSprite(this.node, `GenThumb_${i}`, { x: 0, y: 0, w: 34, h: GEN_H - 4 }, 'contain');
      thumb.setVisible(false);
      this.genThumbs.push(thumb);
      this.genThumbKey.push('');
    }
    for (let i = 0; i < 13; i += 1) {
      this.troopLabels.push(this.makeLabel('', 0, 0, CELL_W, 16, COLORS.textDim, 'center'));
      this.troopLockLabels.push(this.makeLabel('', 0, 0, 40, 12, COLORS.textFaint, 'right'));
    }
    for (let i = 0; i < 9; i += 1) {
      this.formLabels.push(this.makeLabel('', 0, 0, CELL_W, 16, COLORS.textDim, 'center'));
      this.formLockLabels.push(this.makeLabel('', 0, 0, 40, 12, COLORS.textFaint, 'right'));
    }
    for (let i = 0; i < WISE_MAX; i += 1) {
      this.wiseLabels.push(this.makeLabel('', 0, 0, WISE_W - 8, 15, COLORS.textDim, 'center'));
    }
    for (let i = 0; i < 3; i += 1) {
      this.quickLabels.push(this.makeLabel('', 0, 0, 190, 17, COLORS.textDim, 'center'));
    }
    for (let i = 0; i < 2; i += 1) {
      this.actionLabels.push(this.makeLabel('', 0, 0, 320, 17, COLORS.text, 'center'));
    }
    // 出陣順序（R94）：5 行「序號 武將 / 兵種」；面板預設隱藏，展開時由 drawQueue() 擺位取字
    for (let i = 0; i < DEPLOY_SLOTS; i += 1) {
      this.queueLabels.push(this.makeLabel('', 0, 0, 320, 18, COLORS.text, 'left'));
      this.queueTroopLabels.push(this.makeLabel('', 0, 0, 190, 17, COLORS.textDim, 'center'));
      // F-07：每槽第二行三檔站位鈕的文字（前 / 中 / 後）
      for (let c = 0; c < COL_ORDER.length; c += 1) {
        this.queueColLabels.push(this.makeLabel('', 0, 0, 180, 15, COLORS.textDim, 'center'));
      }
    }
    this.queueTitle = this.makeLabel('出 陣 順 序', 375, 196, 520, 24, COLORS.goldLight, 'center');
    // 收起態時當窄條標題、展開態時當面板底部的說明（同一顆 Label，省一個節點）
    this.queueHint = this.makeLabel('', 375, 1300, 700, 15, COLORS.textDim, 'center');
    this.queueClose = this.makeLabel('確 定', 375, 830, 270, 22, COLORS.goldLight, 'center');

    // 出陣順序面板独立成一层（最后添加 → 永远在最上层）：胶暗底 + 面板 + 自己的 Label 都在这层里，
    // 不再被主界面的九宫格底板 / 选中框盖住。
    const queueLayer = new Node('QueueLayer');
    const qTransform = queueLayer.addComponent(UITransform);
    qTransform.setContentSize(DESIGN_W, DESIGN_H);
    this.queueGfx = queueLayer.addComponent(Graphics);
    this.node.addChild(queueLayer);
    const queueNodes: (Label | null)[] = [
      this.queueTitle,
      this.queueHint,
      this.queueClose,
      ...this.queueLabels,
      ...this.queueTroopLabels,
      ...this.queueColLabels,
    ];
    for (const label of queueNodes) {
      if (label) label.node.setParent(queueLayer);
    }
    queueLayer.active = false;
    this.queueLayer = queueLayer;

    // 最後一步：所有 Label 都建好了，統一上文字層級
    this.applyRoles();
  }

  protected async start(): Promise<void> {
    try {
      this.labelHint!.string = '載入劇本與武將…';
      const data = await loadGameData();
      this.data = data;
      // [P0-2] 劇本號取執行期來源（CampaignRoot.start() 同一支 `RunSetup.scenarioIndex()`）；
      // 舊碼恆取 `scenarios[0]`，《討伐董卓》等劇本會讀到第 1 劇本的城市與守軍。
      this.scenIdx = runScenarioIndex();
      const scenario = (data.scenarios[this.scenIdx] ?? data.scenarios[0]) as unknown as CampaignScenario | undefined;
      if (!scenario || !Array.isArray(scenario.cities)) {
        throw new Error(`scenarios[${this.scenIdx}].cities 為空，請確認 bundles/res/data/scenarios.json`);
      }
      const targetName = GameState.takeDeployTarget() ?? scenario.cities[0]?.NAME ?? '南皮';
      this.targetCity =
        scenario.cities.find((city) => city.NAME === targetName) ??
        ({ NAME: targetName, POPULATION: 200000, DEFENSE: 300, pos_xy: [0, 0] } satisfies CampaignCity);
      // 守軍總數：garrison.json 優先（與 web deploy.html 的 `garrison` 同口徑）
      this.garrison = cityGarrisonTroops(data, this.scenIdx, this.targetCity.NAME);

      // 敵情由大地圖發起時算好（出征 = 城裏的守將；守城戰 = 來襲部隊的主將）。
      // 直接打開 Deploy 場景（沒人 setDeployEnemy）時退化成現算，空城會得到「守備隊」。
      this.defenseArmyId = GameState.takeDeployArmy();
      const passed = GameState.takeDeployEnemy();
      if (this.defenseArmyId) {
        const army = GameState.armies().find((item) => item.id === this.defenseArmyId);
        if (army) {
          this.defenseFrom = army.from;
          // 守城戰的「敵軍 N 兵」用的是來襲部隊人數（不是本城守軍）
          this.garrison = Math.max(1, army.troops);
        }
      }
      this.intel = passed
        ? {
            name: passed.name,
            str: passed.str,
            int: passed.int,
            troops: passed.troops,
            defense: passed.defense,
            owner: passed.owner,
            officers: [],
            fallback: passed.fallback,
          }
        : resolveEnemyIntel(data, this.scenIdx, this.targetCity.NAME, 100);

      this.troopNames = data.troops.names;
      this.formNames = data.formations.names;
      this.troopMatrix = data.troops.matrix as unknown as MatrixRow[];
      this.formMatrix = data.formations.matrix as unknown as MatrixRow[];

      const save = GameState.loadSave();
      // [R231] 攻城戰前準備：CampaignRoot.startArrivalSiege() 會先把「剛抵達的兵團」
      // 寫成快照再進本屏。非空時本屏改成戰前準備（參戰=這支兵團，不能換將/改兵）。
      this.siege = GameState.peekDeploySiege();
      // F-07：進來先讀站位（與 web 共用 COL_KEY；沒存過 → 全部按中列）
      this.loadCols();
      const from = GameState.takeDeployFrom();
      // 与 web 的 `HOME = qs.from || save.owned[0] || target` 一致
      this.home = from ?? save.owned[0] ?? targetName;

      const rows = data.generals as unknown as GeneralRow[];
      // [Bug A] 主将/将列一律来自**出發城**（this.home）的存檔運行時人事：
      // 運行時 roster（`OfficersOfCity`，與物品頁/內政頁同一入口）→ 分劇本城市表 →
      // garrison.json 的出發城出戰名單。舊碼用 generals.json 靜態 `CITY` 過濾（第 1 劇本快照），
      // 守方武將會被當成我方候選；`owned` 那條 fallback 還可能混進黃巾之亂的將。
      const byName = new Map<string, GeneralRow>();
      for (const gen of rows) {
        if (gen.NAME && gen.NAME !== '盜賊') byName.set(gen.NAME, gen);
      }
      const ctx: O.OfficersCtx = {
        generals: data.generals,
        scenIdx: this.scenIdx,
        // `CampaignSave` 型別沒列 roster（`GameState.normalize()` 的白名單外鍵），實際存檔有
        roster: O.mergeRosters((save as unknown as { roster?: unknown }).roster),
        playerForce: runPlayerForce(),
        scenarioCities: scenario.cities,
      };
      let homeRows: GeneralRow[] = [];
      try {
        homeRows = O.officerNamesOfCity(save, this.home, ctx)
          .map((name) => byName.get(name))
          .filter((gen): gen is GeneralRow => !!gen);
      } catch (err) {
        console.warn('[DeployRoot] 出發城運行時人事讀取失敗，退回劇本表', err);
      }
      if (homeRows.length === 0) {
        // 存檔還沒有人事紀錄（例如直接開 Deploy 場景）：用「分劇本城市表」過濾出發城
        homeRows = rows.filter(
          (gen) =>
            gen.NAME !== '盜賊' &&
            timeAt(gen.city_by_times, this.scenIdx) === this.home &&
            timeAt(gen.status_by_times, this.scenIdx) !== '未',
        );
      }
      if (homeRows.length === 0) {
        // 最後才退 garrison.json（同一劇本、同一座出發城）的出戰名單
        const homeTable = garrisonOf(data, this.scenIdx, this.home);
        homeRows = (homeTable?.officers ?? [])
          .map((officer) => byName.get(officer.name))
          .filter((gen): gen is GeneralRow => !!gen);
      }
      const anyGeneral = rows.filter((gen) => gen.NAME !== '盜賊');
      const major = this.majorOf(data, save, ctx);
      // 在外部隊的武將不再進候選（原作：出征的武將不在出發城守城；空城是被允許的）
      // R232c：不能只看 `GameState.armies()`——抵達城下的兵團已被 `removeArmy()` 移出 `save.armies`，
      // 只留在 `save.siege` 快照裡；只看 armies 會讓「派往 A 的將」在攻打 B 時重新出現在候選池
      // （使用者實測：第二支隊伍編成界面出現第一支的武將）。統一走 `O.awayNameSet()`（save.away ∪ armies ∪ siege）。
      const away = O.awayNameSet(save);
      const pool = (homeRows.length > 0 ? homeRows : anyGeneral)
        .filter((gen) => !away.has(gen.NAME))
        .slice()
        .sort((a, b) => {
          // 太守优先，其次 STR+INT（web deploy.html 的 officersOf 排序）
          const aMajor = a.NAME === major ? 1 : 0;
          const bMajor = b.NAME === major ? 1 : 0;
          if (aMajor !== bMajor) return bMajor - aMajor;
          return b.STR + b.INT - (a.STR + a.INT);
        })
        .slice(0, 12);
      this.generals = pool;
      this.selectedGen = 0;
      // [R237] 攻城戰前準備的鎖人要**先於**出陣隊列/存檔隊列套用：
      // 舊碼把 `applySiegeRoster()` 放在整個隊列邏輯之後，一旦中間任何一步拋錯（catch 只寫提示），
      // 就會留下「generals=出發城候選池 + queue=存檔隊列」的狀態 ⇒ 戰前準備屏顯示的不是抵達兵團，
      // 而是城裡 5 個將（製作人截圖：攻城編成卻列 關羽/劉備/簡雍/張飛/管輅）。
      if (this.siege) this.applySiegeRoster(byName);
      // R94：出陣隊列。存檔有 `deployQueue` 就照它（含順序/兵種）；舊檔沒有就按「當前候選 5 將」
      // 即時生成（queueOf 不寫檔）。誰坐第 1 槽＝誰是主將：
      //  · 存過隊列 → 用存檔的第 1 槽（玩家調過的順序不能被「候選第一人」頂回去）
      //  · 沒存過   → 用當前選中的候選第一位
      const stored = hasQueue(save as unknown as DeployQueueSave);
      // 沒存過隊列時只預選主將（原作是玩家自己勾選隨軍；不再自動塞滿 5 人）
      this.queue = queueOf(save as unknown as DeployQueueSave, pool.slice(0, 1).map((g) => g.NAME));
      if (!this.siege && stored && this.queue[0]) {
        const head = this.queue[0]!.general;
        const index = pool.findIndex((g) => g.NAME === head);
        if (index >= 0) this.selectedGen = index;
        const troopIndex = TROOP_CHARS.indexOf(this.queue[0]!.troop);
        if (troopIndex >= 0) this.troop = troopIndex;
        // 存檔只記總數（`deployQueue` 第 1 槽 `troops`）：按該將等級的兩欄上限拆回步/騎，
        // 與 web `deploy.html` 的 `rerollCaps()` 同一個口徑（`core/levels.ts` 的 `troopColumnsOf()`）。
        this.totalToColumns(clamp(this.queue[0]!.troops, 1, 100));
      } else if (!this.siege && pool[0] && this.queue[0]?.general !== pool[0].NAME) {
        this.queue = setGeneral(this.queue, 0, pool[0].NAME);
      }
      this.loaded = true;
      // [R231] 攻城戰前準備：將在 applyGeneral 之前鎖定（主將=抵達兵團主將），
      // 兵在 applyGeneral 之後鎖定（等級上限夾完再蓋回快照兵數）。
      if (this.siege) this.applySiegeRoster(byName); // 幂等：已在上面鎖過，這裡再確保一次
      this.applyGeneral();
      if (this.siege) this.applySiegeTroops();
      this.loadPortrait();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.labelHint) this.labelHint.string = `載入失敗：${message}`;
      console.error('[DeployRoot]', err);
    }
  }

  onEnable(): void {
    input.on(Input.EventType.TOUCH_START, guardTouch(this, 'onTouchStart', 'DeployRoot'), this);
    input.on(Input.EventType.TOUCH_MOVE, guardTouch(this, 'onTouchMove', 'DeployRoot'), this);
    input.on(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'DeployRoot'), this);
  }

  onDisable(): void {
    input.off(Input.EventType.TOUCH_START, guardTouch(this, 'onTouchStart', 'DeployRoot'), this);
    input.off(Input.EventType.TOUCH_MOVE, guardTouch(this, 'onTouchMove', 'DeployRoot'), this);
    input.off(Input.EventType.TOUCH_END, guardTouch(this, 'onTouch', 'DeployRoot'), this);
  }

  // -------------------------------------------------------------------------
  // 节点
  // -------------------------------------------------------------------------

  private makeGraphics(name: string): Graphics {
    const node = new Node(name);
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
    node.setPosition(0, 0, 0);
    node.addComponent(UITransform).setContentSize(DESIGN_W, DESIGN_H);
    return node.addComponent(Graphics);
  }

  /** 编成底图 + 蒙版；两者都异步、失败即隐藏，draw() 会自动退回纯色块。 */
  private buildArt(): void {
    this.artBg = new ArtBg(this.node, 'DeployBg', { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H }, true);
    this.artBg.node.setSiblingIndex(0);
    this.artBg.load('bg/deploy_bg', () => {
      if (this.loaded) this.draw();
    });
    addVeil(
      this.node,
      'DeployVeil',
      { x: 0, y: 120, w: DESIGN_W, h: 1080 },
      new Color(8, 11, 16, 152),
    );
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
    const node = new Node(`Label_${text || 'empty'}`);
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
    // 同 CampaignRoot：left/right 的 cx 是框的边，不是框的中心。
    const centerX = align === 'left' ? cx + width / 2 : align === 'right' ? cx - width / 2 : cx;
    node.setPosition(centerX - HALF_W, HALF_H - cy, 0);
    return label;
  }

  private makeSectionLabel(text: string, cx: number, cy: number): Label {
    const label = this.makeLabel(text, cx, cy, 340, 19, COLORS.gold, 'left');
    addOutline(label, new Color(6, 8, 12, 220), 1);
    return label;
  }

  private makePortrait(): Sprite {
    const node = new Node('Portrait');
    node.parent = this.node;
    node.layer = Layers.Enum.UI_2D;
    const transform = node.addComponent(UITransform);
    transform.setContentSize(120, 150);
    node.setPosition(24 + 60 - HALF_W, HALF_H - (150 + 75), 0);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    return sprite;
  }

  // -------------------------------------------------------------------------
  // 九宮底板 + 文字層級（w5-cocos-skin）
  // -------------------------------------------------------------------------

  /** 建九宮底板層：六張分區卡、立繪框、兩顆大按鈕、滑杆軌道、四類格子底板。 */
  private buildSkin(): void {
    const layer = new Node('DeploySkin');
    layer.layer = Layers.Enum.UI_2D;
    layer.setPosition(0, 0, 0);
    const transform = layer.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(DESIGN_W, DESIGN_H);
    layer.parent = this.node;
    this.skinLayer = layer;

    for (const slot of SECTION_CARDS) {
      this.addPlateOn(layer, slot.key, slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h, slot.name);
    }
    for (const slot of FIXED_PLATES) {
      this.addPlateOn(layer, slot.key, slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h, slot.name);
    }

    // 兵力滑杆軌道（`project/170` 兩欄）：`bar_div` 的規格是「拉伸」（tile:false），
    // 橫拉到整條軌道才不糊。步兵欄左段、騎兵欄右段，中間留 60px 空隙。
    this.addPlateOn(layer, 'bar_div', SLIDER_X0, SLIDER_Y - 4, INF_SLIDER_X1 - SLIDER_X0, 8, 'SkinSliderTrack');
    this.addPlateOn(layer, 'bar_div', CAV_SLIDER_X0, SLIDER_Y - 4, SLIDER_X1 - CAV_SLIDER_X0, 8, 'SkinSliderTrackCav');

    // 格子底板：位置只由 index 决定（與 drawGenGrid/drawGrid/drawWise 完全同一套公式）
    for (let i = 0; i < GEN_PLATES; i += 1) {
      this.genPlates.push(
        this.addPlateOn(layer, 'plate_sq', GEN_X + (i % GEN_COLS) * (GEN_W + 8), GEN_Y + Math.floor(i / GEN_COLS) * (GEN_H + 8), GEN_W, GEN_H, `SkinGenPlate_${i}`),
      );
    }
    for (let i = 0; i < TROOP_PLATES; i += 1) {
      this.troopPlates.push(
        this.addPlateOn(layer, 'plate_sq', TROOP_X + (i % TROOP_COLS) * (CELL_W + 8), TROOP_Y + Math.floor(i / TROOP_COLS) * (CELL_H + 8), CELL_W, CELL_H, `SkinTroopPlate_${i}`),
      );
    }
    for (let i = 0; i < FORM_PLATES; i += 1) {
      this.formPlates.push(
        this.addPlateOn(layer, 'plate_sq', TROOP_X + (i % FORM_COLS) * (CELL_W + 8), FORM_Y + Math.floor(i / FORM_COLS) * (CELL_H + 8), CELL_W, CELL_H, `SkinFormPlate_${i}`),
      );
    }
    for (let i = 0; i < WISE_PLATES; i += 1) {
      this.wisePlates.push(
        this.addPlateOn(layer, 'plate_sq', WISE_X + (i % WISE_COLS) * (WISE_W + 8), WISE_Y + Math.floor(i / WISE_COLS) * (WISE_H + 8), WISE_W, WISE_H, `SkinWisePlate_${i}`),
      );
    }

    // 四類格子的選中疊層：只有四角裝飾，疊在格子上不會糊掉格名
    this.selGen = this.addPlateOn(layer, 'plate_sel', GEN_X, GEN_Y, GEN_W, GEN_H, 'SkinGenSelected');
    this.selTroop = this.addPlateOn(layer, 'plate_sel', TROOP_X, TROOP_Y, CELL_W, CELL_H, 'SkinTroopSelected');
    this.selForm = this.addPlateOn(layer, 'plate_sel', TROOP_X, FORM_Y, CELL_W, CELL_H, 'SkinFormSelected');
    this.selWise = this.addPlateOn(layer, 'plate_sel', WISE_X, WISE_Y, WISE_W, WISE_H, 'SkinWiseSelected');
    for (const node of [this.selGen, this.selTroop, this.selForm, this.selWise]) node.active = false;
  }

  private addPlateOn(layer: Node, key: string, x: number, y: number, w: number, h: number, name: string): Node {
    const node = makeNineSlice(layer, key, w, h);
    node.name = name;
    placeDesign(node, x, y, w, h);
    this.skinNodes.set(name, node);
    return node;
  }

  /** 數據到位後決定哪些格子有底板：沒武將/沒學/超出數量的格子不出底板（讀起來就是「空」）。 */
  private syncCellPlates(): void {
    for (let i = 0; i < this.genPlates.length; i += 1) this.genPlates[i].active = i < this.generals.length;
    for (let i = 0; i < this.troopPlates.length; i += 1) {
      this.troopPlates[i].active = i < this.troopNames.length && this.lockedTroops[i] !== true;
    }
    for (let i = 0; i < this.formPlates.length; i += 1) {
      this.formPlates[i].active = i < this.formNames.length && this.lockedForms[i] !== true;
    }
    const wiseCount = Math.min(this.wiseOptions.length, WISE_MAX);
    for (let i = 0; i < this.wisePlates.length; i += 1) this.wisePlates[i].active = i < wiseCount;
  }

  /** 把一塊 `plate_sel` 擺到第 index 格；越界就整塊隱藏。 */
  private placeSelection(node: Node | null, index: number, x0: number, y0: number, w: number, h: number, cols: number, count: number): void {
    if (!node) return;
    if (index < 0 || index >= count) {
      node.active = false;
      return;
    }
    const x = x0 + (index % cols) * (w + 8);
    const y = y0 + Math.floor(index / cols) * (h + 8);
    const transform = node.getComponent(UITransform);
    if (transform) transform.setContentSize(w, h);
    placeDesign(node, x, y, w, h);
    node.active = true;
  }

  /** 四格選中態（純外觀，與 `this.troop` / `this.form` / `this.wise` 同源，不改它們）。 */
  private placeSelections(): void {
    const wiseIndex = this.wiseOptions.slice(0, WISE_MAX).findIndex((option) => option.seq === this.wise);
    this.placeSelection(this.selGen, this.selectedGen, GEN_X, GEN_Y, GEN_W, GEN_H, GEN_COLS, this.generals.length);
    this.placeSelection(this.selTroop, this.troop, TROOP_X, TROOP_Y, CELL_W, CELL_H, TROOP_COLS, this.troopNames.length);
    this.placeSelection(this.selForm, this.form, TROOP_X, FORM_Y, CELL_W, CELL_H, FORM_COLS, this.formNames.length);
    this.placeSelection(this.selWise, wiseIndex, WISE_X, WISE_Y, WISE_W, WISE_H, WISE_COLS, Math.min(this.wiseOptions.length, WISE_MAX));
  }

  /**
   * 文字層級分配。
   *
   * 第三個參數是「版式豁免字號」：編成頁格子密集（104×52 的武將格、44 高的軍師技格），
   * 放不下 role 默認字號的地方只換描邊/投影策略、不動字號；`labelTitle` 維持 32
   * （頂欄只有 124 高，40px 會壓到 `labelTarget` 那一行）。
   */
  private applyRoles(): void {
    applyTextRole(this.labelTitle, 'title', 32);
    applyTextRole(this.labelTarget, 'body', 18);
    applyTextRole(this.labelGenName, 'head', 24);
    applyTextRole(this.labelGenStats, 'num', 18);
    applyTextRole(this.labelGenSkill, 'body', 17);
    applyTextRole(this.labelIntel, 'body', 16);
    applyTextRole(this.labelSoldier, 'num', 20);
    applyTextRole(this.labelHint, 'body', 15);
    applyTextRoles(this.genLabels, 'body', 16);
    applyTextRoles(this.troopLabels, 'body', 16);
    applyTextRoles(this.troopLockLabels, 'body', 12);
    applyTextRoles(this.formLabels, 'body', 16);
    applyTextRoles(this.formLockLabels, 'body', 12);
    applyTextRoles(this.wiseLabels, 'body', 15);
    applyTextRoles(this.quickLabels, 'num', 17);
    applyTextRoles(this.actionLabels, 'head', 18);
    // F-07 站位角標/按鈕：版式豁免字號（格子只有 52 高、面板一行要塞三檔）
    applyTextRoles(this.genColLabels, 'badge', 12);
    applyTextRoles(this.mainColLabels, 'body', 15);
    applyTextRoles(this.queueColLabels, 'body', 15);
  }

  private fillRect(g: Graphics, x: number, y: number, w: number, h: number, color: string, alpha = 255): void {
    g.fillColor = rgba(color, alpha);
    g.rect(x - HALF_W, HALF_H - y - h, w, h);
    g.fill();
  }

  /** 漸層近似（w5-render）：把設計座標色帶交給本頁的 fillRect */
  private paintBands(g: Graphics, bands: Band[]): void {
    for (let i = 0; i < bands.length; i += 1) {
      const band = bands[i];
      this.fillRect(g, band.x, band.y, band.w, band.h, band.color, band.alpha);
    }
  }

  /**
   * 面板級的二維色域（w7-cocos-render3）。
   * web 的 `.sec` / `.it` 是 `linear-gradient(180deg,…)` 再疊一層 `inset box-shadow`——
   * 一個方向走明度、另一個方向走暖度，兩個方向乘起來才是它那個灰階厚度。
   * `Draw.lightGrid` 的每一格只差 1 個 8bit 單位，肉眼讀成平滑漸層（不會有棋盤感），
   * 但色數是 cols×rows 的乘積。**每格至少留 20×12 設計像素**（半分辨率下 ≈10×6=60 像素，
   * 遠高於「出現次數 ≥8」的門檻），所以下面所有 cols/rows 都按面積配，不亂給。
   * `gDown` 是 G 通道自上而下的下沉量；`rows` 比它大時自動加大，避免行與行撞成同一個 RGB。
   */
  private areaGrid(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    cols: number,
    rows: number,
    base: string,
    gDown: number,
    alpha = 255,
    rMax = 7,
    bMax = 5,
  ): void {
    // G 下沉量夾到 13：原本夾 10 是為了躲洋紅（(27,6,29) 那次，見 project\161 §5-A），
    // 但那是 base 帶藍（#232B35，B=53）又只沉 G 的結果。現在 base 是中性暖灰（B=27），
    // 而且 B 跟著往下沉（bMax），R 只往上走，最深的一格仍是 (42,18,20) 這種暖褐，
    // 不會回到洋紅那一側；夾 13 讓出 14 級 G 給列方向，色數才撐得起來。
    const span = Math.min(13, Math.max(3, Math.round(Math.abs(gDown) || 10)));
    // 列方向不走斜坡：斜坡要撐 16 列就得 R +17 / B -8，整片面板會漂成棕紫（踩過兩次）。
    // 改走 Draw.gridWeave 的「蛇形小振幅」——段與段反向回捲，相鄰列永遠只差 1 級，
    // 沒有 gridShade 那種「每 8 列掉回 0」的接縫（750 寬截圖上是一道 96px 的豎線）。
    // 色數不變：(rMax+1)×(bMax+1) 個欄組合的 (R,B) 仍然互異，只是排列改成蛇形。
    // 欄上限放到 63：一個 704 寬的卡片切 63 欄時每格 11.2 設計像素（半分辨率 5.6×3.7
    // ≈20 像素），仍遠高於「出現次數 ≥8」，但欄組合從 28 個撐到 63 個（9×7），
    // 一張卡片自己的色數就從 28×2×11=616 變成 63×2×14=1764。
    const c = Math.max(1, Math.min(Math.round(cols), 63));
    this.paintBands(g, gridWeave({ x, y, w, h }, c, rows, base, rMax, -span, bMax, alpha));
  }

  /** 格子底：拿 top/bottom 兩個色算出 G 下沉量，其餘交給 areaGrid。 */
  private cellGrid(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    top: string,
    bottom: string,
    cols = 6,
    rows = 8,
    alpha = 255,
  ): void {
    const gTop = parseInt(top.slice(2, 4), 16);
    const gBottom = parseInt(bottom.slice(2, 4), 16);
    if (!Number.isFinite(gTop) || !Number.isFinite(gBottom)) {
      this.paintBands(g, vBands(x, y, w, h, top, bottom, 8, alpha, alpha));
      return;
    }
    this.areaGrid(g, x, y, w, h, cols, rows, top, gTop - gBottom, alpha);
  }

  private strokeRect(g: Graphics, x: number, y: number, w: number, h: number, color: string, width = 2): void {
    g.strokeColor = rgba(color);
    g.lineWidth = width;
    g.rect(x - HALF_W, HALF_H - y - h, w, h);
    g.stroke();
  }

  // -------------------------------------------------------------------------
  // 数据
  // -------------------------------------------------------------------------

  private currentGen(): CampaignGeneral | null {
    return this.generals[this.selectedGen] ?? null;
  }

  /** 等级：`General.level` 数据表里没有（generals.json 无 level 欄位），走分劇本起始等級表。 */
  private levelOf(gen: CampaignGeneral | null): number {
    const raw = gen ? (gen as CampaignGeneral & { level?: number }).level : undefined;
    const own = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    // R85：没有显式 level 时不要一律给 20，而是取**当前剧本的起始等级**
    // （Lv2/2/4/6/8，见 ScenarioLevels.ts 与 project/136）；表没载入才退回 2。
    const fallback = scenarioLevelOf(gen?.NAME ?? '', 2);
    return clamp(own > 0 ? own : fallback, 1, 99);
  }

  /**
   * **出發城**（`this.home`）的太守，不是目標城：web `deploy.html` 的主将候选同样是
   * 「出發城太守優先」。舊碼讀 `this.targetCity`（目標/守方）：從平原打樂陵時太守永遠是
   * 空串，主将就被 STR+INT 排序帶成關羽（更舊的版本甚至帶出黃巾之亂的張角那一列）。
   *
   * 來源順序：存檔運行時 `major`（`cityMajorNameOf`）→ 劇本表 `MAJOR` → garrison.json 出發城列。
   */
  private majorOf(data: GameData, save: unknown, ctx: O.OfficersCtx): string {
    try {
      const runtime = O.cityMajorNameOf(save, this.home, ctx);
      if (runtime) return runtime;
    } catch (err) {
      console.warn('[DeployRoot] 出發城太守讀取失敗，退回劇本表', err);
    }
    try {
      // 太守只有 garrison.json 里有；缺表时为空串，排序自然退回 STR+INT。
      const table = (data as GarrisonData).garrison;
      const list = Array.isArray(table) ? table : [];
      const scenario = list.find((row) => row && (row as { scenario?: number }).scenario === this.scenIdx) as
        | { cities?: Record<string, { major?: string }> }
        | undefined;
      const city = scenario?.cities?.[this.home];
      return typeof city?.major === 'string' ? city.major : '';
    } catch {
      return '';
    }
  }

  /** 换将/首次进屏：重算白名单、兵力上限、军师技候选、敵情。 */
  private applyGeneral(): void {
    const gen = this.currentGen();
    const data = this.data;
    if (!gen || !data) {
      this.lockedTroops = new Array(13).fill(false);
      this.lockedForms = new Array(9).fill(false);
      this.refresh();
      return;
    }

    const troops = troopsOf(gen);
    const forms = formationsOf(gen);
    const troopCount = this.troopNames.length || 13;
    const formCount = this.formNames.length || 9;
    this.lockedTroops = Array.from({ length: troopCount }, (_, i) => (troops.length > 0 ? !troops.includes(i) : false));
    this.lockedForms = Array.from({ length: formCount }, (_, i) => (forms.length > 0 ? !forms.includes(i) : false));

    // 初始选择：优先该将的默认兵种/阵形，被锁则退到第一个可用的
    if (this.lockedTroops[this.troop]) {
      this.troop = troops.length > 0 ? troops[0] : 0;
    }
    if (this.lockedForms[this.form]) this.form = forms.length > 0 ? forms[0] : 0;
    if (this.troop === 0 && troops.length > 0) this.troop = defaultTroopOf(gen);
    if (this.form === 0 && forms.length > 0) this.form = defaultFormationOf(gen);
    if (this.lockedTroops[this.troop]) this.troop = troops[0] ?? 0;
    if (this.lockedForms[this.form]) this.form = forms[0] ?? 0;

    const level = this.levelOf(gen);
    // 兩欄上限各管一欄（`project/170`）：步兵欄 `troopCapOf()` + 騎兵欄 `cavalryCapOf()`，
    // 上陣總數是兩欄之和 —— 不再用「騎兵算在帶兵數裡」的舊口徑（那會讓 20 級以下騎兵恆 0）。
    const cols = troopColumnsOf(level);
    this.soldierCap = cols.inf;
    this.cavalryCap = cols.cav;
    this.soldiers = clamp(this.soldiers, 1, this.soldierCap);
    this.cavalry = clamp(this.cavalry, 0, this.cavalryCap);

    // 军师技：web 用 `{...gen, level}` 调 listWisdomChoices，这里给一份同形的副本
    const leveled = { ...gen, level } as CampaignGeneral;
    const seqs = listWisdomChoices(data, leveled);
    const names = new Map<number, string>();
    for (const row of data.wises) names.set(row.SEQUENCE, row.NAME);
    this.wiseOptions = [{ seq: null, name: '不 用', hint: '不發動軍師技', dim: false }];
    for (const seq of seqs) {
      if (this.wiseOptions.length >= WISE_MAX) break;
      this.wiseOptions.push({
        seq,
        name: names.get(seq) ?? `技 ${seq}`,
        hint: wiseHintOf(seq) ?? '效果未實作（可選，戰鬥中不生效）',
        dim: WISE_UNIMPLEMENTED.includes(seq) || wiseHintOf(seq) === null,
      });
    }
    if (this.wise !== null && !seqs.includes(this.wise)) this.wise = null;

    // 敵情已在大地圖算好；直接開場（沒人傳）才現算。兩個分支都走 EnemyIntel，
    // 保證「空城 → 守備隊（武/智由城防折算）」而不是「守將 武 0 / 智 0」。
    if (!this.intel) {
      this.intel = resolveEnemyIntel(data, this.scenIdx, this.targetCity?.NAME ?? '南皮', 100);
    }
    // [R231] 攻城戰前準備進入的畫面没有「出征」：參戰兵團已定，標題用「攻城編成」
    if (this.labelTitle) {
      this.labelTitle.string = this.siege ? '攻 城 編 成' : this.defenseArmyId ? '守 城 戰' : '出 征 編 成';
    }

    this.refresh();
  }

  /**
   * 總兵力 → 步/騎兩欄（原作 `unit+0x5C` ← `unit+0x58`，`project/168` §4）。
   *
   * 存檔只記總數：超過步兵欄上限的部分算騎兵，再被騎兵欄上限 `cavalryCapOf()` 夾一次；
   * 步 = 總數 − 騎。Web `deploy.html` 的 `rerollCaps()` 是同一個算法，兩端必須同值。
   */
  private totalToColumns(total: number): void {
    const cols = troopColumnsOf(this.levelOf(this.currentGen()));
    this.soldierCap = cols.inf;
    this.cavalryCap = cols.cav;
    this.cavalry = clamp(total - cols.inf, 0, cols.cav);
    this.soldiers = clamp(total - this.cavalry, 1, cols.inf);
  }

  private enemyTroop(): number {
    return this.troopNames.includes('黃巾') ? this.troopNames.indexOf('黃巾') : 10;
  }

  private enemyForm(): number {
    return this.formNames.includes('雁形') ? this.formNames.indexOf('雁形') : 3;
  }

  /**
   * 本場敵軍兵力——**出征屏與戰場唯一的出口**（原作口徑見 project/53_数据与配额.md §1）。
   *
   * 上場的兵是「守將帶的兵」（`unit+0x58` 帶兵數 + 騎兵數，`battleSetup` 的 `enemyTroops`），
   * 不是城內預備兵池（`city+0x82/+0x86`，就是 `garrison.json` 那份 `this.garrison`）。
   * 之前 `:558`/`:584` 顯示 `garrison`（110/145 這種城內總數），loadout 卻用 `intel.troops`
   * （本城 60 = 空城按「我軍六成」折出來的守備隊），兩個數根本不是一回事，於是
   * 「出征屏寫 145 兵、戰場上只有 60 兵」。
   *
   * 現在顯示與 loadout 共用這一個函數：`clamp(round(intel.troops), 1, 200)`
   * （200 = `battleSetup` 的 100 步 + 100 騎上限）。本城數值仍是 60，**零平衡變化**。
   */
  private enemySoldiers(): number {
    // 關卡（易京/官渡/赤壁…）：關上沒有武將，守軍就是 `garrison.json` 的 `garrison`
    // （12 座關實測 110，`POPULATION=0` 沒有第二個來源）。**不能**走 `intel.troops`：
    // EnemyIntel 把守軍按 /6 折算再夾到 [60,100]（110/6=18 → 60），於是出征列表寫 110 兵、
    // 戰場上只有 60 兵。這裡與 web deploy.html 的 `?bsoldiers=` 同口徑（project/163 §3）。
    if (this.targetCity && !this.defenseArmyId && isGate(this.targetCity)) {
      return Math.max(1, Math.min(200, Math.round(this.garrison)));
    }
    const troops = this.intel?.troops;
    const n = Number.isFinite(troops) ? Math.round(troops as number) : Math.round(this.garrison / 6);
    return Math.max(1, Math.min(200, n));
  }

  private refresh(): void {
    if (!this.loaded || !this.labelTarget) return;
    const gen = this.currentGen();
    const intel = this.intel;
    const enemyName = intel?.name ?? '守備隊';
    const defending = !!this.defenseArmyId;
    if (this.siege) {
      // [R231] 攻城戰前準備：標籤寫清楚「這支兵團是抵達城下的那支」，不是從城裡重新派兵
      this.labelTarget.string =
        `攻 城 ${this.targetCity?.NAME ?? '—'} · ${this.siege.general || '我軍'} ` +
        `${this.siege.troops} 兵 自 ${this.siege.from} 抵達 · 敵 ${this.enemySoldiers()} 兵`;
    } else {
      this.labelTarget.string = defending
        ? `守 城 ${this.targetCity?.NAME ?? '—'} · 敵軍自 ${this.defenseFrom || '—'} 來襲 · 敵軍 ${this.enemySoldiers()} 兵`
        // 兩個數字本來就不同，標籤必須分開（與 web `deploy.html:158` 同口徑，project/163）：
        //   守軍 = 城內總兵（`cityGarrisonTroops()`，關卡就是 garrison.json 的 110）
        //   上陣 = 這一仗敵方真的出場的兵（`enemySoldiers()`，loadout 的同一個出口）
        // 舊版只寫「守軍 ${enemySoldiers()} 兵」＝把上陣兵貼上守軍標籤，關卡上會讀成「守軍 60」而清單寫 110。
        : `目標 ${this.targetCity?.NAME ?? '—'} · 從 ${this.home || '—'} 出征 · ` +
          `守軍 ${Math.max(0, Math.round(this.garrison))} 兵 · 上陣 ${this.enemySoldiers()} 兵`;
    }
    if (this.labelGenName) this.labelGenName.string = gen?.NAME ?? '—（無可用主將）';
    if (this.labelGenStats) {
      this.labelGenStats.string = gen
        ? `武力 ${gen.STR} · 智力 ${gen.INT} · 節操 ${gen.CONSTANCY ?? '—'} · 等級 ${this.levelOf(gen)}`
        : '請先在大地圖取得城池';
    }
    if (this.labelGenSkill) {
      const wiseCount = Math.max(0, this.wiseOptions.length - 1);
      this.labelGenSkill.string = gen ? `必殺 ${countList(gen.SKILL)} · 軍師技 ${wiseCount}` : '';
    }

    const troopLabel = this.troopNames[this.troop] ?? '?';
    const formLabel = this.formNames[this.form] ?? '?';
    const enemyTroop = this.enemyTroop();
    const enemyForm = this.enemyForm();
    const tb = bonus(this.troopMatrix, this.troop, enemyTroop) - bonus(this.troopMatrix, enemyTroop, this.troop);
    const fb = bonus(this.formMatrix, this.form, enemyForm) - bonus(this.formMatrix, enemyForm, this.form);
    const net = tb + fb;
    const sign = (value: number): string => (value > 0 ? `+${value}` : String(value));

    if (this.labelIntel) {
      // 顯示的兵力跟 loadout 同一個出口（enemySoldiers），出征前就知道戰場上會遇到幾個兵
      const troops = this.enemySoldiers();
      // 交付验收要求这行同时给出「将名 + 武/智 + 兵力」，且空城不能是「守將 0/0」
      // 關卡（易京/官渡/赤壁…）：garrison.json 的 officers 是空的 ⇒ 沒有守將，寫「武 0 / 智 0」是假數據；
      // 與 web `deploy.html` 的「守將 無（關卡：…）」同口徑（project/163 §3）。
      const gateHere = !!this.targetCity && !this.defenseArmyId && isGate(this.targetCity);
      const head = defending
        ? `敵 將 ${enemyName}（武 ${intel?.str ?? 0} / 智 ${intel?.int ?? 0}）· 敵軍 ${troops} 兵`
        : gateHere
          ? `守 將 無（此關卡未配置守將）· 守軍 ${troops} 兵`
          : `敵 將 ${enemyName}（武 ${intel?.str ?? 0} / 智 ${intel?.int ?? 0}）· 守軍 ${troops} 兵`;
      const note = intel?.fallback && !gateHere ? ' · 無守將（守備隊·城防折算）' : '';
      this.labelIntel.string =
        `${head}\n` +
        `敵 ${this.troopNames[enemyTroop] ?? '?'}·${this.formNames[enemyForm] ?? '?'} · ` +
        `我 ${troopLabel}·${formLabel} · 相剋 ${sign(net)}${note}`;
    }
    if (this.labelSoldier) {
      // 兩欄相加：步 + 騎 = 上陣總數（原作 `unit+0x5C`），與 web `deploy.html` 的 `#numtotal` 同一句
      this.labelSoldier.string =
        `步 ${this.soldiers}/${this.soldierCap} · 騎 ${this.cavalry}/${this.cavalryCap} = ${this.soldiers + this.cavalry} 兵`;
      this.labelSoldier.color = rgba(COLORS.goldLight);
    }
    if (this.labelHint) {
      const selected = this.wiseOptions.find((option) => option.seq === this.wise);
      const base = selected && selected.seq !== null
        ? `軍師技「${selected.name}」：${selected.hint}`
        // 起始等級按劇本 BaseEXP 反推（184 是 Lv2 → 上限 10），寫死「20 → 100」是舊版的假數字
        : `未學的兵種/陣形置灰不可選；等級 ${gen ? this.levelOf(gen) : '—'} → 兵力上限 ${this.soldierCap} 步 + ${this.cavalryCap} 騎（兩欄相加）。`;
      this.labelHint.string = this.hintText || base;
    }
    this.draw();
  }

  // -------------------------------------------------------------------------
  // 绘制
  // -------------------------------------------------------------------------

  private draw(): void {
    const base = this.gBase;
    const ui = this.gUi;
    if (!base || !ui) return;
    // 第 1 槽永遠跟隨主將區（主將 / 兵種 / 兵力），調序面板與上半屏不會各說一套
    this.syncQueueFromUi();
    base.clear();
    ui.clear();

    // 底图模式：内容带留给 bg/deploy_bg（蒙版已压暗），Graphics 只压半透明的顶栏/底栏
    if (this.artBg?.state === 'ready') {
      // 頂/底壓條改成縱向漸層（w5-render）：web 的頁頭是 linear-gradient(180deg,#0b0e13,transparent)。
      // 色值照 web_deploy.png 採樣（頁頭 lum≈35、底欄 lum≈34）提亮一檔，段數 12 避免階梯。
      // w7-cocos-render3：同樣換成二維色域（web 頁頭還有一層 radial 暖光，橫向也會變色）
      this.areaGrid(base, 0, 0, DESIGN_W, 124, 63, 11, '#2A241C', 16, 214, 8, 6);
      this.areaGrid(base, 0, 1194, DESIGN_W, 140, 63, 12, '#2B2D2B', 14, 236, 8, 6);
    } else {
      this.paintBands(base, vBands(0, 0, DESIGN_W, DESIGN_H, '#171B21', '#1E160E', 20, 255, 255));
      this.paintBands(base, vBands(0, 0, DESIGN_W, 124, '#2A241C', '#14100B', 12, 255, 255));
      this.fillRect(base, 0, 124, DESIGN_W, 1170, COLORS.bg, 0);
      this.paintBands(base, vBands(0, 1194, DESIGN_W, 140, '#23282A', '#101317', 12, 255, 255));
    }
    this.fillRect(base, 0, 123, DESIGN_W, 1, COLORS.line);
    this.fillRect(base, 0, 125, DESIGN_W, 1, COLORS.gold, 40);
    // w7-cocos-render2：頁頭頂端高光條 + 四周內陰影、底欄頂緣內陰影（web 的 inset box-shadow）
    this.paintBands(base, vBands(0, 0, DESIGN_W, 7, '#5E4C2C', '#2A241C', 4, 132, 58));
    this.paintBands(base, edgeBands({ x: 0, y: 0, w: DESIGN_W, h: 124 }, '#000000', 140, 20, 3));
    this.paintBands(base, vBands(0, 1194, DESIGN_W, 10, '#000000', '#2B2D2B', 5, 120, 0));

    // 立绘底板
    // 立绘底板（w7-cocos-render3：4×4 二維色域，立繪 Sprite 疊在上面）
    this.areaGrid(ui, 24, 150, 120, 150, 5, 11, '#201A14', 13, 250);
    this.strokeRect(ui, 24, 150, 120, 150, COLORS.line, 1);
    this.fillRect(ui, 25, 151, 118, 1, COLORS.gold, 46);

    // 卡片內的光影（w7-cocos-render2）：六張九宮卡片本來是一整塊純色，格與格之間的
    // gutter 沒有任何深淺變化，整頁讀成「貼紙」。補一層極淡的縱向明暗（上白下黑，
    // alpha 9→24，八段）＋上緣金高光＋下緣黑壓邊，把 16px 的卡片內距做出厚度；
    // 一切都在既有矩形裡面畫，不動任何 layout。
    // w7-cocos-render3：那層 8 段縱向在 dpr 之後同樣被平均掉（每段 1 像素），
    // 改成二維色域：718 寬一律切 28 欄（每格 25.6 設計像素），列數按卡片高度配，
    // 每格約 25.6×14 → 半分辨率下 ≈13×7＝91 像素，色數是乘積不是加法。
    // 卡片自己的九宮金框仍露在內縮 7px 之外，所以讀起來還是「面板」而非色塊。
    const CARD_ROWS: readonly number[] = [20, 16, 22, 16, 14, 14];
    SECTION_CARDS.forEach((card, cardIndex) => {
      const r = card.rect;
      const rows = CARD_ROWS[cardIndex] ?? 8;
      // 63 欄（每格 11.2 設計像素）＋ rMax 8 / bMax 6：欄組合 9×7=63、列 14 級 G，
      // 一張卡 63×2×14=1764 色；六張卡共用同一組 base，所以這是整頁共用的上限。
      this.areaGrid(ui, r.x + 7, r.y + 9, r.w - 14, r.h - 18, 63, rows, '#221F1B', 16, 232, 8, 6);
      this.paintBands(ui, topSheen(r.x + 8, r.y + 3, r.w - 16, '#F2DCA8', 26));
      this.paintBands(ui, topSheen(r.x + 8, r.y + r.h - 3, r.w - 16, '#000000', 70));
    });

    this.buttons = [];
    this.drawMainCols(ui);
    this.drawGenGrid(ui);
    this.drawGrid(ui, 'troop', this.troopLabels, this.troopLockLabels, this.lockedTroops, this.troopNames, TROOP_COLS, TROOP_X, TROOP_Y, this.troop);
    this.drawGrid(ui, 'form', this.formLabels, this.formLockLabels, this.lockedForms, this.formNames, FORM_COLS, TROOP_X, FORM_Y, this.form);
    this.drawWise(ui);
    this.drawSliders(ui);
    this.drawQuick(ui);
    this.drawFooter(ui);
    this.drawQueue(ui);

    // 九宮底板：先按數據隱藏空格，再把選中態擺到剛畫好的格子上
    this.syncCellPlates();
    this.placeSelections();
  }

  /**
   * 主將區右上角的三檔站位鈕（F-07）。與武將卡角標 / 出陣順序面板共用同一份 `COL_KEY`：
   * 主將就是隊列第 1 槽，這裡改完 `colOf()` 立刻反映到角標與出征 payload。
   */
  private drawMainCols(g: Graphics): void {
    const gen = this.currentGen();
    const current = gen ? this.colOf(gen.NAME) : 'mid';
    COL_ORDER.forEach((col, index) => {
      // 主將卡（y136-302）右上角：姓名行右端之外、屬性行之上，70 寬的三連鈕
      const x = 498 + index * 78;
      const y = 138;
      const on = col === current;
      this.cellGrid(g, x, y, 70, 30, on ? '#4A3A20' : '#22282F', on ? '#1D1509' : '#171C22', 5, 5, on ? 244 : 200);
      if (on) this.paintBands(g, topSheen(x + 1, y + 1, 68, '#FBEBBE', 56));
      this.strokeRect(g, x, y, 70, 30, on ? COLORS.gold : COLORS.line, on ? 2 : 1);
      const label = this.mainColLabels[index];
      if (label) {
        label.string = COL_LABEL[col];
        label.color = rgba(on ? COLORS.goldLight : COLORS.textDim);
        label.node.setPosition(x + 35 - HALF_W, HALF_H - (y + 15), 0);
      }
      this.buttons.push({ kind: 'mcol', index, x, y, w: 70, h: 30 });
    });
  }

  private drawGenGrid(g: Graphics): void {
    this.generals.forEach((gen, index) => {
      const col = index % GEN_COLS;
      const row = Math.floor(index / GEN_COLS);
      const x = GEN_X + col * (GEN_W + 8);
      const y = GEN_Y + row * (GEN_H + 8);
      const headName = this.queue[0]?.general;
      const inQueue = this.queue.some((slot) => slot.general === gen.NAME);
      const selected = headName ? headName === gen.NAME : index === this.selectedGen;
      // w7-cocos-render3：3×2 二維色域（104×52 的格子每格約 34×26 設計像素）
      this.cellGrid(g, x, y, GEN_W, GEN_H, selected ? '#4A3A20' : '#22282F', selected ? '#1D1509' : '#171C22', 6, 12, selected ? 244 : 214);
      this.paintBands(g, topSheen(x + 1, y + 1, GEN_W - 2, selected ? '#FBEBBE' : '#9FB4CC', selected ? 60 : 22));
      // w7-cocos-render2：格內四邊暗角 + 底緣一道黑線，讓金屬片有厚度
      this.paintBands(g, edgeBands({ x, y, w: GEN_W, h: GEN_H }, '#000000', 70, 5, 2));
      this.paintBands(g, topSheen(x + 2, y + GEN_H - 2, GEN_W - 4, '#000000', 80));
      // 已勾選隨軍：右上角勾選框（原作勾選框口徑），主將（第 1 槽）金框更亮
      const boxX = x + GEN_W - 17;
      const boxY = y + 3;
      this.fillRect(g, boxX, boxY, 14, 14, inQueue ? COLORS.gold : '#12161B', inQueue ? 235 : 180);
      this.strokeRect(g, boxX, boxY, 14, 14, inQueue ? COLORS.goldLight : COLORS.line, 1);
      const pickLabel = this.pickLabels[index];
      if (pickLabel) {
        pickLabel.string = inQueue ? '✓' : '';
        pickLabel.color = rgba(COLORS.bgDeep);
        pickLabel.node.setPosition(boxX + 7 - HALF_W, HALF_H - (boxY + 7), 0);
      }
      this.strokeRect(g, x, y, GEN_W, GEN_H, selected ? COLORS.gold : inQueue ? COLORS.goldDim : COLORS.line, selected ? 2 : 1);
      const label = this.genLabels[index];
      if (label) {
        label.string = gen.NAME;
        label.color = rgba(inQueue ? (selected ? COLORS.goldLight : COLORS.text) : COLORS.textDim);
        // 左侧 34px 让给缩略立绘，姓名居中在右半格
        label.node.setPosition(x + 36 + (GEN_W - 36) / 2 - HALF_W, HALF_H - (y + GEN_H / 2), 0);
      }
      // F-07：卡片右上角「前/中/後」角標。站位按武將名存，默認中列；角標只看不點，
      // 三檔按鈕在主將區（主將）與出陣順序面板（每一槽）——與 web 的「按武將持久化」同口徑。
      const colLabel = this.genColLabels[index];
      if (colLabel) {
        const col = this.colOf(gen.NAME);
        colLabel.string = COL_LABEL[col];
        colLabel.color = rgba(col === 'mid' ? COLORS.textFaint : COLORS.goldLight);
        colLabel.node.setPosition(x + GEN_W - 34 - HALF_W, HALF_H - (y + 9), 0);
      }
      const thumb = this.genThumbs[index];
      if (thumb) {
        thumb.setPosition(x + 2, y + 2);
        if (this.genThumbKey[index] !== gen.NAME) {
          this.genThumbKey[index] = gen.NAME;
          thumb.loadHero(gen.NAME);
        }
        thumb.setVisible(true);
      }
      this.buttons.push({ kind: 'gen', index, x, y, w: GEN_W, h: GEN_H });
    });
    for (let i = this.generals.length; i < this.genLabels.length; i += 1) {
      const label = this.genLabels[i];
      if (label) label.string = '';
      const colLabel = this.genColLabels[i];
      if (colLabel) colLabel.string = '';
      this.genThumbs[i]?.setVisible(false);
    }
  }

  private drawGrid(
    g: Graphics,
    kind: 'troop' | 'form',
    labels: Label[],
    lockLabels: Label[],
    locked: boolean[],
    names: string[],
    cols: number,
    x0: number,
    y0: number,
    selectedIndex: number,
  ): void {
    names.forEach((name, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = x0 + col * (CELL_W + 8);
      const y = y0 + row * (CELL_H + 8);
      const isLocked = locked[index] === true;
      const selected = !isLocked && index === selectedIndex;
      const top = isLocked ? '#151A20' : selected ? '#4A3A20' : '#22282F';
      const bottom = isLocked ? '#0F1318' : selected ? '#1D1509' : '#171C22';
      // w7-cocos-render3：兵種/陣形格 4×3 二維色域（130×52 → 每格 32×17 設計像素；dpr 後仍 ≥8）
      this.cellGrid(g, x, y, CELL_W, CELL_H, top, bottom, 10, 12, isLocked ? 170 : selected ? 244 : 214);
      if (!isLocked) this.paintBands(g, topSheen(x + 1, y + 1, CELL_W - 2, selected ? '#FBEBBE' : '#9FB4CC', selected ? 60 : 22));
      // w7-cocos-render2：格內四邊暗角 + 底緣黑線（未學的格子也加，讓「未學」有實體感）
      this.paintBands(g, edgeBands({ x, y, w: CELL_W, h: CELL_H }, '#000000', 70, 5, 2));
      this.paintBands(g, topSheen(x + 2, y + CELL_H - 2, CELL_W - 4, '#000000', 80));
      this.strokeRect(g, x, y, CELL_W, CELL_H, isLocked ? '#232830' : selected ? COLORS.gold : COLORS.line, selected ? 2 : 1);
      const label = labels[index];
      if (label) {
        label.string = name;
        label.color = rgba(isLocked ? COLORS.textFaint : selected ? COLORS.goldLight : COLORS.textDim);
        // 未学的格子右边腾 34px 给「未學」角标
        label.node.setPosition(x + (CELL_W - 34) / 2 - HALF_W, HALF_H - (y + CELL_H / 2), 0);
      }
      const lockLabel = lockLabels[index];
      if (lockLabel) {
        lockLabel.string = isLocked ? '未學' : '';
        lockLabel.node.setPosition(x + CELL_W - 24 - HALF_W, HALF_H - (y + CELL_H / 2), 0);
      }
      // 未学的格子**不进 buttons**：点不到（web 的 `.it.lock` 同语义）
      if (!isLocked) this.buttons.push({ kind, index, x, y, w: CELL_W, h: CELL_H });
    });
    // 清掉多余的 label（数据表比控件少时）
    for (let i = names.length; i < labels.length; i += 1) {
      if (labels[i]) labels[i].string = '';
      if (lockLabels[i]) lockLabels[i].string = '';
    }
  }

  private drawWise(g: Graphics): void {
    const options = this.wiseOptions.slice(0, WISE_MAX);
    options.forEach((option, index) => {
      const col = index % WISE_COLS;
      const row = Math.floor(index / WISE_COLS);
      const x = WISE_X + col * (WISE_W + 8);
      const y = WISE_Y + row * (WISE_H + 8);
      const selected = option.seq === this.wise;
      // w7-cocos-render3：軍師技鈕 3×2 二維色域（169×44 → 每格 56×22 設計像素）
      this.cellGrid(
        g, x, y, WISE_W, WISE_H,
        selected ? '#4A3A20' : '#22282F', selected ? '#1D1509' : '#171C22',
        10, 9, selected ? 244 : 214,
      );
      if (!option.dim) this.paintBands(g, topSheen(x + 1, y + 1, WISE_W - 2, selected ? '#FBEBBE' : '#9FB4CC', selected ? 56 : 20));
      // w7-cocos-render2：同格子語言的內陰影
      this.paintBands(g, edgeBands({ x, y, w: WISE_W, h: WISE_H }, '#000000', 70, 5, 2));
      this.paintBands(g, topSheen(x + 2, y + WISE_H - 2, WISE_W - 4, '#000000', 80));
      this.strokeRect(g, x, y, WISE_W, WISE_H, selected ? COLORS.gold : COLORS.line, selected ? 2 : 1);
      const label = this.wiseLabels[index];
      if (label) {
        label.string = option.name;
        label.color = rgba(selected ? COLORS.goldLight : option.dim ? COLORS.textFaint : COLORS.textDim);
        label.node.setPosition(x + WISE_W / 2 - HALF_W, HALF_H - (y + WISE_H / 2), 0);
      }
      this.buttons.push({ kind: 'wise', index, x, y, w: WISE_W, h: WISE_H });
    });
    for (let i = options.length; i < this.wiseLabels.length; i += 1) {
      if (this.wiseLabels[i]) this.wiseLabels[i].string = '';
    }
  }

  /** 第 column 欄滑桿的區間（0 = 步兵欄、1 = 騎兵欄）：範圍、上限、當前值、下界 */
  private sliderRange(column: number): { x0: number; x1: number; cap: number; value: number; min: number } {
    return column === 1
      ? { x0: CAV_SLIDER_X0, x1: SLIDER_X1, cap: this.cavalryCap, value: this.cavalry, min: 0 }
      : { x0: SLIDER_X0, x1: INF_SLIDER_X1, cap: this.soldierCap, value: this.soldiers, min: 1 };
  }

  private thumbX(column: number): number {
    const r = this.sliderRange(column);
    const max = Math.max(r.min + 1, r.cap);
    if (max <= r.min) return r.x0;
    return r.x0 + ((r.value - r.min) / (max - r.min)) * (r.x1 - r.x0);
  }

  /**
   * 兩欄滑桿（`project/170`）：左段步兵、右段騎兵，同一行高度。
   * 讀數在 `labelSoldier`（「步 x/y · 騎 a/b = 總 兵」），不另加欄名 Label。
   */
  private drawSliders(g: Graphics): void {
    for (const column of [0, 1] as const) {
      const r = this.sliderRange(column);
      const disabled = column === 1 && this.cavalryCap <= 0;
      const thumb = this.thumbX(column);
      // 軌道：深色漸層底 + 內陰影（web 的 range 軌道是 inset shadow）
      this.paintBands(g, vBands(r.x0, SLIDER_Y - 4, r.x1 - r.x0, 8, '#161C24', '#2B3441', 4, 255, 255));
      // 已選段：步兵金、騎兵銀（兩欄一眼分得開）
      const to = column === 1 ? '#5A6C80' : '#8A6A24';
      const from = column === 1 ? '#D8E4F2' : '#F0D07A';
      this.paintBands(g, vBands(r.x0, SLIDER_Y - 4, Math.max(2, thumb - r.x0), 8, from, to, 4, disabled ? 140 : 235, 235));
      // 25/50/80/100 刻度（超過上限的不畫，同 web 的「超上限」）
      for (const mark of [25, 50, 80, 100]) {
        if (mark > r.cap || mark < r.min) continue;
        const x = r.x0 + ((mark - r.min) / Math.max(1, r.cap - r.min)) * (r.x1 - r.x0);
        this.fillRect(g, x - 1, SLIDER_Y + 8, 2, 8, COLORS.line, 255);
      }
      // 滑块（比單欄時小一號：兩條軌道共用一行高度）
      const radius = 14;
      g.fillColor = rgba(disabled ? '#232830' : '#3D301B', 255);
      g.circle(thumb - HALF_W, HALF_H - SLIDER_Y, radius);
      g.fill();
      g.strokeColor = rgba(disabled ? COLORS.line : column === 1 ? '#CFE0F4' : COLORS.gold);
      g.lineWidth = 2;
      g.circle(thumb - HALF_W, HALF_H - SLIDER_Y, radius);
      g.stroke();
      // 觸摸熱區（44 高，各自整條軌道；index 就是欄號）
      this.buttons.push({ kind: 'slide', index: column, x: r.x0 - 12, y: SLIDER_Y - 22, w: r.x1 - r.x0 + 24, h: 44 });
    }
  }

  private drawQuick(g: Graphics): void {
    [50, 80, 100].forEach((value, index) => {
      const x = TROOP_X + index * 216;
      const enabled = value <= this.soldierCap;
      const selected = this.soldiers === value;
      const hot = selected && enabled;
      this.paintBands(
        g,
        vBands(x, QUICK_Y, 200, 42, hot ? '#4A3A20' : '#22282F', hot ? '#1D1509' : '#171C22', 6, enabled ? 214 : 140, enabled ? 214 : 140),
      );
      if (hot) this.paintBands(g, topSheen(x + 1, QUICK_Y + 1, 198, '#FBEBBE', 60));
      this.strokeRect(g, x, QUICK_Y, 200, 42, hot ? COLORS.gold : COLORS.line, hot ? 2 : 1);
      const label = this.quickLabels[index];
      if (label) {
        label.string = enabled ? `${value} 步` : `${value} 超上限`;
        label.color = rgba(enabled ? (selected ? COLORS.goldLight : COLORS.textDim) : COLORS.textFaint);
        label.node.setPosition(x + 100 - HALF_W, HALF_H - (QUICK_Y + 21), 0);
      }
      if (enabled) this.buttons.push({ kind: 'quick', index, x, y: QUICK_Y, w: 200, h: 42 });
    });
  }

  private drawFooter(g: Graphics): void {
    const back = { x: 24, y: 1210, w: 330, h: 84 };
    const go = { x: 396, y: 1210, w: 330, h: 84 };
    // 底欄兩顆大鈕：金屬漸層 + 頂部高光 + 內陰影（w5-render，對齊 web 底欄 .btn）
    // w7-cocos-render3：兩顆鈕改成 10×3 二維色域（330×84 → 每格 33×28 設計像素）
    this.cellGrid(g, back.x, back.y, back.w, back.h, '#1E2024', '#10151C', 16, 10, 246);
    this.paintBands(g, topSheen(back.x + 2, back.y + 2, back.w - 4, '#A9BDD6', 30));
    this.paintBands(g, edgeBands(back, '#000000', 90, 20, 3));
    this.strokeRect(g, back.x, back.y, back.w, back.h, COLORS.line, 1);
    this.cellGrid(g, go.x, go.y, go.w, go.h, '#4E3D21', '#1D1509', 16, 10, 255);
    this.paintBands(g, topSheen(go.x + 2, go.y + 2, go.w - 4, '#FBEBBE', 76));
    this.paintBands(g, edgeBands(go, '#000000', 90, 20, 3));
    this.strokeRect(g, go.x, go.y, go.w, go.h, COLORS.gold, 2);
    this.buttons.push({ kind: 'back', index: 0, ...back });
    this.buttons.push({ kind: 'go', index: 0, ...go });

    if (this.actionLabels[0]) {
      this.actionLabels[0].string = '返 回\n大地圖';
      this.actionLabels[0].node.setPosition(back.x + back.w / 2 - HALF_W, HALF_H - (back.y + back.h / 2), 0);
    }
    if (this.actionLabels[1]) {
      const gen = this.currentGen();
      const wiseName = this.wiseOptions.find((option) => option.seq === this.wise)?.name ?? '不用';
      // [R231] 攻城戰前準備：參戰兵團已定，按鈕是「出 戰」（直接進 Battle），
      // 不再是「出 征」（那會從出發城再派一支新兵團 → 又走到城下 → 再彈編成）。
      const action = this.siege ? '出 戰' : '出 征';
      this.actionLabels[1].string =
        `${action}\n${gen?.NAME ?? '—'} · ${this.troopNames[this.troop] ?? '?'} · ` +
        `${this.formNames[this.form] ?? '?'} · ${this.soldiers + this.cavalry} 兵 · ${wiseName}`;
      this.actionLabels[1].color = rgba(COLORS.goldLight);
      this.actionLabels[1].node.setPosition(go.x + go.w / 2 - HALF_W, HALF_H - (go.y + go.h / 2), 0);
    }
  }

  // -------------------------------------------------------------------------
  // 出陣順序（R94）
  // -------------------------------------------------------------------------

  /** 第 1 槽跟著主將區走：主將 / 兵種 / 兵力三個入口只有一份口徑。 */
  private syncQueueFromUi(): void {
    if (!this.queue.length) return;
    const gen = this.currentGen();
    if (gen) this.queue = setGeneral(this.queue, 0, gen.NAME);
    const char = TROOP_CHARS[this.troop];
    if (typeof char === 'string') this.queue = setTroop(this.queue, 0, char);
    // 隊列第 1 槽存的是**總兵力**（兩欄之和），與 web `deploy.html` 的 `DQ.setTroops(q,0,步+騎)` 同值
    this.queue = setTroops(this.queue, 0, this.soldiers + this.cavalry);
  }

  /** 調序後把第 1 槽的人/兵種回填到上半屏（等級/上限/軍師技候選全部重算）。 */
  private applyQueueHead(): void {
    const head = this.queue[0];
    if (!head) return;
    const index = this.generals.findIndex((g) => g.NAME === head.general);
    if (index >= 0) this.selectedGen = index;
    const troopIndex = TROOP_CHARS.indexOf(head.troop);
    if (troopIndex >= 0) this.troop = troopIndex;
    // 槽裡只有總兵力：先按新主將的兩欄上限拆回步/騎，再走 applyGeneral 的夾取
    if (Number.isFinite(head.troops) && head.troops > 0) this.totalToColumns(head.troops);
    this.applyGeneral();
    // [R231] 攻城戰前準備：兵力鎖在抵達兵數，調序後不能被隊列槽位裡的預設兵力頂掉
    if (this.siege) this.applySiegeTroops();
  }

  /** 落盤：存檔的 `deployQueue` 是唯一真身（v3 可選字段，舊檔沒有也能讀）。 */
  /**
   * [R238] 隊列裡「畫面上不存在」的將要濾掉。
   *
   * 病根：`deployQueue` 是跨局/跨城持久化的，玩家這次候選池只有 1 個將時，
   * 隊列裡仍可能躺著上一局勾過的 4 個名字（畫面上只畫 `this.generals`，所以看不出來）。
   * `march()` 直接把 `this.queue` 當隨軍名單 ⇒ 那 4 個「看不見的將」被一起派出去，
   * 抵達後的攻城編成按快照重建隊列就變成 5 個人（製作人實測：出征 1 人、到達 5 人）。
   */
  private liveQueue(): DeployQueue[number][] {
    const names = new Set(this.generals.map((gen) => gen.NAME));
    return this.queue.filter((slot) => !!slot.general && names.has(slot.general));
  }

  private persistQueue(): void {
    // [R231] 攻城戰前準備不改寫存檔 deployQueue：參戰兵團是抵達部隊，不是城裡的派兵隊列
    if (this.siege) return;
    this.syncQueueFromUi();
    const save = GameState.loadSave() as unknown as DeployQueueSave;
    // [R238] 只落盤「畫面上真正存在的將」，否則存檔會一直夾帶看不見的舊名字
    saveQueue(save, this.liveQueue());
    GameState.persistSave();
  }

  // -------------------------------------------------------------------------
  // F-07 前 / 中 / 後列（站位）
  // -------------------------------------------------------------------------

  /** 某將的站位；沒存過 / 名字不認識 → 中列（與 web 的 `colOf()` 同語義，默認中列）。 */
  private colOf(name: string): GeneralCol {
    const col = this.cols[name];
    return col === 'front' || col === 'back' ? col : 'mid';
  }

  /**
   * 從 `COL_KEY` 讀站位。只收 `front/mid/back` 三個合法值（web `loadCols()` 同口徑）：
   * 壞 JSON / 非物件 / 髒值一律當沒存 —— 出征頁讀外部存檔不能拋。
   */
  private loadCols(): void {
    const out: Record<string, GeneralCol> = {};
    try {
      const raw = sys.localStorage.getItem(COL_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (!name) continue;
            if (value === 'front' || value === 'mid' || value === 'back') out[name] = value;
          }
        }
      }
    } catch (err) {
      console.warn('[DeployRoot] 讀站位（COL_KEY）失敗，全部按中列', err);
    }
    this.cols = out;
  }

  /** 寫回 `COL_KEY`：`{ 武將名: 'front'|'mid'|'back' }`（與 web 同鍵同格式，互為相容）。 */
  private saveCols(): void {
    try {
      sys.localStorage.setItem(COL_KEY, JSON.stringify(this.cols));
    } catch (err) {
      console.warn('[DeployRoot] 寫站位（COL_KEY）失敗，本局仍生效', err);
    }
  }

  /** 改一將的站位並立刻落盤（角標 / 三檔按鈕 / 出征 payload 全部讀同一份 `cols`）。 */
  private setCol(name: string, col: GeneralCol): void {
    if (!name) return;
    this.cols[name] = col;
    this.saveCols();
  }

  /**
   * 出征 payload 的站位表：出陣隊列裡的每將 → 前/中/後（5 槽全帶；默認中列）。
   * 這是 web `deployColsParam()` 的同一份名單，只是不走字串 URL 而是直接掛 payload 的 `cols`。
   */
  private deployCols(): Record<string, GeneralCol> {
    const out: Record<string, GeneralCol> = {};
    for (const slot of this.queue) {
      if (slot && typeof slot.general === 'string' && slot.general) out[slot.general] = this.colOf(slot.general);
    }
    return out;
  }

  /** 三角形箭頭（按鈕沒有文字標籤，直接用 Graphics 畫，省 5 個 Label 節點）。 */
  private drawArrow(g: Graphics, cx: number, cy: number, size: number, up: boolean, color: string, alpha: number): void {
    const ax = cx - HALF_W;
    const ay = HALF_H - cy;
    g.fillColor = rgba(color, alpha);
    g.moveTo(ax, ay + (up ? -size : size));
    g.lineTo(ax + size, ay + (up ? size : -size));
    g.lineTo(ax - size, ay + (up ? size : -size));
    g.close();
    g.fill();
  }

  private drawQueue(g: Graphics): void {
    const hint = this.queueHint;
    const title = this.queueTitle;
    for (const label of this.queueLabels) label.node.active = this.queueOpen;
    for (const label of this.queueTroopLabels) label.node.active = this.queueOpen;
    for (const label of this.queueColLabels) label.node.active = this.queueOpen;
    if (title) title.node.active = this.queueOpen;
    if (this.queueClose) this.queueClose.node.active = this.queueOpen;

    if (!this.queueOpen) {
      if (this.queueLayer) this.queueLayer.active = false;
      // 收起態：兵力快捷鈕與底欄之間一條窄條，點它展開
      // w7-cocos-render3：12×2 二維色域（678×36 → 每格 56×18 設計像素）
      this.cellGrid(g, 24, QUEUE_Y, 678, 36, '#1E2024', '#10151C', 16, 5, 240);
      this.paintBands(g, topSheen(26, QUEUE_Y + 2, 674, '#A9BDD6', 28));
      this.strokeRect(g, 24, QUEUE_Y, 678, 36, COLORS.line, 1);
      if (hint) {
        hint.string = `出 陣 順 序（${this.queue.length}/${DEPLOY_SLOTS} 槽）· 點此調整`;
        hint.color = rgba(COLORS.goldLight);
        hint.node.setPosition(375 - HALF_W, HALF_H - (QUEUE_Y + 18), 0);
      }
      this.buttons.push({ kind: 'queue', index: 0, x: 24, y: QUEUE_Y, w: 678, h: 36 });
      return;
    }

    // 展開態：模態面板（吃掉全部觸摸，背後的滑桿/按鈕本帧不 push）
    const qg = this.queueGfx;
    if (!qg) return;
    qg.clear();
    g = qg;
    if (this.queueLayer) this.queueLayer.active = true;
    this.fillRect(g, 0, 0, DESIGN_W, DESIGN_H, '#000000', 235);
    const px = 40;
    const py = 214;
    const pw = 670;
    const ph = 640;
    this.areaGrid(g, px, py, pw, ph, 24, 22, '#1C232C', 14, 255);
    this.paintBands(g, edgeBands({ x: px, y: py, w: pw, h: ph }, '#000000', 110, 22, 3));
    this.strokeRect(g, px, py, pw, ph, COLORS.gold, 2);
    if (title) title.node.setPosition(375 - HALF_W, HALF_H - (py + 30), 0);

    const rowH = 88;
    this.queue.forEach((slot, i) => {
      const rowY = py + 76 + i * rowH;
      const onField = i < DEPLOY_FIELD_SLOTS;
      if (i % 2 === 1) this.fillRect(g, px + 12, rowY - 6, pw - 24, rowH - 8, '#0A0E13', 110);
      // w7-cocos-render3：五個槽位各鋪一層 14×3 二維色域（web 的清單行是 .row + inset 陰影）
      this.areaGrid(g, px + 12, rowY - 6, pw - 24, rowH - 8, 24, 6, onField ? '#221E17' : '#191B1F', 12, 190);
      // 上陣的 3 槽左側畫一條金色豎線，預備槽畫灰色
      this.fillRect(g, px + 12, rowY - 6, 4, rowH - 8, onField ? COLORS.gold : COLORS.line, onField ? 230 : 150);

      const name = this.queueLabels[i];
      if (name) {
        name.string = `${i + 1}   ${slot.general}${i === 0 ? '（主將）' : ''}`;
        name.color = rgba(i === 0 ? COLORS.goldLight : COLORS.text);
        name.node.setPosition(px + 34 - HALF_W, HALF_H - (rowY + 12), 0);
      }
      const troop = this.queueTroopLabels[i];
      if (troop) {
        // [R231] 攻城戰前準備：兵力鎖在抵達兵數（整支兵團共用），不能像城內編成那樣逐將分兵。
        // 主將行顯示抵達兵數，其餘行標「隨軍」，避免顯示 makeSlot 的預設 10 兵造成誤解。
        troop.string = this.siege
          ? `${i === 0 ? `${this.siege.troops} 兵` : '隨軍'} · ${slot.troop}`
          : `${slot.troops} 兵 · ${slot.troop}`;
        troop.color = rgba(onField ? COLORS.text : COLORS.textFaint);
        troop.node.setPosition(px + 380 - HALF_W, HALF_H - (rowY + 12), 0);
      }
      // F-07 站位三檔（前/中/後）：每槽第二行，按武將名存 COL_KEY（槽位本身不存 col，
      // saveQueue() 會剝掉額外欄位）。預備槽也允許先排站位，真正進戰場的只有前 3 槽。
      const currentCol = this.colOf(slot.general);
      COL_ORDER.forEach((col, c) => {
        const bx = px + 34 + c * 188;
        const by = rowY + 42;
        const on = currentCol === col;
        this.cellGrid(g, bx, by, 180, 34, on ? '#4A3A20' : '#22282F', on ? '#1D1509' : '#171C22', 10, 5, on ? 244 : 200);
        if (on) this.paintBands(g, topSheen(bx + 1, by + 1, 178, '#FBEBBE', 56));
        this.strokeRect(g, bx, by, 180, 34, on ? COLORS.gold : COLORS.line, on ? 2 : 1);
        const label = this.queueColLabels[i * COL_ORDER.length + c];
        if (label) {
          label.string = COL_LABEL[col];
          label.color = rgba(on ? COLORS.goldLight : COLORS.textDim);
          label.node.setPosition(bx + 90 - HALF_W, HALF_H - (by + 17), 0);
        }
        this.buttons.push({ kind: 'qcol', index: i * COL_ORDER.length + c, x: bx, y: by, w: 180, h: 34 });
      });
      // 兵種：點一下在 12 個兵種字之間循環（web 版是 <select>，這裡用點擊循環，最小可用）
      this.buttons.push({ kind: 'qtr', index: i, x: px + 300, y: rowY - 6, w: 180, h: 40 });
      // 上/下移只在「可上陣的前 3 槽」之間生效（軍師技 seq 3 放開的正是這 3 槽）
      const canUp = onField && i > 0;
      const canDown = onField && i + 1 < DEPLOY_FIELD_SLOTS && i + 1 < this.queue.length;
      this.paintBands(g, vBands(px + 500, rowY - 4, 48, 34, canUp ? '#2C3542' : '#1B2027', '#12161B', 6, 255, 255));
      this.strokeRect(g, px + 500, rowY - 4, 48, 34, canUp ? COLORS.line : '#20262E', 1);
      this.drawArrow(g, px + 524, rowY + 13, 8, true, canUp ? COLORS.goldLight : COLORS.textFaint, canUp ? 255 : 120);
      if (canUp) this.buttons.push({ kind: 'qup', index: i, x: px + 500, y: rowY - 4, w: 48, h: 34 });
      this.paintBands(g, vBands(px + 556, rowY - 4, 48, 34, canDown ? '#2C3542' : '#1B2027', '#12161B', 6, 255, 255));
      this.strokeRect(g, px + 556, rowY - 4, 48, 34, canDown ? COLORS.line : '#20262E', 1);
      this.drawArrow(g, px + 580, rowY + 13, 8, false, canDown ? COLORS.goldLight : COLORS.textFaint, canDown ? 255 : 120);
      if (canDown) this.buttons.push({ kind: 'qdn', index: i, x: px + 556, y: rowY - 4, w: 48, h: 34 });
    });

    // 底部：確定 + 一行說明
    const close = { x: px + 200, y: py + ph - 92, w: 270, h: 62 };
    this.paintBands(g, vBands(close.x, close.y, close.w, close.h, '#4E3D21', '#1D1509', 8, 255, 255));
    this.paintBands(g, topSheen(close.x + 2, close.y + 2, close.w - 4, '#FBEBBE', 70));
    this.strokeRect(g, close.x, close.y, close.w, close.h, COLORS.gold, 2);
    if (this.queueClose) {
      this.queueClose.string = '確 定';
      this.queueClose.node.setPosition(close.x + close.w / 2 - HALF_W, HALF_H - (close.y + close.h / 2), 0);
    }
    this.buttons.push({ kind: 'qclose', index: 0, ...close });
    if (hint) {
      hint.string = '前 3 槽上陣 · 點兵種循環切換 · ▲▼ 調序 · 前/中/後 定站位';
      hint.color = rgba(COLORS.textDim);
      hint.node.setPosition(375 - HALF_W, HALF_H - (py + ph - 24), 0);
    }
  }

  // -------------------------------------------------------------------------
  // 交互
  // -------------------------------------------------------------------------

  /** 触摸点 → 设计坐标（左上原点） */
  private toDesign(event: EventTouch): { x: number; y: number } | null {
    const transform = this.node.getComponent(UITransform);
    if (!transform) return null;
    const ui = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    return { x: local.x + HALF_W, y: HALF_H - local.y };
  }

  /** 拖動第 column 欄（0 = 步、1 = 騎）到 x 處；兩欄各自夾自己的上限，互不佔用。 */
  private setColumnFromX(column: number, x: number): void {
    // [R231] 攻城戰前準備：兵力鎖定，滑桿/拖拽一律不生效
    if (this.siege) return;
    const r = this.sliderRange(column);
    const ratio = clamp((x - r.x0) / Math.max(1, r.x1 - r.x0), 0, 1);
    const value = Math.round(r.min + ratio * Math.max(1, r.cap - r.min));
    if (column === 1) this.cavalry = clamp(value, 0, this.cavalryCap);
    else this.soldiers = clamp(value, 1, this.soldierCap);
    this.refresh();
  }

  /** 落在哪一欄的軌道上（0 = 步、1 = 騎）：兩段之間留 60px 空隙，靠左靠右都判得清 */
  private sliderColumnAt(x: number): number {
    return x >= CAV_SLIDER_X0 - 20 ? 1 : 0;
  }

  private onTouchStart(event: EventTouch): void {
    if (!this.loaded) return;
    // 調序面板是模態：展開時不進滑桿拖拽
    if (this.queueOpen) return;
    // [R231] 攻城戰前準備：兵力鎖定，不進滑桿拖拽
    if (this.siege) return;
    const point = this.toDesign(event);
    if (!point) return;
    // 只有落在滑杆热区才进拖拽，其余交给 TOUCH_END 的按钮命中
    if (point.x >= SLIDER_X0 - 24 && point.x <= SLIDER_X1 + 24 && point.y >= SLIDER_Y - 30 && point.y <= SLIDER_Y + 30) {
      this.dragColumn = this.sliderColumnAt(point.x);
      this.dragging = true;
      this.setColumnFromX(this.dragColumn, point.x);
    }
  }

  private onTouchMove(event: EventTouch): void {
    if (!this.dragging) return;
    const point = this.toDesign(event);
    if (point) this.setColumnFromX(this.dragColumn, point.x);
  }

  private onTouch(event: EventTouch): void {
    if (!this.loaded) return;
    const point = this.toDesign(event);
    if (!point) return;
    this.dragging = false;
    const { x, y } = point;

    // 調序面板展開時吃掉全部觸摸：只認面板上的 qup/qdn/qtr/qclose，其餘一律吞掉
    if (this.queueOpen) {
      for (const button of this.buttons) {
        if (x < button.x || x > button.x + button.w || y < button.y || y > button.y + button.h) continue;
        if (button.kind === 'qclose') {
          this.queueOpen = false;
          this.refresh();
          return;
        }
        if (button.kind === 'qup' || button.kind === 'qdn') {
          const to = button.index + (button.kind === 'qup' ? -1 : 1);
          this.queue = moveSlot(this.queue, button.index, to, DEPLOY_FIELD_SLOTS);
          this.applyQueueHead();
          this.persistQueue();
          this.refresh();
          return;
        }
        if (button.kind === 'qtr') {
          const slot = this.queue[button.index];
          if (!slot) return;
          const at = TROOP_CYCLE.indexOf(slot.troop);
          const troop = TROOP_CYCLE[(at + 1) % TROOP_CYCLE.length] ?? '刀';
          this.queue = setTroop(this.queue, button.index, troop);
          if (button.index === 0) {
            const index = TROOP_CHARS.indexOf(troop);
            if (index >= 0) this.troop = index;
          }
          this.persistQueue();
          this.refresh();
          return;
        }
        if (button.kind === 'qcol') {
          // index = slot*3 + 檔位：站位按武將名存（槽位本身不存 col）
          const slot = this.queue[Math.floor(button.index / COL_ORDER.length)];
          const col = COL_ORDER[button.index % COL_ORDER.length];
          if (!slot || !col) return;
          this.setCol(slot.general, col);
          this.refresh();
          return;
        }
        return;
      }
      return;
    }

    for (const button of this.buttons) {
      if (x < button.x || x > button.x + button.w || y < button.y || y > button.y + button.h) continue;
      if (button.kind === 'back') {
        latchTap();
        // [R231] 攻城戰前準備的「返回大地圖」＝放棄攻城：兵退回出發城、清快照，
        // 不能回「重新派兵」的編成屏（那正是「到達一次彈一次」的循環）。
        if (this.siege) {
          this.abandonSiege();
          return;
        }
        director.loadScene('Campaign');
        return;
      }
      if (button.kind === 'go') {
        latchTap();
        this.persistQueue();
        this.march();
        return;
      }
      if (button.kind === 'queue') {
        this.queueOpen = true;
        this.refresh();
        return;
      }
      if (button.kind === 'mcol') {
        // 主將區三檔：主將 = 隊列第 1 槽，站位按武將名存（角標/隊列面板立即同步）
        const gen = this.currentGen();
        const col = COL_ORDER[button.index];
        if (gen && col) this.setCol(gen.NAME, col);
        this.refresh();
        return;
      }
      if (button.kind === 'gen') {
        // [R231] 攻城戰前準備：參戰的是抵達兵團，將卡只展示，不能換將/調人
        if (this.siege) {
          this.hintText = '攻城戰前準備：參戰的是剛抵達的兵團，不能換將（只可調陣形/兵種/軍師技/站位/出陣順序）。';
          this.refresh();
          return;
        }
        const gen = this.generals[button.index];
        if (!gen) return;
        const at = this.queue.findIndex((slot) => slot.general === gen.NAME);
        if (at < 0) {
          if (this.queue.length >= DEPLOY_SLOTS) {
            this.hintText = `出陣最多 ${DEPLOY_SLOTS} 人；先在出陣順序裡移掉一位。`;
            this.refresh();
            return;
          }
          this.queue = [...this.queue, makeSlot(gen.NAME)];
        } else if (at === 0) {
          // 再點一次主將 = 取消他（下一位移上來當主將）
          this.queue = this.queue.filter((_, i) => i !== 0);
        } else {
          // 點已勾選的副將 = 升為主將（移到第 1 槽）
          const slot = this.queue[at]!;
          this.queue = [slot, ...this.queue.filter((_, i) => i !== at)];
        }
        const headName = this.queue[0]?.general;
        const headIndex = headName ? this.generals.findIndex((row) => row.NAME === headName) : -1;
        if (headIndex >= 0) this.selectedGen = headIndex;
        this.applyQueueHead();
        this.persistQueue();
        this.applyGeneral();
        this.loadPortrait();
        this.refresh();
        return;
      }
      if (button.kind === 'troop') {
        this.troop = button.index;
      } else if (button.kind === 'form') {
        this.form = button.index;
      } else if (button.kind === 'wise') {
        this.wise = this.wiseOptions[button.index]?.seq ?? null;
      } else if (button.kind === 'slide') {
        // [R231] 攻城戰前準備：兵力鎖在抵達兵數，滑桿不生效
        if (this.siege) {
          this.hintText = '攻城戰前準備：兵力鎖在抵達時的兵數，不能增減。';
          this.refresh();
          return;
        }
        this.setColumnFromX(button.index === 1 ? 1 : 0, x);
        return;
      } else if (button.kind === 'quick') {
        if (this.siege) {
          this.hintText = '攻城戰前準備：兵力鎖在抵達時的兵數，不能增減。';
          this.refresh();
          return;
        }
        this.soldiers = [50, 80, 100][button.index] ?? this.soldierCap;
      }
      this.hintText = '';
      this.refresh();
      return;
    }
  }

  private march(): void {
    // [R231] 攻城戰前準備：按「出 戰」＝用剛抵達的兵團直接開打，不派新兵團。
    // 必須放在「沒有可用主將」檢查之前：抵達兵團的將領若解析不到資料列，
    // 仍應由 fight() 用快照裡的 general 兜底開戰（不能卡在「先取得一座有武將的城」）。
    if (this.siege) {
      this.fight();
      return;
    }
    const gen = this.currentGen();
    if (!gen) {
      this.hintText = '沒有可用主將：先在大地圖取得一座有我方武將的城。';
      this.refresh();
      return;
    }
    // 兵團出征：編成屏只負責選將/排序/兵力，按「出征」才真的把兵團派出去
    if (GameState.peekDeployMarch()) {
      this.persistQueue();
      // [R238] 只派「畫面上勾得到」的隨軍將：隊列可能夾帶上一局留下的隱形名字
      const officers = this.liveQueue()
        .map((slot) => slot.general)
        .filter((name): name is string => !!name && name !== gen.NAME);
      if (GameState.dispatchMarch(gen.NAME, officers, this.soldiers + this.cavalry)) {
        director.loadScene('Campaign');
      } else {
        this.hintText = '兵不足：先回城徵兵再出征。';
        this.refresh();
      }
      return;
    }
    // 出戰前把出陣順序落盤（含主將槽的兵種/兵力），避免「調了順序但沒按確定」丟失
    this.persistQueue();
    const intel = this.intel;
    const bstr = intel?.str ?? Math.min(100, 50 + Math.floor((this.targetCity?.DEFENSE ?? 300) / 8));
    const bint = intel?.int ?? Math.max(30, 140 - bstr);
    // 與出征屏顯示同一個出口（enemySoldiers），不再各自夾一次（舊的 Math.max(60,…) 已去掉）
    const bsoldiers = this.enemySoldiers();
    // 車輪戰名冊：我方按編成屏的出陣順序；敵方主將 + 守將（去重，最多 4 位）
    const rosterA = this.queue
      .map((slot) => slot.general)
      .filter((name): name is string => !!name);
    if (rosterA.length === 0) rosterA.push(gen.NAME);
    const rosterB = [intel?.name ?? '守備隊', ...(intel?.officers ?? []).map((o) => o.name)]
      .filter((name, i, all) => !!name && all.indexOf(name) === i)
      .slice(0, 4);
    const loadout: BattleLoadout = {
      gen: gen.NAME,
      genStr: gen.STR,
      genInt: gen.INT,
      genLevel: this.levelOf(gen),
      troop: this.troop,
      form: this.form,
      // 戰場只認總數（`BattleLoadout.soldiers`，對齊 web 的 `?soldiers=`）：步 + 騎
      soldiers: this.soldiers + this.cavalry,
      wise: this.wise,
      bgen: intel?.name ?? '守備隊',
      btroop: this.enemyTroop(),
      bform: this.enemyForm(),
      bsoldiers,
      bstr,
      bint,
      rosterA,
      rosterB,
      indexA: 0,
      indexB: 0,
    };
    if (this.defenseArmyId) {
      loadout.defend = true;
      loadout.armyId = this.defenseArmyId;
    }
    // F-07 站位：每將 front/mid/back 隨 payload 的 `cols` 帶進戰鬥（web 是 URL 的 `cols=`）。
    // `GameState.BattleLoadout` 沒有 col 欄位（本輪不碰 GameState.ts）——`startBattle()` 是
    // `{ ...loadout, ... }` 展開，額外屬性原樣進 `BattleLaunch`，所以型別上補交叉型別即可。
    const payload: BattleLoadoutWithCols = { ...loadout, cols: this.deployCols() };
    GameState.startBattle(this.targetCity?.NAME ?? '南皮', payload);
  }

  // -------------------------------------------------------------------------
  // R231 攻城戰前準備（兵團抵達敵城/關卡 → 用剛抵達的部隊打，不再重新派兵）
  // -------------------------------------------------------------------------

  /**
   * [R231] 把參戰將鎖成「剛抵達兵團」的編制。
   *
   * 兵團抵達時已 `removeArmy()`，出發城的候選池會把這些將當成「在外部隊」濾掉（away），
   * 舊碼因此顯示「沒有可用主將」的空屏 → 玩家只能重新派兵 → 新兵團又抵達 → 再彈編成。
   * 這裡直接用快照裡的主將/隨軍重建 generals 與出陣隊列（隊列順序即 web 的 `officers`）。
   */
  private applySiegeRoster(byName: Map<string, GeneralRow>): void {
    const siege = this.siege;
    if (!siege) return;
    const names = [siege.general, ...siege.officers]
      .filter((name): name is string => !!name)
      .filter((name, i, all) => all.indexOf(name) === i)
      .slice(0, DEPLOY_SLOTS);
    const rows = names
      .map((name) => byName.get(name))
      .filter((gen): gen is GeneralRow => !!gen);
    // 無條件覆寫：快照裡的將領若在 data.generals 裡解析不到，generals 就該是空陣列
    // （fight() 會用 siege.general + 預設 STR/INT 兜底），不能殘留出發城的候選池——
    // 那會讓 currentGen() 拿到城裡別的武將，戰前準備屏顯示的根本不是抵達的兵團。
    this.generals = rows;
    this.selectedGen = 0;
    this.queue = names.map((name) => makeSlot(name));
  }

  /**
   * [R231] 把兵力鎖在抵達兵數（兩欄上限放寬到兵數，全部記步兵欄）。
   *
   * 抵達兵團的兵是「已離開出發城」的實際兵力，不能再從城裡增減；等級上限只管「能帶多少」，
   * 抵達兵數可能因上月徵兵而略高，所以上限取 max(等級上限, 抵達兵數) 而不是夾掉。
   */
  private applySiegeTroops(): void {
    const siege = this.siege;
    if (!siege) return;
    const troops = Math.max(1, Math.round(Number(siege.troops) || 1));
    this.soldierCap = Math.max(this.soldierCap, troops);
    this.cavalry = 0;
    this.soldiers = troops;
    this.hintText =
      '攻城戰前準備：參戰的是剛抵達的兵團，不能換將/改兵力；只可選陣形/兵種/軍師技/站位/出陣順序，按「出 戰」決戰。';
    this.refresh();
  }

  /**
   * [R231] 攻城戰前準備按「出 戰」：用剛抵達的兵團直接進 Battle。
   *
   * 與 `march()` 的差別：
   *   - 不 `dispatchMarch()`（那會再造一支新兵團，是本 bug 的循環來源）；
   *   - `soldiers` = 抵達兵數（鎖定值）；
   *   - `armyId` = 快照部隊 id：戰後 `recordBattleResult()` 據此清部隊（已不在存檔時是 no-op），
   *     不設 `defend`（我方進攻，輸了不掉城）。
   */
  private fight(): void {
    const siege = this.siege;
    if (!siege) return;
    const gen = this.currentGen();
    const genName = gen?.NAME ?? siege.general;
    if (!genName) {
      this.hintText = '攻城戰：找不到參戰主將，請回大地圖。';
      this.refresh();
      return;
    }
    const intel = this.intel;
    const bstr = intel?.str ?? Math.min(100, 50 + Math.floor((this.targetCity?.DEFENSE ?? 300) / 8));
    const bint = intel?.int ?? Math.max(30, 140 - bstr);
    const rosterA = this.queue
      .map((slot) => slot.general)
      .filter((name): name is string => !!name);
    if (rosterA.length === 0) rosterA.push(genName);
    const rosterB = [intel?.name ?? '守備隊', ...(intel?.officers ?? []).map((o) => o.name)]
      .filter((name, i, all) => !!name && all.indexOf(name) === i)
      .slice(0, 4);
    const loadout: BattleLoadout = {
      gen: genName,
      genStr: gen?.STR ?? 80,
      genInt: gen?.INT ?? 60,
      genLevel: gen ? this.levelOf(gen) : 20,
      troop: this.troop,
      form: this.form,
      // 戰場只認總數（`BattleLoadout.soldiers`）：就是抵達兵團的兵數，一兵不多一兵不少
      soldiers: Math.max(1, Math.round(Number(siege.troops) || 1)),
      wise: this.wise,
      home: siege.from,
      bgen: intel?.name ?? '守備隊',
      btroop: this.enemyTroop(),
      bform: this.enemyForm(),
      bsoldiers: this.enemySoldiers(),
      bstr,
      bint,
      rosterA,
      rosterB,
      indexA: 0,
      indexB: 0,
      armyId: siege.armyId,
    };
    const payload: BattleLoadoutWithCols = { ...loadout, cols: this.deployCols() };
    // 快照是一次性的：進 Battle 前清掉，避免「返回大地圖 → 再進編成」又走攻城分支
    GameState.clearDeploySiege();
    GameState.clearDeployMarch();
    this.siege = null;
    GameState.startBattle(this.targetCity?.NAME ?? siege.target, payload);
  }

  /**
   * [R231] 攻城戰前準備按「返回大地圖」＝放棄攻城。
   *
   * 口徑同 web `campaign.html` 的確認框「退兵」＋`refundArmy()`：
   * 部隊退回出發城，`cities[from].troops = min(600, troops + 抵達兵數)`，然後清快照回大地圖。
   * （web deploy.html 的返回只是 `campaign.html?sel=`，但那時部隊還沒撤；Cocos 這裡已撤隊，
   *   所以按 campaign 的「退兵」語義把兵退回，避免玩家白丟一支部隊。）
   */
  private abandonSiege(): void {
    const siege = this.siege;
    GameState.clearDeploySiege();
    GameState.clearDeployMarch();
    this.siege = null;
    // R234b：不再立刻退款回城（那會讓這批將馬上又能編去打別城），改派一支返程兵團；
    // 部隊與將在回程途中仍算在途，到城才併入守軍。
    if (siege?.from && siege.target) {
      GameState.pushReturnArmy(siege.target, siege.from, siege.general ?? '', siege.officers ?? [], siege.troops ?? 0);
    }
    director.loadScene('Campaign');
  }

  // -------------------------------------------------------------------------
  // 立绘
  // -------------------------------------------------------------------------

  private loadPortrait(): void {
    const gen = this.currentGen();
    if (!this.portrait) return;
    if (!gen) {
      this.portrait.spriteFrame = null;
      return;
    }
    const cached = this.portraitCache.get(gen.NAME);
    if (cached) {
      this.applyPortraitFrame(gen.NAME, cached);
      return;
    }
    this.portrait.spriteFrame = null;
    // bundles/res/hero/*.webp 的 .meta 是 `importer:"image"` + `userData.type:"texture"`，
    // 没有 spriteFrame 子资产，所以不能 `loadRes(path, SpriteFrame)`。
    // 走 ArtLayer.loadFrame：先拿 ImageAsset 自己包 SpriteFrame；中文 key 与 URL 编码
    // key 各试一次；再不行退回远程 http；最后退回空立绘板（不抛异常）。
    loadFrame(`hero/${gen.NAME}`, (frame) => {
      if (frame) {
        this.applyPortraitFrame(gen.NAME, frame);
        return;
      }
      const encoded = encodeURIComponent(gen.NAME);
      loadFrame(`hero/${encoded}`, (frame2) => {
        if (frame2) this.applyPortraitFrame(gen.NAME, frame2);
        else this.loadRemotePortrait(gen.NAME);
      });
    });
  }

  private loadRemotePortrait(name: string): void {
    if (!this.heroBaseUrl) return;
    const base = this.heroBaseUrl.endsWith('/') ? this.heroBaseUrl : `${this.heroBaseUrl}/`;
    assetManager.loadRemote<ImageAsset>(`${base}${encodeURIComponent(name)}.png`, (err, asset) => {
      if (!err && asset) this.applyPortrait(name, asset);
    });
  }

  private applyPortraitFrame(name: string, frame: SpriteFrame): void {
    if (!this.portrait) return;
    this.portraitFrame = frame;
    // 立绘板是 120×150；按 contain（等比、宽度留白）塞进去，别拉变形。
    const size = frame.originalSize;
    const transform = this.portrait.node.getComponent(UITransform);
    if (transform && size.width > 0 && size.height > 0) {
      const k = Math.min(120 / size.width, 150 / size.height);
      transform.setContentSize(size.width * k, size.height * k);
    }
    this.portrait.spriteFrame = frame;
    this.portraitCache.set(name, frame);
  }

  /** 远程兜底：loadRemote 拿到的是 ImageAsset，运行时拼一张 SpriteFrame。 */
  private applyPortrait(name: string, image: ImageAsset): void {
    const texture = new Texture2D();
    texture.image = image;
    const frame = new SpriteFrame();
    frame.texture = texture;
    this.applyPortraitFrame(name, frame);
  }
}
