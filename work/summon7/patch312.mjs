// R171 阴性对照的可复现验证：在 0x312/0x314 的两种反向之间切换，验证 summon7.test.ts 会红。
// 用法：node work/summon7/patch312.mjs save|both-reverse|both-forward|314-forward|restore
//   save        建立 backup（只在第一次需要）
//   其余模式    一律从 backup（pristine）出发再改，避免叠加
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('game/src/core/smartscript/syscalls.ts');
const BAK = path.resolve('work/summon7/syscalls.backup.ts');

const FWD = 'for (let i = 1; i < args.length; i++) callArgs.push(args[i].value);';
const RVS = 'for (let i = args.length - 1; i >= 1; i--) callArgs.push(args[i].value);';

const mode = process.argv[2] || 'save';
if (mode === 'save') {
  fs.copyFileSync(SRC, BAK);
  console.log('backup ->', BAK);
  process.exit(0);
}
if (mode === 'restore') {
  fs.copyFileSync(BAK, SRC);
  console.log('restored');
  process.exit(0);
}

// 永远从 pristine 出发
let t = fs.readFileSync(BAK, 'utf8');
const REV_BLOCK =
  'if (id === 0x314) {\n' +
  '        ' + RVS + '\n' +
  '      } else {\n' +
  '        ' + FWD + '\n' +
  '      }';
if (!t.includes(REV_BLOCK)) {
  console.error('pristine anchor not found — syscalls.ts 的结构变了，需要更新本脚本');
  process.exit(2);
}

if (mode === 'both-reverse') {
  t = t.replace(REV_BLOCK, '{ ' + RVS + ' }');
} else if (mode === 'both-forward') {
  t = t.replace(REV_BLOCK, '{ ' + FWD + ' }');
} else if (mode === '314-forward') {
  t = t.replace(REV_BLOCK, 'if (id === 0x314 || true) {\n        ' + FWD + '\n      } else {\n        ' + FWD + '\n      }');
} else {
  console.error('unknown mode', mode);
  process.exit(2);
}
fs.writeFileSync(SRC, t, 'utf8');
console.log('patched ->', mode);
