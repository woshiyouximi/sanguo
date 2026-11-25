import fs from 'node:fs';

const p = 'F:/sanguo/game/src/core/army_cmd.ts';
const sectionPath = 'F:/sanguo/work/move_grid/_new_army_section.ts.txt';
let t = fs.readFileSync(p, 'utf8');
const hadBom = t.charCodeAt(0) === 0xfeff;
if (hadBom) t = t.slice(1);
const section = fs.readFileSync(sectionPath, 'utf8');
const marker = '// 六、指令怎么影响移动（battle.ts 之外的包装器；零改 battle.ts）';
const i = t.indexOf(marker);
if (i < 0) throw new Error('section marker not found');
const start = t.lastIndexOf('// ---------------------------------------------------------------------------', i);
if (start < 0) throw new Error('separator not found');
t = t.slice(0, start) + section;
fs.writeFileSync(p, (hadBom ? '\uFEFF' : '') + t, 'utf8');
console.log('spliced army section, len', t.length);
