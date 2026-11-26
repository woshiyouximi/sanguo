// @ts-nocheck
// F-07：Cocos「出征編成」頁的前 / 中 / 後列。
//
// 分兩層驗：
//   1) 源碼契約 —— cocos scripts 不在 game/src 同步範圍、直接 import 會 TS1287（同
//      cocos_p1_port.test.ts），所以 DeployRoot.ts / BattleRoot.ts 只讀源碼 + 正則守接線：
//      COL_KEY 與 web 同鍵、三檔按鈕/角標都在、出征 payload 帶 `cols`、BattleRoot 把它交給
//      createWorld 的 a.col（敵方固定 mid）。
//   2) 行為 —— 站位落位是 core（game/src/core/battle.ts，web 與 Cocos 共用同一份）的事，
//      直接 import 跑真世界：front/mid/back 相對中列各差 1 格、中列 == 不帶 col 的既有落位。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../src/data.ts';
import {
  COL_RANK,
  colOffsetOf,
  colRankOf,
  createWorld,
  normalizeCol,
  parseCols,
  unitCell,
} from '../src/core/battle.ts';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const deploySrc = (): string => read('../cocos/assets/scripts/DeployRoot.ts');
const battleSrc = (): string => read('../cocos/assets/scripts/BattleRoot.ts');
const webDeploySrc = (): string => read('../web/deploy.html');

// 取主將落位：沿用 formation_col.test.ts 的取法（isGeneral + unitCell().gx）。
function worldWithGeneralCol(col: string | undefined, side: 'A' | 'B' = 'A') {
  const sideCfg = {
    troop: 2,
    formation: 0,
    soldiers: 100,
    general: { name: '關羽', str: 97, int: 75 },
    ...(col ? { col } : {}),
  };
  const opts: Record<string, unknown> = { data: loadData(), seed: 7 };
  opts[side === 'A' ? 'a' : 'b'] = sideCfg;
  return createWorld(opts);
}

function generalGx(world: ReturnType<typeof createWorld>, side: 'A' | 'B' = 'A'): number {
  const unit = world.units.find((u: { isGeneral?: boolean; side?: string }) => u.isGeneral && u.side === side);
  assert.ok(unit, `world 裡應該有 ${side} 側主將`);
  return unitCell(unit).gx;
}

// ---------------------------------------------------------------------------
// ① DeployRoot：COL_KEY（與 web 同鍵同格式）+ 前/中/後 三檔
// ---------------------------------------------------------------------------

test('F-07 DeployRoot：COL_KEY 與 web 同鍵，前/中/後 三檔次序固定', () => {
  const src = deploySrc();
  assert.match(src, /const COL_KEY = 'sanguo_deploy_cols_v1';/);
  assert.match(src, /const COL_LABEL: Record<GeneralCol, string> = \{ front: '前', mid: '中', back: '後' \};/);
  assert.match(src, /const COL_ORDER: readonly GeneralCol\[\] = \['front', 'mid', 'back'\];/);
  // web 端是同一組常數（deploy.html:548-549）；鍵名相同 = 兩端 localStorage 互為相容。
  const web = webDeploySrc();
  assert.match(web, /COL_KEY\s*=\s*'sanguo_deploy_cols_v1'/);
  assert.match(web, /front:\s*'前',\s*mid:\s*'中',\s*back:\s*'後'/);
});

test('F-07 DeployRoot：站位按武將名讀寫 COL_KEY（默認中列，不塞 deployQueue）', () => {
  const src = deploySrc();
  assert.match(src, /private loadCols\(\): void \{/);
  assert.match(src, /private saveCols\(\): void \{/);
  assert.match(src, /sys\.localStorage\.getItem\(COL_KEY\)/);
  assert.match(src, /sys\.localStorage\.setItem\(COL_KEY, JSON\.stringify\(this\.cols\)\)/);
  // 只收三個合法值（web loadCols() 同口徑），髒值當沒存
  assert.match(src, /value === 'front' \|\| value === 'mid' \|\| value === 'back'/);
  // 沒存過 / 名字不認識 → 中列
  assert.match(src, /return col === 'front' \|\| col === 'back' \? col : 'mid';/);
  // 進屏就讀（在 start() 裡），與 web 進頁載入站位同語義
  assert.match(src, /this\.loadCols\(\);/);
  // deployQueue 仍只存原本三欄（站位獨立存，避免 saveQueue() 剝掉 col）
  assert.match(src, /saveQueue\(save, this\.(liveQueue\(\)|queue)\)/);
});

// ---------------------------------------------------------------------------
// ② DeployRoot：出征 payload 帶 `cols`（每將 front/mid/back）
// ---------------------------------------------------------------------------

test('F-07 DeployRoot：出征 payload 帶 cols（每將站位），沿用 startBattle 既有通道', () => {
  const src = deploySrc();
  assert.match(src, /type BattleLoadoutWithCols = BattleLoadout & \{ cols: Record<string, GeneralCol> \};/);
  assert.match(src, /private deployCols\(\): Record<string, GeneralCol> \{/);
  assert.match(src, /out\[slot\.general\] = this\.colOf\(slot\.general\);/);
  assert.match(src, /const payload: BattleLoadoutWithCols = \{ \.\.\.loadout, cols: this\.deployCols\(\) \};/);
  assert.match(src, /GameState\.startBattle\(this\.targetCity\?\.NAME \?\? '南皮', payload\)/);
});

// ---------------------------------------------------------------------------
// ③ DeployRoot：編成頁顯示「前/中/後」（12 將角標 + 主將區/隊列面板三檔按鈕）
// ---------------------------------------------------------------------------

test('F-07 DeployRoot：武將卡角標 + 主將區/隊列面板三檔按鈕都標前/中/後', () => {
  const src = deploySrc();
  // 12 張將卡的角標（默認中列由 colOf() 給）
  assert.match(src, /this\.genColLabels\.push\(this\.makeLabel\('', 0, 0, 30, 12, COLORS\.textFaint, 'right'\)\);/);
  assert.match(src, /colLabel\.string = COL_LABEL\[col\];/);
  assert.match(src, /colLabel\.node\.setPosition\(x \+ GEN_W - 34 - HALF_W, HALF_H - \(y \+ 9\), 0\);/);
  // 主將區右上角三檔
  assert.match(src, /private drawMainCols\(g: Graphics\): void \{/);
  assert.match(src, /this\.drawMainCols\(ui\);/);
  assert.match(src, /this\.buttons\.push\(\{ kind: 'mcol', index, x, y, w: 70, h: 30 \}\);/);
  // 出陣順序面板每槽第二行三檔
  assert.match(src, /this\.buttons\.push\(\{ kind: 'qcol', index: i \* COL_ORDER\.length \+ c, x: bx, y: by, w: 180, h: 34 \}\);/);
  // 點擊分發：qcol 寫回按名站位、mcol 改主將站位
  assert.match(src, /if \(button\.kind === 'qcol'\) \{/);
  assert.match(src, /this\.setCol\(slot\.general, col\);/);
  assert.match(src, /if \(button\.kind === 'mcol'\) \{/);
  assert.match(src, /applyTextRoles\(this\.genColLabels, 'badge', 12\);/);
});

// ---------------------------------------------------------------------------
// ④ BattleRoot：payload.cols → createWorld 的 a.col；敵方默認 mid
// ---------------------------------------------------------------------------

test('F-07 BattleRoot：把 payload.cols 接進 createWorld 的 a.col（b 固定 mid）', () => {
  const src = battleSrc();
  assert.match(src, /import \{[^}]*\bnormalizeCol\b[^}]*\} from '\.\/core\/battle';/);
  assert.match(src, /type BattleLaunchWithCols = BattleLaunch & \{ cols\?: Record<string, unknown> \};/);
  assert.match(
    src,
    /const launchCols: Record<string, unknown> = \(launch as BattleLaunchWithCols \| null\)\?\.cols \?\? \{\};/,
  );
  // 名字 → 站位；值不認識 / 沒帶來 → normalizeCol() 收口成 mid（與 web main.js:680 同口徑）
  assert.match(
    src,
    /const colOf = \(name: string \| undefined\): 'front' \| 'mid' \| 'back' => normalizeCol\(name \? launchCols\[name\] : undefined\);/,
  );
  // A 側主將帶站位，B 側（敵方）本輪固定中列
  assert.match(src, /col: colOf\(launch\?\.gen\),/);
  assert.match(src, /col: 'mid',/);
  const colLines = src.match(/^\s*col: .*$/gm) ?? [];
  assert.equal(colLines.length, 2, 'createWorld 只應該有 a/b 兩條 col');
  const aIndex = src.indexOf('col: colOf(launch?.gen),');
  const bIndex = src.indexOf("col: 'mid',");
  assert.ok(aIndex > 0 && bIndex > aIndex, 'a.col 應在 b.col 之前');
});

// ---------------------------------------------------------------------------
// ⑤ core：parseCols 解析 front/mid/back（全形符號、未知值回 mid、壞段丟棄）
// ---------------------------------------------------------------------------

test('F-07 core parseCols：front/mid/back 解析（全形、未知值、壞輸入）', () => {
  assert.deepEqual(parseCols('關羽:front,張飛:back,劉備:mid'), { 關羽: 'front', 張飛: 'back', 劉備: 'mid' });
  assert.deepEqual(parseCols('關羽：前，張飛：後'), { 關羽: 'front', 張飛: 'back' });
  assert.deepEqual(parseCols('關羽:中路,張飛'), { 關羽: 'mid' });
  assert.deepEqual(parseCols(undefined), {});
  assert.deepEqual(parseCols(42), {});
  assert.equal(COL_RANK.front, 0);
  assert.equal(COL_RANK.mid, 1);
  assert.equal(COL_RANK.back, 2);
  assert.equal(colRankOf('front'), 0);
  assert.equal(colRankOf('不認識'), 1);
  assert.equal(colOffsetOf('front'), 1);
  assert.equal(colOffsetOf('mid'), 0);
  assert.equal(colOffsetOf('back'), -1);
  assert.equal(normalizeCol('前'), 'front');
  assert.equal(normalizeCol('後'), 'back');
  assert.equal(normalizeCol(42), 'mid');
});

// ---------------------------------------------------------------------------
// ⑥ core 行為：落位真的位移（中列 == 既有落位）
// ---------------------------------------------------------------------------

test('F-07 core 落位：A 側 front 比中列前 1 格、back 後 1 格；B 側鏡像', () => {
  const mid = generalGx(worldWithGeneralCol('mid'));
  const noCol = generalGx(worldWithGeneralCol(undefined));
  const front = generalGx(worldWithGeneralCol('front'));
  const back = generalGx(worldWithGeneralCol('back'));

  // 中列 = 沒帶 col 的既有落位（F-26 保證不帶 col 的舊行為逐格不變）
  assert.equal(noCol, mid, '沒帶 col 應等於中列（既有落位）');
  assert.equal(front, mid - 1, 'A 側前排應向敵方偏移 1 格');
  assert.equal(back, mid + 1, 'A 側後排應向己方偏移 1 格');
  assert.notEqual(front, back);

  // 主將單位本身帶站位（nearestEnemy 同距 tie-break 用）
  const world = worldWithGeneralCol('front');
  const general = world.units.find((u: { isGeneral?: boolean; side?: string }) => u.isGeneral && u.side === 'A');
  assert.equal(general?.col, 'front');

  // B 側是鏡像（敵我對稱，web main.js 對 b 側同樣傳 col）
  const bMid = generalGx(worldWithGeneralCol('mid', 'B'), 'B');
  assert.equal(generalGx(worldWithGeneralCol('front', 'B'), 'B'), bMid + 1);
  assert.equal(generalGx(worldWithGeneralCol('back', 'B'), 'B'), bMid - 1);
});

// ---------------------------------------------------------------------------
// ⑦ web ↔ Cocos：同一個 COL_KEY、同一個 payload 鍵名 `cols`
// ---------------------------------------------------------------------------

test('F-07 web↔Cocos 對齊：同 COL_KEY，同 payload 鍵名 cols', () => {
  const web = webDeploySrc();
  const cocos = deploySrc();
  const cocosKey = cocos.match(/const COL_KEY = '([^']+)';/)?.[1];
  const webKey = web.match(/COL_KEY\s*=\s*'([^']+)'/)?.[1];
  assert.equal(cocosKey, 'sanguo_deploy_cols_v1');
  assert.equal(webKey, cocosKey);

  // web 出征 URL 的 `cols=`（deploy.html:920/952）↔ Cocos payload 的 `cols`（DeployRoot march()）
  assert.match(web, /function deployColsParam\(\)/);
  assert.match(web, /cols:\s*deployColsParam\(\)/);
  assert.match(cocos, /cols: this\.deployCols\(\)/);
  // BattleRoot 收的鍵名一致
  assert.match(battleSrc(), /\.cols \?\? \{\}/);
});
