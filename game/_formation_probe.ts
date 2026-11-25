/**
 * 布阵探针（m4 交付物，可留仓库）：只读 `core`，不碰视图/渲染。
 *
 * 用法： `cd F:/sanguo/game; node _formation_probe.ts`
 *
 * 打印 方形 / 錐形 / 箭矢 在 N = 10 / 50 / 100 / 200 时的
 *  - A/B 两侧逐行（每个 y）的 x 范围
 *  - 两侧整体 x 范围、最近格距（欧氏，同排时就是 dx）
 *
 * 验收基线（project/174 §4.1）：方形 N=100 → A 兵 51..61、B 兵 10..20、最近 31 格。
 */
import { loadData } from './src/data.ts';
import { createWorld, formationCells } from './src/core/battle.ts';
import type { FormationCell, Side } from './src/core/battle.ts';

const data = loadData({
  dir: new URL('./data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

const CASES: { name: string; formation: number }[] = [
  { name: '方形', formation: 0 },
  { name: '錐形', formation: 2 },
  { name: '箭矢', formation: 8 },
];
const SIZES = [10, 50, 100, 200];

function range(xs: number[]): [number, number] {
  return [Math.min(...xs), Math.max(...xs)];
}

function nearest(a: FormationCell[], b: FormationCell[]): { d: number; pa: FormationCell; pb: FormationCell } {
  let best = { d: Infinity, pa: a[0]!, pb: b[0]! };
  for (const pa of a) {
    for (const pb of b) {
      const d = Math.hypot(pa.gx - pb.gx, pa.gy - pb.gy);
      if (d < best.d) best = { d, pa, pb };
    }
  }
  return best;
}

function rows(cells: FormationCell[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const c of cells) {
    const arr = m.get(c.gy) ?? [];
    arr.push(c.gx);
    m.set(c.gy, arr);
  }
  return m;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

for (const { name, formation } of CASES) {
  for (const n of SIZES) {
    const A = formationCells(data.formations, formation, n, 'A' as Side);
    const B = formationCells(data.formations, formation, n, 'B' as Side);
    const ra = range(A.map((c) => c.gx));
    const rb = range(B.map((c) => c.gx));
    const near = nearest(A, B);
    const rowsA = rows(A);
    const rowsB = rows(B);
    const ys = [...new Set([...rowsA.keys(), ...rowsB.keys()])].sort((x, y) => x - y);
    console.log(`${name} N=${n}  兵数 A=${A.length} B=${B.length}  A.x=${ra[0]}..${ra[1]}  B.x=${rb[0]}..${rb[1]}  最近=${fmt(near.d)}  (A ${near.pa.gx},${near.pa.gy} ↔ B ${near.pb.gx},${near.pb.gy})`);
    for (const y of ys) {
      const xa = rowsA.get(y);
      const xb = rowsB.get(y);
      const sa = xa ? `A ${range(xa)[0]}..${range(xa)[1]}(${xa.length})` : 'A —';
      const sb = xb ? `B ${range(xb)[0]}..${range(xb)[1]}(${xb.length})` : 'B —';
      console.log(`   y=${String(y).padStart(2)}  ${sb.padEnd(18)}  ${sa}`);
    }
    console.log('');
  }
}

// 主将落位（`0x404DAF` + `0x442D1B`）：走 createWorld，顺带验证布阵整体（兵数/主将格）。
console.log('主将落位（createWorld，两侧同阵同兵）');
for (const { name, formation } of CASES) {
  const line: string[] = [];
  for (const n of SIZES) {
    const w = createWorld({
      data,
      seed: 1,
      a: { formation, soldiers: n },
      b: { formation, soldiers: n },
    });
    const ga = w.units.find((u) => u.side === 'A' && u.isGeneral)!;
    const gb = w.units.find((u) => u.side === 'B' && u.isGeneral)!;
    const na = w.units.filter((u) => u.side === 'A' && !u.isGeneral).length;
    const nb = w.units.filter((u) => u.side === 'B' && !u.isGeneral).length;
    line.push(`N=${n}: A(${ga.x},${ga.y})/${na}兵 B(${gb.x},${gb.y})/${nb}兵`);
  }
  console.log(`${name}  ${line.join('   ')}`);
}
