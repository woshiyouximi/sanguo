# -*- coding: utf-8 -*-
"""拼「原作素材 → 九屏底图」对照表：F:\\sanguo\\work\\ui_ref_sheet.jpg

每个格子：缩略图 + 文件名 + 尺寸/字节 + 落到哪一屏 + 用法/避让要点。
字体用系统微软雅黑 / Consolas。
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, COLS = 1740, 4
PAD = 32
GAP = 22
TW = (W - PAD * 2 - GAP * (COLS - 1)) // COLS          # 400
TH = 250                                              # 缩略图区
CELLH = TH + 132                                      # 图 + 4 行字
HEAD = 168
FOOT = 96

F_REG = r"C:\Windows\Fonts\msyh.ttc"
F_BLD = r"C:\Windows\Fonts\msyhbd.ttc"
F_MONO = r"C:\Windows\Fonts\consola.ttf"

MENU = r"F:\sanguo\export\png\SHAPE\MENU"
BG = r"F:\sanguo\export\png\SHAPE\BG"
POL = r"F:\sanguo\export\png\SHAPE\POLICY"
MAP = r"F:\sanguo\export\png\SHAPE\MAP"

C_BG = (11, 14, 19)
C_CELL = (20, 24, 30)
C_LINE = (58, 48, 33)
C_TXT = (233, 228, 214)
C_DIM = (154, 146, 126)
C_DIM2 = (120, 116, 104)
C_GOLD = (216, 179, 106)
C_GOLD2 = (243, 224, 180)
C_JADE = (127, 179, 156)


def font(path, size):
    return ImageFont.truetype(path, size)


F_NAME = font(F_MONO, 19)
F_META = font(F_REG, 15)
F_USE = font(F_REG, 17)
F_NOTE = font(F_REG, 15)
F_BLD_18 = font(F_BLD, 18)
F_H1 = font(F_BLD, 40)
F_H2 = font(F_REG, 18)
F_TAG = font(F_REG, 14)
F_MONO_S = font(F_MONO, 15)
F_NAME_CJK = font(F_BLD, 18)   # 标题里出现中文时用它（Consolas 没有汉字）


def load(path):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
    else:
        im = im.convert("RGB")
    return im


def fit_in(im, bw, bh, dark=True):
    """等比缩进 bw×bh，透明区铺暗格。"""
    out = Image.new("RGB", (bw, bh), (14, 17, 22) if dark else (30, 30, 30))
    r = min(bw / im.width, bh / im.height)
    nw, nh = max(1, int(im.width * r)), max(1, int(im.height * r))
    t = im.resize((nw, nh), Image.LANCZOS)
    if t.mode == "RGBA":
        out.paste(t, ((bw - nw) // 2, (bh - nh) // 2), t)
    else:
        out.paste(t, ((bw - nw) // 2, (bh - nh) // 2))
    return out


def checker(bw, bh, s=10):
    im = Image.new("RGB", (bw, bh), (26, 29, 34))
    d = ImageDraw.Draw(im)
    for y in range(0, bh, s):
        for x in range(0, bw, s):
            if (x // s + y // s) % 2 == 0:
                d.rectangle([x, y, x + s - 1, y + s - 1], fill=(34, 38, 44))
    return im


def build_composite():
    """BG 天空 + MG 山 + FG 城墙 三层拼成一张原作战场示意（1000×420）。"""
    bw, bh = 748, 214
    canvas = Image.new("RGB", (bw, bh), (0, 0, 0))
    layers = [("BG00B.png", 0.34), ("MG00A.png", 0.30), ("FG00A.png", 0.36)]
    y = 0
    for name, frac in layers:
        im = load(os.path.join(BG, name))
        h = int(bh * frac)
        k = bw / im.width
        strip = im.resize((bw, max(1, int(im.height * k))), Image.LANCZOS)
        # 竖向缩放到目标高度
        strip = strip.resize((bw, h), Image.LANCZOS)
        if strip.mode == "RGBA":
            canvas.paste(strip, (0, y), strip)
        else:
            canvas.paste(strip, (0, y))
        y += h
    return canvas


def main():
    tiles = [
        # (img, filename, 屏, 用法, 备注, 特殊高度?)
        (os.path.join(MAP, "CHINAMAP.png"), "SHAPE/MAP/CHINAMAP.png", "M1 大地图",
         "等比 1:1 画进 canvas（随 zoom 变）", "道路/河流已烘进像素；城点实测 0 城落海", None),
        (os.path.join(MENU, "D1_1B.png"), "SHAPE/MENU/D1_1B.png", "M1 对照",
         "原作另有一张带金框的缩版地图（500×410）", "可当「地图入框」的版式参照；金框本身不搬用", None),
        (os.path.join(MENU, "TITLEBG.png"), "SHAPE/MENU/TITLEBG.png", "P1 启动",
         "只取 y236–458「军队列阵」带", "logo y40–150 与版权行 y455–475 必须裁掉", None),
        (os.path.join(MENU, "TITLEBG2.png"), "SHAPE/MENU/TITLEBG2.png", "P1 备选",
         "同构图的另一张（同样带 logo）", "仅作构图参考：竖排书名 / 军队 / 天空", None),
        (os.path.join(POL, "PALAIS01.png"), "SHAPE/POLICY/PALAIS01.png", "M2 城池内政",
         "整幅 cover + 上暗下亮蒙版", "大殿纵深好；顶部帷幔区压暗放标题", None),
        (os.path.join(POL, "PALAIS04.png"), "SHAPE/POLICY/PALAIS04.png", "M2 变体",
         "按城换 01–05，做城池差异", "只有 6 张，按势力/城序轮换", None),
        (os.path.join(POL, "YIELD.png"), "SHAPE/POLICY/YIELD.png", "M2/M3 参考",
         "内政/出征的第二个场景", "同为 640×480 3D 渲染", None),
        (os.path.join(MENU, "WARPREP01.png"), "SHAPE/MENU/WARPREP01.png", "M3 出征编成",
         "只当布局骨架参考（含汉字）", "原作把编成做成两栏 + 中央对拼，可借构图", None),
        (os.path.join(BG, "BG00A.png"), "SHAPE/BG/BG00A.png", "B1 战斗（天空层）",
         "视差三层之一：天空", "730×96 横条；00A 白天 / 00B 黄昏", "wide"),
        (os.path.join(BG, "MG00A.png"), "SHAPE/BG/MG00A.png", "B1 战斗（山峦层）",
         "视差三层之二：远山", "880×96 横条，带透明", "wide"),
        (os.path.join(BG, "FG00A.png"), "SHAPE/BG/FG00A.png", "B1 战斗（前景层）",
         "视差三层之三：城墙 + 树", "1000×96 横条，带透明", "wide"),
        ("__comp__", "BG+MG+FG 三层合成", "B1 战斗",
         "三层按 34/30/36% 高度叠出战场", "原作战场就是这三条滚动的；**没有 FLOOR\\*** ", "comp"),
        (os.path.join(MENU, "WAR0D.png"), "SHAPE/MENU/WAR0D.png", "B1 HUD",
         "战斗底条 640×136", "只当 HUD 分区比例参考，不搬用", "wide"),
        (os.path.join(MENU, "STAFF.png"), "SHAPE/MENU/STAFF.png", "G1 武将详情",
         "542×2711 超长名单：版式参考", "原作把武将做成一条长卷，可借「长卷」概念", "tall"),
        (os.path.join(MENU, "D1_8C.png"), "SHAPE/MENU/D1_8C.png", "G1/S1 框体",
         "记录列表块 412×265（行高参考）", "原作框体一律不搬用，只量比例", None),
        (os.path.join(MENU, "MAIN01A.png"), "SHAPE/MENU/MAIN01A.png", "全局按钮",
         "125×28（约 4.5:1）按钮比例参考", "原型按钮 224×80 = 2.8:1，比原作更厚", "tiny"),
    ]

    rows = (len(tiles) + COLS - 1) // COLS
    H = HEAD + rows * CELLH + (rows - 1) * GAP + FOOT
    sheet = Image.new("RGB", (W, H), C_BG)
    d = ImageDraw.Draw(sheet)

    # 顶部
    d.text((PAD, 34), "原作素材 → 九屏底图 对照表", font=F_H1, fill=C_GOLD2)
    d.text((PAD, 88), "《三國群英傳 II》1999 ODIN SOFT 解包素材 · 只作开发期占位与对齐参照，发布前必须替换",
           font=F_H2, fill=C_DIM)
    d.text((PAD, 118), "png 解包目录：F:\\sanguo\\export\\png\\SHAPE\\   ·   生成：work/ui_ref_sheet.jpg",
           font=F_META, fill=C_DIM2)
    # 图例
    lx = W - PAD - 560
    d.rectangle([lx, 40, lx + 12, 52], fill=C_GOLD)
    d.text((lx + 20, 36), "原作占位（发布前替换）", font=F_TAG, fill=C_DIM)
    d.rectangle([lx + 210, 40, lx + 222, 52], fill=C_JADE)
    d.text((lx + 230, 36), "AI 重绘", font=F_TAG, fill=C_DIM)
    d.rectangle([lx + 330, 40, lx + 342, 52], fill=(91, 127, 166))
    d.text((lx + 350, 36), "程序生成", font=F_TAG, fill=C_DIM)
    d.line([PAD, HEAD - 18, W - PAD, HEAD - 18], fill=C_LINE)

    for i, (path, name, scr, use, note, kind) in enumerate(tiles):
        r, c = divmod(i, COLS)
        x = PAD + c * (TW + GAP)
        y = HEAD + r * (CELLH + GAP)
        d.rectangle([x, y, x + TW - 1, y + CELLH - 1], fill=C_CELL, outline=(38, 44, 52))
        # 缩略图
        if kind == "comp":
            im = build_composite()
        elif kind == "tall":
            im = load(path)
            im = fit_in(im, TH * 2 // 3, TH)  # 长图缩成竖条
        elif kind == "wide":
            im = load(path)
            im = fit_in(im, TW - 16, 96)
        else:
            im = load(path)
            im = fit_in(im, TW - 16, TH - 8)
        bgc = checker(im.width, im.height) if im.width < TW - 16 or im.height < TH - 8 else None
        box = Image.new("RGB", (TW - 16, TH - 8), (16, 19, 24))
        if bgc is not None:
            box.paste(bgc, ((TW - 16 - im.width) // 2, (TH - 8 - im.height) // 2))
        box.paste(im, ((TW - 16 - im.width) // 2, (TH - 8 - im.height) // 2))
        sheet.paste(box, (x + 8, y + 6))

        # 标签
        tag = "原作占位"
        tw = d.textlength(tag, font=F_TAG)
        d.rectangle([x + TW - 12 - tw - 14, y + 12, x + TW - 8, y + 36], fill=(40, 33, 20))
        d.text((x + TW - 12 - tw - 7, y + 15), tag, font=F_TAG, fill=C_GOLD)

        ty = y + TH + 2
        disp = os.path.basename(name) if name.endswith(".png") else name
        # 含中文的标题换 CJK 字体，否则 Consolas 全是豆腐块
        d.text((x + 12, ty), disp,
               font=F_NAME if disp.isascii() else F_NAME_CJK, fill=C_GOLD2)
        sz = ""
        if path != "__comp__":
            im0 = Image.open(path)
            sz = "%d×%d · %.0f KB" % (im0.width, im0.height, os.path.getsize(path) / 1024)
        else:
            sz = "748×214 · 示意合成"
        d.text((x + 12, ty + 26), sz + "   →   " + scr, font=F_META, fill=C_DIM)
        d.text((x + 12, ty + 48), use, font=F_USE, fill=C_TXT)
        d.text((x + 12, ty + 74), note, font=F_NOTE, fill=C_DIM2)
        if path != "__comp__":
            d.text((x + 12, ty + 96), name.rsplit("/", 1)[0], font=F_MONO_S, fill=(96, 92, 82))

    fy = H - FOOT + 16
    d.line([PAD, fy - 8, W - PAD, fy - 8], fill=C_LINE)
    d.text((PAD, fy), "结论：原作能直接当整幅底的只有 CHINAMAP / PALAIS / TITLEBG 三类（都在本表上半）；"
                      "M3/D1/R1/G1/S1 原作只有框体，本次用 AI 重绘补，M2 用 PALAIS01 占位。",
           font=F_H2, fill=C_DIM)
    d.text((PAD, fy + 28), "SHAPE/BG 里没有 FLOOR* 512×512 平铺材质 —— 该目录是 730/880/1000×96 的三层视差横条"
                           "（BG 天 / MG 山 / FG 地），任务书里「FLOOR 平铺」的前提与实际素材不符。",
           font=F_META, fill=C_DIM2)

    out = r"F:\sanguo\work\ui_ref_sheet.jpg"
    sheet.save(out, quality=88, optimize=True)
    print("OK", out, sheet.size, "%.0f KB" % (os.path.getsize(out) / 1024))


if __name__ == "__main__":
    main()
