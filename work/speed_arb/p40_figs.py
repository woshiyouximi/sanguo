# -*- coding: utf-8 -*-
"""Draw the two evidence figures for project/190.
fig1: x(t) tracks of general (battle A, y=164.5) and one unblocked archer (y=94)
fig2: cell pitch vs screen y (measured same-row spacings) + the two operating points
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = r'F:\sanguo\work\speed_arb'

try:
    F = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 15)
    F2 = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 12)
except Exception:
    F = ImageFont.load_default(); F2 = F

# ---------------- fig1 : tracks ----------------
GEN = [285,291,299,305,310,315,322,324,329,338,340,349,353,359,363,370,375,379,388,394,400,402,408,414,419,426,431,436,441,449,455,462,466,472,478,480,486,493,496,501,510,515,519,526,532,535,542]
GEN_K0 = 62
ARC = [487,484,481,479,476,473,471,467,465,461,458,454,452]
ARC_K0 = 176

W, H = 900, 520
img = Image.new('RGB', (W, H), (250, 250, 248))
d = ImageDraw.Draw(img)

# panel A
ax0, ay0, aw, ah = 70, 50, 780, 190
d.rectangle([ax0, ay0, ax0+aw, ay0+ah], outline=(120,120,120))
for gx in range(0, 51, 10):
    X = ax0 + gx/50*aw
    d.line([X, ay0, X, ay0+ah], fill=(230,230,230))
    d.text((X-8, ay0+ah+4), str(gx), fill=(90,90,90), font=F2)
for gy in range(280, 550, 50):
    Y = ay0+ah - (gy-280)/270*ah
    d.line([ax0, Y, ax0+aw, Y], fill=(230,230,230))
    d.text((ax0-40, Y-7), str(gy), fill=(90,90,90), font=F2)
pts = [(ax0 + i/50*aw, ay0+ah - (v-280)/270*ah) for i, v in enumerate(GEN)]
d.line(pts, fill=(200,40,40), width=2)
for p in pts:
    d.ellipse([p[0]-2.5, p[1]-2.5, p[0]+2.5, p[1]+2.5], fill=(200,40,40))
d.text((ax0, ay0-30), u'A  主将赵云 x(t)  08:36.0-08:37.7   OLS 斜率 5.558 px/视频帧 (n=47, rms=1.42px)', fill=(150,20,20), font=F)
d.text((ax0, ay0-14), u'    y 恒 164.5；dx min2/med6/mean5.587/max9；零位移帧 0', fill=(90,90,90), font=F2)

# panel B
by0 = 320; bh = 170
d.rectangle([ax0, by0, ax0+aw, by0+bh], outline=(120,120,120))
for gx in range(0, 13, 2):
    X = ax0 + gx/12*aw
    d.line([X, by0, X, by0+bh], fill=(230,230,230))
    d.text((X-6, by0+bh+4), str(gx), fill=(90,90,90), font=F2)
for gy in range(445, 495, 10):
    Y = by0+bh - (gy-445)/50*bh
    d.line([ax0, Y, ax0+aw, Y], fill=(230,230,230))
    d.text((ax0-36, Y-7), str(gy), fill=(90,90,90), font=F2)
pts = [(ax0 + i/12*aw, by0+bh - (v-445)/50*bh) for i, v in enumerate(ARC)]
d.line(pts, fill=(30,80,200), width=2)
for p in pts:
    d.ellipse([p[0]-2.5, p[1]-2.5, p[0]+2.5, p[1]+2.5], fill=(30,80,200))
d.text((ax0, by0-30), u'B  敌弓兵 x(t)  08:41.9-08:42.3   OLS 斜率 -2.934 px/视频帧 (n=13, rms=0.61)   y 恒 94', fill=(20,50,160), font=F)
d.text((ax0, by0-14), u'    逐帧 Δx = -3,-3,-2,-3,-3,-2,-4,-2,-4,-3,-4,-2；零位移帧 0（前方空格，未被堵）', fill=(90,90,90), font=F2)

d.text((ax0, H-32), u'图1  两段连续帧的位移轨迹（30fps 逐帧，NCC 跟踪；数据与 project/176 一致，残差同量级 1.4-1.5px）', fill=(60,60,60), font=F2)
img.save(os.path.join(OUT, 'fig1_tracks.png'))
print('fig1 ok')

# ---------------- fig2 : pitch vs y ----------------
# measured same-row pitch (battle B deployment, clean same-y pairs; battle A archer line)
PTS_B = [(124, 57.6, 'deployed row, y123.6 (battle B)'),
         (136, 64.0, 'deployed row, y135.8 (battle B)'),
         (170, 81.0, 'deployed row, y170.5 (battle B)')]
PTS_A = [(94, 53.0, 'archer line 47..57 (battle A)')]
K_B, P_B = 9170.0, 283.0
# battle A zoom correction measured at y=94: 53/ (9170/(283-94)) = 53/48.5
ZOOM_A = 53.0 / (K_B/(P_B-94))

W2, H2 = 900, 540
img2 = Image.new('RGB', (W2, H2), (250,250,248))
d = ImageDraw.Draw(img2)
x0, y0, w, h = 80, 70, 760, 330
pxlo, pxhi = 40, 110
pylo, pyhi = 80, 220
d.rectangle([x0, y0, x0+w, y0+h], outline=(120,120,120))
def X(y): return x0 + (y-pylo)/(pyhi-pylo)*w
def Y(p): return y0+h - (p-pxlo)/(pxhi-pxlo)*h
for yy in range(80, 221, 20):
    d.line([X(yy), y0, X(yy), y0+h], fill=(232,232,232))
    d.text((X(yy)-9, y0+h+4), str(yy), fill=(90,90,90), font=F2)
for pp in range(40, 111, 10):
    d.line([x0, Y(pp), x0+w, Y(pp)], fill=(232,232,232))
    d.text((x0-26, Y(pp)-7), str(pp), fill=(90,90,90), font=F2)
# fit curve (battle B camera)
cv = [(X(yy), Y(K_B/(P_B-yy))) for yy in range(80, 200) if P_B-yy > 8]
d.line(cv, fill=(150,150,150), width=2)
cvA = [(X(yy), Y(ZOOM_A*K_B/(P_B-yy))) for yy in range(80, 200) if P_B-yy > 8]
d.line(cvA, fill=(120,120,120), width=1)
for y, p, lab in PTS_B:
    d.ellipse([X(y)-5, Y(p)-5, X(y)+5, Y(p)+5], fill=(30,120,40))
    d.text((X(y)+8, Y(p)-26), u'%.1f px @y=%d' % (p, y), fill=(20,90,30), font=F2)
for y, p, lab in PTS_A:
    d.ellipse([X(y)-5, Y(p)-5, X(y)+5, Y(p)+5], fill=(30,80,200))
    d.text((X(y)+8, Y(p)-16), u'%.1f px @y=%d (battle A)' % (p, y), fill=(20,50,160), font=F2)
# operating points: measured px/frame x 40 ticks-worth? no: show cells/frame? show px-per-16-video-frames
# general 5.5643 px/frame * 16 frames(=40 ticks @72Hz) = 89.0 ; archer 2.92*16 = 46.7
d.ellipse([X(164.5)-6, Y(84.4)-6, X(164.5)+6, Y(84.4)+6], outline=(200,40,40), width=2)
d.text((X(164.5)-150, Y(84.4)+4), u'主将所在排 y=164.5 → 84.5 px/格（红圈）', fill=(160,20,20), font=F2)
d.ellipse([X(94)-6, Y(53)-6, X(94)+6, Y(53)+6], outline=(200,40,40), width=2)
d.text((X(94)+10, Y(53)+14), u'弓兵所在排 y=94 → 53 px/格（红圈）', fill=(160,20,20), font=F2)
d.text((x0, y0-46), u'图2  同排相邻单位间距（=1 格）随屏幕 y 变化 —— 格尺不是常数，是 y 的函数', fill=(40,40,40), font=F)
d.text((x0, y0-28), u'灰线: pitch(y)=9170/(283-y)（battle B 三点拟合）；细线: battle A 同比 x%.3f 缩放' % ZOOM_A, fill=(90,90,90), font=F2)
d.text((x0, H2-56), u'判读：主将 5.558 px/帧 ÷ 84.5 px/格 = 1.97 格/秒', fill=(30,30,30), font=F2)
d.text((x0, H2-38), u'      弓兵 2.934 px/帧 ÷ 53 px/格 = 1.66 格/秒   → 格/秒之比 1.19，而非像素比 1.89', fill=(30,30,30), font=F2)
d.text((x0, H2-20), u'      1.89 = 1.59（透视：84.5/53）× 1.19（士兵部分行动未走成）', fill=(160,20,20), font=F2)
img2.save(os.path.join(OUT, 'fig2_pitch.png'))
print('fig2 ok  ZOOM_A=%.3f' % ZOOM_A)
