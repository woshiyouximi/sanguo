import fs from "node:fs";

const NEW = "F:/sanguo/work/fidelity/fidelity_expect.json";
const OLD = "F:/sanguo/work/fidelity/fidelity_expect.before_r192.json";
const OUT = "F:/sanguo/work/fidelity/fidelity_expect.json";

const neu = JSON.parse(fs.readFileSync(NEW, "utf8"));
const old = JSON.parse(fs.readFileSync(OLD, "utf8"));

let copied = 0;
let skipped = 0;

function isPlaceholder(s) {
  return typeof s === "string" && (s.includes("\ufffd") || s.includes("编码事故中损坏") || s.includes("R192 证据串损坏") || s.includes("见 project/192"));
}

function walk(a, b, path) {
  if (a === null || typeof a !== "object") {
    if (typeof a === "string" && typeof b === "string" && isPlaceholder(a) && !isPlaceholder(b)) {
      return { value: b, hit: true };
    }
    if (typeof a === "string" && typeof b === "string" && a === b) return { value: a, hit: false };
    if (typeof a === "string" && typeof b === "string") { skipped += 1; return { value: a, hit: false }; }
    return { value: a, hit: false };
  }
  if (Array.isArray(a)) {
    const arr = a.map((v, i) => {
      const r = walk(v, Array.isArray(b) ? b[i] : undefined, `${path}[${i}]`);
      if (r.hit) copied += 1;
      return r.value;
    });
    return { value: arr, hit: false };
  }
  const obj = {};
  for (const k of Object.keys(a)) {
    const r = walk(a[k], b && typeof b === "object" ? b[k] : undefined, `${path}.${k}`);
    if (r.hit) copied += 1;
    obj[k] = r.value;
  }
  return { value: obj, hit: false };
}

const res = walk(neu, old, "$");
fs.writeFileSync(OUT, JSON.stringify(res.value, null, 1), "utf8");
console.log(`backfilled ${copied} strings, skipped ${skipped} differing strings (kept new)`);
