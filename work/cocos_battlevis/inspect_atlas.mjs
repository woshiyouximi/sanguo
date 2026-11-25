import { readFileSync } from 'node:fs';

function summarize(path) {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const out = { path, pages: [], groups: {}, prefixes: {} };
  for (const p of j.pages ?? []) {
    out.pages.push({ file: p.file, w: p.w, h: p.h, sprites: p.sprites.length });
    for (const s of p.sprites) {
      const m = /^(.*)_f\d+$/.exec(s.name);
      const pre = m ? m[1] : s.name;
      out.prefixes[pre] = (out.prefixes[pre] ?? 0) + 1;
    }
  }
  for (const [k, v] of Object.entries(j.groups ?? {})) {
    out.groups[k] = Array.isArray(v) ? v.length : JSON.stringify(v).slice(0, 80);
  }
  out.topKeys = Object.keys(j);
  return out;
}

for (const p of process.argv.slice(2)) {
  console.log(JSON.stringify(summarize(p), null, 1));
}
