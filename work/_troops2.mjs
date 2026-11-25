import { readFileSync } from "node:fs";
const t = JSON.parse(readFileSync("game/data/troops.json","utf8"));
console.log("troop names:", t.names.map((n,i)=>i+":"+n).join(" "));
console.log("matrix rows:", t.matrix.length);
