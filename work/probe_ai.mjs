import { readFileSync } from "node:fs";
const scen = JSON.parse(readFileSync("data/scenarios.json","utf8"))[0];
const cities = scen.cities;
const byName = new Map(cities.map(c=>[c.NAME,c]));
const adj = new Map(cities.map(c=>[c.NAME,new Set()]));
let walk=0, sent=0;
for (const p of scen.paths||[]) {
  if ((p.Length||0)>=30000){ sent++; continue; }
  if(!adj.has(p.Start)||!adj.has(p.End)) continue;
  adj.get(p.Start).add(p.End); adj.get(p.End).add(p.Start); walk++;
}
const troops = (c)=> Math.min(Math.floor((c.POPULATION||0)/2500)+110,600);
console.log("cities",cities.length,"paths walk",walk,"sentinel",sent);
const mine = cities.slice(0,3).map(c=>c.NAME);
console.log("seed owned:", mine.map(n=>`${n}:${troops(byName.get(n))}`).join("  "));
for (const n of mine){
  const nb=[...adj.get(n)].map(x=>`${x}(t=${troops(byName.get(x))},pop=${byName.get(x).POPULATION})`);
  console.log(`\n${n} t=${troops(byName.get(n))} nb:`); nb.forEach(s=>console.log("   "+s));
}
const gens = JSON.parse(readFileSync("data/generals.json","utf8"));
const rows = Array.isArray(gens)?gens:gens.rows||[];
console.log("\ngenerals len", rows.length);
for (const n of mine){
  console.log(n, "->", rows.filter(g=>g.CITY===n && g.NAME!=="盜賊").map(g=>`${g.NAME}(${g.STR}/${g.INT})`).join(" ") || "(none)");
}
