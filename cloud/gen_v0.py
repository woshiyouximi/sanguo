import csv, os
here = r'F:\sanguo\cloud'
HDR = ["id","kind","prompt","negative","width","height","seed","steps","cfg","length","image"]
STYLE = "新国风厚涂风格，厚实可见的笔触，电影感侧逆光，高级灰调，高细节，画面干净"
NEG = "低质量，模糊，文字，乱码字符，水印，logo，现代元素，多人"

rows = []
# 1) 8 将（复用已生成）
for r in csv.DictReader(open(os.path.join(here,'jobs_v0_heroes8.csv'), encoding='utf-8-sig')):
    rows.append(r)
# 2) 2 兵种 × 双视角（V0 只需 2 个兵种验证可读性）
for code, cname, desc in [("M1","朴刀兵","近战步兵，横刀，蓝色布甲配皮护腕，头戴笠帽"),
                          ("MF","弓箭兵","远程弓兵，长弓与箭囊，蓝色轻甲，头戴巾帻")]:
    for view, vdesc in [("front","正视图：从正前方看，能看见脸与胸前甲片"),
                        ("back","背视图：从正后方看，看不见脸，只能看见后脑与背甲")]:
        rows.append({"id": "soldier_%s_%s" % (code, view), "kind":"t2i",
            "prompt": "三国时期士兵全身概念图，%s，%s，浅灰纯色背景，全身站姿，单人。%s" % (desc, vdesc, STYLE),
            "negative": NEG, "width":"512","height":"768","seed":str(900+len(rows)),"steps":"24","cfg":"3.0","length":"","image":""})
# 3) 场景与 UI
scenes = [
 ("bg_battle_grass","竖屏手游战场背景，俯视 40 度，秋季草原，远处低矮土坡与断旗，无人物，右上方来光",832,1216,701),
 ("bg_battle_city","竖屏手游攻城战场背景，俯视 40 度，黄土城墙与城门、攻楼残破，无人物",832,1216,702),
 ("worldmap","三国题材竖屏战略大地图，俯视，山川河流与城池关隘，水墨叠加厚涂，城池用朱红小旗标记，无文字",832,1216,703),
 ("ui_battle_hud","竖屏手游战斗 HUD 设计稿，半透明深色竹简质感，顶部武将血条条带、底部技能圆钮排布、中部留空，无文字",832,1216,704),
 ("ui_city","竖屏手游城池内政界面，竹简卷轴列表配青铜包边，上方城池插画位、中部三列数据格、底部四个圆钮，无文字",832,1216,705),
 ("ui_hero_detail","竖屏手游武将详情界面，左侧立绘位、右侧竖向属性条，青铜框与暗金纹样，无文字",832,1216,706),
 ("ui_formation","竖屏手游阵形选择界面，九宫格阵形缩略图排布在竹简面板上，选中项朱红描边，无文字",832,1216,707),
]
for name,p,w,h,seed in scenes:
    rows.append({"id":name,"kind":"t2i","prompt":p+"。"+STYLE,"negative":NEG,
                 "width":str(w),"height":str(h),"seed":str(seed),"steps":"20","cfg":"3.0","length":"","image":""})
# 4) 技能特效关键帧（透明背景做不到，出深色底再抠）
fx = [
 ("fx_halfmoon","一道巨大的半月形刀气横贯画面，蓝白色能量，边缘飞散火星，深灰纯色背景",801),
 ("fx_fire","火龍从地面腾起的瞬间，橙红火焰与黑烟，深灰纯色背景",802),
 ("fx_lightning","落雷击地的瞬间，白紫色电弧分叉，地面碎裂，深灰纯色背景",803),
 ("fx_bagua","地面浮现发光八卦阵纹，青金色，俯视，深灰纯色背景",804),
]
for name,p,seed in fx:
    rows.append({"id":name,"kind":"t2i","prompt":p+"。"+STYLE,"negative":"文字，水印，人物，武器",
                 "width":"768","height":"768","seed":str(seed),"steps":"20","cfg":"3.0","length":"","image":""})
# 5) 图生视频（第二阶段：先把对应 t2i 结果拷进 ComfyUI/input）
i2v = [
 ("seq_M1_walk","soldier_M1_back.png","士兵背视向前走，步伐沉稳，身体自然摆动，镜头固定",33,901),
 ("seq_M1_attack","soldier_M1_front.png","士兵正面挥刀横劈，动作干脆有力，镜头固定",33,902),
 ("seq_MF_shoot","soldier_MF_front.png","弓兵正面拉弓放箭，弓弦回弹，镜头固定",33,903),
 ("seq_MF_walk","soldier_MF_back.png","弓兵背视向前走，箭囊随步伐晃动，镜头固定",33,904),
]
for name,img,p,length,seed in i2v:
    rows.append({"id":name,"kind":"i2v","prompt":p+"，动作连贯，无镜头运动，纯色背景","negative":"文字，水印，多人，镜头晃动，变形",
                 "width":"512","height":"768","seed":str(seed),"steps":"30","cfg":"5.0","length":str(length),"image":img})

with open(os.path.join(here,'jobs_v0.csv'),'w',encoding='utf-8-sig',newline='') as f:
    w = csv.DictWriter(f, fieldnames=HDR)
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k,"") for k in HDR})
print('jobs_v0.csv:', len(rows), 'rows  (t2i %d / i2v %d)' % (sum(1 for r in rows if r['kind']=='t2i'), sum(1 for r in rows if r['kind']=='i2v')))
