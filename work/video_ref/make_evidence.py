# -*- coding: utf-8 -*-
"""Produce the final q*_*.png evidence set in F:\\sanguo\\work\\video_ref\\.

Each entry: (out_name, time_sec, crop or None, scale)
crop is "x,y,w,h" in source 640x360 pixels; None = whole frame.
"""
import os
from grab import one

OUT = r"F:\sanguo\work\video_ref"

EV = [
    # Q1 开局叫阵
    ("q1_panel_00",   359.5, None, 3),          # 战前「对」面板
    ("q1_taunt_00",   361.3, None, 3),          # 敌将 牽兰 喊话，头像在左下，镜头给敌阵
    ("q1_taunt_01",   362.5, None, 3),          # 我方 金旋 回话，头像在右下，镜头给我方
    ("q1_taunt_02",   363.4, None, 3),          # 喊完回到我方阵列
    ("q1_taunt_03",   360.6, None, 3),          # 第一段之前的空白建立镜头（敌阵）
    ("q1_b2_taunt_00", 748.2, None, 3),         # 第二场：敌将 韓玄 先喊
    ("q1_b2_taunt_01", 749.6, None, 3),         # 第二场：我方 趙範 回话
    # Q2 攻击动作
    ("q2_swing_00",   536.45, "150,50,340,230", 3),
    ("q2_swing_01",   536.48, "150,50,340,230", 3),
    ("q2_swing_02",   536.52, "150,50,340,230", 3),
    ("q2_hit_00",     537.09, "150,40,340,240", 3),
    ("q2_hit_01",     537.15, "150,40,340,240", 3),
    ("q2_hit_02",     537.22, "150,40,340,240", 3),
    ("q2_knock_00",   532.17, "250,150,220,110", 4),
    ("q2_knock_01",   532.23, "250,150,220,110", 4),
    ("q2_knock_02",   532.37, "250,150,220,110", 4),
    # Q3 兵将阻挡 / 前后排遮挡
    ("q3_rows_00",    361.3, "265,70,240,180", 4),   # 敌阵三排，前排遮后排
    ("q3_rows_01",    363.0, "76,0,488,270", 3),     # 我方雁形阵三排
    ("q3_pass_00",    530.33, "250,150,200,120", 4), # 小兵从马前穿过
    ("q3_pass_01",    530.43, "250,150,200,120", 4),
    ("q3_pass_02",    530.53, "250,150,200,120", 4),
    ("q3_hero_00",    927.0, None, 3),               # 主将被 6-7 小兵围住
    # Q4 战场宽度
    ("q4_wide_00",    364.0, None, 2),
    ("q4_wide_01",    368.0, None, 2),
    ("q4_minimap_00", 363.0, "255,318,120,44", 10),  # 小地图：红=敵 绿=我
    # Q5 战后俘虏
    ("q5_capture_00", 542.5, None, 3),               # 武將招降 界面
    ("q5_capture_01", 543.0, None, 3),
    ("q5_post_00",    542.6, None, 3),               # 「我們俘虜了敵方武將趙雲」+ 战后面板
    # Q6 大地图 / 内政
    ("q6_naisei_00",  33.0, None, 3),                # 内政指令 9 项
    ("q6_naisei_01",  75.0, None, 3),
    ("q6_city_00",    258.0, None, 3),               # 城內指令 6 项
    ("q6_dev_00",     3285.0, None, 3),              # 开发
    ("q6_item_00",    3305.0, None, 3),              # 物品使用
    ("q6_map_00",     3255.0, None, 2),              # 大地图 216年9月
]

if __name__ == "__main__":
    os.makedirs(os.path.join(OUT, "stills"), exist_ok=True)
    for name, t, crop, sc in EV:
        dst = os.path.join(OUT, name + ".png")
        one(t, "_tmp_ev", sc, crop)
        src = os.path.join(OUT, "stills", "_tmp_ev.png")
        if os.path.exists(dst):
            os.remove(dst)
        os.replace(src, dst)
        print(dst)
