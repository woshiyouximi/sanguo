import { readFileSync } from "node:fs";
const s0 = JSON.parse(readFileSync("game/data/scenarios.json","utf8"))[0];
for (const n of ["易京","壺關","樂陵","界橋","官渡","都陽","代縣","晉陽"]) {
  const c = s0.cities.find(x=>x.NAME===n);
  console.log(n, c ? JSON.stringify({FLAGS:c.FLAGS,RATE:c.RATE,POP:c.POPULATION,DEF:c.DEFENSE,MONEY:c.MONEY,KING:c.KING,MAJOR:c.MAJOR}) : "MISSING");
}
console.log("RATE==0 count", s0.cities.filter(c=>Number(c.RATE)===0).length, "POP==0", s0.cities.filter(c=>Number(c.POPULATION)===0).length);
console.log("FLAGS values", [...new Set(s0.cities.map(c=>c.FLAGS))]);
console.log("gate names", s0.cities.filter(c=>Number(c.RATE)===0).map(c=>c.NAME+":"+c.FLAGS).join(" "));
