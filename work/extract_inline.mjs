import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("web/campaign.html","utf8");
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.log("NO SCRIPT"); process.exit(1); }
writeFileSync("F:/sanguo/work/campaign_inline.mjs", m[1]);
console.log("extracted", m[1].split("\n").length, "lines");
