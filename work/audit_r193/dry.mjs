import fs from "node:fs";
const rows = JSON.parse(fs.readFileSync("work/audit_r193/cites.json","utf8"));
const re = /(?:^|[`\s(（])((?:[\w./\\-]+\/)?(?:[\w.-]+)\.test\.ts)|(work\/[\w./-]+\.mjs)|(node work\/[\w./-]+)/g;
let n=0;
for (const r of rows) {
  if (r.status !== "\u2705") continue;
  const ev = r.evidence || "";
  const m = [...ev.matchAll(re)].map(x=>x[1]||x[2]||x[3]);
  if (!m.length) { n++; console.log(r.id + "\t" + (r.system||"").slice(0,40) + "\t" + ev.slice(0,110)); }
}
console.log("NO_GUARD=" + n);
