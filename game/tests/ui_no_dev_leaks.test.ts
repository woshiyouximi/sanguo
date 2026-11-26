/**
 * ui_no_dev_leaks.test.ts — Cocos 正式版 UI 不得殘留「開發痕跡」（源碼級契約）
 *
 * 背景（F:\sanguo\work\ui_sweep\REPORT.md P2 / ui_p2 任務）：
 * Cocos 是正式版，web 的調試台內容不許搬過來；但 2.9 真機截圖裡仍能看到
 * 「[新設計]」設計標注、「原作欄位」除錯表、garrison.json 檔名、「全部解鎖」空白按鈕位、
 * 說明頁的畫面規格（750×1334、頁頭 0–124、sanguo_*_v1 存檔鍵名）、60Hz 之類的開發口吻。
 *
 * 這支測試把「清理結果」釘成契約，防止以後又從 web 抄回來：
 *   1) CityListPanel / EndingPanel 不再出現 `[新設計]` 設計標注（任何位置）；
 *   2) DeployRoot 等六檔的「玩家可見文本」不再出現 `garrison.json` 檔名
 *      （註釋是開發資料、不進包，所以先剝註釋再掃）；
 *   3) `原作欄位` 除錯表只在 ItemsPanel 出現，且每一處都受 `devTools` 控制
 *      （原生 / `?rel=1` 收起，預覽 / headless 保留 —— panel_headless 仍依賴它 12 行）；
 *   4) ItemsPanel 的 `devToolsOn()` 判定（isNative / rel=1）與四支調試 Label 的
 *      `node.active = this.devTools`、drawFrame 的門控、unlockBtn 命中的門控都在；
 *   5) 說明頁 / 標題頁不再暴露內部存檔鍵名（`sanguo_`）、畫面規格（750×1334 / 頁頭）
 *      與 60Hz 等開發口吻，且保留資料來源署名。
 *
 * 跑法：`cd game && node --test tests/ui_no_dev_leaks.test.ts`
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..', 'cocos', 'assets', 'scripts');

const FILES = [
  'CityListPanel.ts',
  'EndingPanel.ts',
  'DeployRoot.ts',
  'TitlePanel.ts',
  'ItemsPanel.ts',
  'GeneralBook.ts',
] as const;

const cache = new Map<string, string>();

/** 讀 scripts/ 下的源碼（同一支只讀一次） */
function raw(name: string): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const text = readFileSync(join(SCRIPTS, name), 'utf8');
  cache.set(name, text);
  return text;
}

/**
 * 剝掉 `//` 行註釋與方法塊註釋（字符串內的 `//`、`/*` 不算）。
 * 只為「玩家可見文本」掃描服務：註釋是開發資料，不進正式包，因此不屬於泄漏。
 */
function stripComments(src: string): string {
  let out = '';
  let quote = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i] ?? '';
    const next = src[i + 1] ?? '';
    if (quote !== '') {
      out += ch;
      if (ch === '\\') {
        out += next;
        i += 2;
        continue;
      }
      if (ch === quote) quote = '';
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** 源碼（去註釋後）按行切開；保留空行，索引無語義 */
function codeLines(name: string): string[] {
  return stripComments(raw(name)).split('\n');
}

/** ItemsPanel 裡「原作欄位」的每一處：同/前一行有 devTools 三元，或在 labelDetNote 的 makeLabel 塊裡 */
function assertItemsFieldTextGated(): void {
  const lines = codeLines('ItemsPanel.ts');
  // labelDetNote 的 makeLabel(...) 塊：文字「原作欄位為資料表原文…」在這裡，節點由 devTools 門控。
  const start = lines.findIndex((line) => /this\.labelDetNote\s*=\s*this\.makeLabel\(/.test(line));
  assert.ok(start >= 0, 'ItemsPanel 必須有 labelDetNote = makeLabel(...)（唯讀欄位表的註記）');
  let end = start;
  while (end < lines.length - 1 && !/^\s*\);\s*$/.test(lines[end + 1] ?? '')) end += 1;
  assert.ok(end > start, 'labelDetNote 的 makeLabel(...) 必須有 `);` 結尾');
  // 註記節點本身必須被 devTools 門控（正式包 node.active=false）。
  assert.ok(
    lines.some((line) => /if \(this\.labelDetNote\) this\.labelDetNote\.node\.active = this\.devTools;/.test(line)),
    'ItemsPanel 的 labelDetNote 節點必須受 devTools 控制',
  );

  let checked = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!line.includes('原作欄位')) continue;
    checked += 1;
    if (/this\.devTools/.test(line)) continue; // 同行的 devTools 三元（如 labelDetFoot）
    if (i >= start && i <= end) continue; // gated 註記 Label 的文本
    const prev1 = lines[i - 1] ?? '';
    const prev2 = lines[i - 2] ?? '';
    if (/^\s*[:?]/.test(line) && (/this\.devTools/.test(prev1) || /this\.devTools/.test(prev2))) {
      // `cond = this.devTools\n  ? '…原作欄位…'\n  : '…'`：三元換行寫法，仍屬受控。
      continue;
    }
    assert.fail(`ItemsPanel 第 ${i + 1} 行出現未受 devTools 控制的「原作欄位」文本：${line.trim()}`);
  }
  assert.ok(checked > 0, 'ItemsPanel 應保留受控的「原作欄位」文本（headless 依賴）');
}

test('[新設計] 設計標注不再出現在 UI 檔案（含註釋）', () => {
  for (const file of FILES) {
    assert.ok(!raw(file).includes('新設計'), `${file} 不得再出現「新設計」標注`);
  }
});

test('玩家可見文本不再出現 garrison.json 檔名（去註釋後）', () => {
  for (const file of FILES) {
    const code = stripComments(raw(file));
    assert.ok(!code.includes('garrison.json'), `${file} 的字符串/代碼不得再出現 garrison.json（註釋除外）`);
  }
  // 出征編成的守將副標已改成玩家口吻。
  assert.ok(stripComments(raw('DeployRoot.ts')).includes('此關卡未配置守將'), 'DeployRoot 的「無守將」文案應為玩家口吻');
});

test('原作欄位除錯表只在 ItemsPanel 且受 devTools 控制', () => {
  for (const file of FILES) {
    if (file === 'ItemsPanel.ts') continue;
    assert.ok(!stripComments(raw(file)).includes('原作欄位'), `${file} 不得出現「原作欄位」除錯表文本`);
  }
  assertItemsFieldTextGated();
});

test('ItemsPanel 的 devToolsOn() 判定與門控齊全', () => {
  const code = stripComments(raw('ItemsPanel.ts'));
  // 正式包判定：原生包 or `?rel=1` 都算「非調試台」。
  assert.ok(/isNative/.test(code), 'devToolsOn() 必須看 cc.sys.isNative');
  assert.ok(/rel=1/.test(code), 'devToolsOn() 必須看 location.search 的 rel=1');
  assert.ok(/this\.devTools = devToolsOn\(\);/.test(code), 'build() 必須用 devToolsOn() 賦值 devTools');
  // 四支調試 Label（標題 / 兩欄 / 註記）一起收。
  for (const label of ['labelSectField', 'labelFieldKeys', 'labelFieldVals', 'labelDetNote']) {
    assert.ok(
      new RegExp(`if \\(this\\.${label}\\) this\\.${label}\\.node\\.active = this\\.devTools;`).test(code),
      `${label} 的 node.active 必須受 devTools 控制`,
    );
  }
  // 解鎖主/副文本與命中（全部解鎖 = web 調試台設施）。
  for (const label of ['labelUnlockMain', 'labelUnlockSub']) {
    assert.ok(new RegExp(`this\\.${label}\\.node\\.active = this\\.devTools;`).test(code), `${label} 必須受 devTools 控制`);
  }
  assert.ok(/if \(this\.devTools\) this\.addHit\(LAYOUT\.unlockBtn/.test(code), 'unlockBtn 的命中區必須只在 devTools 出現');
});

test('ItemsPanel 的除錯繪製（原作欄位線 / 註記帶 / 解鎖底板）受 devTools 門控', () => {
  const code = stripComments(raw('ItemsPanel.ts'));
  // 1) 原作欄位標題下的分隔線
  assert.ok(
    /if \(this\.devTools\) \{\n\s*this\.hline\(g, LAYOUT\.sectField\.y \+ LAYOUT\.sectField\.h/.test(code),
    '原作欄位標題下的分隔線必須在 if (this.devTools) 內',
  );
  // 2) 原作欄位表底下的註記帶（whole noteRect 幾何）
  assert.ok(
    /if \(this\.devTools\) \{\n\s*const noteRect = \{ x: LAYOUT\.det\.x \+ 6, y: 1042/.test(code),
    '原作欄位表底下的註記帶必須在 if (this.devTools) 內',
  );
  // 3) 底欄「全部解鎖」底板（正式包留空按鈕位的來源）
  assert.ok(
    /if \(this\.devTools\) \{\n\s*this\.paintBands\(\n\s*g,\n\s*vBands\(LAYOUT\.unlockBtn\.x/.test(code),
    '底欄 unlockBtn 底板必須在 if (this.devTools) 內（否則正式包留無字空按鈕位）',
  );
});

test('說明頁 / 標題頁不再暴露內部鍵名、畫面規格與開發口吻', () => {
  const code = stripComments(raw('TitlePanel.ts'));
  for (const leak of ['sanguo_', '750×1334', '頁頭 0', '九宮', '60Hz']) {
    assert.ok(!code.includes(leak), `TitlePanel 的玩家可見文本不得出現「${leak}」`);
  }
  // 說明頁保留玩家說明與資料來源署名。
  assert.ok(code.includes('玩法與資料來源'), '說明頁副標應為玩家口吻「玩法與資料來源」');
  assert.ok(code.includes('版權歸原權利人'), '說明頁必須保留資料來源/版權署名');
  assert.ok(code.includes('【入 門】') && code.includes('【存 檔】'), '說明頁應保留入門 / 存檔等玩家段落');
});

test('城池一覽 / 結局頁的底部提示已改成玩家口吻', () => {
  assert.ok(stripComments(raw('CityListPanel.ts')).includes('點一行選城'), 'CityListPanel 底部提示應保留玩家文案');
  assert.ok(stripComments(raw('EndingPanel.ts')).includes('此局已結'), 'EndingPanel 底部提示應保留玩家文案');
});

test('stripComments() 自身：字符串裡的 // 不會被當成註釋', () => {
  const src = "const a = 'http://x/y'; // 這是註釋\nconst b = 1; /* 塊註釋 */\n";
  const out = stripComments(src);
  assert.ok(out.includes("'http://x/y'"), '字符串裡的 // 必須保留');
  assert.ok(!out.includes('這是註釋'), '行註釋必須剝掉');
  assert.ok(!out.includes('塊註釋'), '塊註釋必須剝掉');
  assert.ok(out.includes('const b = 1;'), '塊註釋外的代碼必須保留');
});
