import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\smartscript\runtime.ts')
t = p.read_text(encoding='utf-8')

t = t.replace("""import { readFileSync } from 'node:fs';
import type { Fx, GeneralState, Side, Unit, World } from '../battle.ts';""",
"""import type { Fx, GeneralState, Side, Unit, World } from '../battle.ts';""", 1)

old = """const DATA_URL = new URL('../../../data/', import.meta.url);

let cachedProgram: SoProgram | undefined;

/** 读取 `game/data/magic_so.{bin,symbols.json}`（进程内缓存）。 */
export function loadMagicProgram(): SoProgram {
  if (cachedProgram) return cachedProgram;
  const bytes = readFileSync(new URL('magic_so.bin', DATA_URL));
  const sym = JSON.parse(readFileSync(new URL('magic_so.symbols.json', DATA_URL), 'utf8')) as SoSymbols;
  cachedProgram = SoProgram.fromJson(new Uint8Array(bytes), sym);
  return cachedProgram;
}"""

new = """const DATA_URL = new URL('../../../data/', import.meta.url);

let cachedProgram: SoProgram | undefined;
/** 浏览器里由 `initMagicProgram()` 预先塞进来的原始字节。 */
let preloaded: { bin: ArrayBuffer | Uint8Array; symbols: SoSymbols } | undefined;

/**
 * 预加载 `magic_so.{bin,symbols.json}`。
 *
 * Node 下自动从磁盘读；浏览器下 **必须** 在开战前 `await` 一次
 * （`game/web/main.js` 里已接），否则 `cast()` 会抛"尚未加载"。
 * 之所以不做成同步 XHR：微信小游戏环境不支持，而且会阻塞首帧。
 */
export async function initMagicProgram(base = 'data/'): Promise<void> {
  if (cachedProgram || preloaded) return;
  const binUrl = new URL('magic_so.bin', new URL(base, location.href)).toString();
  const symUrl = new URL('magic_so.symbols.json', new URL(base, location.href)).toString();
  const [binRes, symRes] = await Promise.all([fetch(binUrl), fetch(symUrl)]);
  if (!binRes.ok || !symRes.ok) throw new Error(`magic_so 加载失败: ${binRes.status}/${symRes.status}`);
  preloaded = { bin: await binRes.arrayBuffer(), symbols: (await symRes.json()) as SoSymbols };
}

/** 读取 `game/data/magic_so.{bin,symbols.json}`（进程内缓存）。 */
export function loadMagicProgram(): SoProgram {
  if (cachedProgram) return cachedProgram;
  if (preloaded) {
    cachedProgram = SoProgram.fromJson(new Uint8Array(preloaded.bin), preloaded.symbols);
    return cachedProgram;
  }
  // Node / 测试：动态 require 以免把 node:fs 打进浏览器包
  const req = (globalThis as { process?: { getBuiltinModule?: (n: string) => unknown } }).process?.getBuiltinModule;
  if (typeof req !== 'function') throw new Error('magic_so 尚未加载：浏览器/小游戏请先 await initMagicProgram()');
  const fs = req('node:fs') as { readFileSync: (p: URL, enc?: string) => unknown };
  const bytes = fs.readFileSync(new URL('magic_so.bin', DATA_URL)) as Uint8Array;
  const sym = JSON.parse(fs.readFileSync(new URL('magic_so.symbols.json', DATA_URL), 'utf8') as string) as SoSymbols;
  cachedProgram = SoProgram.fromJson(new Uint8Array(bytes), sym);
  return cachedProgram;
}"""
assert old in t
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('runtime loader split node/browser')
