import fs from "node:fs";
const G = "F:/sanguo/game/";
const sc = JSON.parse(fs.readFileSync(G+"data/scenarios.json","utf8"));
const gar = JSON.parse(fs.readFileSync(G+"data/garrison.json","utf8"));
const s0 = sc[0], g0 = gar["0"].cities;
for (const name of ["晉陽","易京","樂陵","壺關","許昌","宛","弘農","襄平","北平","代縣"]) {
  const c = s0.cities.find(x=>x.NAME===name);
  const g = g0[name];
  console.log(name.padEnd(3), "KING="+JSON.stringify(c.KING).padEnd(8), "MAJOR="+JSON.stringify(c.MAJOR).padEnd(8),
    "POP="+String(c.POPULATION).padEnd(7), "DEF="+String(c.DEFENSE).padEnd(4),
    "gar="+(g?g.garrison:"-"), "|", g ? g.officers.map(o=>o.name+"("+o.str+"/"+o.int+")").slice(0,6).join(" ") : "-");
}
console.log("\n--- scen1 (idx1) 晉陽/南皮/洛陽 ---");
const s1 = sc[1], g1 = gar["1"].cities;
for (const name of ["晉陽","南皮","洛陽","易京"]) {
  const c = s1.cities.find(x=>x.NAME===name); const g = g1[name];
  if (!c) { console.log(name,"absent"); continue; }
  console.log(name.padEnd(3), "KING="+JSON.stringify(c.KING).padEnd(8), "MAJOR="+JSON.stringify(c.MAJOR).padEnd(8), "gar="+(g?g.garrison:"-"), "|", g?g.officers.map(o=>o.name+"("+o.str+"/"+o.int+")").slice(0,5).join(" "):"-");
}
