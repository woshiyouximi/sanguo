// 统计 CALLS 被调函数的 argc 分布（判断"按 argc 取参"的影响面）。
import { readFileSync } from 'node:fs';

const files = ['../game/data/magic_so.bin', '../game/data/system_so.bin'];
// 复用端口自己的解析器：loadMagicProgram 只认 magic；这里直接用 SoProgram。
const { SoProgram } = await import('../game/src/core/smartscript/program.ts');
for (const f of files) {
  const buf = readFileSync(new URL(f, import.meta.url));
  let prog;
  try {
    prog = SoProgram.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), f.includes('system') ? 'SYSTEM.SO' : 'MAGIC.SO');
  } catch (e) {
    console.log(f, 'parse fail', e.message);
    continue;
  }
  const seen = new Map();
  for (let pc = prog.codeStart; pc < prog.codeEnd; ) {
    const ins = prog.decode(pc);
    if (ins.op === 0x47) {
      // 往回找最近的 PUSHS 名字：端口是运行时找，这里只用 pc 附近不可靠 ⇒ 跳过
    }
    pc = ins.next;
  }
  const fns = typeof prog.functions === 'function' ? prog.functions() : prog.functions;
  const buckets = new Map();
  for (const fn of fns ?? []) buckets.set(fn.argc, (buckets.get(fn.argc) ?? 0) + 1);
  console.log(f, 'functions:', (fns ?? []).length, 'argc 分布:', [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
}
