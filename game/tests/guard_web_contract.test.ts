/**
 * R3 / R16 / R29 / R40 假绿守护（37a 的 ✅ 当年没有任何直接断言）。
 *
 * R3  ：5 个剧本、势力数 15/19/9/9/6（docs/03c TIMES*.INI），campaign.html 全量读入并显示。
 *      数据层断言 scenarios.json；显示层没有 DOM，只能做「源码契约」断言（卡片里必须是
 *      `${s.kings.length} 勢力`，且 renderPickCards/renderScenarioStrip 都对整个 SCEN 取 map）。
 * R16 ：全 EXE 无 徵糧/訓練/治水/外交 字串（04c §5 负证据）→ 全仓扫描 + 正向控制。
 * R29 ：兵力档位滑杆（deploy.html）。37a 写的是 10/50/100/200 档，实际实现是 [50,80,100]，
 *      上限 SOLDIER_CAP=100 —— 报告里如实记录这一处 37a 自述与实现的偏差。
 * R40 ：没有独立单挑子系统（0x447516 空函数，04b3）→ 全仓扫描 單挑/单挑/duel。
 *
 * 跑法：`cd F:\sanguo\game && node --test tests/guard_web_contract.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const GAME = fileURLToPath(new URL('../', import.meta.url));

const read = (rel: string): string => readFileSync(join(GAME, rel), 'utf8');
const readJson = <T>(rel: string): T => JSON.parse(read(rel)) as T;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** 引擎实现所在的全部语料：web 的 js/html、core 的 ts、data 的 json */
function corpus(): Array<{ path: string; text: string }> {
  const files = [
    ...readdirSync(join(GAME, 'web'))
      .filter((n) => n.endsWith('.js') || n.endsWith('.html'))
      .map((n) => join(GAME, 'web', n)),
    ...walk(join(GAME, 'src', 'core')).filter((p) => p.endsWith('.ts')),
    ...readdirSync(join(GAME, 'data'))
      .filter((n) => n.endsWith('.json'))
      .map((n) => join(GAME, 'data', n)),
  ];
  return files.map((p) => ({ path: relative(GAME, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }));
}

// ---------------------------------------------------------------- R3
test('R3 五劇本勢力數 15/19/9/9/6，卡片逐劇本顯示 ${s.kings.length} 勢力', () => {
  const scen = readJson<Array<{ kings: unknown[]; cities: unknown[]; paths: unknown[] }>>('data/scenarios.json');
  assert.equal(scen.length, 5, '必須是 5 個劇本');
  assert.deepEqual(
    scen.map((s) => s.kings.length),
    [15, 19, 9, 9, 6],
    'docs/03c TIMES*.INI 的勢力數 15/19/9/9/6',
  );
  // 反向：沒有一個劇本缺勢力名單或城/路為空（全量讀入，不是只讀第一個）
  for (const [i, s] of scen.entries()) {
    assert.ok(Array.isArray(s.kings) && s.kings.length > 0, `劇本 ${i + 1} 勢力名單`);
    assert.equal(s.cities.length, 60, `劇本 ${i + 1} 應有 60 城`);
    assert.ok(s.paths.length > 0, `劇本 ${i + 1} 應有道路`);
  }

  const html = read('web/campaign.html');
  // 讀的是 scenarios.json，不是內嵌前 3 個劇本的舊資料
  assert.match(html, /fetch\('\.\.\/data\/scenarios\.json'\)/, '必須 fetch 完整 scenarios.json');
  assert.match(html, /const SCEN = scenRaw\.map\(/, 'SCEN 必須由 scenRaw.map 全量轉出');
  // 選劇本卡片：顯示的是 kings.length（勢力數），不是寫死 15/19/9/9/6
  assert.match(html, /kings\.length\}\s*勢力/, '卡片必須用 ${s.kings.length} 勢力');
  // 兩個渲染入口都對整個 SCEN 取 map（不能 slice 掉後面的劇本）
  assert.match(html, /function renderPickCards\(\)[\s\S]{0,400}SCEN\.map\(\(s, i\)/, 'renderPickCards 對全部 SCEN');
  assert.match(html, /function renderScenarioStrip\(\)[\s\S]{0,400}SCEN\.map\(\(s, i\)/, 'renderScenarioStrip 對全部 SCEN');
  // 反向：不得出現寫死的「15 勢力」文案，也不得只渲染前幾個劇本
  assert.doesNotMatch(html, /\b15 勢力\b/, '不得寫死勢力數');
  assert.doesNotMatch(html, /SCEN\.slice\(/, '不得對 SCEN 取子集顯示');
});

// ---------------------------------------------------------------- R29
test('R29 兵力檔位由帶兵上限派生（半编/八成/满编），上限 = troopCapOf(等级) ≤ 100；滑杆 1..cap 動態夾', () => {
  const html = read('web/deploy.html');
  // R84 改口径：档位不再写死 [50,80,100]（30 兵上限时三档全灰），改为按 SOLDIER_CAP 派生。
  assert.match(html, /const quick = \[Math\.round\(SOLDIER_CAP \/ 2\), Math\.round\(SOLDIER_CAP \* 0\.8\), SOLDIER_CAP\]/, '檔位必須由上限派生');
  assert.match(html, /const LV_OVERRIDE = Math\.max\(0, Math\.trunc\(Number\(qs\.get\('lv'\)\) \|\| 0\)\)/, '?lv= 覆蓋');
  assert.match(html, /let GEN_LEVEL = levelOf\(gen, LV_OVERRIDE\)/, '等級走 core/levels.ts');
  assert.match(html, /let SOLDIER_CAP = troopCapOf\(GEN_LEVEL\)/, '上限走 core/levels.ts 的 troopCapOf');

  // 上限公式本身由 core 断言（tests/levels.test.ts），这里只钉「上限不会超过 100」
  const p1 = html.indexOf("import { levelOf, troopCapOf } from '../dist/core/levels.js'");
  assert.ok(p1 > 0, '必須從 core/levels.js import');

  assert.doesNotMatch(html, /data-num="200"/, '37a 的 200 檔在實現中不存在');
  // 靜態滑杆範圍 + 動態上限 + 上下界夾取（0/超上限都要被夾住）
  assert.match(html, /id="numrange" min="1" max="100" step="1"/, '滑杆靜態 1..100');
  assert.match(html, /range\.max = String\(SOLDIER_CAP\)/, '滑杆上限跟 SOLDIER_CAP 走');
  assert.match(html, /Math\.max\(1, Math\.min\(SOLDIER_CAP, Math\.round\(Number\(e\.target\.value\) \|\| 1\)\)\)/, '滑杆值夾在 1..cap');
  assert.match(html, /soldiers = Math\.min\(Number\(t\.dataset\.num\), SOLDIER_CAP\)/, '檔位點選也要夾上限');
});

// ---------------------------------------------------------------- R16
test('R16 無 徵糧/訓練/治水/外交 字串（全語料掃描 + 正向控制，避免空掃描誤綠）', () => {
  const files = corpus();
  assert.ok(files.length >= 20, `語料至少要掃到 20 檔（實際 ${files.length}）`);
  const paths = files.map((f) => f.path);
  for (const must of ['web/campaign.html', 'web/city_model.js', 'web/deploy.html', 'src/core/battle.ts', 'data/items.json']) {
    assert.ok(paths.includes(must), `掃描語料缺少 ${must}`);
  }
  const bad = /徵糧|征粮|訓練|训练|治水|外交/;
  const hits = files.filter((f) => bad.test(f.text)).map((f) => f.path);
  assert.deepEqual(hits, [], `不該存在 徵糧/訓練/治水/外交，命中：${hits.join(', ')}`);

  // 正向控制：同一批語料裡這些字串必須找得到，證明掃描不是空的
  assert.ok(files.some((f) => f.text.includes('搜索')), '正向控制：應找得到「搜索」');
  assert.ok(files.some((f) => f.text.includes('ATTACK')), '正向控制：應找得到 ATTACK');
});

// ---------------------------------------------------------------- R40
test('R40 沒有獨立單挑子系統（無 單挑/单挑/duel 標識，附正向控制）', () => {
  const files = corpus();
  const paths = files.map((f) => f.path);
  for (const must of ['web/campaign.html', 'web/city_model.js', 'src/core/battle.ts', 'src/core/smartscript/vm.ts']) {
    assert.ok(paths.includes(must), `掃描語料缺少 ${must}`);
  }
  const bad = /單挑|单挑|duel|DUEL/;
  // 只看代码/字符串，不看注释：注释里引用 `docs/04b3_单挑流程.md` 是在说明「原作没有这个子系统」，
  // 不该被当成实现（R84 这条守卫就是因为一句文档引用误红）。
  const stripComments = (t: string): string =>
    t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const hits = files
    .filter((f) => bad.test(stripComments(f.text)))
    .map((f) => f.path);
  assert.deepEqual(hits, [], `不該存在單挑子系統（註解不算），命中：${hits.join(', ')}`);

  // 反向控制：戰鬥語料確實存在命中/兵力字樣，避免「掃到空目錄」式假綠
  assert.ok(files.some((f) => f.path === 'src/core/battle.ts' && f.text.includes('hitChance')), '正向控制：battle.ts 的 hitChance');
  assert.ok(files.some((f) => f.text.includes('命中')), '正向控制：應找得到「命中」');
});
