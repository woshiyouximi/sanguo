import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8')
add = """- **主将派驻（v3）**：出征时从"我方城池里的武将"按 `STR+INT` 取最高者当主将，
  URL 带 `gen=<姓名>`；`main.js` 的 `generalFromQuery()` 在 `data.generals` 里查表，
  取 `STR/INT` 作为主将属性（查不到退回關羽 97/75）。实测 `?gen=張飛` → 卡片显示"張飛 武99 智51"。
  注意 `loadData()` 返回的 `generals` 是**数组**（不是 `{rows}`），代码里两种形状都兼容。
"""
if '主将派驻（v3）' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('doc v3')
