# -*- coding: utf-8 -*-
"""w7-cocos-render3：修編成頁偏紫（lead m01600 批准的三處顏色字面量 + G 下沉收窄）。

偏紫的成因不是「暖色不對」，而是**只有 G 在掉**：卡片 base (36,31,24) 疊 23 級 G 下沉 → 底部
(40,8,21)，G 掉到個位數、B 還在 20 上下，讀起來就是洋紅。web 的 `linear-gradient(165deg)` 是
三個通道一起往「更暗的暖色」走，不會出現這種單通道崩塌。

（Draw.gridShade 的行奇偶抖動已另外手動改好，本腳本只動 DeployRoot.ts。）
"""
import io

DEPLOY = r"F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts"
d = io.open(DEPLOY, encoding="utf-8").read()


def rep(text, old, new, why):
    n = text.count(old)
    assert n == 1, ("NOT UNIQUE", why, n)
    return text.replace(old, new)


d = rep(
    d,
    "    const span = Math.max(rows + 1, Math.round(Math.abs(gDown)));\n",
    "    // G 下沉量夾到 10：原本 `max(rows+1, gDown)` 在 22 行的卡片上等於一路壓掉 23 級，\n"
    "    // 深色區的 G 掉到 8、只剩 B 在撐，整片就讀成洋紅（見 project\\161 §5-A）。\n"
    "    const span = Math.min(10, Math.max(3, Math.round(Math.abs(gDown) || 10)));\n",
    "areaGrid span cap",
)
d = rep(d, "'#241F18', 16, 232", "'#221F1B', 16, 232", "cards base")
# 返回鈕與出陣順序窄條共用同一個基色（兩處）
n = d.count("'#232B35', '#10151C'")
assert n == 2, ("footer base count", n)
d = d.replace("'#232B35', '#10151C'", "'#1E2024', '#10151C'")
d = rep(d, "'#221B12', 13, 250", "'#201A14', 13, 250", "portrait base")

io.open(DEPLOY, "w", encoding="utf-8", newline="\n").write(d)
print("patched deploy")
