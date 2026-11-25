import { readFileSync } from "node:fs";
const scens = JSON.parse(readFileSync("game/data/scenarios.json","utf8"));
const gens = JSON.parse(readFileSync("game/data/generals.json","utf8"));
const items = JSON.parse(readFileSync("game/data/items.json","utf8"));
const s0 = scens[0];
console.log("scen0 id/name", s0.id, s0.system);
console.log("first 3 cities:", s0.cities.slice(0,3).map(c=>`${c.NAME}(pop${c.POPULATION},def${c.DEFENSE},money${c.MONEY},rate${c.RATE})`).join(" | "));
for (const c of s0.cities) {
  const wild = gens.filter(g=>g.CITY===c.NAME && g.Status==="野");
  const base = gens.filter(g=>g.CITY===c.NAME && g.Status!=="野");
  if (wild.length || c.NAME===s0.cities[0].NAME || c.NAME===s0.cities[1].NAME || c.NAME===s0.cities[2].NAME)
    console.log(`${c.NAME}: base=${base.length} wild=${wild.length} [${wild.map(g=>g.NAME).join(",")}]`);
}
const st = scens[0].paths.slice(0,3);
console.log("path sample", JSON.stringify(st[0]).slice(0,200));
// neighbors of first city
const NE = (name) => { const idx = s0.cities.findIndex(c=>c.NAME===name); return s0.paths.filter(p=>(p.Start===idx||p.End===idx)&&p.Length<30000).map(p=>s0.cities[p.Start===idx?p.End:p.Start].NAME); };
for (const c of s0.cities.slice(0,8)) console.log("  邻接", c.NAME, "=", NE(c.NAME).join(","));
console.log("status counts", JSON.stringify(gens.reduce((a,g)=>{a[g.Status]=(a[g.Status]||0)+1;return a;},{})));
const bySearch = items.reduce((a,i)=>{a[i.SearchType]=(a[i.SearchType]||[]).concat(i);return a;},{});
for (const k of Object.keys(bySearch)) console.log(`SearchType ${k}: ${bySearch[k].length}`, bySearch[k].map(i=>`${i.Sequence}:${i.Name}/R${i.Rate}`).join(" "));
