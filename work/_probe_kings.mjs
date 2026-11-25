import { readFileSync } from "node:fs";
const s0 = JSON.parse(readFileSync("game/data/scenarios.json","utf8"))[0];
console.log("kings sample", JSON.stringify(s0.kings).slice(0, 500));
console.log("kings len", Array.isArray(s0.kings) ? s0.kings.length : typeof s0.kings);
const kinds = new Map();
for (const c of s0.cities) { const k=String(c.KING); kinds.set(k,(kinds.get(k)||0)+1); }
console.log("KING values", [...kinds.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15));
console.log("numeric KING cities", s0.cities.filter(c=>/^\d+$/.test(String(c.KING))).map(c=>c.NAME+":"+c.KING).join(" "));
