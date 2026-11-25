import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
def o(n):           # our screenshot
    return Image.open(os.path.join(OUT, n)).convert("RGB")
def v(t, name):     # video frame
    return Image.open(_mk.grab(t, name + ".png", sub="cmp")).convert("RGB")

def fit(im, w):
    h = int(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)

o1 = o("our_b01_t1.png")
o4 = o("our_b04_t1500.png")
o6 = o("our_b06_surrender.png")

# --- item 1: 开局 ---
a = v(467.0, "b_start_990"); b = v(469.0, "b_start_99x")
_mk.montage([(a, "原作 07:47.0 开局：时间牌 99，场中空无一兵"),
             (b, "原作 07:49.0：主将+方阵已在场，敌方仍离线"),
             (fit(o1, 470), "我们 t=1（sim=1）：全阵静止，时间牌 99")],
            os.path.join(OUT, "c01_start.png"), cols=3, title="① 开局")

# --- item 2/6: 主将前进 & 布阵位置 ---
a = v(469.5, "b_form"); a = a.crop((60, 20, 600, 330))
b = v(478.0, "b_adv").crop((0, 20, 620, 330))
_mk.montage([(fit(a, 540), "原作 07:49.5 主将（骑马）站在阵中，四周都是自己的兵"),
             (fit(b, 540), "原作 07:58.0 主将已前出，我方阵列仍成型"),
             (fit(o1.crop((0, 240, 751, 1050)), 380), "我们 t=1：阵型贴地，主将不在阵内可见")],
            os.path.join(OUT, "c02_general.png"), cols=3, title="② 主将前进 / ⑥ 布阵位置")

# --- item 4: 接敌 ---
a = v(481.0, "b_hit").crop((0, 20, 620, 330))
b = v(486.0, "b_melee").crop((0, 20, 620, 330))
_mk.montage([(fit(a, 540), "原作 08:01 接触瞬间：红衣一方停下与蓝衣互砍"),
             (fit(b, 540), "原作 08:06 混战：双方贴身，不再前进"),
             (fit(o4.crop((0, 60, 751, 1000)), 380), "我们 t=1500：敌方已推到我方阵前，我方原地不动")],
            os.path.join(OUT, "c04_contact.png"), cols=3, title="④ 能打就不走")

# --- item 7: HUD ---
a = v(510.0, "hud830").crop((70, 250, 570, 358))
b = o4.crop((0, 970, 751, 1120))
_mk.montage([(fit(a, 700), "原作 08:30 HUD：左右镜像 兵96/96 體54/54 + 两个裸数字(0/88 vs 20/66)"),
             (fit(b, 700), "我们 t=1500 HUD：兵/疲/智/士/武/行 + 技 60/60")],
            os.path.join(OUT, "c07_hud.png"), cols=1, title="⑦ HUD 四字段")

# --- item 8: 倒计时 ---
N = (285, 256, 360, 292)
a = _mk.crop(v(467.0, "cd0"), N, 5)
b = _mk.crop(v(510.0, "cd1"), N, 5)
c = _mk.crop(v(540.0, "cd2"), N, 5)
d = _mk.crop(o1.crop((250, 0, 500, 70)), (0, 0, 250, 70), 2)
_mk.montage([(a, "原作 07:47 = 99（起始值）"), (b, "原作 08:30 = 75"),
             (c, "原作 09:00 = 58（73s 掉 41）"), (d, "我们 t=1 = 九十九")],
            os.path.join(OUT, "c08_countdown.png"), cols=4, title="⑧ 顶部中文倒计时")

# --- item 9: 作战指令 ---
a = v(363.0, "cmd").crop((470, 0, 640, 200))
_mk.montage([(fit(a, 320), "原作作战指令：11 项平铺（前军前进在最上）"),
             (fit(o1.crop((510, 1000, 751, 1336)), 300), "我们：6 大按钮 + 部隊指令 二层")],
            os.path.join(OUT, "c09_cmd.png"), cols=2, title="⑨ 作战指令")

# --- item 10: 招降 ---
a = Image.open(r"F:\sanguo\work\orig_video\clean_0910.png").convert("RGB").crop((100, 0, 720, 300))
b = Image.open(r"F:\sanguo\work\play86\shots\06f_招降面板.png").convert("RGB")
_mk.montage([(fit(a, 560), "原作 09:10 武将招降：忠誠度/等級/武力/智力/士氣/疲勞/武器/物品/勝場數/敗場數 + 釋放·斬首·看押"),
             (fit(b, 380), "我们（web 版 06f）：逐将卡 武/智/忠誠/義理 + 招降/斬首/釋放 + 批量三键")],
            os.path.join(OUT, "c10_surrender.png"), cols=1, title="⑩ 招降面板")
print("ok")
