// 逐技能分析：从 fx_func 出发，按“执行顺序”（先序 DFS，CALL 点处递归）收集音效调用点。
import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/dis.json', 'utf8'));
const magics = JSON.parse(fs.readFileSync('F:/sanguo/game/data/magics.json', 'utf8'));
const funcs = d.funcs;
const byName = new Map(funcs.map((f) => [f.name, f]));
const sitesByFunc = new Map();
for (const s of d.soundSites) {
  if (!sitesByFunc.has(s.func)) sitesByFunc.set(s.func, []);
  sitesByFunc.get(s.func).push(s);
}
for (const arr of sitesByFunc.values()) arr.sort((a, b) => a.addr - b.addr);

const disLines = fs.readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
// 函数头行号：按 func #idx 找
const headLine = new Map();
const reHead = /^; func #(\d+)\s+(\S+)\s+.*@0x([0-9a-f]+)/;
disLines.forEach((l, i) => { const m = reHead.exec(l); if (m) headLine.set(+m[1], i + 1); });
for (const f of funcs) f.line = headLine.get(f.idx) ?? 0;

// 每个函数的指令级“调用/音效”事件序列，用来做 DFS 顺序
const events = new Map(); // name -> [{kind:'call'|'snd', addr, callee?, site?}]
for (const f of funcs) {
  const ev = [];
  for (const s of sitesByFunc.get(f.name) ?? []) ev.push({ kind: 'snd', addr: s.addr, site: s });
  // CALL 事件：需要指令级信息，重新扫一遍 dis 太慢——从 calls 列表拿不到地址，改为直接扫 dis.json 之外的源文件
  events.set(f.name, ev);
}
// 重新解析 CALL 地址（轻量：只对用到的文件整读一次，缓存）
const callSites = new Map(); // name -> [{addr, callee}]
{
  let cur = null;
  const reIns = /^([0-9A-F]{6})\s+([0-9A-F]+)\s+([A-Z][A-Z0-9_]*)\s*(.*?)\s*;\s*(.*)$/;
  const reH = /^; func #(\d+)\s+(\S+)\s+.*@0x([0-9a-f]+)/;
  for (const line of disLines) {
    const h = reH.exec(line);
    if (h) { cur = h[2]; if (!callSites.has(cur)) callSites.set(cur, []); continue; }
    const m = reIns.exec(line);
    if (!m || !cur) continue;
    if (m[3] === 'CALL') callSites.get(cur).push({ addr: parseInt(m[1], 16), callee: m[4].trim() });
  }
}
for (const f of funcs) {
  const ev = events.get(f.name);
  for (const c of callSites.get(f.name) ?? []) ev.push({ kind: 'call', addr: c.addr, callee: c.callee });
  ev.sort((a, b) => a.addr - b.addr);
}

// DFS：先序，遇到 CALL 立刻下钻；遇到别的 MagicN 不下钻（避免把别的技能整包拉进来）
function collect(root) {
  const out = [];
  const seen = new Set();
  const stack = [{ name: root, depth: 0, path: [root] }];
  // 用显式栈模拟先序
  const walk = (name, depth, path, visited) => {
    const f = byName.get(name);
    if (!f) return;
    for (const ev of events.get(name) ?? []) {
      if (ev.kind === 'snd') out.push({ ...ev.site, depth, path: [...path] });
      else {
        const callee = ev.callee;
        if (!byName.has(callee)) continue;
        if (/^Magic\d+$/.test(callee)) continue;
        if (visited.has(callee)) continue;
        visited.add(callee);
        walk(callee, depth + 1, [...path, callee], visited);
      }
    }
  };
  walk(root, 0, [root], new Set([root]));
  return out;
}

const rows = [];
for (const mg of magics) {
  const seq = mg.SEQUENCE;
  const fn = mg.fx_func;
  const sites = collect(fn);
  const names = sites.map((s) => s.name ?? `(dyn@${s.func})`);
  rows.push({
    seq, name: mg.NAME, script: mg.SCRIPT, dir: mg.fx_dir_primary, dirs: mg.fx_dir, fx_func: fn,
    first: names[0] ?? null,
    sounds: [...new Set(names)],
    sites: sites.map((s) => ({ name: s.name, func: s.func, addr: s.addr, line: s.line, depth: s.depth, path: s.path })),
  });
}
fs.writeFileSync('F:/sanguo/work/sfx84/skills.json', JSON.stringify(rows, null, 1));

const withSnd = rows.filter((r) => r.first);
console.log('skills', rows.length, 'withSnd', withSnd.length, 'noSnd', rows.length - withSnd.length);
console.log('first==dir-match?', withSnd.filter((r) => (r.first.match(/^m(\d{3})/) ?? [])[1] === r.dir).length);
const noSnd = rows.filter((r) => !r.first);
console.log('无音效技能:', noSnd.map((r) => `${r.seq}:${r.name}(${r.fx_func},dir${r.dir})`).join(' '));
console.log('\n--- 前 20 行 ---');
for (const r of rows.slice(0, 20)) console.log(r.seq, r.name, r.fx_func, 'dir', r.dir, 'first', r.first, 'all', JSON.stringify(r.sounds), 'sites', r.sites.map((s) => `${s.func}@0x${s.addr.toString(16)}`).join(','));
