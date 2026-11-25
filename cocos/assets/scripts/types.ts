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
  Weapon?: string;
  Horse?: string;
  Skill?: string;
  WiseSkill?: string;
  POS?: string;
  CITY?: string;
  Status?: string;
  BLOOD?: string;
  CONSTANCY?: number;
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
}

export interface Item {
  Sequence: number;
  Name: string;
  Attrib: string;
  TYPE: string;
  Sort: number;
  Level: number;
  Rate: number;
  Force?: number;
  Sprite?: string;
  Description?: string;
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
