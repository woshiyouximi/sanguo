/**
 * 数据装载：把 `data/*.json` 读成强类型 `GameData`，并做条数校验。
 *
 * 条数校验不是洁癖——它是"移植时数据没搬错"的唯一廉价保险：
 * 原作 60 城 / 116 路 / 401 将 / 110 技 / 67 军师技 / 77 物品 / 12 地形 / 13 兵种 / 9 阵形。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  FormationTable,
  GameData,
  General,
  Item,
  Magic,
  MatrixTable,
  Scenario,
  Terrain,
  Wise,
} from './types.ts';

export const EXPECT = {
  generals: 401,
  magics: 110,
  wises: 67,
  items: 77,
  terrains: 12,
  troops: 13,
  formations: 9,
} as const;

function readJson<T>(dir: string, name: string): T {
  return JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
}

export interface LoadOptions {
  /** 数据目录，默认 `./data`（相对进程 cwd） */
  dir?: string;
  /** 是否校验条数，默认 true */
  validate?: boolean;
}

export function loadData(opts: LoadOptions = {}): GameData {
  const dir = opts.dir ?? join(process.cwd(), 'data');
  const data: GameData = {
    troops: readJson<MatrixTable>(dir, 'troops.json'),
    formations: readJson<FormationTable>(dir, 'formations.json'),
    magics: readJson<Magic[]>(dir, 'magics.json'),
    wises: readJson<Wise[]>(dir, 'wises.json'),
    generals: readJson<General[]>(dir, 'generals.json'),
    terrains: readJson<Terrain[]>(dir, 'terrains.json'),
    items: readJson<Item[]>(dir, 'items.json'),
    scenarios: readJson<Scenario[]>(dir, 'scenarios.json'),
  };
  if (opts.validate !== false) validate(data);
  return data;
}

/** 条数 + 矩阵反对称 + 名字表一致性，任一不符直接抛错 */
export function validate(data: GameData): void {
  const checks: [string, number, number][] = [
    ['generals', data.generals.length, EXPECT.generals],
    ['magics', data.magics.length, EXPECT.magics],
    ['wises', data.wises.length, EXPECT.wises],
    ['items', data.items.length, EXPECT.items],
    ['terrains', data.terrains.length, EXPECT.terrains],
    ['troops', data.troops.names.length, EXPECT.troops],
    ['formations', data.formations.names.length, EXPECT.formations],
  ];
  for (const [name, got, want] of checks) {
    if (got !== want) throw new Error(`数据条数不符: ${name} = ${got}，期望 ${want}`);
  }
  assertAntisymmetric('兵种', data.troops);
  assertAntisymmetric('阵形', data.formations);
  // 多值字段一律数组（project/08 §9.5）。老数据里 102 人的 WISESKILL 是字符串，
  // 消费方按数组取会静默拿到 undefined，所以在入口就把契约钉死。
  assertArrayFields(data.generals as unknown as Array<Record<string, unknown>>, [
    'SKILL',
    'WISESKILL',
    'POS',
    'BattleArray',
    'Force',
    'UseForce',
  ]);
}

function assertArrayFields(rows: Array<Record<string, unknown>>, fields: string[]): void {
  for (const f of fields) {
    let bad = 0;
    for (const r of rows) {
      const v = r[f];
      if (v !== undefined && !Array.isArray(v)) bad++;
    }
    if (bad > 0) throw new Error(`字段 ${f} 有 ${bad} 行不是数组（应为数组）`);
  }
}

function assertAntisymmetric(label: string, table: MatrixTable): void {
  // 阵形表是 9 个「可选阵」+ 11×11 相克表：matrix 的前 names.length 行/列就是那 9 阵，
  // 多出来的行/列是引擎内部阵（特殊阵型 / 亂陣，见 tools/export_slots.py MATRIX_11），
  // 它们的名字在 matrix_names 里。所以行数以 matrix 为准，名字以 matrix_names 兜底。
  const n = table.matrix.length;
  const extra = (table as MatrixTable & { matrix_names?: string[] }).matrix_names;
  if (n < table.names.length) throw new Error(`${label}矩阵行数 ${n} 少于阵形数 ${table.names.length}`);
  for (let i = 0; i < n; i++) {
    const row = table.matrix[i]!;
    const expect = table.names[i] ?? extra?.[i];
    if (expect !== undefined && row.name !== expect) throw new Error(`${label}第 ${i} 行名 ${row.name} != ${expect}`);
    if (row.vs.length !== n) throw new Error(`${label}第 ${i} 行列数 ${row.vs.length} != ${n}`);
    if (row.vs[i] !== 0) throw new Error(`${label}对角不为 0: [${i}][${i}] = ${row.vs[i]}`);
    for (let j = 0; j < n; j++) {
      const sum = row.vs[j]! + table.matrix[j]!.vs[i]!;
      if (sum !== 0) throw new Error(`${label}矩阵不反对称: [${i}][${j}]+[${j}][${i}] = ${sum}`);
    }
  }
}

/** 按名字查兵种/阵形下标；查不到返回 -1（调用方决定要不要报错） */
export function indexOf(table: MatrixTable, name: string): number {
  return table.names.indexOf(name);
}
