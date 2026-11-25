"""从备份重新编码 hero（可反复调参，无代际损失）。

用法：python rehero.py <width> <height> <quality>
从 F:\\sanguo\\dist\\_backup\\hero 的原始 webp 读出，写到 bundles/res/hero。
"""
import os
import sys

from PIL import Image

SRC = r"F:\sanguo\dist\_backup\hero"
DST = r"F:\sanguo\game\cocos\assets\bundles\res\hero"


def dir_size(path: str) -> int:
    return sum(
        os.path.getsize(os.path.join(path, f))
        for f in os.listdir(path)
        if os.path.isfile(os.path.join(path, f))
    )


def main() -> int:
    w, h, q = (int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (256, 374, 78)
    files = [f for f in sorted(os.listdir(SRC)) if f.lower().endswith(".webp")]
    total = 0
    worst = 0
    for f in files:
        src = os.path.join(SRC, f)
        dst = os.path.join(DST, f)
        with Image.open(src) as im:
            im = im.convert("RGB").resize((w, h), Image.LANCZOS)
            im.save(dst, "WEBP", quality=q, method=6)
        n = os.path.getsize(dst)
        total += n
        worst = max(worst, n)
    imgs = dir_size(DST)
    print(f"{len(files)} 张 -> {w}x{h} q{q}: 图片 {imgs / 1024 / 1024:.2f} MB (目录含meta {dir_size(DST) / 1024 / 1024:.2f} MB)，单张最大 {worst // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
