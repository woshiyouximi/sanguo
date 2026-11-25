# -*- coding: utf-8 -*-
"""UI 二轮修订：7 个不合格项重跑（木纹被画成金属板 / 槽画成刀 / 底板画成杆）。

只改这 7 行的 prompt/negative，其余沿用 jobs_env_v1.csv；seed +1 换采样。
"""
import csv, os

HERE = os.path.dirname(os.path.abspath(__file__))

STYLE = ("新国风厚涂，油画笔触可见，材质厚重，青灰、赭石、暗金为主的低饱和高级灰调，"
         "单一暖色主光从左前方四十五度射入，明暗塑形体积感强，细节丰富，"
         "画面上不出现任何字符、题字与纹样文字")

UI = ("游戏界面素材，正视正交投影，物体水平居中且完整出现在画面内，四边留出均匀空隙，"
      "纯色中性深灰背景，只呈现材质与结构，画面中不出现任何文字、字母、数字与图标符号，"
      "边缘干净锐利，适合九宫格切片，")

NEG = ("钢铁，银色，刀刃，刀剑，枪尖，徽章，纹章，浮雕图案，文字，汉字，字母，数字，"
       "人物，水印，logo，扁平化设计，渐变色，低质量，模糊")

FIX = {
    "ui_btn_wood_normal": "漆木按钮常态：横向长圆角矩形，整块深褐色大漆木质底，木纹清晰可见，漆面有细微裂纹与温润反光，外描一圈铜金色细边，上缘一道浅色内高光，整体微微凸起",
    "ui_btn_wood_pressed": "漆木按钮按下态：横向长圆角矩形，整块深褐色大漆木质，表面向内凹陷，凹陷边缘有暗影，亮度比常态低一档，木纹清晰",
    "ui_btn_wood_disabled": "漆木按钮禁用态：横向长圆角矩形，整块木质，木色灰暗去饱和，没有高光与反光，木纹干涩朴素",
    "ui_bar_slot": "进度条空槽：一条横向内凹的长槽，槽口两侧有薄薄的斜切边，槽内是空的深色空洞，两端各有一个铜制端盖",
    "ui_list_row": "列表行木质底板：一块横向长条木板，四角圆润，平整的木纹表面，没有凸起装饰，左端有一个方形小凹槽",
    "ui_icon_plate": "图标底板：方形凹槽底板，外侧一圈铜边，槽内空无一物，只有深色绒布质感，中心平整",
    "ui_tab_bar": "标签栏底板：一整块横向长条木质底板，表面被两道细铜线分成三个等宽格子，格子之间没有缝隙，整块板是连续的一体",
}

src = os.path.join(HERE, "jobs_env_v1.csv")
rows = list(csv.DictReader(open(src, encoding="utf-8-sig")))
out_rows = []
for r in rows:
    if r["id"] in FIX:
        r = dict(r)
        r["prompt"] = STYLE + "。" + UI + FIX[r["id"]]
        r["negative"] = NEG
        r["seed"] = str(int(r["seed"]) + 1)
        out_rows.append(r)
cols = ["id", "kind", "prompt", "negative", "width", "height", "seed", "steps", "cfg", "length", "image"]
dst = os.path.join(HERE, "jobs_env_v1_fix.csv")
with open(dst, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in out_rows:
        w.writerow(r)
print("wrote", dst, len(out_rows), "rows:", [r["id"] for r in out_rows])
