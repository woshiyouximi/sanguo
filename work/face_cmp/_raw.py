# -*- coding: utf-8 -*-
import os
from PIL import Image
H = r"F:\sanguo\game\web\assets\hero"
O = r"F:\sanguo\work\face_cmp"
for n in ["大喬", "祝融夫人", "貂蟬"]:
    im = Image.open(os.path.join(H, n + ".webp")).convert("RGB")
    im.resize((im.width * 2 // 3, im.height * 2 // 3), Image.LANCZOS).save(
        os.path.join(O, "_raw_" + n + ".png"))
    print(n, im.size)
