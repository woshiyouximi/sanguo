import { readFileSync } from "node:fs";
const t = JSON.parse(readFileSync("data/troops.json","utf8"));
console.log(Object.keys(t));
const arr = Array.isArray(t) ? t : (t.troops||t.list||null);
if (arr) console.log(arr.length, arr.map(x=>x.name||x.n||x.id).join(","));
