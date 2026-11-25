import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MARCH_PER_MONTH,
  SENTINEL_LENGTH,
  advance,
  intercept,
  pathBetween,
  posOf,
  type Army,
  type ScenarioLike,
} from '../src/core/march.ts';

const scenario = JSON.parse(
  readFileSync(new URL('../data/scenarios.json', import.meta.url), 'utf8'),
)[0] as ScenarioLike;

function mk(over: Partial<Army> = {}): Army {
  return {
    id: 'a1',
    side: 'A',
    from: '北平',
    to: '易京',
    pathIndex: pathBetween(scenario, '北平', '易京') ?? -1,
    progress: 0,
    troops: 100,
    ...over,
  };
}

function pair(a: string, b: string) {
  return scenario.paths
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.Start === a && p.End === b) || (p.Start === b && p.End === a));
}

test('pathBetween：找到相邻城的可走路，并返回该路的下标', () => {
  const i = pathBetween(scenario, '北平', '易京');
  assert.equal(typeof i, 'number');
  const p = scenario.paths[i as number];
  assert.ok(
    (p.Start === '北平' && p.End === '易京') || (p.Start === '易京' && p.End === '北平'),
    `返回的路 ${p.Start}-${p.End} 不是 北平-易京`,
  );
  assert.ok((p.Length ?? 0) < SENTINEL_LENGTH);
});

test('pathBetween：反方向也能找到同一条路', () => {
  const a = pathBetween(scenario, '北平', '易京');
  const b = pathBetween(scenario, '易京', '北平');
  assert.equal(a, b);
});

test('pathBetween：不相邻（隔一座城）返回 null', () => {
  // 襄平 → 易京 要经过 北平，Army 一次只走一条路
  assert.equal(pair('襄平', '易京').length, 0);
  assert.equal(pathBetween(scenario, '襄平', '易京'), null);
});

test('pathBetween：跳过 Length>=30000 的哨兵路', () => {
  const sentinels = pair('北平', '代縣');
  assert.ok(sentinels.length > 0, '样本里 北平-代縣 应有哨兵路');
  assert.ok(sentinels.every(({ p }) => (p.Length ?? 0) >= SENTINEL_LENGTH));
  assert.equal(pair('北平', '代縣').filter(({ p }) => (p.Length ?? 0) < SENTINEL_LENGTH).length, 0);
  assert.equal(pathBetween(scenario, '北平', '代縣'), null);
});

test('pathBetween：同城 / 空名返回 null', () => {
  assert.equal(pathBetween(scenario, '北平', '北平'), null);
  assert.equal(pathBetween(scenario, '北平', ''), null);
});

test('advance：标准速度 3 个月走完一条路', () => {
  const a = mk({ progress: 0 });
  const m1 = advance([a], 1);
  assert.equal(a.progress, MARCH_PER_MONTH);
  assert.equal(m1.still.length, 1);
  assert.equal(m1.arrived.length, 0);

  advance([a], 1);
  assert.equal(a.progress, 2 * MARCH_PER_MONTH);

  const m3 = advance([a], 1);
  assert.equal(a.progress, 1);
  assert.deepEqual(m3.arrived.map((x) => x.id), ['a1']);
  assert.equal(m3.still.length, 0);
});

test('advance：speed=3 一个月到（近路），speed=1.5 两个月到', () => {
  const fast = mk({ id: 'fast', progress: 0 });
  const fast1 = advance([fast], 3);
  assert.equal(fast.progress, 1);
  assert.deepEqual(fast1.arrived.map((x) => x.id), ['fast']);

  const mid = mk({ id: 'mid', progress: 0 });
  const mid1 = advance([mid], 1.5);
  assert.equal(mid.progress, 0.5);
  assert.equal(mid1.arrived.length, 0);
  const mid2 = advance([mid], 1.5);
  assert.equal(mid.progress, 1);
  assert.equal(mid2.arrived.length, 1);
});

test('advance：到达后不再前进，也不越过 1', () => {
  const a = mk({ progress: 0.9 });
  advance([a], 1);
  assert.equal(a.progress, 1);
  advance([a], 1);
  advance([a], 3);
  assert.equal(a.progress, 1);
});

test('advance：progress 异常（NaN / 负数）按 0 起算并夹在 0..1', () => {
  const a = mk({ progress: Number.NaN });
  advance([a], 1);
  assert.equal(a.progress, MARCH_PER_MONTH);
  const b = mk({ id: 'b', progress: -5 });
  advance([b], 1);
  assert.equal(b.progress, MARCH_PER_MONTH);
});

test('posOf：progress 0 / 0.5 / 1 落在折线上（手写直线样本）', () => {
  const sc: ScenarioLike = {
    cities: [
      { NAME: 'A', pos_xy: [0, 0] },
      { NAME: 'B', pos_xy: [100, 0] },
    ],
    paths: [{ Start: 'A', End: 'B', Length: 100, points: [[0, 0], [50, 0], [100, 0]] }],
  };
  const at = (progress: number) => posOf(sc, mk({ from: 'A', to: 'B', pathIndex: 0, progress }));
  assert.deepEqual(at(0), [0, 0]);
  assert.deepEqual(at(0.5), [50, 0]);
  assert.deepEqual(at(1), [100, 0]);
});

test('posOf：progress 超出 0..1 被夹住', () => {
  const sc: ScenarioLike = {
    cities: [
      { NAME: 'A', pos_xy: [0, 0] },
      { NAME: 'B', pos_xy: [100, 0] },
    ],
    paths: [{ Start: 'A', End: 'B', Length: 100, points: [[0, 0], [100, 0]] }],
  };
  assert.deepEqual(posOf(sc, mk({ from: 'A', to: 'B', pathIndex: 0, progress: 1.7 })), [100, 0]);
  assert.deepEqual(posOf(sc, mk({ from: 'A', to: 'B', pathIndex: 0, progress: -0.4 })), [0, 0]);
});

test('posOf：从终点往起点走时方向相反', () => {
  const sc: ScenarioLike = {
    cities: [
      { NAME: 'A', pos_xy: [0, 0] },
      { NAME: 'B', pos_xy: [100, 0] },
    ],
    paths: [{ Start: 'A', End: 'B', Length: 100, points: [[0, 0], [100, 0]] }],
  };
  assert.deepEqual(posOf(sc, mk({ from: 'B', to: 'A', pathIndex: 0, progress: 0 })), [100, 0]);
  assert.deepEqual(posOf(sc, mk({ from: 'B', to: 'A', pathIndex: 0, progress: 0.25 })), [75, 0]);
  assert.deepEqual(posOf(sc, mk({ from: 'A', to: 'B', pathIndex: 0, progress: 0.25 })), [25, 0]);
});

test('posOf：真实路两端落在城点附近，中点落在折线上', () => {
  const i = pathBetween(scenario, '北平', '易京');
  assert.equal(typeof i, 'number');
  const p = scenario.paths[i as number];
  const fromPos = scenario.cities.find((c) => c.NAME === p.Start)?.pos_xy as number[];
  const toPos = scenario.cities.find((c) => c.NAME === p.End)?.pos_xy as number[];

  const start = posOf(scenario, mk({ from: p.Start, to: p.End, pathIndex: i as number, progress: 0 }));
  const end = posOf(scenario, mk({ from: p.Start, to: p.End, pathIndex: i as number, progress: 1 }));
  // 道路端点与城点不是同一个像素（城点取中心，路端点略偏 ~2px），允许小误差
  assert.ok(Math.hypot(start[0] - fromPos[0], start[1] - fromPos[1]) < 6);
  assert.ok(Math.hypot(end[0] - toPos[0], end[1] - toPos[1]) < 6);

  const mid = posOf(scenario, mk({ from: p.Start, to: p.End, pathIndex: i as number, progress: 0.5 }));
  const pts = p.points as number[][];
  let best = Infinity;
  for (let k = 1; k < pts.length; k++) {
    const [x1, y1] = pts[k - 1];
    const [x2, y2] = pts[k];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((mid[0] - x1) * dx + (mid[1] - y1) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(mid[0] - (x1 + dx * t), mid[1] - (y1 + dy * t)));
  }
  assert.ok(best < 0.001, `中点离折线 ${best}px`);
});

test('intercept：同一条路、相向、进度交错 → 相遇', () => {
  const a = mk({ id: 'a', side: 'A', from: '北平', to: '易京', progress: 0.6 });
  const b = mk({ id: 'b', side: 'B', from: '易京', to: '北平', progress: 0.5 });
  assert.equal(a.pathIndex, b.pathIndex);
  assert.equal(intercept(a, b), true);
  assert.equal(intercept(b, a), true);
});

test('intercept：同向、不同路、同阵营、已到城下都不算', () => {
  const a = mk({ id: 'a', side: 'A', from: '北平', to: '易京', progress: 0.7 });
  const sameDir = mk({ id: 'b', side: 'B', from: '北平', to: '易京', progress: 0.6 });
  assert.equal(intercept(a, sameDir), false);

  const otherRoad = mk({ id: 'c', side: 'B', from: '易京', to: '北平', progress: 0.6 });
  otherRoad.pathIndex = (a.pathIndex + 1) % scenario.paths.length;
  assert.equal(intercept(a, otherRoad), false);

  const sameSide = mk({ id: 'd', side: 'A', from: '易京', to: '北平', progress: 0.6 });
  assert.equal(intercept(a, sameSide), false);

  const arrived = mk({ id: 'e', side: 'B', from: '易京', to: '北平', progress: 1 });
  assert.equal(intercept(a, arrived), false);
});

test('intercept：还没交错（和 < 1）不算相遇', () => {
  const a = mk({ id: 'a', side: 'A', from: '北平', to: '易京', progress: 0.4 });
  const b = mk({ id: 'b', side: 'B', from: '易京', to: '北平', progress: 0.55 });
  assert.equal(intercept(a, b), false);
});
