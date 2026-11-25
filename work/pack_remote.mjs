// pack_remote.mjs —— 把一个 Cocos 构建产物里的 bundle 从包内搬到「远程 CDN 目录」，并同步 settings.json。
// 用法: node pack_remote.mjs <buildDir> <serverUrl> <bundleName> [bundleName...]
//   例: node pack_remote.mjs F:/sanguo/game/cocos-build/wechatgame https://cdn.example.com/sanguo/ res
// 做的事（等价于编辑器 Build 面板里把 bundle 勾成「远程包」）：
//   1) src/settings*.json 的 assets.server = serverUrl（末尾补 /）
//   2) assets.remoteBundles 里加上这些 bundle 名
//   3) <buildDir>/assets/<bundle> 整个目录搬到 <buildDir>-remote/<bundle>（= CDN 根目录，直接上传）
import fs from 'node:fs';
import path from 'node:path';

const [buildDirArg, serverArg, ...bundleArgs] = process.argv.slice(2);
if (!buildDirArg || !serverArg || bundleArgs.length === 0) {
  console.error('usage: node pack_remote.mjs <buildDir> <serverUrl> <bundle> [bundle...]');
  process.exit(2);
}
const buildDir = path.resolve(buildDirArg);
const serverUrl = serverArg.endsWith('/') ? serverArg : serverArg + '/';
const remoteDir = buildDir + '-remote';

function dirSize(p) {
  let bytes = 0, files = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else { bytes += fs.statSync(f).size; files++; }
    }
  };
  if (fs.existsSync(p)) walk(p);
  return { bytes, files };
}

// ---- settings.json ----
const srcDir = path.join(buildDir, 'src');
if (!fs.existsSync(srcDir)) { console.error('找不到', srcDir); process.exit(1); }
const settingsName = fs.readdirSync(srcDir).find((n) => /^settings.*\.json$/.test(n));
if (!settingsName) { console.error('src 下没有 settings*.json'); process.exit(1); }
const settingsPath = path.join(srcDir, settingsName);
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
settings.assets = settings.assets || {};
settings.assets.server = serverUrl;
const rb = new Set(settings.assets.remoteBundles || []);
for (const b of bundleArgs) rb.add(b);
settings.assets.remoteBundles = [...rb];
fs.writeFileSync(settingsPath, JSON.stringify(settings));

// ---- 搬目录 ----
fs.mkdirSync(remoteDir, { recursive: true });
const moved = [];
for (const b of bundleArgs) {
  const src = path.join(buildDir, 'assets', b);
  if (!fs.existsSync(src)) { console.log(`[skip] 包内没有 assets/${b}（可能已是远程）`); continue; }
  const before = dirSize(src);
  const dest = path.join(remoteDir, 'remote', b);
  fs.rmSync(dest, { recursive: true, force: true });
  try {
    fs.renameSync(src, dest);
  } catch {
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
  moved.push({ bundle: b, ...before });
  console.log(`[move] assets/${b} -> ${dest}  ${(before.bytes / 1048576).toFixed(2)} MB / ${before.files} 文件`);
}

const pkg = dirSize(buildDir);
console.log('---');
console.log(`settings: ${settingsPath}`);
console.log(`  assets.server        = ${settings.assets.server}`);
console.log(`  assets.remoteBundles = ${JSON.stringify(settings.assets.remoteBundles)}`);
console.log(`首包总计: ${(pkg.bytes / 1048576).toFixed(2)} MB / ${pkg.files} 文件`);
for (const m of moved) console.log(`远程 ${m.bundle}: ${(m.bytes / 1048576).toFixed(2)} MB / ${m.files} 文件 -> ${remoteDir}`);
