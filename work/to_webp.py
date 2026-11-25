import pathlib
files = [r'F:\sanguo\game\web\main.js', r'F:\sanguo\game\web\deploy.html', r'F:\sanguo\game\web\items.html']
for f in files:
    p = pathlib.Path(f)
    t = p.read_text(encoding='utf-8')
    n = t.count("assets/hero/")
    t2 = t.replace("assets/hero/' + encodeURIComponent", "assets/hero/' + encodeURIComponent").replace("+ '.png'", "+ '.webp'")
    t2 = t2.replace('assets/hero/${encodeURIComponent(x.NAME)}.png', 'assets/hero/${encodeURIComponent(x.NAME)}.webp')
    if t2 != t:
        p.write_text(t2, encoding='utf-8')
    print(p.name, 'refs', n, 'changed', t2 != t, 'webp now', t2.count('.webp'))
