#!/usr/bin/env node
// 一次性侦察：用 TypeScript AST 找出 core/** 里
//   1) for-of 头是逻辑表达式 / 三元式 的位置（Creator Babel 崩溃陷阱）
//   2) 所有 spread（`[...x]` / `...x`）里 x 不是数组/对象字面量的位置（Babel loose spread 陷阱）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
const ts = createRequire('F:/sanguo/game/package.json')('typescript');

const ROOT = 'F:/sanguo/game/src/core';
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) files.push(full);
  }
})(ROOT);

const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const textOf = (sf, node) => node.getText(sf).replace(/\s+/g, ' ').slice(0, 120);

function isLogical(expr) {
  let e = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isConditionalExpression(e)) return 'ternary';
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.BarBarToken) return '||';
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return '&&';
    if (k === ts.SyntaxKind.QuestionQuestionToken) return '??';
  }
  return null;
}

const forOfHits = [];
const spreads = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const rel = relative(ROOT, file).split('\\').join('/');
  (function visit(node) {
    if (ts.isForOfStatement(node)) {
      const kind = isLogical(node.expression);
      if (kind) forOfHits.push({ file: rel, line: lineOf(sf, node.getStart(sf)), kind, expr: textOf(sf, node.expression) });
    }
    if (ts.isSpreadElement(node)) {
      let e = node.expression;
      while (ts.isParenthesizedExpression(e)) e = e.expression;
      const safe = ts.isArrayLiteralExpression(e) || ts.isObjectLiteralExpression(e) || ts.isStringLiteralLike(e);
      if (!safe) spreads.push({ file: rel, line: lineOf(sf, node.getStart(sf)), expr: textOf(sf, node.parent) });
    }
    ts.forEachChild(node, visit);
  })(sf);
}

console.log('=== for-of 头是逻辑/三元（Babel 陷阱）===');
for (const h of forOfHits) console.log(`${h.file}:${h.line}  [${h.kind}]  ${h.expr}`);
console.log(`合计 ${forOfHits.length} 处`);
console.log('\n=== spread 非数组/对象字面量（loose spread 陷阱）===');
for (const s of spreads) console.log(`${s.file}:${s.line}  ${s.expr}`);
console.log(`合计 ${spreads.length} 处`);
