// work/cocos_ai84/build.mjs — 把 Cocos 侧的 AiModel.ts / AiRunner.ts 编成 node 可直接 import 的 ESM
//
// 为什么需要这一步：Cocos Creator 用打包器解析「无扩展名」的相对导入，而 node ESM 要求
// 显式 .js。tsc 按 module=ES2022 只做语法搬运、不改写说明符，所以编完之后把 build/*.js
// 里的 './AiModel' 补成 './AiModel.js'（只动说明符，不动任何逻辑）。
//
// 用法：node work/cocos_ai84/build.mjs      （从 F:\sanguo 运行）
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const tsc = path.join(repo, 'game', 'node_modules', 'typescript', 'bin', 'tsc');

const run = spawnSync(process.execPath, [tsc, '-p', path.join(here, 'tsconfig.build.json')], {
  cwd: repo,
  stdio: 'inherit',
});
if (run.status !== 0) {
  console.error(`[build] tsc 失败，exit ${run.status}`);
  process.exit(run.status || 1);
}

const include = ['../../game/cocos/assets/scripts/AiModel.ts', '../../game/cocos/assets/scripts/AiRunner.ts'];
let fixed = 0;
for (const rel of include) {
  const out = path.join(here, 'build', path.basename(rel).replace(/\.ts$/, '.js'));
  let src = fs.readFileSync(out, 'utf8');
  const before = src;
  src = src.replace(/from '\.\/(AiModel)'/g, "from './$1.js'");
  if (src !== before) {
    fs.writeFileSync(out, src, 'utf8');
    fixed++;
  }
}

for (const f of ['AiModel.js', 'AiRunner.js']) {
  const p = path.join(here, 'build', f);
  const src = fs.readFileSync(p, 'utf8');
  if (/from 'cc'/.test(src)) {
    console.error(`[build] ${f} 里出现了 'cc' 导入：Cocos 侧可以，node 侧不能跑`);
    process.exit(2);
  }
  console.log(`[build] ${f} ${fs.statSync(p).size} B`);
}
console.log(`[build] ok，改写说明符 ${fixed} 个文件`);
