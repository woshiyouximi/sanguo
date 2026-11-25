import { readFileSync } from "node:fs";
const scens = JSON.parse(readFileSync("game/data/scenarios.json","utf8"));
const s0 = scens[0];
console.log("cities", s0.cities.length, "paths", s0.paths.length);
const NE = (name) => s0.paths.filter(p=>p.Length<30000 && (p.Start===name||p.End===name)).map(p=>`${p.Start===name?p.End:p.Start}(${p.Length})`);
for (const c of s0.cities) {
  const ne = NE(c.NAME);
  if (ne.length) console.log(c.NAME, "FLAGS",c.FLAGS,"RATE",c.RATE,"KING",JSON.stringify(c.KING),"MAJOR",c.MAJOR,"WISE",c.WISE,"->",ne.join(" "));
}
