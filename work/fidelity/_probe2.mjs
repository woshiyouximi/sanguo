import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "F:/sanguo";
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const DATA_FILES = ['magics', 'wises', 'troops', 'terrains', 'generals', 'items', 'scenarios', 'formations', 'garrison', 'levels_by_scenario'];
const D = {};
for (const n of DATA_FILES) D[n] = JSON.parse(readText(`game/data/${n}.json`));

const B = await import(pathToFileURL(path.join(ROOT, "game/dist/core/battle.js")).href);

const w = B.createWorld({ data: D });
w.sides.A.general.hp = 1;
const r = B.cast(w, "A", 1);
console.log("cast", JSON.stringify(r));
for (const n of [1, 5, 20, 60, 120, 240]) {
  for (let i = 0; i < n; i++) B.step(w);
  console.log(`after +${n} ticks hp=${w.sides.A.general.hp} tick=${w.tick}`);
}
console.log("world fields", Object.keys(w).filter((k) => /inst|session|script|proj/i.test(k)).join(","));

const w2 = B.createWorld({ data: D });
const t = w2.units.find((u) => u.side === "B" && u.alive);
const hp0 = w2.sides.B.general.hp;
const cs = B.cast(w2, "A", 18, t.x, t.y);
console.log("strike cast", JSON.stringify(cs), "foeHp0", hp0);
for (let i = 0; i < 240; i++) B.step(w2);
console.log("after 240 foeHp", w2.sides.B.general.hp, "aliveB", w2.units.filter((u) => u.side === "B" && u.alive).length);
