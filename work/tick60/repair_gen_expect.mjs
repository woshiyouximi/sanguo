/**
 * Repair helper (throwaway): rebuild the damaged gen_expect.mjs string literals from the
 * pristine fidelity_expect.json, because a PowerShell Get-Content/Set-Content round trip
 * decoded the UTF-8 file as CP936 and destroyed ~60 characters.
 *
 * ASCII-only source on purpose (the console here is CP936).
 * Run: node work/tick60/repair_gen_expect.mjs
 */
import fs from 'node:fs';

const REC = 'F:/sanguo/work/fidelity/gen_expect.recovered.mjs';
const JSONP = 'F:/sanguo/work/fidelity/fidelity_expect.before_r192.json';
const OUT = 'F:/sanguo/work/fidelity/gen_expect.fixed.mjs';

const FFFD = '\uFFFD';

const text = fs.readFileSync(REC, 'utf8').replace(/^\?/, '\uFEFF');
const json = JSON.parse(fs.readFileSync(JSONP, 'utf8'));

/** every string value inside the expectation JSON */
function collect(node, out) {
  if (typeof node === 'string') {
    if (node.length >= 4) out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collect(v, out);
    return;
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collect(v, out);
  }
}
const raw = [];
collect(json, raw);
const cands = [...new Set(raw)];

/** ASCII-only skeleton: drop non-ASCII, question marks and whitespace */
const skel = (s) => s.replace(/[^\x20-\x7E]/g, '').replace(/\?/g, '').replace(/\s+/g, '');

function lev(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[n];
}

const candSkel = cands.map((c) => ({ value: c, skel: skel(c) }));

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
const unesc = (s) => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c));

let replaced = 0;
let ambiguous = 0;
let unmatched = 0;
const unmatchedSamples = [];

const lines = text.split('\n');
const outLines = lines.map((line, idx) => {
  if (!line.includes(FFFD)) return line;
  // replace every single-quoted literal that contains a replacement char
  return line.replace(/'((?:[^'\\]|\\.)*)'/g, (whole, bodyRaw) => {
    const body = unesc(bodyRaw);
    if (!body.includes(FFFD)) return whole;
    const s = skel(body);
    let best = null;
    let bestD = Infinity;
    let second = Infinity;
    for (const c of candSkel) {
      const d = Math.abs(c.skel.length - s.length) > 12 ? Infinity : lev(s, c.skel);
      if (d < bestD) {
        second = bestD;
        bestD = d;
        best = c;
      } else if (d < second) {
        second = d;
      }
    }
    const okDist = best && bestD <= Math.max(4, Math.round(s.length * 0.06));
    const unique = second - bestD >= 2 || bestD <= 3;
    if (okDist && unique) {
      replaced++;
      return "'" + esc(best.value) + "'";
    }
    if (okDist) ambiguous++;
    else unmatched++;
    unmatchedSamples.push(`line ${idx + 1} dist=${bestD} skelLen=${s.length}`);
    return whole;
  });
});

fs.writeFileSync(OUT, outLines.join('\n'), 'utf8');
const stillBad = outLines.filter((l) => l.includes(FFFD)).length;
console.log(`replaced=${replaced} ambiguous=${ambiguous} unmatched=${unmatched} stillBadLines=${stillBad}`);
console.log(unmatchedSamples.slice(0, 10).join(' | '));
