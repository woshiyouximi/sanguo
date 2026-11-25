import io, re
for f in ['game/web/campaign.html', 'game/web/city.html']:
    s = io.open(f, encoding='utf-8').read()
    m = re.search(r'<script type="module">(.*?)</script>', s, re.S)
    out = 'work/_check_' + f.split('/')[-1].replace('.html', '') + '.mjs'
    io.open(out, 'w', encoding='utf-8').write(m.group(1))
    print(out, len(m.group(1)))
