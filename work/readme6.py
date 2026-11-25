import pathlib
p = pathlib.Path(r'F:\sanguo\project\README.md')
t = p.read_text(encoding='utf-8')
add = """
## 当前可玩范围（2026-11-24 19:20 实测）

| 系统 | 状态 | 证据 |
|---|---|---|
| 大地图（60 城 / 116 路 / 关隘 / 内政三键 / 月推进） | ✅ 可玩 | `campaign.html`，原作底图零错位 |
| 出征编成（13 兵种 / 9 阵形 / 50·80·100 兵 / 相剋预测） | ✅ 可玩 | `deploy.html` |
| 战斗（100v100 实时、兵种/阵形相克、士气、武将参战、技能双资源） | ✅ 可玩 | `index.html`，17/17 测试 |
| 结算与成长（战功/经验/升级/存档写回） | ✅ 可玩 | 结算面板 + `localStorage` |
| 守城战与 AI 出兵 | ✅ 可玩 | `?defend=1`，`?adv=12` 可复现 |
| 武将详情（400 将立绘 / 1–8 必杀 / 1–8 军师） | ✅ 可看 | `proto/ui?s=g1` |
| 物品装备（77 件 / 四槽 / 兵符不加属性） | ✅ 可玩 | `items.html`，57 条自检 |
| 技能特效 | ✅ 103/110 技 | 818 帧原作序列帧，旋转适配竖屏 |
| 音频 | ✅ BGM 3 首 + 99 音效 | 9.2 MB，`audio.js` |
| 单位动作 | ⚠️ 仅我方攻击/死亡 | 敌方无素材，仍走路 |
| 招降 / 斩首 / 掉落 | ❌ 未做 | 反汇编结论在 `docs/04b2` |
| 存档位管理 / 剧本选择 / 新手引导 | ❌ 未做 | — |
"""
if '## 当前可玩范围' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('readme status')
