import pathlib
p = pathlib.Path(r'F:\sanguo\project\README.md')
t = p.read_text(encoding='utf-8')
old = "| `13_音频接入.md` | 99 个音效 + 3 首 BGM（9.20 MB）、地形→BGM 映射、console 全空的验收方式 |"
new = old + "\n| `14_物品与装备.md` | 77 件物品 / 四槽 / 兵符与阵法书为什么不占槽 / 57 条自检 |"
if '14_物品与装备.md' not in t:
    t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('readme items row')
