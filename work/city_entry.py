import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
t = p.read_text(encoding='utf-8')

# 1) 自己的城多一个「內政」入口（city.html 八命令）
old = """    acts.push(`<div class="btn" data-act="develop"><span>開 發</span><small>金 400 → 民 +3000</small></div>`);"""
new = """    acts.push(`<div class="btn" data-act="develop"><span>開 發</span><small>金 400 → 民 +3000</small></div>`);
    acts.push(`<div class="btn primary" data-act="city"><span>內 政</span><small>八命令 · 搜索/移動/任命</small></div>`);"""
assert old in t
t = t.replace(old, new, 1)

# 2) 事件：跳 city.html
old2 = """  if (act === 'recruit') {"""
new2 = """  if (act === 'city') {
    location.href = './city.html?city=' + encodeURIComponent(selected);
    return;
  }
  if (act === 'recruit') {"""
assert old2 in t
t = t.replace(old2, new2, 1)
p.write_text(t, encoding='utf-8')
print('city entry added')
