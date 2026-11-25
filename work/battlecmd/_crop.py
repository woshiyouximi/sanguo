import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
im.crop((0, 990, 750, 1334)).resize((1500, 688), Image.LANCZOS).save(dst)
print(dst, im.size)
