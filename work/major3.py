import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\deploy.html')
t = p.read_text(encoding='utf-8')
old = ": `本城武將 ${pool.length} 人 · 太守 ${city.MAJOR || '—'}`;"
new = ": `本城武將 ${pool.length} 人 · 太守 ${homeCity.MAJOR || '—'}`;"
assert old in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('label fixed')
