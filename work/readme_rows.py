import pathlib
p = pathlib.Path(r'F:\sanguo\project\README.md')
t = p.read_text(encoding='utf-8')
rows = [
 ("12_技能特效接入.md", "818 帧原作特效用 `lighter` 叠加 + 逐帧热点，3.56 MiB/41 请求"),
 ("13_音频接入.md", "99 WAV→mp3 + 3 首 BGM，`mp3\\%02d.mp3` 在 EXE `0x05315B`（SoundTrack 就是文件名）"),
 ("14_物品与装备.md", "77 件分 6 组、55 件可装备、四槽规则、兵符不加属性（57 条自检）"),
 ("15_数值模拟报告.md", "13×13 兵种对拍 60 局/格：强方均胜 92.4–100%，相克像开关不是旋钮"),
 ("16_单位动作接入.md", "攻击/受击/死亡的选帧规则与图集打包（`animSelect.ts`）"),
 ("19_招降斩首与掉落.md", "`capture.ts`：招降/斩首/释放 + 掉落 + 经验加成（10 条测试）"),
 ("20_存档与剧本选择.md", "10 槽 + 5 剧本 + 旧档迁移，未知字段原样保留"),
 ("24_Cocos美术接入.md", "立绘/底图/图集接法；`load(SpriteFrame)` 从来失败，必须 `ImageAsset`"),
 ("25_与原作差距对照.md", "**先看这篇**：内容层 100% 搬完但未全生效 + 8 处流程不一致"),
 ("26_军师技系统.md", "67 条分 10 类：25 条生效/18 条待消费点/24 条未实作"),
 ("27_大地图行军.md", "`march.ts`：在途部队/抵达/遭遇，`?march=0` 可回退"),
 ("28_脚本虚拟机移植.md", "90/90 opcode、109/110 技能可跑；`WAIT` 逐帧挂起待做"),
 ("29_城池内政八命令.md", "開發/徵兵/搜索/移動/任命/物品/情報/出征 + 6 处近似说明"),
 ("30_敌我守将与势力还原.md", "`garrison.json` 5 剧本×60 城×1011 条；三处接线 diff"),
 ("31_还原清单.md", "**验收基线**：13 处取巧逐项证据 + 轮次对比"),
]
marker = "| `23_微信小游戏构建与包体.md`"
idx = t.find(marker)
assert idx >= 0, 'anchor rows missing'
end = t.index("\n", idx) + 1
add = "".join("| `%s` | %s |\n" % (a, b) for a, b in rows if ("`%s`" % a) not in t)
t = t[:end] + add + t[end:]
p.write_text(t, encoding='utf-8')
print('rows added:', len(add.splitlines()))
