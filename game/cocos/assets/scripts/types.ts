/**
 * 原作数据表的 TypeScript 形状。
 *
 * 字段名保持与 INI 完全一致（大写/驼峰混用是原作本来的样子），
 * 这样从 `docs/03*` 对字段时不需要再做心智映射。
 * 数据来源：`F:\sanguo\tools\import_legacy.py` → `F:\sanguo\data\*.json`
 */

/** 13×13 兵种 / 9×9 阵形 相克矩阵，行=攻方、列=守方，取值 ±68 或 ±25 */
export interface MatrixTable {
  names: string[];
  matrix: { name: string; vs: number[] }[];
}

/** 阵形的一个槽位分区（mode 1..5），fill 是已算好的格坐标 */
export interface FormationSlot {
  /** 阵形编号 0..10（0..8 是 9 种阵，9/10 是变体） */
  a: number;
  name: string;
  anchorX: number;
  weights: Record<string, number>;
  modes: unknown;
  bbox: unknown;
  /** N 人时的落位，{mode,x,y} 局部坐标；gx = x + anchorX + (200-N)//25 */
  fill: Record<string, { mode: number; x: number; y: number }[]>;
}

export interface FormationTable extends MatrixTable {
  slots: FormationSlot[];
  slot_rule: {
    grid: [number, number];
    cell_px: [number, number];
    formula: string;
    k_of_mode: string;
    source: string;
  };
}

/** 武将技 / 军师技。POWER 恒 100（只用于算气力），真正威力是 ATTACK */
export interface Magic {
  SEQUENCE: number;
  NAME: string;
  MP: number;
  POWER: number;
  ATTACK: number;
  SCRIPT: number;
  ATTRIB: string;
  TITLE?: string;
  NOTE?: string;
  ACTIVE?: string;
  fx_dir?: string[];
  fx_dir_primary?: string;
  fx_frames?: number;
  fx_bytes?: number;
}

export interface Wise {
  SEQUENCE: number;
  Execute: number;
  WiseLevel: number;
  NAME: string;
  ATTRIB: number;
  Level: number;
  ACTIVE: number;
}

export interface General {
  NAME: string;
  FACE?: string;
  STR: number;
  INT: number;
  BaseHP: number;
  BaseMP: number;
  BaseEXP?: number;
  /** 运行时等级：数据表里没有，由战役存档/结算写入（battle.ts、capture.ts、wises.ts 都读 `level`） */
  level?: number;
  Weapon?: string;
  Horse?: string;
  /** 多值字段一律数组：1 条也是数组（见 project/08 §9.5） */
  SKILL?: Array<[number, number]>;
  WISESKILL?: Array<[number, number]>;
  Skill?: Array<[number, number]>;
  POS?: string[];
  /** 已学阵形：9 个单字缩写（方/圓/錐/雁/玄/魚/鉤/衝/箭） */
  BattleArray?: string[];
  /** 当前使用阵形：单个缩写（INI 的 `UseBattleArray`，与本字段同名但类型不同，见下） */
  UseBattleArray?: string;
  /** 全部可带兵种（13 个单字缩写，含未学）；原作按 `1<<兵种号` 匹配兵符 */
  Force?: string[];
  /** 当前可带兵种（`UseForce`，原作用这个上阵；通常 1 个） */
  UseForce?: string[];
  CITY?: string;
  Status?: string;
  BLOOD?: string;
  CONSTANCY?: number;
  /** 忠诚度 0..99（`general+0x3C`），战后处置用；INI 里叫 `Loyal` */
  Loyal?: number;
  /** INI 的 `LOYAL`：情义势力（04b2 §2.2 的 `+0xBF`），当前数据全空 */
  LOYAL?: string;
  TYPE?: number;
}

export interface Terrain {
  Name: string;
  Sequence: number;
  SoundTrack: number;
  Floor: string;
  Foreground: string;
  Midground: string;
  Background: string;
  _index: number;
  /**
   * 地形×兵种相克行，13 个 int（= docs/04b §3.2 的 12×13 表按行拆开；列=兵种 0..12）。
   * 原作 `0x4307AE TerrainMod` 取 `[terrain*0x34 + thing*4 + 0x48D030]`，所以**索引即地形 id**，
   * 与 `Name` 无关（索引 3 叫"船上"、索引 7 才叫"森林"）。缺失/越界一律按 0 处理。
   */
  vs?: number[];
}

export interface Item {
  Sequence: number;
  Name: string;
  Attrib: string;
  TYPE: string;
  Sort: number;
  Level: number;
  Rate: number;
  /** 掉落/搜索判定类型：0 无条件 / 1 等级接近 / 2 等级够高（04b2 §5.3） */
  SearchType?: number;
  /**
   * 兵符位掩码 `1 << 兵种号`（0..4096）；非兵符是空字符串 `""` 而不是 0，故类型放宽。
   * 见 `core/unlock.ts`。
   */
  Force?: number | string;
  /** 阵法书位掩码 `1 << 阵形号`（0..256）；非阵法书是空字符串 `""`。见 `core/unlock.ts`。 */
  Battle?: number | string;
  Sprite?: string;
  Description?: string;
}

/**
 * 战役存档（game/web/campaign.html 的那份 localStorage JSON 的最小可用子集）。
 *
 * 这里只声明本仓库 TS 侧真正会读写的字段，其余（month/log/ts…）由 web 层自己管；
 * 加上索引签名是为了让 JS 侧多出来的键不至于让类型守卫炸掉。
 */
export interface CampaignSave {
  /** [R242] 戰後生死/俘虜：名冊狀態權威（'死' / '俘'），由 `markGeneralGone()` 寫入 */
  generalStatus?: Record<string, string>;
  /** [R244] 城名 → 被我方接管的月份（我方打下來的城不再回落劇本表找人） */
  takenOver?: Record<string, number>;
  gold?: number;
  /** 已占领城池名 */
  owned?: string[];
  /** 城名 → 城况（troops/pop/money…），web 层结构 */
  cities?: Record<string, Record<string, unknown>>;
  /** 城名 → 该城武将名列表；战后招降的人落在这里 */
  roster?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface Scenario {
  id: number;
  file: string;
  system: Record<string, unknown>;
  kings: { NAME: string; FLAGNUM: number; SELECT: number; Type: number }[];
  cities: unknown[];
  paths: unknown[];
  generals: unknown[];
}

/** 运行时只读的全量数据 */
export interface GameData {
  troops: MatrixTable;
  formations: FormationTable;
  magics: Magic[];
  wises: Wise[];
  generals: General[];
  terrains: Terrain[];
  items: Item[];
  scenarios: Scenario[];
}
