import fs from 'node:fs';

const tp = 'game/tsconfig.json';
let t = fs.readFileSync(tp, 'utf8');
if (t.includes('"moduleDetection": "force",')) {
  t = t.replace('"moduleDetection": "force",', '');
  fs.writeFileSync(tp, t);
  console.log('tsconfig: reverted moduleDetection');
}

const cp = 'game/cocos/package.json';
const c = JSON.parse(fs.readFileSync(cp, 'utf8'));
if (c.type !== 'module') {
  const out = { type: 'module', ...c };
  fs.writeFileSync(cp, JSON.stringify(out, null, 2) + '\n');
  console.log('cocos/package.json: type=module added');
} else {
  console.log('cocos/package.json: already module');
}
