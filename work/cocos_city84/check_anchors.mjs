import fs from 'node:fs';
const t = fs.readFileSync('game/cocos/assets/scripts/CityModel.ts', 'utf8');
const anchors = [
  '  return 1 + Math.min(EFF.MAX_BONUS, int / EFF.DIV);',
  "  devDef: { v: 6, grade: '新設計',",
  "  devPopCap: { v: 400000, grade: '新設計',",
  "  effDiv: { v: 400, grade: '新設計',",
  "export const EFF = { DIV: incrVal('effDiv'), MAX_BONUS: incrVal('effMax') };",
];
anchors.forEach((s, i) => console.log(`C${i + 1} 命中 ${t.split(s).length - 1}`));
console.log('DEF 已还原:', t.includes("  DEF: incrVal('devDef'),\n"));
console.log('行数:', t.split('\n').length);
