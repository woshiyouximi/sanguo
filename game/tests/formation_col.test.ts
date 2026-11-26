/**
 * F26 武將站位（前 / 中 / 後列）—— 原作战前四件事的最后一件。
 *
 * 证据：`work/ref_pdf/sanguo2_guide.txt` L152「武将站位 拖到前 / 中 / 后列，决定谁先挨打」
 *（L161 再列一次「拖顺序、选阵形、选站位」）；戰前面板的「定位」行两侧各显一档
 *（`work/video_ui_b/crop_cmp_mid.png`）⇒ 三档。纵深量的换算见 `battle.ts` 的 F26 注释：
 * 源帧排距 40–45px ÷ 1 身位 33px = 1.2–1.4 身位；本项目 1 格 = 1.33 身位 ⇒ 1 排距 ≈ 1 格
 * ⇒ 前 = +1 格、中 = 0、後 = −1 格。
 *
 * 这里钉的是**接口 + 落位**（core 的三个纯函数、createWorld 的 gx、同距接敌的 tie-break）
 * 与**出征页契约**（col 进 deployQueue、随 URL 传），不测画面。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.ts';
import {
  COL_RANK,
  colOffsetOf,
  colRankOf,
  createWorld,
  nearestEnemy,
  normalizeCol,
  parseCols,
  unitCell,
} from '../src/core/battle.ts';
import type { Unit, World } from '../src/core/battle.ts';

const data = loadData();

/** 找某侧主将（createWorld 每侧只放一名 `isGeneral`）。 */
function generalOf(world: World, side: 'A' | 'B'): Unit {
  const u = world.units.find((v) => v.isGeneral && v.side === side);
  assert.ok(u, `${side} 侧必须有主将单位`);
  return u!;
}

function gxOf(world: World, side: 'A' | 'B'): number {
  return unitCell(generalOf(world, side)).gx;
}

/** 同一局的三个变体：col = front / mid / back（其余参数逐字相同）。 */
function worldWithCol(col: 'front' | 'mid' | 'back' | undefined, side: 'A' | 'B' = 'A'): World {
  const cfg = { troop: 2, formation: 0, soldiers: 100, general: { name: '關羽', str: 97, int: 75 } };
  const withCol = col === undefined ? cfg : { ...cfg, col };
  return side === 'A'
    ? createWorld({ data, seed: 7, a: withCol })
    : createWorld({ data, seed: 7, b: withCol });
}

// ────────────────────────────────────────────── ① 解析 cols=

test('parseCols：出征 URL 的緊凑式「關羽:front,張飛:back」', () => {
  assert.deepEqual(parseCols('關羽:front,張飛:back'), { 關羽: 'front', 張飛: 'back' });
  // 全形逗號 / 分號也認（出征令是字串拼出來的，鍵盤/輸入法都可能給全形）
  assert.deepEqual(parseCols('關羽：front，張飛：back'), { 關羽: 'front', 張飛: 'back' });
  assert.deepEqual(parseCols('關羽:front;張飛:back'), { 關羽: 'front', 張飛: 'back' });
  assert.deepEqual(parseCols('關羽:前,張飛:後'), { 關羽: 'front', 張飛: 'back' });
});

// ────────────────────────────────────────────── ② 未知值回落 mid

test('parseCols：未知值回落 mid，沒有冒號/空名字整段丟掉', () => {
  assert.deepEqual(parseCols('關羽:sideways'), { 關羽: 'mid' });
  assert.deepEqual(parseCols('關羽:'), { 關羽: 'mid' });
  assert.deepEqual(parseCols('關羽:123'), { 關羽: 'mid' });
  // 沒冒號 = 不知道是誰的檔位 ⇒ 丟掉，不猜
  assert.deepEqual(parseCols('關羽,張飛:back'), { 張飛: 'back' });
  // 名字是空的也丟掉
  assert.deepEqual(parseCols(':front'), {});
  // 非字串（?cols= 不存在 / 被別的東西塞進來）：空表，戰鬥照常開
  assert.deepEqual(parseCols(null), {});
  assert.deepEqual(parseCols(undefined), {});
  assert.deepEqual(parseCols(''), {});
});

// ────────────────────────────────────────────── ③ 空格 / 中文冒號容錯

test('parseCols：空格與中文冒號容錯，值本身也 trim', () => {
  assert.deepEqual(parseCols(' 關羽 ： 前 ， 張飛 ： 後 '), { 關羽: 'front', 張飛: 'back' });
  assert.deepEqual(parseCols('\t關羽 :  FRONT \n'), { 關羽: 'front' });
  assert.deepEqual(parseCols('關羽 : 中'), { 關羽: 'mid' });
});

test('normalizeCol / colOffsetOf / COL_RANK：三檔只有一個口徑', () => {
  assert.equal(normalizeCol('front'), 'front');
  assert.equal(normalizeCol('f'), 'front');
  assert.equal(normalizeCol('前'), 'front');
  assert.equal(normalizeCol('前列'), 'front');
  assert.equal(normalizeCol('back'), 'back');
  assert.equal(normalizeCol('後列'), 'back');
  assert.equal(normalizeCol('后列'), 'back');
  assert.equal(normalizeCol('mid'), 'mid');
  assert.equal(normalizeCol('中'), 'mid');
  assert.equal(normalizeCol('別的東西'), 'mid');
  assert.equal(normalizeCol(undefined), 'mid');
  assert.equal(normalizeCol(3), 'mid');
  // 朝敵方為正：前 +1 格、中 0、後 −1 格（換算見檔頭）
  assert.equal(colOffsetOf('front'), 1);
  assert.equal(colOffsetOf('mid'), 0);
  assert.equal(colOffsetOf('back'), -1);
  assert.equal(colOffsetOf(undefined), 0);
  // 縱深序：越小越前
  assert.ok(COL_RANK.front < COL_RANK.mid && COL_RANK.mid < COL_RANK.back);
  assert.equal(colRankOf('front'), 0);
  assert.equal(colRankOf('back'), 2);
});

// ────────────────────────────────────────────── ④ createWorld：列决定 gx

test('createWorld：A 側「前 < 中 < 後」，各差 1 格（中列 = 既有落位）', () => {
  const front = gxOf(worldWithCol('front'), 'A');
  const mid = gxOf(worldWithCol('mid'), 'A');
  const back = gxOf(worldWithCol('back'), 'A');
  const bare = gxOf(worldWithCol(undefined), 'A');
  // A 側面朝 −x（step 的 `f = A ? -1 : 1`）⇒ 前列 = gx 更小 = 離敵陣更近
  assert.ok(front < mid, `前列應該更靠前：front gx=${front} mid gx=${mid}`);
  assert.ok(mid < back, `後列應該更靠後：mid gx=${mid} back gx=${back}`);
  assert.equal(mid - front, 1, '前 vs 中應差 1 格');
  assert.equal(back - mid, 1, '後 vs 中應差 1 格');
  // 中列 = 不帶 col 的舊落位（既有對局逐格不變）
  assert.equal(mid, bare, '中列必須逐格等於舊落位');
});

test('createWorld：B 側鏡像（面朝 +x ⇒ 前列 gx 更大），中列不動', () => {
  const front = gxOf(worldWithCol('front', 'B'), 'B');
  const mid = gxOf(worldWithCol('mid', 'B'), 'B');
  const back = gxOf(worldWithCol('back', 'B'), 'B');
  assert.ok(front > mid, `B 側前列應朝 +x：front gx=${front} mid gx=${mid}`);
  assert.ok(mid > back, `B 側後列應朝 −x：mid gx=${mid} back gx=${back}`);
  assert.equal(front - mid, 1);
  assert.equal(mid - back, 1);
  assert.equal(mid, gxOf(worldWithCol(undefined, 'B'), 'B'));
});

test('createWorld：主將單位帶 col，中列不帶 col 也照舊', () => {
  const w = worldWithCol('front');
  assert.equal(w.sides.A.col, 'front');
  assert.equal(worldWithCol('back').sides.A.col, 'back');
  assert.equal(worldWithCol(undefined).sides.A.col, undefined);
  assert.equal(generalOf(w, 'A').col, 'front');
  // 前/後列只挪主將：本方小兵格數不變，站位不吃掉陣列
  assert.equal(w.units.filter((u) => !u.isGeneral && u.side === 'A').length, 100);
  assert.equal(worldWithCol('front').units.length, worldWithCol('mid').units.length);
});

// ────────────────────────────────────────────── ⑤ 同距接敵：前列優先

test('nearestEnemy：完全同距時前列優先（無 col 時保持陣列序）', () => {
  const w = worldWithCol(undefined);
  w.units.length = 0;
  const me: Unit = { side: 'A', x: 30, y: 6, prevX: 30, prevY: 6, alive: true, cd: 0 };
  const soldier: Unit = { side: 'B', x: 32, y: 6, prevX: 32, prevY: 6, alive: true, cd: 0, kind: 'infantry' };
  const frontGen: Unit = { side: 'B', x: 28, y: 6, prevX: 28, prevY: 6, alive: true, cd: 0, isGeneral: true, col: 'front' };
  const backGen: Unit = { side: 'B', x: 28, y: 6, prevX: 28, prevY: 6, alive: true, cd: 0, isGeneral: true, col: 'back' };
  // 两个候选都在 2 格外（一左一右）：旧口径取数组里先出现的（小兵）
  w.units.push(soldier, frontGen);
  assert.equal(nearestEnemy(w, me), frontGen, '同距時前列的主將應先被選中');
  // 同样位置换成後列主將：rank 比小兵更後 ⇒ 小兵仍先被選中（规则是"列序"，不是"武将优先"）
  w.units.length = 0;
  w.units.push(soldier, backGen);
  assert.equal(nearestEnemy(w, me), soldier, '同距時後列主將不該插隊');
  // 两个都没有 col：退回数组序（既有对局逐位不变）
  w.units.length = 0;
  const s2: Unit = { side: 'B', x: 32, y: 6, prevX: 32, prevY: 6, alive: true, cd: 0, kind: 'infantry' };
  const s3: Unit = { side: 'B', x: 28, y: 6, prevX: 28, prevY: 6, alive: true, cd: 0, kind: 'infantry' };
  w.units.push(s2, s3);
  assert.equal(nearestEnemy(w, me), s2, '没有站位信息时保持旧行为');
});

// ────────────────────────────────────────────── ⑥ 出征页 / 战斗页契约

const readWeb = (rel: string) => readFileSync(new URL(`../web/${rel}`, import.meta.url), 'utf8');

test('deploy.html：站位三檔写进 deployQueue 的每项，并随出战 URL 传 cols=', () => {
  const src = readWeb('deploy.html');
  // 三档标签 + 三按钮（不是拖放）
  assert.match(src, /COL_LABEL = \{ front: '前', mid: '中', back: '後' \}/);
  assert.match(src, /data-qcol="\$\{i\}:\$\{c\}"/);
  assert.match(src, /\.qrow \.qcol button/);
  // 每项队列槽都带 col，缺省 mid；另按武將名持久化（deploy_queue 的 saveQueue 只留三栏）
  assert.match(src, /col: COL_BY_NAME\[s\.general\] \|\| s\.col \|\| 'mid'/);
  assert.match(src, /sanguo_deploy_cols_v1/);
  assert.match(src, /COL_BY_NAME\[queue\[idx\]\.general\] = col/);
  // 出战 URL：cols=關羽:front,張飛:back 的紧凑式
  assert.match(src, /function deployColsParam\(\)/);
  assert.match(src, /\.map\(\(s\) => `\$\{s\.general\}:\$\{s\.col \|\| colOf\(s\.general\)\}`\)/);
  assert.match(src, /cols: deployColsParam\(\),/);
});

test('main.js：解析 ?cols= 并写进 createWorld 的 a.col', () => {
  const src = readWeb('main.js');
  assert.match(src, /parseCols, requestRetreat/);           // 从 dist/core/battle.js 进 import
  assert.match(src, /cols: parseCols\(q\.get\('cols'\)\)/);
  assert.match(src, /col: \(cfg\.aGeneral\.name && cfg\.cols\[cfg\.aGeneral\.name\]\) \|\| 'mid'/);
});
