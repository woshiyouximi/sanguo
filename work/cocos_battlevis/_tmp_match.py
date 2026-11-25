import numpy as np
from PIL import Image

full = np.asarray(Image.open(r"F:\sanguo\work\cocos_battlevis\02_battle_t3.png").convert("L"), dtype=np.float32)
clip = Image.open(r"F:\sanguo\work\cocos_battlevis\03_general_A.png").convert("L")
print("full", full.shape, "clip", clip.size)

# 取 clip 中间一块高对比的模板：马头 + 脖子
tpl0 = clip.crop((40, 150, 260, 330)).resize((110, 90), Image.LANCZOS)


def match(tpl, img):
    t = np.asarray(tpl, dtype=np.float32)
    t = t - t.mean()
    th, tw = t.shape
    H, W = img.shape
    best = (-1e18, None)
    # 逐像素滑（图小，暴力够快）
    for y in range(0, H - th):
        for x in range(0, W - tw):
            win = img[y:y + th, x:x + tw]
            w2 = win - win.mean()
            den = (np.sqrt((w2 ** 2).sum()) * np.sqrt((t ** 2).sum()))
            if den <= 1e-6:
                continue
            score = float((w2 * t).sum() / den)
            if score > best[0]:
                best = (score, (x, y))
    return best


for s in (1.0, 1 / 1.0255, 1.0255):
    tpl = tpl0.resize((int(round(110 * s)), int(round(90 * s))), Image.LANCZOS)
    sc, pos = match(tpl, full)
    print("scale", round(s, 4), "best corr", round(sc, 4), "at", pos)
