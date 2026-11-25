# 原作帧 vs 本作截图 并排对照（project/182 用）
# 跑法：<bundled python> F:\sanguo\work\map_army\make_compare.py
import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"F:\sanguo\work\map_army"
VID = r"F:\sanguo\work\video_ui"
FONT = r"C:\Windows\Fonts\msyh.ttc"


def load(path, w):
    im = Image.open(path).convert("RGB")
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def pair(left_path, right_path, title, out_name, lw=900, rw=740, gap=20):
    left = load(left_path, lw)
    right = load(right_path, rw)
    head = 62
    h = head + max(left.height, right.height) + 12
    canvas = Image.new("RGB", (left.width + gap + right.width, h), (14, 17, 22))
    canvas.paste(left, (0, head))
    canvas.paste(right, (left.width + gap, head))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, canvas.width, head - 1], fill=(22, 27, 33))
    d.text((16, 14), title, font=ImageFont.truetype(FONT, 28), fill=(243, 224, 180))
    canvas.save(os.path.join(OUT, out_name))
    print("wrote", out_name, canvas.size)


# 原作帧只取中间的游戏画面区（去掉 B 站黑边与真人背景）
def crop(path, box, name):
    p = os.path.join(OUT, name)
    Image.open(path).convert("RGB").crop(box).save(p)
    return p


m = crop(os.path.join(VID, "A_map_troopmenu_t0120.png"), (205, 0, 1400, 900), "_crop_troopmenu.png")
pair(m, os.path.join(OUT, "02_army_menu.png"),
     "左：原作 A_map_troopmenu_t0120《兵团指令》5 项 + 7 行军情   ｜   右：本作 02_army_menu",
     "compare_menu.png")

t = crop(os.path.join(VID, "A_map_target_t0245.png"), (205, 0, 1400, 900), "_crop_target.png")
pair(t, os.path.join(OUT, "03_retarget.png"),
     "左：原作 A_map_target_t0245《请选择兵团目的城市》全屏选点态   ｜   右：本作 03_retarget",
     "compare_pick.png")

g = crop(os.path.join(VID, "A_map_t0130.png"), (205, 0, 1400, 900), "_crop_map.png")
pair(g, os.path.join(OUT, "01_armies.png"),
     "左：原作 A_map_t0130（骑旗部队走在道路上）   ｜   右：本作 01_armies（大地圖部隊層）",
     "compare_map.png")
