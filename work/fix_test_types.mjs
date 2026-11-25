import fs from 'node:fs';

const p = 'F:/sanguo/game/tests/wises.test.ts';
let t = fs.readFileSync(p, 'utf8');

// 1) 在 fakeGeneral 之後插一個 atLevel 輔助（General 沒有 level 欄位）
if (!t.includes('function atLevel(')) {
  const anchor = `  if (level !== undefined) g.level = level;
  return g;
}
`;
  const helper = `
/** General 沒有 level 欄位（存檔也還沒記），測試裡顯式掛一個再傳進去。 */
function atLevel(g: General, level: number): General {
  return { ...g, level } as General;
}
`;
  if (!t.includes(anchor)) throw new Error('anchor not found');
  t = t.replace(anchor, anchor + helper);
}

// 2) { ...g, level: N } → atLevel(g, N)
t = t.replace(/\{ \.\.\.(\w+), level: (\d+) \}/g, 'atLevel($1, $2)');

// 3) 混合寫法（展開函數呼叫）單獨處理
t = t.replace(
  "generalLevel({ ...fakeGeneral(['1, 6']), level: 0 })",
  "generalLevel(Object.assign(fakeGeneral(['1, 6']), { level: 0 }))",
);

fs.writeFileSync(p, t, 'utf8');
console.log('atLevel count:', (t.match(/atLevel\(/g) || []).length);
console.log('remaining spread-level:', (t.match(/\{ \.\.\.\w+, level:/g) || []).length);
