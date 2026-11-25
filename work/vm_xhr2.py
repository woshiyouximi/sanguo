import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\smartscript\runtime.ts')
t = p.read_text(encoding='utf-8')
old = """    const get = (u: string, bin: boolean): unknown => {
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
    cachedProgram = SoProgram.fromJson(new Uint8Array(bytes), sym);"""
new = """    // 同步 XHR 在文档里不能设 responseType，二进制的标准做法是
    // overrideMimeType('text/plain; charset=x-user-defined') 再逐字符取低 8 位。
    const getText = (u: string): string => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', u, false);
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
      xhr.send(null);
      if (xhr.status !== 200 && xhr.status !== 0) throw new Error(`magic_so 加载失败: ${u} (${xhr.status})`);
      return xhr.responseText;
    };
    const binText = getText(new URL('magic_so.bin', DATA_URL).toString());
    const bytes = new Uint8Array(binText.length);
    for (let i = 0; i < binText.length; i++) bytes[i] = binText.charCodeAt(i) & 0xff;
    const sym = JSON.parse(getText(new URL('magic_so.symbols.json', DATA_URL).toString())) as SoSymbols;
    cachedProgram = SoProgram.fromJson(bytes, sym);"""
assert old in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('xhr text->bytes')
