import { readFileSync } from 'node:fs';

const SCRIPTS = 'F:/sanguo/game/cocos/assets/scripts/';
const INPUT_GUARD = readFileSync(SCRIPTS + 'InputGuard.ts', 'utf8');
const INPUT_LATCH = readFileSync(SCRIPTS + 'InputLatch.ts', 'utf8');

function fnBody(src, name) {
  const hit = new RegExp(
    `(?:export\\s+)?(?:function\\s+)?(?:private|public|protected)?\\s*${name}\\s*(?:<[^>]*>)?\\s*\\(`,
  ).exec(src);
  if (!hit) return ['NO HIT', ''];
  const open = src.indexOf('{', hit.index);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return [src.slice(Math.max(0, hit.index - 40), hit.index + 40), src.slice(open + 1, i)];
    }
  }
  return ['NO CLOSE', ''];
}

for (const name of ['safeTouch', 'guardTouch', 'resetInputAfterShow', 'installInputResilience']) {
  const [hit, body] = fnBody(INPUT_GUARD, name);
  console.log('===', name, '=== hit:', JSON.stringify(hit), '\nbody:', JSON.stringify(body.slice(0, 120)));
}
for (const name of ['latchTap', 'resetTapLatch', 'tapLatched']) {
  const [hit, body] = fnBody(INPUT_LATCH, name);
  console.log('===', name, '=== hit:', JSON.stringify(hit), '\nbody:', JSON.stringify(body.slice(0, 120)));
}
