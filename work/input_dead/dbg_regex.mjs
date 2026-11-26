import { readFileSync } from 'node:fs';
const s = readFileSync('F:/sanguo/game/cocos/assets/scripts/ArmyLayer.ts', 'utf8');
const line = s.split('\n').map((x) => x.trim()).find((x) => x.startsWith('input.on('));
console.log('line =', JSON.stringify(line));
console.log('codes =', [...line].slice(0, 45).map((c) => c.charCodeAt(0)).join(','));
const R = /^input\.(on|off)\(Input\.EventType\.TOUCH_(?:START|MOVE|END)\), guardTouch\(this, '(onTouch(?:Start|Move)?)', '([A-Za-z0-9_]+)'\), this\);$/;
console.log('full match =', R.test(line));
const parts = [
  [/^input\.(on|off)\(Input\.EventType\./, 'head'],
  [/^input\.(on|off)\(Input\.EventType\.TOUCH_(?:START|MOVE|END)\)/, 'evt'],
  [/^input\.(on|off)\(Input\.EventType\.TOUCH_END, guardTouch\(this, /, 'mid'],
  [/'(onTouch(?:Start|Move)?)'/, 'method'],
  [/', '([A-Za-z0-9_]+)'\), this\);$/, 'tail'],
];
for (const [r, name] of parts) console.log(name, '=>', r.test(line));
