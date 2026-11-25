import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\deploy.html')
t = p.read_text(encoding='utf-8')
old = "  const major = homeCity.NAME === name ? (homeCity.MAJOR || (city.NAME === name ? city.MAJOR : '') || '') : '';"
new = "  const major = homeCity.NAME === name ? (homeCity.MAJOR || '') : '';"
assert old in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('major fixed')
