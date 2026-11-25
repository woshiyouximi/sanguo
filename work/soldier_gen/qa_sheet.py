# -*- coding: utf-8 -*-
"""QA 图：把建好的图集按 battleView 的口径（屏幕宽 66px，底边中点 = 地面点）画出来。

  row = 我方 walk(M) | 我方 attack(M) | 敵軍 walk(N 幀) | 敵軍 walk(N 幀 + main.js 46% 紅染)
  最上面一行是旧 AI 图集（80×104，脚线 y=100）做尺寸/脚线基准，和 13 兵种画在同一条绿线上。

  --scale 2 可以放大看裁切（红竖线 = 帧矩形左右边界 = 会被裁掉的地方）
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"F:\sanguo")
GEN = ROOT / "work" / "soldier_gen"
W_SCREEN = 66

LABEL = {
    "a": "0 A  PODAO", "c": "1 C  CHANGQIANG", "d": "2 D  DADAO", "f": "3 F  GONGJIAN",
    "i": "4 I  LIANCHUI", "h": "5 H  FEIDAO", "j": "6 J  WUDOU", "k": "7 K  MANZU",
    "e": "8 E  TIEZHUI", "l": "9 L  TENGJIA", "m": "10 M HUANGJIN", "b": "11 B NU",
    "g": "12 G NVBING",
}
ORDER = ["a", "c", "d", "f", "i", "h", "j", "k", "e", "l", "m", "b", "g"]
GROUP = {"a": "podao", "c": "changqiang", "d": "dadao", "f": "archer", "i": "lianchui",
         "h": "feidao", "j": "wudou", "k": "manzu", "e": "tiechui", "l": "tengjia",
         "m": "huangjin", "b": "nu", "g": "nvbing"}
ZH = {"a": "朴刀", "c": "長槍", "d": "大刀", "f": "弓箭", "i": "鍊錘", "h": "飛刀", "j": "武鬥",
      "k": "蠻族", "e": "鐵鎚", "l": "籐甲", "m": "黃巾", "b": "弩", "g": "女兵"}


def font(size):
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def tint(im):
    """与 main.js 的 source-atop 等价：只给已有着色的像素刷红（rgba(206,52,40,0.46)）。"""
    out = im.copy()
    a = out.getchannel("A")
    red = Image.new("RGBA", im.size, (206, 52, 40, 118))
    red.putalpha(a.point(lambda v: 118 if v else 0))
    out.alpha_composite(red)
    return out


def main():
    build = GEN / sys.argv[1]
    out = GEN / sys.argv[2]
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    only = sys.argv[4].split(",") if len(sys.argv) > 4 else ORDER
    doc = json.loads((build / "units.json").read_text(encoding="utf-8"))
    page = Image.open(build / "units_00.png").convert("RGBA")
    page_e = tint(page)
    frames = {s["name"]: s for s in doc["pages"][0]["sprites"]}

    w = int(round(W_SCREEN * scale))
    gap = int(8 * scale)

    def colw(n):
        return n * (w + gap) + gap

    f_small = font(max(11, int(13 * scale)))
    f_head = font(max(12, int(15 * scale)))
    g0 = doc["groups"][GROUP[only[0]]]
    sheet_w = 200 + colw(len(g0["back"])) * 3 + colw(len(g0["attack"])) + 80
    cell_h = int(130 * scale)
    rows = len(only) + 1  # +1 = 旧图集基准行
    sheet = Image.new("RGBA", (sheet_w, 46 + cell_h * rows + 20), (46, 82, 44, 255))
    dr = ImageDraw.Draw(sheet)
    dr.text((10, 14), "M 幀/我方 walk | M 幀/我方 attack | N 幀/敵軍 walk | N 幀+46%紅染/敵軍實際",
            fill=(255, 250, 190, 255), font=f_head)

    # 第 0 行：旧 AI 图集（80×104、脚线 y=100）——脚线抬到绿线上，和新图集比尺寸
    old_png = GEN / "old" / "units_00.png"
    if old_png.exists():
        oj = json.loads((GEN / "old" / "units.json").read_text(encoding="utf-8"))
        of = {s["name"]: s for s in oj["pages"][0]["sprites"]}
        oimg = Image.open(old_png).convert("RGBA")
        ground = 46 + cell_h - int(22 * scale)
        dr.line([0, ground, sheet_w, ground], fill=(130, 190, 120, 255), width=1)
        dr.text((10, ground - int(92 * scale)), "OLD atlas (AI 80x104)", fill=(255, 255, 220, 255), font=f_small)
        dr.text((10, ground - int(78 * scale)), "旧 AI 图集（对照尺寸）", fill=(255, 255, 220, 255), font=f_small)
        x = 200
        for n in oj["groups"]["archer"]["back"][:6]:
            f = of[n]
            h = int(round(f["h"] / f["w"] * w))
            cell = oimg.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])).resize((w, h), Image.LANCZOS)
            # 旧图集脚线在 y=100/104（离底边 4/104），抬 66×4/80 ≈ 3.3px 才落在绿线上
            sheet.alpha_composite(cell, (x, ground - h + int(round(3.3 * scale))))
            x += w + gap

    for i, key in enumerate(only):
        g = doc["groups"][GROUP[key]]
        top = 46 + (i + 1) * cell_h
        ground = top + cell_h - int(22 * scale)
        dr.text((10, ground - int(92 * scale)), LABEL[key], fill=(255, 255, 220, 255), font=f_small)
        dr.text((10, ground - int(78 * scale)), ZH[key], fill=(255, 255, 220, 255), font=f_small)
        dr.line([0, ground, sheet_w, ground], fill=(130, 190, 120, 255), width=1)
        x = 200
        for names, img in ((g["back"], page), (g["attack"], page),
                           (g["front"], page), (g["front"], page_e)):
            for n in names:
                f = frames[n]
                h = int(round(f["h"] / f["w"] * w))
                cell = img.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])).resize((w, h), Image.LANCZOS)
                sheet.alpha_composite(cell, (x, ground - h))
                if scale > 1.2:  # 画出会被裁掉的边界
                    dr.line([x, ground - h, x, ground], fill=(255, 90, 90, 110), width=1)
                    dr.line([x + w - 1, ground - h, x + w - 1, ground], fill=(255, 90, 90, 110), width=1)
                x += w + gap
            x += 14
    sheet.convert("RGB").save(out, optimize=True)
    print("wrote", out, sheet.size)


main()
