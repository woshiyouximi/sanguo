import { createWorld, cast, step, TICK_HZ } from "../../game/dist/core/battle.js";
import fs from "node:fs";

const ROOT = "F:/sanguo";
const data = JSON.parse(fs.readFileSync(`${ROOT}/game/data/magics.json`, "utf8"));

const mk = () => createWorld({
  data,
  seed: 777,
  a: { general: { name: "關羽", str: 97, int: 75, level: 6 } },
  b: { general: { name: "張角", str: 70, int: 88, level: 5 } },
});

// heal
{
  const w = mk();
  w.sides.A.general.hp = 1;
  const before = w.sides.A.general.hp;
  const r = cast(w, "A", 1);
  console.log("heal cast", JSON.stringify(r), "hp_right_after", w.sides.A.general.hp, "before", before);
  for (let t = 0; t < 300; t++) step(w);
  console.log("heal after 300 ticks hp", w.sides.A.general.hp);
}

// strike (落月弓 seq 18)
{
  const w = mk();
  const alive0 = w.sides.B.alive ?? w.sides.B.troops ?? null;
  const r = cast(w, "A", 18);
  console.log("strike cast", JSON.stringify(r));
  for (let t = 0; t < 300; t++) step(w);
  console.log("strike after 300 ticks B", JSON.stringify({ troops: w.sides.B.troops, alive: w.sides.B.alive, generalHp: w.sides.B.general.hp }));
}
