#!/usr/bin/env node
/**
 * scan_storage.mjs — 掃兩端所有 localStorage 鍵，分類「寫 / 讀 / 只出現」。
 *
 *   node work/parity_sweep/scan_storage.mjs            # 印表
 *   node work/parity_sweep/scan_storage.mjs --json     # 出 work/parity_sweep/storage.json
 *
 * 口徑：
 *   - 只認字串常值 `sanguo_*`（含模板前綴 `sanguo_slot_payload_v1_` 這種）；
 *   - 同一行出現 setItem / removeItem / writeJson / writeRaw / storageOf -> write；
 *     getItem / readJson / readRaw -> read；兩者都有 -> readwrite；
 *   - 其餘（註解、清單、比較）-> ref。
 * 註：只掃 .js/.html/.ts 檔；不跟進 core/（core 是單源，由 check_parity 管）。
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'F:/sanguo';
const JSON_OUT = join(ROOT, 'work/parity_sweep/storage.json');
const TARGETS = [
  ['web', join(ROOT, 'game/web')],
  ['cocos', join(ROOT, 'game/cocos/assets/scripts')],
];
const EXT = new Set(['.js', '.mjs', '.html', '.ts']);
const WRITE = /setItem|removeItem|writeJson|writeRaw|writeSlot|saveStore|JSON\.stringify/;
const READ = /getItem|readJson|readRaw|loadStore|JSON\.parse/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'core' || name === 'node_modules' || name.startsWith('.')) continue;
      walk(p, out);
    } else if (EXT.has(name.slice(name.lastIndexOf('.')))) out.push(p);
  }
  return out;
}

const keys = new Map();
for (const [side, dir] of TARGETS) {
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
      for (const m of line.matchAll(/sanguo_[A-Za-z0-9_]+/g)) {
        const key = m[0];
        if (!keys.has(key)) keys.set(key, []);
        let kind = 'ref';
        if (WRITE.test(line) && READ.test(line)) kind = 'readwrite';
        else if (WRITE.test(line)) kind = 'write';
        else if (READ.test(line)) kind = 'read';
        keys.get(key).push({ side, file: rel, line: i + 1, kind, text: line.trim().slice(0, 150) });
      }
    });
  }
}

const rows = [...keys.entries()].map(([key, hits]) => {
  const by = { web: [], cocos: [] };
  for (const h of hits) by[h.side].push(h);
  const sum = (list) => ({
    read: list.filter((h) => h.kind === 'read' || h.kind === 'readwrite').length,
    write: list.filter((h) => h.kind === 'write' || h.kind === 'readwrite').length,
    ref: list.filter((h) => h.kind === 'ref').length,
  });
  return { key, total: hits.length, web: sum(by.web), cocos: sum(by.cocos), hits: by };
}).sort((a, b) => a.key.localeCompare(b.key));

if (process.argv.includes('--json')) {
  writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`wrote ${JSON_OUT} (${rows.length} keys)`);
} else {
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
  console.log(pad('key', 34) + pad('web r/w', 10) + pad('cocos r/w', 12) + 'files');
  for (const r of rows) {
    const files = [...r.hits.web, ...r.hits.cocos].length;
    console.log(pad(r.key, 34) + pad(`${r.web.read}/${r.web.write}`, 10) + pad(`${r.cocos.read}/${r.cocos.write}`, 12) + files);
  }
}
