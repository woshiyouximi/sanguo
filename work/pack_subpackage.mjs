// 把 wechatgame 构建产物改成「微信分包」结构，产出可直接上传的稳定副本。
//
//   node pack_subpackage.mjs <buildDir> <outDir> <bundle...>
//
// 做的事：
//   1. 整目录复制到 outDir（覆盖）
//   2. assets/<bundle>  ->  subpackages/<bundle>   （Cocos 3.8 小游戏分包的固定根目录，
//      见构建产物 engine-adapter.js：`_[name] = "subpackages/" + name`、`n.base = "subpackages/" + name`）
//   3. src/settings*.json: assets.server="" / remoteBundles=[] / subpackages=["<bundle>"]
//   4. game.json: subpackages [{ name, root:"subpackages/<bundle>/" }]
//   5. project.config.json: appid -> wxf631d432ca7abcee（如存在）
//   6. 打印主包（不含 sub/）与总体积
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [buildDir, outDir, ...bundles] = process.argv.slice(2);
if (!buildDir || !outDir || bundles.length === 0) {
  console.error('用法: node pack_subpackage.mjs <buildDir> <outDir> <bundle...>');
  process.exit(2);
}
const APPID = 'wxf631d432ca7abcee';

const walk = (dir, base = dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'));
  }
  return out;
};
const sizeOf = (files) => files.reduce((s, f) => s + statSync(f).size, 0);
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';

// 1. 复制
if (existsSync(outDir)) {
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch (e) {
    // Windows 上目录句柄可能被（微信开发者工具等）占用：退化为清空内容
    console.warn(`  !! 无法删除 ${outDir}（${e.code}），改为清空内容`);
    for (const name of readdirSync(outDir)) {
      try {
        rmSync(join(outDir, name), { recursive: true, force: true });
      } catch (e2) {
        console.warn(`     !! 残留 ${name}（${e2.code}）`);
      }
    }
  }
}
mkdirSync(dirname(outDir), { recursive: true });
cpSync(buildDir, outDir, { recursive: true });
console.log(`复制 ${buildDir} -> ${outDir}`);

// 2. 搬 bundle
const subs = [];
for (const b of bundles) {
  const from = join(outDir, 'assets', b);
  const to = join(outDir, 'subpackages', b);
  if (existsSync(from)) {
    mkdirSync(join(outDir, 'subpackages'), { recursive: true });
    renameSync(from, to);
    subs.push(b);
    // 微信要求每个分包根目录下有 game.js（否则报「未找到 [subpackages][0][root] 对应的 …/game.js」）。
    // 但这**不能是空占位**：微信加载分包时会执行它，而 Cocos 的 bundle 注册代码就在分包里的
    // `index.<hash>.js`（它注册 `virtual:///prerequisite-imports/<bundle>`）。空文件 ⇒ 主包
    // `loadBundle('<bundle>')` 报 «Unable to instantiate virtual:///prerequisite-imports/<bundle>
    // from undefined»，随后所有该 bundle 的资源都「does not exist」。
    // 实测证据：project/84_微信IDE验证.md §10（复验 2，2026-11-25）。
    const stub = join(to, 'game.js');
    const entries = readdirSync(to).filter((f) => /^index\.[0-9a-z]+\.js$/i.test(f));
    const legacy = readdirSync(to).filter((f) => /^index\.js$/i.test(f));
    const entryFile = entries[0] ?? legacy[0];
    if (!existsSync(stub)) {
      writeFileSync(stub, entryFile
        ? `// 分包入口：执行 bundle 注册代码（由 work/pack_subpackage.mjs 生成）\nrequire('./${entryFile}');\n`
        : '// asset-only subpackage: no entry code\n');
      console.log(`  assets/${b} -> subpackages/${b}（game.js → ${entryFile ?? '空占位'}）`);
    }
  } else if (existsSync(to)) {
    subs.push(b);
    console.log(`  subpackages/${b} 已就位`);
  } else {
    console.warn(`  !! 找不到 assets/${b}`);
  }
}
const assetsDir = join(outDir, 'assets');
if (existsSync(assetsDir) && readdirSync(assetsDir).length === 0) rmSync(assetsDir, { recursive: true, force: true });

// 3. settings
const srcDir = join(outDir, 'src');
const settingsFiles = existsSync(srcDir) ? readdirSync(srcDir).filter((f) => /^settings.*\.json$/.test(f)) : [];
for (const f of settingsFiles) {
  const p = join(srcDir, f);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.assets = j.assets || {};
  j.assets.server = '';
  j.assets.remoteBundles = [];
  j.assets.subpackages = subs.slice();
  const pb = new Set(j.assets.projectBundles || []);
  for (const s of subs) pb.add(s);
  j.assets.projectBundles = [...pb];
  writeFileSync(p, JSON.stringify(j));
  console.log(`  settings: ${f} -> server="" subpackages=${JSON.stringify(subs)} projectBundles=${JSON.stringify(j.assets.projectBundles)}`);
}

// 4. game.json
const gameJsonPath = join(outDir, 'game.json');
if (existsSync(gameJsonPath)) {
  const g = JSON.parse(readFileSync(gameJsonPath, 'utf8'));
  g.subpackages = subs.map((s) => ({ name: s, root: `subpackages/${s}/` }));
  writeFileSync(gameJsonPath, JSON.stringify(g, null, 2));
  console.log(`  game.json: subpackages=${JSON.stringify(g.subpackages)}`);
} else {
  console.warn('  !! 没有 game.json');
}

// 5. project.config.json
const pcPath = join(outDir, 'project.config.json');
if (existsSync(pcPath)) {
  const pc = JSON.parse(readFileSync(pcPath, 'utf8'));
  const old = pc.appid;
  pc.appid = APPID;
  writeFileSync(pcPath, JSON.stringify(pc, null, 2));
  console.log(`  project.config.json: appid ${old} -> ${APPID}`);
} else {
  console.warn('  !! 没有 project.config.json');
}

// 6. 统计
const all = walk(outDir);
const inSub = all.filter((f) => f.startsWith('subpackages/'));
const main = all.filter((f) => !f.startsWith('subpackages/'));
const mainSize = sizeOf(main.map((f) => join(outDir, f)));
const subSize = sizeOf(inSub.map((f) => join(outDir, f)));
const total = mainSize + subSize;
console.log('');
console.log(`主包   ${mb(mainSize)}  ${main.length} 文件`);
console.log(`分包   ${mb(subSize)}  ${inSub.length} 文件 ${subs.length ? `(${subs.join(', ')})` : ''}`);
console.log(`总计   ${mb(total)}  ${all.length} 文件`);
// R204：总计上限按微信小游戏 30 MB（-Audio embed 会把音频打进 res 分包）。
// 真正的硬闸门在 tools\build_wechat.ps1（main ≤ 4 MB / total ≤ 30 MB），这里只是出包后的概览。
console.log(`主包 ${mainSize <= 4 * 1024 * 1024 ? 'OK <=4MB' : 'FAIL >4MB'} / 总计 ${total <= 30 * 1024 * 1024 ? 'OK <=30MB' : 'FAIL >30MB'}`);
