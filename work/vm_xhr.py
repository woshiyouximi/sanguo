import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\smartscript\runtime.ts')
t = p.read_text(encoding='utf-8')
old = """  // Node / 测试：动态 require 以免把 node:fs 打进浏览器包"""
new = """  // 浏览器兜底：同步 XHR（首帧前一次性 261 KB，之后走缓存）。这样即使调用方
  // 忘了 `await initMagicProgram()`，技能也不会退化成占位特效。
  if (typeof XMLHttpRequest !== 'undefined') {
    const get = (u: string, bin: boolean): unknown => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', u, false);
      if (bin) xhr.responseType = 'arraybuffer';
      xhr.send(null);
      if (xhr.status !== 200 && xhr.status !== 0) throw new Error(`magic_so 加载失败: ${u} (${xhr.status})`);
      return bin ? xhr.response : xhr.responseText;
    };
    const binUrl = new URL('magic_so.bin', DATA_URL).toString();
    const symUrl = new URL('magic_so.symbols.json', DATA_URL).toString();
    const bytes = get(binUrl, true) as ArrayBuffer;
    const sym = JSON.parse(get(symUrl, false) as string) as SoSymbols;
    cachedProgram = SoProgram.fromJson(new Uint8Array(bytes), sym);
    return cachedProgram;
  }
  // Node / 测试：动态 require 以免把 node:fs 打进浏览器包"""
assert old in t
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('sync xhr fallback')
