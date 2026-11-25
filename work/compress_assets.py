"""压缩 bundles/res 里的立绘与特效贴图（原地覆盖，.meta 不动）。

- hero/*.webp: 480x701 -> 256x374, q78
- fx/*.png:   宽高各减半（保持 PNG，alpha 保留）

用法：python compress_assets.py
"""
import os
import shutil
import sys

from PIL import Image

RES = r"F:\sanguo\game\cocos\assets\bundles\res"
BACKUP = r"F:\sanguo\dist\_backup"


def human(n: int) -> str:
    return f"{n / 1024 / 1024:.2f} MB" if n >= 1024 * 1024 else f"{n / 1024:.0f} KB"


def dir_size(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def backup(sub: str) -> None:
    src = os.path.join(RES, sub)
    dst = os.path.join(BACKUP, sub)
    if os.path.isdir(dst):
        print(f"[backup] {dst} 已存在，跳过")
        return
    shutil.copytree(src, dst)
    print(f"[backup] {src} -> {dst}")


def compress_hero() -> tuple[int, int, int]:
    d = os.path.join(RES, "hero")
    files = [f for f in sorted(os.listdir(d)) if f.lower().endswith(".webp")]
    before = dir_size(d)
    worst = 0
    for f in files:
        p = os.path.join(d, f)
        old = os.path.getsize(p)
        with Image.open(p) as im:
            im = im.convert("RGB").resize((256, 374), Image.LANCZOS)
            im.save(p, "WEBP", quality=78, method=6)
        new = os.path.getsize(p)
        worst = max(worst, new)
    return before, dir_size(d), worst


def compress_fx() -> tuple[int, int]:
    d = os.path.join(RES, "fx")
    files = [f for f in sorted(os.listdir(d)) if f.lower().endswith(".png")]
    before = dir_size(d)
    for f in files:
        p = os.path.join(d, f)
        with Image.open(p) as im:
            im = im.convert("RGBA")
            w, h = im.size
            im = im.resize((max(1, w // 2), max(1, h // 2)), Image.LANCZOS)
            im.save(p, "PNG", optimize=True)
    return before, dir_size(d)


def main() -> int:
    if not os.path.isdir(RES):
        print(f"找不到 {RES}")
        return 1
    os.makedirs(BACKUP, exist_ok=True)

    print("=== 压缩前 ===")
    total_before = 0
    for sub in ("hero", "audio", "fx", "data", "anim"):
        s = dir_size(os.path.join(RES, sub))
        total_before += s
        print(f"  {sub:<6} {human(s):>9}")
    print(f"  {'合计':<5} {human(total_before):>9}")

    backup("hero")
    backup("fx")

    print("=== 压缩 hero ===")
    hb, ha, worst = compress_hero()
    print(f"  hero  {human(hb)} -> {human(ha)}   单张最大 {worst // 1024} KB")

    print("=== 压缩 fx ===")
    fb, fa = compress_fx()
    print(f"  fx    {human(fb)} -> {human(fa)}")

    print("=== 压缩后 ===")
    total_after = 0
    for sub in ("hero", "audio", "fx", "data", "anim"):
        s = dir_size(os.path.join(RES, sub))
        total_after += s
        print(f"  {sub:<6} {human(s):>9}")
    print(f"  {'合计':<5} {human(total_after):>9}  (省 {human(total_before - total_after)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
