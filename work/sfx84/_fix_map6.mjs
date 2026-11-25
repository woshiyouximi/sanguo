import fs from "node:fs";

const p = "F:/sanguo/work/sfx84/map6.json";
const m = JSON.parse(fs.readFileSync(p, "utf8"));

const fix = {
  42: { snd: "m032snd01", deep0: "m032snd01", note: "R192 修正：Magic43→Sparkle→CreateSparkle 的 deep 直证（0x02A658 m032snd01）；dir022 的磁盘命名猜测不成立" },
  101: { snd: "m031snd01", deep0: "m031snd01", note: "R192 修正：#102 集火柱→Magic107→CreateFirePillar 的 deep 直证（0x029E20 m031snd01）；dir021 的磁盘命名猜测不成立" },
};

for (const [k, v] of Object.entries(fix)) {
  const e = m[k];
  if (!e) throw new Error("missing key " + k);
  e.snd = v.snd;
  e.grade = "A";
  e.via = "效果函数 deep 直证（R192 修正）";
  e.evidence = v.note;
  delete e.dir;
  delete e.dirs;
}

fs.writeFileSync(p, JSON.stringify(m, null, 1), "utf8");
console.log("patched", Object.keys(fix).length, "entries");
