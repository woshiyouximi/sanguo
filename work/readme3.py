import pathlib
p = pathlib.Path(r'F:\sanguo\project\README.md')
t = p.read_text(encoding='utf-8')
old = "| `21_Cocos装配清单.md` | 装配只要 1.5–2 小时（0 处手连）、首包 27.6 MB 的硬问题与两条解法 |"
new = ("| `21_Cocos装配清单.md` | 装配只要 1.5–2 小时（0 处手连）、首包 27.6 MB 的硬问题与两条解法 |\n"
       "| `22_Cocos场景与构建.md` | 压缩 UUID 算法与实测表、4 个场景骨架、`startScene` 必填坑、四屏截图 |\n"
       "| `23_微信小游戏构建与包体.md` | wechatgame 构建、31.72 MB 逐目录拆解、瘦身路线、375×812 安全区 |")
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('rows added')
