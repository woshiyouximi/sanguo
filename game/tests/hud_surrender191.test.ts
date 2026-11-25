// @ts-nocheck
// 理由：本測試對 web/campaign.html（瀏覽器端單檔頁面，非 TS 模組）做**靜態結構斷言**，
// 只讀字串、不執行頁面；型別嚴格檢查留給 src/**（tsc --noEmit 其餘檔案必須 0 錯）。
/**
 * hud_surrender191.test.ts — 191 招降面板對齊原作（`project\188_录像逐项复核.md` §10 / `work\bili_battle\clean_0910.png`）
 *
 * 跑法：  cd game && node --test tests/hud_surrender191.test.ts
 *
 * 為什麼有這支：188 §10 給出的原作 09:00–09:12 招降面板是
 *   標題「武將招降」· 上方被俘將台詞 · 左俘將立繪 / 右我方立繪 · 按鈕列 釋放/斬首/看押 ·
 *   逐行 忠誠/等級/武力/智力/士氣/疲勞/武器/物品/勝場數/敗場數 · 下方我方招降台詞。
 * 191 把它落成 web 面板（我方主將立繪 + 上下兩句台詞 + 兩欄十項 + 釋放/斬首/招降），
 * 本檔把「面板長相可驗的那幾條」釘成可執行斷言，避免又被後續輪次改回去。
 *
 * 改壞→紅的做法：把 `surFields` 的 cells 刪一項、把按鈕順序換回 招降/斬首/釋放、或把
 * `surLordFaceShow()` 從 `openSurrenderSheet` 拿掉，對應用例立刻失敗。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../web/campaign.html', import.meta.url), 'utf8');

/** 取模組層 `function name(...)` 的 body（大括號配平；找不到回 null）—— 與 tests/rows85.test.ts:74 同法 */
function fnBody(src, name) {
  const lines = src.split(/\r?\n/);
  const head = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    if (!head.test(lines[i])) continue;
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth === 0 && j > i) return lines.slice(i, j + 1).join('\n');
    }
  }
  return null;
}

/** `#surrenderSheet` 整個 sheet 的標記（到 `</div>` 收尾後的第一個空行前的 `<!--` 為止不好抓，改用 id 起算 20 行） */
function sheetBlock(src) {
  const i = src.indexOf('id="surrenderSheet"');
  assert.ok(i > 0, 'campaign.html 必須有 #surrenderSheet');
  return src.slice(i, i + 4000);
}

test('招降面板：标题「武 將 招 降」+ 上下两句台词（原作 09:10 帧的「不用多說了」/「你軍已經沒機會了」）', () => {
  const box = sheetBlock(SRC);
  assert.match(box, /<div class="ttl">武 將 招 降<\/div>/, '标题必须是「武 將 招 降」');
  assert.match(box, /id="surSayCaptive"[^>]*>「不用多說了，大丈夫生死何懼！」</, '上方要有被俘将台词');
  assert.match(box, /class="sgod-say ours">「你軍已經沒機會了，不如轉投我方，一定不會虧待你的！」</, '下方要有我方招降台词');
});

test('招降面板：我方主将立绘槽存在，并由 openSurrenderSheet() 在每次开面板时填（双立绘的另一半）', () => {
  const box = sheetBlock(SRC);
  assert.match(box, /class="sgod-face" id="surLordFace"/, '#surLordFace 必须在 sheet-hd 里');
  const show = fnBody(SRC, 'surLordFaceShow');
  assert.ok(show, '必须有 surLordFaceShow()');
  assert.match(show, /portraitUrl\(name, 'full'\)/, '立绘走 SG.portraitUrl(name, full)');
  assert.match(show, /MM\.monarchOf\(save\)/, '我方立绘取存档君主');
  const open = fnBody(SRC, 'openSurrenderSheet');
  assert.ok(open, '必须有 openSurrenderSheet()');
  assert.match(open, /surLordFaceShow\(\)/, 'openSurrenderSheet 必须调 surLordFaceShow()');
});

test('招降面板：surFields 的十项与顺序对齐原作（等級/士氣/疲勞/武力/智力/忠誠/武器/物品/勝場數/敗場數）', () => {
  const body = fnBody(SRC, 'surFields');
  assert.ok(body, '必须有 surFields()');
  const cellsAt = body.indexOf('const cells = [');
  assert.ok(cellsAt > 0, 'surFields 里必须有 const cells = [');
  const cellsSrc = body.slice(cellsAt, body.indexOf('];', cellsAt));
  const keys = [...cellsSrc.matchAll(/\[\s*'([^']+)'\s*,/g)].map((m) => m[1]);
  assert.deepEqual(keys, [
    '等級', '士氣', '疲勞', '武力', '智力', '忠誠', '武器', '物品', '勝場數', '敗場數',
  ], '十项必须齐全且顺序同原作');
  // 拿不到的项一律灰「—」（勝場/敗場不按將落库：core 的 BattleRecord 是单场战绩）
  assert.match(cellsSrc, /\['勝場數', null\]/, '勝場數 本作拿不到 → null → 灰「—」');
  assert.match(cellsSrc, /\['敗場數', null\]/, '敗場數 本作拿不到 → null → 灰「—」');
  assert.match(body, /v == null \? '—' : surEsc\(v\)/, 'null 值渲染成「—」');
  assert.match(body, /class="none"/, '「—」必须带 .none（灰）样式');
});

test('招降面板：卡片按钮列顺序 釋放 → 斬首 → 招降（原作第三档是「看押」，本作无该状态，[新設計] 保留招降在第三位）', () => {
  const body = fnBody(SRC, 'surCardHtml');
  assert.ok(body, '必须有 surCardHtml()');
  const rel = body.indexOf('data-sur="release"');
  const kill = body.indexOf('data-sur="kill"');
  const rec = body.indexOf('data-sur="recruit"');
  assert.ok(rel > 0 && kill > rel && rec > kill, `按钮顺序必须是 release<kill<recruit，实得 ${rel},${kill},${rec}`);
  assert.match(body, /看押/, '第三档要在 title 里交代「原作是看押」的 [新設計] 依据');
});

test('招降面板：结构契约没被破坏（surCards / 三个批量键 / 无 data-close / let surState 仍在模组层）', () => {
  const box = sheetBlock(SRC);
  assert.match(box, /<div id="surCards"><\/div>/, '#surCards 是渲染容器（点击委托按 .sgen[data-name] 取名字）');
  assert.match(box, /id="surAllRelease"/, '批量键 surAllRelease 保留');
  assert.match(box, /id="surAllKill"/, '批量键 surAllKill 保留');
  assert.match(box, /id="surAllRecruit"/, '批量键 surAllRecruit 保留');
  assert.doesNotMatch(box, /data-close=/, '招降面板刻意不可关闭（没决策完不进大地图）');
  assert.match(SRC, /^let surState = null;$/m, 'surState 仍是模组层 let（rows85 的 TDZ 审计依赖它）');
});
