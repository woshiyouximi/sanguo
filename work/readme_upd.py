import pathlib
p = pathlib.Path(r'F:\sanguo\project\README.md')
t = p.read_text(encoding='utf-8')

old_tail = t[t.index('## 当前可玩范围'):]
new_tail = """## 当前可玩范围（2026-11-24 19:45 实测）

| 系统 | 状态 | 证据 |
|---|---|---|
| 大地图（60 城 / 116 路 / 关隘 / 内政三键 / 月推进） | ✅ 可玩 | `campaign.html`，原作底图逐点零错位 |
| 剧本选择 + 10 存档位 + 旧档迁移 | ✅ 可玩 | `saves.js`，32 条自检 + 22 条浏览器 e2e |
| 出征编成（13 兵种 / 9 阵形 / 50·80·100 兵 / 相剋预测） | ✅ 可玩 | `deploy.html` |
| 战斗（100v100 实时、兵种/阵形相克、士气、武将参战、双资源技能） | ✅ 可玩 | `index.html`，27 条测试 |
| 结算与成长（战功/经验/升级/存档写回） | ✅ 可玩 | 结算面板 + `localStorage` |
| 招降 / 斩首 / 释放 / 掉落 | ✅ 可玩 | `core/capture.ts`，10 条测试，结算面板底部三行 |
| 守城战与 AI 出兵 | ✅ 可玩 | `?defend=1`，`?adv=12` 可复现 |
| 武将详情（400 将立绘 / 1–8 必杀 / 1–8 军师） | ✅ 可看 | `proto/ui?s=g1` |
| 物品装备（77 件 / 四槽 / 兵符不加属性） | ✅ 可玩 | `items.html`，57 条自检 |
| 技能特效 | ✅ 103/110 技 | 818 帧原作序列帧 → 40 张图集 3.56 MB |
| 音频 | ✅ BGM 3 首 + 99 音效 | 9.2 MB，`audio.js` |
| 单位动作（走 / 攻 / 受击 / 死） | ✅ 我方四套 | `animSelect.ts` + 4 张动作图集 |
| 底图（大地图 / 编成 / 物品 / 战斗 HUD / 九屏原型） | ✅ 已铺 | 原作 CHINAMAP + 6 张 AI 重绘，共 2.94 MB |
| Cocos 工程（三屏脚本 + 资源树 + 581 meta） | 🟡 构建已通 | Creator 3.8.8 headless build 7 s，**场景装配进行中** |
| 微信小游戏包（分包 / 首包 4 MB 内 / 版号） | ❌ 未做 | 手册 `21_Cocos装配清单.md` §5 给了两条路线 |
| 新手引导 / 战斗内 UI 打磨 | ❌ 未做 | — |
"""
t = t.replace(old_tail, new_tail)

t = t.replace(
"""| 改数据前后要自检 | `python tools\\validate_all.py`（**37 PASS / 0 FAIL**，3 条 WARN 是立绘覆盖率） |""",
"""| 改数据前后要自检 | `python tools\\validate_all.py`（**38 PASS / 0 FAIL**） |""")

t = t.replace(
"""| `16_单位动作接入.md` | attack/hit/death 三套背视动作帧 + 8 处合并 diff（待合并） |""",
"""| `15_数值模拟报告.md` | 13×13 兵种对拍胜率热图：**最弱一档 |值|≤20 也有 92.4% 胜率**，相克是开关不是旋钮 |
| `16_单位动作接入.md` | attack/hit/death 三套背视动作帧 + 8 处合并 diff |
| `17_底图与版式.md` | web 四页底图：原作 CHINAMAP 零错位 + 6 张 AI 重绘、2.94 MB 的取舍 |
| `18_原型底图与版式.md` | 九屏原型底图：7 张 AI 重绘 + 2 张原作占位 |
| `19_招降斩首与掉落.md` | 招降/斩首/释放/掉落规则、`post` JSON 形状、两条口径差异 |
| `20_存档与剧本选择.md` | 10 槽数据结构、旧档迁移、32 条自检 |
| `21_Cocos装配清单.md` | 装配只要 1.5–2 小时（0 处手连）、首包 27.6 MB 的硬问题与两条解法 |""")

t = t.replace(
"""- **Cocos 侧**：三屏脚本（`CampaignRoot/DeployRoot/BattleRoot`）已就位但**没有 Creator 实机验证**（本机未装 Creator）。""",
"""- **Cocos 侧**：Creator **3.8.8 已装好**（`F:\\sanguo\\tools\\cocos\\cc388`），581 个 `.meta` 已导入，headless 构建 **7 秒通过**；四个场景正在生成（`22_Cocos场景与构建.md`）。""")

p.write_text(t, encoding='utf-8')
print('README updated')
