// 生成 66 号报告的证据文件（只读扫描，不写 game/ 下任何文件）
// 输出 UTF-8，避免 PowerShell 中文编码事故
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const OUT = path.join(ROOT, 'work/cocos_audit');
const lines = (arr) => arr.join('\n') + '\n';
const mb = (n) => (n / 1048576).toFixed(2);

function walk(dir, acc = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.isFile()) acc.push(p);
  }
  return acc;
}
function stat(p) { try { return fs.statSync(p); } catch { return { size: 0, mtime: new Date(0) }; } }
function agg(files) {
  let bytes = 0;
  for (const f of files) bytes += stat(f).size;
  return { count: files.length, bytes };
}
const hhmmss = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

// ---------------------------------------------------------------- 1. web_size
{
  const web = path.join(ROOT, 'game/web');
  const all = walk(web);
  const tot = agg(all);
  const L = [];
  L.push('# game/web 资产总账（node 递归实测，2026-11-25）');
  L.push(`TOTAL ${tot.count} files  ${tot.bytes} bytes  ${mb(tot.bytes)} MB`);
  L.push('');
  L.push('## 一级目录');
  const tops = fs.readdirSync(web, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const d of tops.sort()) {
    const a = agg(walk(path.join(web, d)));
    L.push(`${d.padEnd(10)} ${String(a.count).padStart(5)} files  ${String(a.bytes).padStart(10)} B  ${mb(a.bytes).padStart(7)} MB`);
    if (d === 'assets' || d === 'anim') {
      for (const sd of fs.readdirSync(path.join(web, d), { withFileTypes: true })) {
        const sp = path.join(web, d, sd.name);
        if (sd.isDirectory()) {
          const b = agg(walk(sp));
          L.push(`  ${sd.name.padEnd(10)} ${String(b.count).padStart(5)} files  ${String(b.bytes).padStart(10)} B  ${mb(b.bytes).padStart(7)} MB`);
        } else {
          const st = stat(sp);
          L.push(`  [file] ${sd.name.padEnd(22)} ${String(st.size).padStart(9)} B`);
        }
      }
    }
  }
  L.push('');
  L.push('## bg 细分（三层视差 / 原作 POLICY / 竖版 AI 殿内 / UI 图元）');
  for (const d of ['env', 'orig', 'policy']) {
    const p = path.join(web, 'assets/bg', d);
    const a = agg(walk(p));
    L.push(`bg/${d.padEnd(8)} ${String(a.count).padStart(3)} files  ${mb(a.bytes)} MB`);
  }
  L.push('bg/* 根文件：');
  for (const f of fs.readdirSync(path.join(web, 'assets/bg'))) {
    const p = path.join(web, 'assets/bg', f);
    if (fs.statSync(p).isFile()) L.push(`  ${f.padEnd(24)} ${stat(p).size} B`);
  }
  fs.writeFileSync(path.join(OUT, 'web_size.txt'), lines(L), 'utf8');
}

// ---------------------------------------------------------------- 2. cocos_tree
{
  const proj = path.join(ROOT, 'game/cocos');
  const L = [];
  L.push('# game/cocos 工程结构（node 递归实测，2026-11-25）');
  L.push('工程根：F:/sanguo/game/cocos   creator=3.8.8');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(proj, 'package.json'), 'utf8'));
    L.push(`package.json: name=${pkg.name} creator=${pkg.creator?.version ?? '(none)'}`);
  } catch (e) { L.push('package.json 读取失败 ' + e.message); }
  L.push('');
  L.push('## scene 场景');
  for (const f of fs.readdirSync(path.join(proj, 'assets/scene'))) {
    const p = path.join(proj, 'assets/scene', f);
    L.push(`  ${f.padEnd(18)} ${stat(p).size} B  mtime ${hhmmss(stat(p).mtime)}`);
  }
  L.push('');
  L.push('## assets/scripts（23 个 .ts + core/ + view/ + shim/）');
  const sc = walk(path.join(proj, 'assets/scripts')).filter((f) => f.endsWith('.ts'));
  for (const f of sc.sort()) {
    const rel = path.relative(path.join(proj, 'assets/scripts'), f).replace(/\\/g, '/');
    L.push(`  ${rel.padEnd(34)} ${String(stat(f).size).padStart(6)} B  mtime ${hhmmss(stat(f).mtime)}`);
  }
  L.push(`  – 共 ${sc.length} 个 .ts，合计 ${sc.reduce((a, f) => a + stat(f).size, 0)} B`);
  L.push('');
  L.push('## assets/bundles/res（Cocos 侧资源 bundle 摘要）');
  const res = walk(path.join(proj, 'assets/bundles/res'));
  const ra = agg(res);
  L.push(`  TOTAL ${ra.count} files  ${mb(ra.bytes)} MB`);
  const resSubs = fs.readdirSync(path.join(proj, 'assets/bundles/res'), { withFileTypes: true });
  for (const d of resSubs.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(proj, 'assets/bundles/res', d.name);
    const a = d.isDirectory() ? agg(walk(p)) : { count: 1, bytes: stat(p).size };
    L.push(`  ${d.name.padEnd(12)} ${String(a.count).padStart(5)} files  ${mb(a.bytes).padStart(7)} MB`);
  }
  L.push('');
  L.push('## 顶层目录体积（含 library/temp 缓存，不进包）');
  for (const d of fs.readdirSync(proj, { withFileTypes: true })) {
    const p = path.join(proj, d.name);
    const a = d.isDirectory() ? agg(walk(p)) : { count: 1, bytes: stat(p).size };
    L.push(`  ${d.name.padEnd(14)} ${String(a.count).padStart(5)} files  ${mb(a.bytes).padStart(8)} MB`);
  }
  L.push('');
  L.push('## 构建产物 game/cocos-build/*');
  for (const d of fs.readdirSync(path.join(ROOT, 'game/cocos-build'))) {
    const p = path.join(ROOT, 'game/cocos-build', d);
    if (!fs.statSync(p).isDirectory()) continue;
    const a = agg(walk(p));
    L.push(`  ${d.padEnd(14)} ${String(a.count).padStart(5)} files  ${mb(a.bytes).padStart(7)} MB`);
    for (const sd of fs.readdirSync(p, { withFileTypes: true })) {
      if (!sd.isDirectory()) continue;
      const b = agg(walk(path.join(p, sd.name)));
      L.push(`    ${sd.name.padEnd(12)} ${String(b.count).padStart(5)} files  ${mb(b.bytes).padStart(7)} MB`);
    }
  }
  L.push('');
  L.push('## 对照：game/dist（web 页面 import 的 tsc 产物）');
  const dist = agg(walk(path.join(ROOT, 'game/dist')));
  L.push(`  ${dist.count} files  ${dist.bytes} B  ${mb(dist.bytes)} MB`);
  fs.writeFileSync(path.join(OUT, 'cocos_tree.txt'), lines(L), 'utf8');
}

// ---------------------------------------------------------------- 3. ai_assets
{
  const web = path.join(ROOT, 'game/web');
  const L = [];
  L.push('# AI 生成资源残留清单（2026-11-25 实测）');
  L.push('');
  L.push('## A. 400 张 AI 武将立绘 game/web/assets/hero/*.webp');
  const hero = walk(path.join(web, 'assets/hero'));
  const ha = agg(hero);
  L.push(`  合计 ${ha.count} files  ${ha.bytes} B  ${mb(ha.bytes)} MB`);
  const sizes = hero.map((f) => stat(f).size);
  L.push(`  单张 ${Math.min(...sizes)}..${Math.max(...sizes)} B  平均 ${Math.round(ha.bytes / ha.count)} B`);
  L.push('  文件名（前 20）：' + hero.slice(0, 20).map((f) => path.basename(f)).join(', '));
  L.push('  仍可达路径（代码位置）：');
  L.push('    game/web/face_map.js:409  window.SG_ART=\'own\' / ?portrait=hero 可强制走 AI');
  L.push('    game/web/face_map.js:419  var HERO=function(key){return "assets/hero/"+encodeURIComponent(key)+".webp"}');
  L.push('    game/web/main.js:923-925  ... ? window.SG.portraitUrl(name,\'full\') : \'assets/hero/\'+...+\'.webp\'');
  L.push('    game/web/deploy.html:193-195  同构回落');
  L.push('    game/web/items.html:220-222   同构回落');
  L.push('');
  L.push('## B. 6 张竖版殿内背景 game/web/assets/bg/env/hall_01..06.jpg  [推测为 AI 重绘]');
  for (const f of ['hall_01', 'hall_02', 'hall_03', 'hall_04', 'hall_05', 'hall_06']) {
    const p = path.join(web, 'assets/bg/env', f + '.jpg');
    if (fs.existsSync(p)) L.push(`  ${f}.jpg ${stat(p).size} B`);
  }
  L.push('  依据：project/49_内政与征兵.md:198-206 明确写「殿內背景 hall_01..06」+ hallIndexOf 映射；');
  L.push('        city.html:315 applyHall() 写 --hall → assets/bg/env/hall_0N.jpg；');
  L.push('        project/18_原型底图与版式.md:77 计划「AI 重绘竖版内政大殿」；');
  L.push('        project/49 未写生成方式，故标 [推测]。');
  L.push('');
  L.push('## C. 对照：已改原作、不再依赖 AI 的部分');
  L.push('  face/ 801 files 1.90 MB（原作 FACE001..400 100x120 双规格）→ 四页 portraitUrl 首选');
  L.push('');
  L.push('## D. 死重（不在 web 包内，但占磁盘）');
  L.push('  work/asset_pipe/hero_png_dup 400 files 179.57 MB（project/56:15）');
  L.push('  work/asset_pipe/hero_webp_orig 400 files 12.89 MB（project/56:16）');
  fs.writeFileSync(path.join(OUT, 'ai_assets.txt'), lines(L), 'utf8');
}

console.log('written: web_size.txt / cocos_tree.txt / ai_assets.txt');
