#!/usr/bin/env node
// expect_diff.mjs — frozen-baseline diff gate for work/fidelity/fidelity_expect.json.
//
// Why: on 2026-11-25 the expectation generator (gen_expect.mjs) was destroyed by a
// PowerShell CP936 round-trip. The replacement gate (check.mjs, 459 assertions) only
// verifies the *numbers*, so a regenerated JSON with silently re-worded provenance text
// still passes. This script compares a candidate JSON against a frozen baseline and
// fails on every difference that is not in the explicit allowlist below.
//
// Usage:
//   node work/fidelity/expect_diff.mjs                      # audit: pre-incident baseline, all R192 + drift diffs visible
//   node work/fidelity/expect_diff.mjs --frozen             # tripwire: reviewed_r192 snapshot, only generatedAt may differ
//   node work/fidelity/expect_diff.mjs <base> <candidate>
//   node work/fidelity/expect_diff.mjs --list               # print the allowlist
// Exit: 0 = only allowlisted differences, 1 = unexpected differences (printed), 2 = usage/IO error.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BASE = path.join(ROOT, 'work/fidelity/fidelity_expect.before_r192.json');
const REVIEWED = path.join(ROOT, 'work/fidelity/fidelity_expect.reviewed_r192.json');
const CUR = path.join(ROOT, 'work/fidelity/fidelity_expect.json');

// Each entry: [regex on JSON path, why it is allowed to differ].
// Rule: a path may only be allowlisted with a documented cause. "R192" = the tick-rate
// change (project/192). "parallel repair" = the 2026-11-25 rebuild of gen_expect.mjs by
// another worker, which changed how some fields are derived; those are recorded here so
// the drift stays visible instead of silently passing.
const ALLOW = [
  ['^generatedAt$', 'timestamp of the run'],
  ['^sources\\[\\d+\\]\\.(bytes|sha1(_16)?|mtime)$', 'input file bytes changed upstream (map6.json, 2026-11-25)'],
  ['^origin\\.tickHz$', 'R192: 30 -> 60 Hz (project/192)'],
  ['^troops\\.tickHz$', 'R192: 30 -> 60 Hz (project/192)'],
  ['^origin\\.evidence\\.tickHz60$', 'R192: new evidence string for 60 Hz'],
  ['^troops\\.evidence\\[1\\]$', 'R192: evidence string 2 now cites 60 Hz'],
  ['^magics\\[\\d+\\]\\.sfx\\.(direct|dirs?)$', 'map6.json regenerated 2026-11-25 18:18'],
  ['^magics\\[\\d+\\]\\.sfx\\.all(\\[\\d+\\]|\\.length)?$', 'map6.json regenerated 2026-11-25 18:18'],
  ['^magics\\[\\d+\\]\\.fx\\.dirs?$', 'map6.json regenerated 2026-11-25 18:18'],
  ['^magics\\[\\d+\\]\\.sfx\\.(grade|gradeRaw|snd|primary|via|deep|A|C|B)$', 'map6.json regenerated 2026-11-25 18:18'],
  ['^magics\\[\\d+\\]\\.evidence\\[1\\]$', 'sfx evidence text tracks map6.json'],
  ['^magics\\[\\d+\\]\\.castKind$', 'parallel repair: castKind now taken from the engine (gen_expect.mjs:14), not R192'],
  ['^speculations\\[\\d+\\]\\.(what|why)$', 'R192: fxTtl wording + parallel repair of spec text'],
];

if (process.argv.includes('--list')) {
  for (const [re, why] of ALLOW) console.log(re + '  # ' + why);
  process.exit(0);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const frozen = process.argv.includes('--frozen');
const basePath = args[0] ? path.resolve(args[0]) : frozen ? REVIEWED : BASE;
const curPath = args[1] ? path.resolve(args[1]) : CUR;

function load(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('expect_diff: cannot read ' + p + ': ' + e.message);
    process.exit(2);
  }
}

const base = load(basePath);
const cur = load(curPath);
const diffs = [];

function kind(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
function val(v) {
  if (typeof v === 'string') return JSON.stringify(v.length > 160 ? v.slice(0, 157) + '...' : v);
  return JSON.stringify(v);
}
function walk(a, b, p) {
  const ka = kind(a);
  const kb = kind(b);
  if (ka !== kb) {
    diffs.push({ p, base: val(a), cur: val(b), t: 'type' });
    return;
  }
  if (ka === 'array') {
    if (a.length !== b.length) diffs.push({ p: p + '.length', base: a.length, cur: b.length, t: 'len' });
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], p + '[' + i + ']');
    return;
  }
  if (ka === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const p2 = p ? p + '.' + k : k;
      if (!(k in a)) { diffs.push({ p: p2, base: '<absent>', cur: val(b[k]), t: 'key+' }); continue; }
      if (!(k in b)) { diffs.push({ p: p2, base: val(a[k]), cur: '<absent>', t: 'key-' }); continue; }
      walk(a[k], b[k], p2);
    }
    return;
  }
  if (a !== b) diffs.push({ p, base: val(a), cur: val(b), t: ka });
}

walk(base, cur, '');

const allowed = [];
const unexpected = [];
for (const d of diffs) {
  const hit = ALLOW.find(([re]) => new RegExp(re).test(d.p));
  if (hit) allowed.push({ ...d, why: hit[1] });
  else unexpected.push(d);
}

const byKind = {};
for (const d of diffs) byKind[d.t] = (byKind[d.t] || 0) + 1;
console.log('expect_diff: base=' + path.basename(basePath) + ' candidate=' + path.basename(curPath));
console.log('diffs=' + diffs.length + ' allowed=' + allowed.length + ' unexpected=' + unexpected.length +
  ' byKind=' + JSON.stringify(byKind));
if (allowed.length) {
  const byWhy = {};
  for (const a of allowed) byWhy[a.why] = (byWhy[a.why] || 0) + 1;
  for (const [why, n] of Object.entries(byWhy)) console.log('  allowed x' + n + '  ' + why);
}
for (const d of unexpected.slice(0, 40)) {
  console.log('  UNEXPECTED ' + d.p + '  base=' + d.base + '  cur=' + d.cur);
}
if (unexpected.length > 40) console.log('  ... ' + (unexpected.length - 40) + ' more unexpected');
process.exit(unexpected.length === 0 ? 0 : 1);
