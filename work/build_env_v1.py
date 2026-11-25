# -*- coding: utf-8 -*-
"""env_v1 后处理：拼版 / 入库素材（裁边、抠底、压体积）。

用法:
  python build_env_v1.py sheet                  -> work/env_contact.jpg
  python build_env_v1.py pack <adopt.txt>       -> game/web/assets/bg/env/ + 体积报告
adopt.txt / reject.txt：每行一个 id，可带 "  # 备注"。
"""
import os, sys, json, io
from PIL import Image, ImageDraw, ImageFont

SRC = r"F:\sanguo\project\art_ref\cloud_env_v1"
FIXDIR = r"F:\sanguo\project\art_ref\cloud_env_v1_fix"
WORK = r"F:\sanguo\work"
DEST = r"F:\sanguo\game\web\assets\bg\env"

FONT_CANDIDATES = [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhbd.ttc",
                   r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\simsun.ttc"]


def font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


TERRAIN_NAMES = ["城·攻城", "城·街巷", "城·城墙", "船上", "草原", "平原",
                 "山地", "森林", "雪原", "沙漠", "關卡", "長城"]
HALL_NAMES = ["高堂", "军帐", "郡府", "边关", "水寨", "民居"]


def png_files(prefix):
    out = []
    for f in sorted(os.listdir(SRC)):
        if f.startswith(prefix) and f.lower().endswith(".png"):
            out.append(f)
    return out


def _thumb(path, w, h):
    im = Image.open(path).convert("RGB")
    im.thumbnail((w, h), Image.LANCZOS)
    return im


def resolve(rid):
    p = os.path.join(FIXDIR, rid + ".png")
    if os.path.exists(p):
        return p
    return os.path.join(SRC, rid + ".png")


REJECT = {"ui_divider_h", "ui_list_row", "ui_tab_bar"}


def _grid(canvas, d, items, cols, cw, ch, lab_h, f_lab, x0, y0, tag, bg, marks=False):
    """把 items 放进 cols 列的格子；每个格子居中放缩略图，标签在下。返回下方 y。"""
    for i, f in enumerate(items):
        cx = x0 + (i % cols) * (cw + 14)
        cy = y0 + (i // cols) * (ch + lab_h + 14)
        d.rectangle([cx, cy, cx + cw, cy + ch], fill=bg)
        rid = f[:-4]
        path = resolve(rid) if marks else os.path.join(SRC, f)
        t = _thumb(path, cw - 8, ch - 8)
        canvas.paste(t, (cx + (cw - t.width) // 2, cy + (ch - t.height) // 2))
        if marks:
            ok = rid not in REJECT
            d.text((cx + 4, cy + 2), "ADOPT" if ok else "REJECT", font=f_lab,
                   fill=(120, 200, 120) if ok else (220, 96, 80))
            if not ok:
                d.rectangle([cx, cy, cx + cw, cy + ch], outline=(220, 96, 80), width=3)
        name = rid.replace(tag, "")
        label = rid if tag == "ui_" else "%s %s" % (name, LABELS.get(tag, {}).get(name, ""))
        d.text((cx, cy + ch + 3), label, font=f_lab, fill=(232, 223, 200))
    rows = (len(items) + cols - 1) // cols
    return y0 + rows * (ch + lab_h + 14)


LABELS = {
    "terrain_": {("%02d" % i): n for i, n in enumerate(TERRAIN_NAMES)},
    "hall_": {("%02d" % (i + 1)): n for i, n in enumerate(HALL_NAMES)},
}


def sheet():
    pad, head = 24, 78
    ter, hal = png_files("terrain_"), png_files("hall_")
    uis = [f for f in sorted(os.listdir(SRC)) if f.startswith("ui_") and f.endswith(".png")]
    for f in sorted(os.listdir(FIXDIR)):
        if f.startswith("ui_") and f.endswith(".png") and f not in uis:
            uis.append(f)
    uis = sorted(set(uis))

    tw, th = 196, int(196 * 1216 / 832)
    hw, hh = 210, int(210 * 1216 / 832)
    uw, uh = 300, 300
    cols = 4
    W = pad * 2 + cols * (uw + 14)
    H = (pad + head + 2 * (th + 26) + 26 + head + hh + 26 + 30
         + head + 4 * (uh + 26))
    canvas = Image.new("RGB", (W, H), (26, 22, 20))
    d = ImageDraw.Draw(canvas)
    f_title, f_lab, f_sub = font(32), font(19), font(19)
    y = pad

    def section(title, sub):
        nonlocal y
        d.text((pad, y), title, font=f_title, fill=(217, 178, 106))
        d.text((pad + d.textlength(title, font=f_title) + 14, y + 12), sub, font=f_sub, fill=(154, 163, 172))
        y += head

    section("§1 战场背景 terrain_00–11",
            "832×1216 竖屏 · 俯视45° · 三层视差（远天际/中障碍/近地面）· 画面内无单位")
    y = _grid(canvas, d, ter, 6, tw, th, 26, f_lab, pad, y, "terrain_", (34, 30, 28))
    y += 26
    section("§2 内政大殿 hall_01–06",
            "832×1216 竖屏 · 中央留白给文字与数值 · 两侧坐席案几 · 无人物")
    y = _grid(canvas, d, hal, 6, hw, hh, 26, f_lab, pad, y, "hall_", (34, 30, 28))
    y += 30
    section("§3 UI 框体 ui_*", "512² / 1024×256 · 只出底材与框 · 无文字 · 绿=ADOPT 红=REJECT")
    y = _grid(canvas, d, uis, cols, uw, uh, 26, f_lab, pad, y, "ui_", (48, 48, 48), marks=True)

    out = os.path.join(WORK, "env_contact.jpg")
    canvas.save(out, quality=86, optimize=True)
    print("sheet ->", out, canvas.size, os.path.getsize(out) // 1024, "KB")

    # UI 单独放大的近观版（128 色量化后用透明底拼，检查抠图质量与框体可用性）
    cell = 380
    cols2 = 4
    W2 = pad * 2 + cols2 * (cell + 14)
    H2 = pad * 2 + 4 * (cell + 26)
    c2 = Image.new("RGB", (W2, H2), (26, 22, 20))
    d2 = ImageDraw.Draw(c2)
    for i, f in enumerate(uis):
        cx = pad + (i % cols2) * (cell + 14)
        cy = pad + (i // cols2) * (cell + 26)
        # 棋盘格底，直接看抠图边缘
        for by in range(0, cell, 20):
            for bx in range(0, cell, 20):
                col = (58, 58, 58) if ((bx // 20 + by // 20) % 2 == 0) else (74, 74, 74)
                d2.rectangle([cx + bx, cy + by, cx + min(bx + 19, cell - 1), cy + min(by + 19, cell - 1)], fill=col)
        rgba = _trim(_alpha_key(Image.open(resolve(f[:-4])).convert("RGB")))
        rgba.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
        c2.paste(rgba, (cx + (cell - rgba.width) // 2, cy + (cell - rgba.height) // 2), rgba)
        ok = f[:-4] not in REJECT
        d2.text((cx, cy + cell + 2), ("ADOPT " if ok else "REJECT ") + f[:-4].replace("ui_", ""),
                font=f_lab, fill=(120, 200, 120) if ok else (220, 96, 80))
    out2 = os.path.join(WORK, "env_ui_contact.jpg")
    c2.save(out2, quality=88, optimize=True)
    print("ui sheet ->", out2, c2.size, os.path.getsize(out2) // 1024, "KB")


# ---------------------------------------------------------------- 入库

def _alpha_key(im):
    """深灰平底 -> 透明：按到背景色的距离做软阈值，边缘 1–2 px 羽化。"""
    im = im.convert("RGBA")
    a = im.split()[3]
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    # 背景色取四角 12×12 中位数
    samp = []
    for (x0, y0) in [(0, 0), (w - 12, 0), (0, h - 12), (w - 12, h - 12)]:
        for dx in range(0, 12, 2):
            for dy in range(0, 12, 2):
                samp.append(px[x0 + dx, y0 + dy])
    samp.sort(key=lambda c: c[0] + c[1] + c[2])
    bg = samp[len(samp) // 2]
    # 边框像素到 bg 的距离 -> 自适应阈值
    dist = []
    for x in range(w):
        for y in (0, 1, 2, h - 3, h - 2, h - 1):
            c = px[x, y]
            dist.append(((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** 0.5)
    dist.sort()
    lo = max(10.0, dist[int(len(dist) * 0.99)] + 4.0)
    hi = lo * 2.0
    lut = []
    for i in range(256):
        pass
    # 逐通道差分不便，直接对像素做 dist
    out = Image.new("RGBA", (w, h))
    op, sp = out.load(), rgb.load()
    for y in range(h):
        for x in range(w):
            c = sp[x, y]
            dv = ((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** 0.5
            if dv <= lo:
                op[x, y] = (c[0], c[1], c[2], 0)
            elif dv >= hi:
                op[x, y] = (c[0], c[1], c[2], 255)
            else:
                op[x, y] = (c[0], c[1], c[2], int(255 * (dv - lo) / (hi - lo)))
    return out


def _trim(im, pad=6):
    bbox = im.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def pack(adopt_file):
    """入库：按 3 MB 硬预算自动降档（质量 -> 边长 -> 调色板）。"""
    adopt = []
    for line in open(adopt_file, encoding="utf-8"):
        line = line.split("#")[0].strip()
        if line:
            adopt.append(line)
    os.makedirs(DEST, exist_ok=True)

    def make(rid, q, big_w, ui_px, ui_cols):
        for base in (FIXDIR, SRC):
            src = os.path.join(base, rid + ".png")
            if os.path.exists(src):
                break
        else:
            return None, None
        im = Image.open(src).convert("RGB")
        if rid.startswith("ui_"):
            a = _trim(_alpha_key(im))
            if max(a.size) > ui_px:
                r = ui_px / max(a.size)
                a = a.resize((max(1, int(a.width * r)), max(1, int(a.height * r))), Image.LANCZOS)
            return a.quantize(colors=ui_cols, method=Image.FASTOCTREE), rid + ".png"
        im = im.resize((big_w, int(big_w * 1216 / 832 + 0.5)), Image.LANCZOS)
        return im, rid + ".jpg"

    plan = [(82, 750, 384, 128), (78, 750, 384, 96), (74, 720, 352, 96),
            (72, 700, 320, 64), (68, 640, 288, 64), (64, 600, 256, 48)]
    for q, big_w, ui_px, ui_cols in plan:
        total = 0
        made = []
        for rid in adopt:
            obj, name = make(rid, q, big_w, ui_px, ui_cols)
            if obj is None:
                print("MISSING", rid)
                continue
            buf = io.BytesIO()
            if name.endswith(".jpg"):
                obj.save(buf, format="JPEG", quality=q, optimize=True, progressive=True)
            else:
                obj.save(buf, format="PNG", optimize=True)
            made.append((rid, len(buf.getvalue()), name))
            total += len(buf.getvalue())
        if total <= 3 * 1048576 * 0.97 or q <= 64:
            break
    # 真正落盘
    made2 = []
    for rid, s, name in made:
        obj, _ = make(rid, q, big_w, ui_px, ui_cols)
        if name.endswith(".jpg"):
            obj.save(os.path.join(DEST, name), quality=q, optimize=True, progressive=True)
        else:
            obj.save(os.path.join(DEST, name), optimize=True)
        made2.append((rid, os.path.getsize(os.path.join(DEST, name)), name))
    for rid, s, name in made2:
        print("%-24s %7.1f KB  %s" % (rid, s / 1024, name))
    tot = sum(s for _, s, _ in made2)
    print("PLAN q=%d big=%d ui=%dpx/%dc  -> %d files  %.2f MB  (limit 3.00 MB)"
          % (q, big_w, ui_px, ui_cols, len(made2), tot / 1048576))
    return tot


if __name__ == "__main__":
    if sys.argv[1] == "sheet":
        sheet()
    else:
        pack(sys.argv[2])
