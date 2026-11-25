import pathlib
p = pathlib.Path(r'F:\sanguo\work\shot_deploy.mjs')
src = pathlib.Path(r'F:\sanguo\work\_cdp_shots.mjs').read_text(encoding='utf-8')
# 复用 CDP 骨架，只换 URL 与输出
out = src.replace("const base = 'http://127.0.0.1:5199/web/city.html?city=' + encodeURIComponent(cityName) + '&gold=3000';",
                  "const base = process.argv[4] || 'http://127.0.0.1:5199/web/deploy.html?city=%E5%8D%97%E7%9A%AE';")
p.write_text(out, encoding='utf-8')
print('cloned', len(out))
