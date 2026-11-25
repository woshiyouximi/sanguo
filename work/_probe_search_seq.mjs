import { readFileSync } from "node:fs";
import * as Saves from "../game/web/saves.js";
import * as M from "../game/web/city_model.js";
const S0 = JSON.parse(readFileSync(new URL("../game/data/scenarios.json", import.meta.url), "utf8"))[0];
const ctx = { generals: JSON.parse(readFileSync(new URL("../game/data/generals.json", import.meta.url),"utf8")), scenario: S0, scenIdx: 0, items: JSON.parse(readFileSync(new URL("../game/data/items.json", import.meta.url),"utf8")) };
const save = Saves.newCampaign(S0); M.ensureExtras(save); for (const c of S0.cities) M.ensureCityState(save, c);
save.gold = 999999;
const city = S0.cities.find(c=>c.NAME==="襄平");
for (let i=0;i<12;i++){ const r = M.search(save, city, ctx); console.log(i, r.kind, r.text); }
console.log("roster", JSON.stringify(save.roster));
