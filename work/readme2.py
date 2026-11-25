import pathlib
p = pathlib.Path(r'F:\sanguo\project\README.md')
t = p.read_text(encoding='utf-8')
t = t.replace("| 武将详情（400 将立绘 / 1–8 必杀 / 1–8 军师） | ✅ 可看 | `proto/ui?s=g1` |",
              "| 武将详情（**400/400 立绘** / 1–8 必杀 / 1–8 军师） | ✅ 可看 | `proto/ui?s=g1`，覆盖率 100% |")
t = t.replace("| Cocos 工程（三屏脚本 + 资源树 + 581 meta） | 🟡 构建已通 | Creator 3.8.8 headless build 7 s，**场景装配进行中** |",
              "| Cocos 工程（4 场景 + 三屏脚本 + 581 meta） | ✅ 可跑 | web-desktop / web-mobile / wechatgame 三平台构建 exit 0 |")
t = t.replace("| 微信小游戏包（分包 / 首包 4 MB 内 / 版号） | ❌ 未做 | 手册 `21_Cocos装配清单.md` §5 给了两条路线 |",
              "| 微信小游戏包体 | 🟡 超标待瘦身 | 首包 **31.72 MB = 上限 7.93 倍**，瘦身方案见 `23_微信小游戏构建与包体.md` |")
t = t.replace("| 新手引导 / 战斗内 UI 打磨 | ❌ 未做 | — |",
              "| 新手引导 / 战斗内 UI 打磨 | ❌ 未做 | — |\n| 真机验证（开发者工具/扫码） / 版号 | ❌ 未做 | 需在你那边完成：换 appid、CDN 域名、审核 |")
p.write_text(t, encoding='utf-8')
print('ok')
