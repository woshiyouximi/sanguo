import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
def v(t, name):
    return Image.open(_mk.grab(t, name + ".png", sub="cmp")).convert("RGB")
def fit(im, w):
    return im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)

a = v(469.5, "b_form").crop((120, 40, 560, 300))
b = v(470.0, "b_form2").crop((180, 60, 520, 280))
o1 = Image.open(os.path.join(OUT, "our_b01_t1.png")).convert("RGB")
_mk.montage([(fit(a, 520), "原作 07:49.5：主将在方阵正中，左右前后都是自己的兵"),
             (fit(b, 520), "原作 07:50.0 中段 3x：主将被自家步兵包住，阵内还有空列"),
             (a.resize((a.width * 2, a.height * 2), Image.LANCZOS), "原作 07:49.5 2x 放大"),
             (fit(o1.crop((0, 900, 751, 1100)), 400), "我们 t=1：最前排是兵，主将不在阵内")],
            os.path.join(OUT, "c06_formation.png"), cols=2, title="⑥ 布阵与主将位置")
print("ok")
