// 一次性实验：确认 node:module registerHooks 对 .ts 的 load 结果形态
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const TARGET = pathToFileURL(path.resolve('F:/sanguo/game/src/core/battle.ts')).href;

registerHooks({
  load(url, ctx, nextLoad) {
    const r = nextLoad(url, ctx);
    if (url === TARGET) {
      const src = String(r.source ?? '');
      const hit = src.includes('Math.floor(rng() * 0x30) - 0x18');
      console.log('format=', r.format, 'len=', src.length, 'jitter-hit=', hit);
      if (hit) {
        return {
          ...r,
          source: src.replace('Math.floor(rng() * 0x30) - 0x18', 'Math.floor(rng() * 0x18) - 0x0c'),
        };
      }
    }
    return r;
  },
});

const m = await import(TARGET);
console.log('loaded battle.ts exports:', typeof m.step);
