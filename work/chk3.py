import pathlib
p = pathlib.Path(r'F:\sanguo\project\31_还原清单.md')
lines = p.read_text(encoding='utf-8').splitlines()
def setline(prefix, new):
    for i, l in enumerate(lines):
        if l.startswith(prefix):
            lines[i] = new
            return True
    return False
ok = []
ok.append(setline("| 城池内政 |", "| 城池内政 | 8 条命令（`04c §2.3`） | ✅ 8/8（`city.html`，25 条自检） | 搜索权重/徵兵预备兵仍是近似（见 29 号文档 §9） |"))
ok.append(setline("| 地形相克 |", "| 地形相克 | 12×13（±25） | ✅ 已进战力（156 格逐格校验） | — |"))
ok.append(setline("| 武将技 |", "| 武将技 | 110 个，脚本驱动；气力 = `POWER×1200` | ✅ 跑 `MAGIC.SO` 字节码，109/110 通过 | 逐帧挂起待做（vm-frame）；`劍輪舞` 死循环在修 |"))
ok.append(setline("| 军师技 |", "| 军师技 | 67 个，战前生效 | 🟡 25 条生效 / 18 条待消费点 / 24 条未实作 | 消费点 vm-frame 在做；未实作的 24 条见 `26` 文档 |"))
ok.append(setline("| 战后处理 |", "| 战后处理 | 招降/斩首/释放 + 战利品（`04b2`） | ✅ 逻辑 + 结算三行；招降入城已接 | 逐将选择弹窗未做（原作是逐将询问） |"))
p.write_text("\n".join(lines) + "\n", encoding='utf-8')
print(ok)
