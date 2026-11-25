import fs from "node:fs";
const G = "F:/sanguo/game/";
const sc = JSON.parse(fs.readFileSync(G+"data/scenarios.json","utf8"));
const gar = JSON.parse(fs.readFileSync(G+"data/garrison.json","utf8")) || JSON.parse(fs.readFileSync(G+"data/garrison.json","utf8"));
console.log("scenario count", sc.length, "garrison type", Array.isArray(gar) ? "array" : Object.keys(gar));
console.log("first3 per scen:", sc.map(s=>s.id+":"+s.cities.slice(0,3).map(c=>c.NAME).join("/")).join(" | "));
const s0 = sc[0];
const adj = new Map();
for (const c of s0.cities) adj.set(c.NAME, []);
for (const p of s0.paths) { if ((p.Length||0) >= 30000) continue; if(!adj.has(p.Start)||!adj.has(p.End)) continue; adj.get(p.Start).push(p.End); adj.get(p.End).push(p.Start); }
for (const name of ["南皮","洛陽","鄴","平原","北平","代縣","晉陽","濮陽","陳留","許昌","薊","漁陽"]) {
  if (!adj.has(name)) { console.log(name, "NOT IN SCEN0"); continue; }
  console.log(name, "->", adj.get(name).join(","));
}
const g0 = Array.isArray(gar) ? gar.find(x=>x.scenario===0) : gar.scenarios?.[0];
console.log("garrison keys:", Object.keys(gar));
for (const name of ["南皮","洛陽"]) {
  const row = s0.cities.find(c=>c.NAME===name);
  const g = g0 && g0.cities ? g0.cities[name] : null;
  console.log(name, "KING=", JSON.stringify(row.KING), "MAJOR=", JSON.stringify(row.MAJOR), "POP=", row.POPULATION, "DEF=", row.DEFENSE, "garrison=", g && g.garrison, "officers=", g ? g.officers.map(o=>o.name+":"+o.str+"/"+o.int).join(" ") : "none");
}
console.log("numeric KING:", s0.cities.filter(c=>typeof c.KING === "number").map(c=>c.NAME).join(","));
