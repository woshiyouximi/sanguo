import io
src = io.open(r'F:\sanguo\work\cocos_verify\cdp.mjs', encoding='utf-8').read()
old = "(x.url || '').includes('cocos-build')"
new = "(x.url || '').includes((process.env.MATCH || 'cocos-build'))"
if old not in src:
    raise SystemExit('anchor not found')
src = src.replace(old, new)
io.open(r'F:\sanguo\work\cocos_verify\cdpweb.mjs', 'w', encoding='utf-8', newline='').write(src)
print('ok')
