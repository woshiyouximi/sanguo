// 通用：在页面里跑一段 JS 并回传结果。JS 从环境变量 EXPR 读（或文件 path）。
import fs from 'node:fs';

export default async ({ s, evaluate, log }) => {
  await s('Page.bringToFront');
  const expr = process.env.EXPR || fs.readFileSync(process.env.EXPR_FILE, 'utf8');
  const out = await evaluate(expr);
  log('eval ->', JSON.stringify(out));
  return out;
};
