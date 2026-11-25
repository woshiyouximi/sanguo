/**
 * 大地圖部隊層（project/182）純函數自檢。
 *
 * 測的不是另寫一份鏡像：直接從 `web/campaign.html` 抽 `[[MARCH_UI_CORE]]` 段，用 `new Function`
 * 跑（手法同 tests/fatigue.test.ts）——頁面壞了這裡就紅，測試寫得再漂亮也沒用。
 * 這一段刻意不碰 DOM / save / view，所以不需要 jsdom，`node --test` 直跑。
 *
 * 覆蓋任務的三條硬指標：
 *   · 進度 → 座標（含反向路段、夾取、非法點）
 *   · 命中判定（半徑 ≥14、取最近、邊界）
 *   · 變更目的校驗（相鄰才通、敵軍/自家城/出發城一律不通）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Retarget = { ok: boolean; pathIndex?: number; why: string };

type MarchUiApi = {
  MARCH_FLAG_W: number;
  MARCH_HIT_R: number;
  MARCH_STACK_GAP: number;
  marchClamp01(n: unknown): number;
  marchLerpPoint(points: unknown, progress: unknown, reverse?: boolean): [number, number];
  marchStackPlace(base: unknown, minDist?: number): Array<[number, number]>;
  marchHitArmy(placed: unknown, px: unknown, py: unknown, r?: number): number;
  marchRetargetCheck(
    army: unknown,
    to: unknown,
    pathOf?: (a: string, b: string) => number | null,
    isMine?: (n: string) => boolean,
  ): Retarget;
  marchRemain(progress: unknown, step: unknown, daysPerMonth?: number): {
    progress: number;
    pct: number;
    months: number;
    days: number;
  };
  marchAtCity(army: unknown): string;
};

const HTML = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');

function pickCore(): MarchUiApi {
  const hit = HTML.match(/\/\/ \[\[MARCH_UI_CORE\]\][^\n]*\n([\s\S]*?)\/\/ \[\[\/MARCH_UI_CORE\]\]/);
  assert.ok(hit, 'campaign.html 裡找不到 [[MARCH_UI_CORE]] 段');
  const make = new Function(`${hit[1]}
    return { MARCH_FLAG_W, MARCH_HIT_R, MARCH_STACK_GAP, marchClamp01, marchLerpPoint,
      marchStackPlace, marchHitArmy, marchRetargetCheck, marchRemain, marchAtCity };`);
  return make() as MarchUiApi;
}

const C = pickCore();

// ─────────────────────────────────────────────────────────────
// 進度 → 座標
// ─────────────────────────────────────────────────────────────
test('進度→座標：直線上 0/0.5/1', () => {
  const line = [[0, 0], [100, 0]];
  assert.deepEqual(C.marchLerpPoint(line, 0), [0, 0]);
  assert.deepEqual(C.marchLerpPoint(line, 0.5), [50, 0]);
  assert.deepEqual(C.marchLerpPoint(line, 1), [100, 0]);
  assert.deepEqual(C.marchLerpPoint(line, 0.25), [25, 0]);
});

test('進度→座標：折線按段長插值（不是按點數）', () => {
  // 兩段：50 步向右 + 100 步向下，總長 150 → 半程落在第二段 25 處
  const bent = [[0, 0], [50, 0], [50, 100]];
  assert.deepEqual(C.marchLerpPoint(bent, 0), [0, 0]);
  assert.deepEqual(C.marchLerpPoint(bent, 0.5), [50, 25]);
  assert.deepEqual(C.marchLerpPoint(bent, 1), [50, 100]);
  // 1/3 剛好是第一段末尾
  assert.deepEqual(C.marchLerpPoint(bent, 1 / 3), [50, 0]);
});

test('進度→座標：反向路段（從路徑 End 出發）progress 要鏡像', () => {
  const line = [[0, 0], [100, 0]];
  assert.deepEqual(C.marchLerpPoint(line, 0, true), [100, 0]);
  assert.deepEqual(C.marchLerpPoint(line, 1, true), [0, 0]);
  assert.deepEqual(C.marchLerpPoint(line, 0.5, true), [50, 0]);
  // 對稱性：反向 t 等於正向 1-t（折線也成立）
  const bent = [[0, 0], [50, 0], [50, 100]];
  assert.deepEqual(C.marchLerpPoint(bent, 0.2, true), C.marchLerpPoint(bent, 0.8, false));
});

test('進度→座標：progress 越界/非數值都夾到 0..1，不出 NaN', () => {
  const line = [[0, 0], [100, 0]];
  assert.deepEqual(C.marchLerpPoint(line, -5), [0, 0]);
  assert.deepEqual(C.marchLerpPoint(line, 5), [100, 0]);
  assert.deepEqual(C.marchLerpPoint(line, NaN), [0, 0]);
  assert.deepEqual(C.marchLerpPoint(line, '0.5'), [50, 0]);
  for (const t of [-1, 0, 0.37, 1, 2, NaN, null, 'x']) {
    const [x, y] = C.marchLerpPoint(line, t);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `progress=${String(t)} 出了非有限值`);
  }
});

test('進度→座標：點不足/非法點不會炸', () => {
  assert.deepEqual(C.marchLerpPoint([], 0.5), [0, 0]);
  assert.deepEqual(C.marchLerpPoint(null, 0.5), [0, 0]);
  assert.deepEqual(C.marchLerpPoint([[7, 9]], 0.5), [7, 9]);
  // 90 度角的非法點被丟掉後，剩一條直線
  assert.deepEqual(C.marchLerpPoint([[0, 0], [NaN, 3], [100, 0]], 0.5), [50, 0]);
  assert.deepEqual(C.marchLerpPoint([[0, 0], [5], [100, 0]], 0.5), [50, 0], '單元素點被丟掉');
  // 字串數字（JSON 遺毒）也要吃
  assert.deepEqual(C.marchLerpPoint([['10', '0'], [100, 0]], 0.5), [55, 0]);
});

// ─────────────────────────────────────────────────────────────
// 疊在同一點的多支部隊要錯開
// ─────────────────────────────────────────────────────────────
test('同點多軍：錯開後的兩兩距離 ≥ 間距', () => {
  const placed = C.marchStackPlace([[100, 100], [100, 100], [100, 100]]);
  assert.equal(placed.length, 3);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const d = Math.hypot(placed[i][0] - placed[j][0], placed[i][1] - placed[j][1]);
      assert.ok(d >= C.MARCH_STACK_GAP - 0.001, `第 ${i}/${j} 支只差 ${d}px`);
    }
  }
  // 第一支留在原地（離城最近的部隊不該被推走）
  assert.deepEqual(placed[0], [100, 100]);
});

test('同點多軍：本來就分開的部隊位置不動；空輸入回空', () => {
  assert.deepEqual(C.marchStackPlace([]), []);
  assert.deepEqual(C.marchStackPlace([[0, 0], [200, 0]]), [[0, 0], [200, 0]]);
  // 順序穩定：同一批輸入兩次結果一致（畫旗與命中都吃這一份，位置不能跳）
  const base = [[30, 40], [30, 40], [30, 40], [30, 40]];
  assert.deepEqual(C.marchStackPlace(base), C.marchStackPlace(base));
});

test('同點多軍：超過九宮格仍不會疊死（繼續外擴）', () => {
  const many = Array.from({ length: 12 }, () => [50, 50] as [number, number]);
  const placed = C.marchStackPlace(many);
  const seen = new Set(placed.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`));
  assert.ok(seen.size >= 9, `12 支部隊只落在 ${seen.size} 個位置上`);
});

// ─────────────────────────────────────────────────────────────
// 命中判定
// ─────────────────────────────────────────────────────────────
test('命中：半徑 ≥14px，圓形判定（斜著也算）', () => {
  assert.ok(C.MARCH_HIT_R >= 14, `命中半徑只有 ${C.MARCH_HIT_R}px，任務要求 ≥14`);
  const one = [[100, 100]];
  assert.equal(C.marchHitArmy(one, 100, 100), 0, '正中要命中');
  assert.equal(C.marchHitArmy(one, 110, 100), 0, '10px 要命中');
  assert.equal(C.marchHitArmy(one, 100, 116), 0, '16px（正上）要命中');
  assert.equal(C.marchHitArmy(one, 111, 111), 0, '斜 15.6px 要命中');
  assert.equal(C.marchHitArmy(one, 100, 130), -1, '30px 不該命中');
  assert.equal(C.marchHitArmy(one, 100, 117), -1, '半徑外 1px 不該命中');
});

test('命中：多支取最近；空白處回 -1；半徑可調', () => {
  const two = [[100, 100], [104, 100]];
  assert.equal(C.marchHitArmy(two, 100, 100), 0);
  assert.equal(C.marchHitArmy(two, 104, 100), 1);
  assert.equal(C.marchHitArmy(two, 105, 100), 1, '離第二支更近');
  assert.equal(C.marchHitArmy([], 0, 0), -1);
  assert.equal(C.marchHitArmy([[0, 0]], 'x', 'y'), -1, '非數字座標不該亂命中');
  assert.equal(C.marchHitArmy(two, 110, 100, 5), -1, '半徑 5 時兩支都在圈外');
  assert.equal(C.marchHitArmy(two, 110, 100, 6.5), 1, '半徑 6.5 時第二支（6px）要命中');
});

// ─────────────────────────────────────────────────────────────
// 變更目的校驗（道路合法性走既有 marchPath，由調用方注入）
// ─────────────────────────────────────────────────────────────
const MY = { id: 'm1-1', side: 'A', from: '代縣', to: '晉陽', pathIndex: 7, progress: 0.5, troops: 100 };
const ROUTES: Record<string, number> = { '代縣|雁門': 3, '代縣|鄴': 9, '代縣|晉陽': 7 };
const pathOf = (a: string, b: string): number | null => {
  const k = `${a}|${b}`;
  return Object.prototype.hasOwnProperty.call(ROUTES, k) ? ROUTES[k] : null;
};
const isMine = (n: string): boolean => n === '鄴';

test('變更目的：相鄰城可以，回傳那條路的 pathIndex', () => {
  const r = C.marchRetargetCheck(MY, '雁門', pathOf, isMine);
  assert.equal(r.ok, true);
  assert.equal(r.pathIndex, 3);
  assert.equal(r.why, '');
  // pathIndex 0 是真路徑，不能被 falsy 判斷吃掉
  const zero = C.marchRetargetCheck(MY, '雁門', () => 0, () => false);
  assert.equal(zero.ok, true);
  assert.equal(zero.pathIndex, 0);
});

test('變更目的：拒絕的五種情形（都要有人話理由）', () => {
  const same = C.marchRetargetCheck(MY, '晉陽', pathOf, isMine);
  assert.equal(same.ok, false);
  assert.match(same.why, /已經是/);

  const back = C.marchRetargetCheck(MY, '代縣', pathOf, isMine);
  assert.equal(back.ok, false);
  assert.match(back.why, /出發城/);

  const far = C.marchRetargetCheck(MY, '洛陽', pathOf, isMine);
  assert.equal(far.ok, false);
  assert.match(far.why, /沒有可行道路/);

  const own = C.marchRetargetCheck(MY, '鄴', pathOf, isMine);
  assert.equal(own.ok, false);
  assert.match(own.why, /我方城池/);

  const foe = C.marchRetargetCheck({ ...MY, side: 'B' }, '雁門', pathOf, isMine);
  assert.equal(foe.ok, false);
  assert.match(foe.why, /敵軍/);
});

test('變更目的：殘缺入參不會拋，一律回 ok:false', () => {
  for (const [army, to] of [[null, '雁門'], [undefined, '雁門'], [MY, ''], [MY, null], [MY, 42]] as Array<[unknown, unknown]>) {
    const r = C.marchRetargetCheck(army, to);
    assert.equal(r.ok, false, `army=${String(army)} to=${String(to)} 竟然放行`);
    assert.ok(r.why.length > 0, '必須給理由');
  }
  // 沒給 pathOf / isMine 時：路徑一律當不存在（寧可擋住，也不放行未校驗的目的地）
  assert.equal(C.marchRetargetCheck(MY, '雁門').ok, false);
});

// ─────────────────────────────────────────────────────────────
// 剩餘月數 / 部隊在不在城上
// ─────────────────────────────────────────────────────────────
test('行軍剩餘：progress + 月步長 → 月/天/百分比', () => {
  // 3 個月的路（每月 1/3），走到一半 → 還有 1.5 個月
  assert.deepEqual(C.marchRemain(0.5, 1 / 3), { progress: 0.5, pct: 50, months: 1.5, days: 45 });
  assert.deepEqual(C.marchRemain(0, 1 / 3), { progress: 0, pct: 0, months: 3, days: 90 });
  assert.deepEqual(C.marchRemain(1, 1 / 3), { progress: 1, pct: 100, months: 0, days: 0 });
  // 1 個月的路（每月 1）
  assert.deepEqual(C.marchRemain(0, 1), { progress: 0, pct: 0, months: 1, days: 30 });
  // 步長非法（0/NaN/負）不該出現 Infinity
  for (const step of [0, NaN, -1, null]) {
    const r = C.marchRemain(0.4, step);
    assert.ok(Number.isFinite(r.months) && Number.isFinite(r.days), `step=${String(step)} 出了非有限值`);
  }
});

test('部隊在城上判定：0 在出發城、1 在目的城、路上回空', () => {
  assert.equal(C.marchAtCity({ from: '代縣', to: '晉陽', progress: 0 }), '代縣');
  assert.equal(C.marchAtCity({ from: '代縣', to: '晉陽', progress: 1 }), '晉陽');
  assert.equal(C.marchAtCity({ from: '代縣', to: '晉陽', progress: 0.5 }), '');
  assert.equal(C.marchAtCity({ progress: 0.5 }), '');
  assert.equal(C.marchAtCity(null), '');
  // 越界 progress 依夾取後判斷
  assert.equal(C.marchAtCity({ from: 'A', to: 'B', progress: -2 }), 'A');
});

// ─────────────────────────────────────────────────────────────
// 頁面接線（靜態契約：這幾條斷了，UI 就是死的）
// ─────────────────────────────────────────────────────────────
test('campaign.html 接線：兵團指令浮層 / 5 項命令 / 選點匾 / 部隊層函數', () => {
  assert.match(HTML, /id="armySheet"/, '缺兵團指令浮層');
  assert.match(HTML, /id="armyInfo"/, '缺 7 行軍情容器');
  assert.match(HTML, /id="armyCmds"/, '缺 5 項命令容器');
  // 5 項命令是 renderArmySheet() 動態建的（原作也是點部隊才畫），所以斷的是那個生成器
  assert.match(HTML, /data-army-act="\$\{act\}"/, '缺命令按鈕的 data-army-act 模板');
  for (const act of ['general', 'retarget', 'station', 'advisor', 'enter']) {
    assert.ok(HTML.includes(`cmd('${act}'`), `缺命令 ${act}`);
  }
  for (const label of ['武將資料', '變更目的', '部隊駐紮', '任命軍師', '進入城內']) {
    assert.ok(HTML.includes(label), `缺命令文案「${label}」`);
  }
  // 原作選點態的藍匾文案（一字不差，project/178 §2.2）
  assert.ok(HTML.includes('請選擇兵團目的城市'), '缺選點態橫幅');
  assert.match(HTML, /id="pickBar"/);
  assert.match(HTML, /#stage\.pick header/, '選點態要藏掉其餘 HUD');

  // 部隊層的關鍵函數必須存在，且繪製走既有投影（armyPos → toScreen）
  for (const fn of ['armyScreenList', 'hitArmy', 'drawArmyMark', 'selectArmy', 'renderArmySheet',
    'enterPickMode', 'exitPickMode', 'applyRetarget', 'enterCity']) {
    assert.match(HTML, new RegExp(`function ${fn}\\(`), `缺 function ${fn}`);
  }
  assert.match(HTML, /function armyPos\(a\) \{[\s\S]*?marchLerpPoint\(/, 'armyPos 沒走核心插值');
  assert.match(HTML, /for \(const it of armyScreenList\(\)\) drawArmyMark\(g, it\)/, 'drawMap 沒接部隊層');
  // 點擊：部隊 → 城 → 清選中；選點態只認城
  assert.match(HTML, /const army = hitArmy\(px, py\);/);
  assert.match(HTML, /if \(pickArmyId\) \{/);
  // 選點態的取消：右鍵 + Esc
  assert.match(HTML, /'contextmenu'/);
  assert.match(HTML, /ev\.key === 'Escape'/);
});
