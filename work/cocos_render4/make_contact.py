"""把最終 876×1368 截圖整理成任務要求的檔名，並拼 2×2 對照版 contact.png。

版面：上排 deploy（before | after）、下排 items（before | after），
每格 876×1368，格間 8px 深色縫，四角加 1px 外框，方便肉眼對位。
"""
import os
import shutil
from PIL import Image

D = r"F:\sanguo\work\cocos_render4"
pairs = [
    ("before876_deploy.png", "deploy_before.png"),
    ("final876_deploy.png", "deploy_after.png"),
    ("before876_items.png", "items_before.png"),
    ("final876_items.png", "items_after.png"),
]
for src, dst in pairs:
    s = os.path.join(D, src)
    d = os.path.join(D, dst)
    shutil.copyfile(s, d)
    print("copy %-24s -> %-20s %d bytes" % (src, dst, os.path.getsize(d)))

imgs = [Image.open(os.path.join(D, n)).convert("RGB") for _, n in pairs]
w, h = imgs[0].size
assert all(im.size == (w, h) for im in imgs), [im.size for im in imgs]
GAP = 8
sheet = Image.new("RGB", (w * 2 + GAP, h * 2 + GAP), (16, 12, 10))
for i, im in enumerate(imgs):
    sheet.paste(im, ((i % 2) * (w + GAP), (i // 2) * (h + GAP)))
sheet.save(os.path.join(D, "contact.png"))
print("contact.png", sheet.size, os.path.getsize(os.path.join(D, "contact.png")), "bytes")
