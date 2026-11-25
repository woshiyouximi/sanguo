import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
def v(t, name):
    return Image.open(_mk.grab(t, name + ".png", sub="cmp")).convert("RGB")
def fit(im, w):
    return im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)

a = v(469.5, "b_form").crop((60, 20, 600, 330))
b = v(472.0, "b_meet").crop((0, 20, 620, 330))
o1 = Image.open(os.path.join(OUT, "our_b01_t1.png")).convert("RGB")
_mk.montage([(fit(a, 540), "原作 07:49.5 主将（骑马）在自阵正中，四周都是自家兵"),
             (fit(b, 540), "原作 07:52.0 主将已在混战中（开局 5 秒内接敌）"),
             (fit(o1.crop((0, 240, 751, 1050)), 380), "我们 t=1：全阵静止，主将不在阵内")],
            os.path.join(OUT, "c02_general.png"), cols=3, title="② 主将前进 / ⑥ 布阵位置")
print("ok")
