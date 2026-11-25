import pathlib
p = pathlib.Path(r'F:\sanguo\cloud\make_jobs.py')
t = p.read_text(encoding='utf-8')

old = '''def hero_prompt(h, i):
    arch = archetype(h["wuli"], h["zhili"])
    feel, armor, color, prop = ARCH[arch]
    if h["name"] in HERO_LOOK:      # 逐将锚点优先于定位
        feel, armor, color, prop = HERO_LOOK[h["name"]]'''
new = '''# ---- 未手写锚点的 360 人：按"定位 + 名字哈希"派生确定性锚点 ----
# 目的：400 张要能成批出，又不能让同一档的人长得一样（V0 的 8 将就吃过这个亏）。
# 规则：定位给"骨相"，哈希给"皮相"；同一名字永远得到同一组参数（可复现、可返工）。
_FEEL_VAR = [
    "面容清癯、颌下短须", "方脸浓眉、目光如炬", "面白微须、眼神沉静",
    "颧高目锐、胡茬粗硬", "眉低压目、唇线紧绷", "面有风霜、鬓角微白",
    "鼻梁高挺、唇角含笑", "額宽下颌方、胡须修整", "眼细长、眉疏淡",
]
_ARMOR_VAR = [
    "玄铁札甲配皮护腕", "两当铠配布腰带", "鱼鳞甲配兽面肩吞",
    "重甲外罩战袍", "皮甲缀铁片", "文士袍外披轻甲",
]
_PROP_VAR = ["长枪", "环首刀", "长柄大刀", "长戟", "强弓与箭囊", "佩剑与令旗", "双戟", "鉄鞭"]
_ACCENT = ["#3A5A8C", "#8C3B2E", "#3F6B4A", "#6B4A2E", "#4A4F58", "#7A3A5E", "#2E4A4A", "#8A6A34"]


def derive_look(name, arch):
    import zlib
    h = zlib.crc32(name.encode("utf-8"))
    feel = _FEEL_VAR[h % len(_FEEL_VAR)]
    armor = _ARMOR_VAR[(h >> 5) % len(_ARMOR_VAR)]
    prop = _PROP_VAR[(h >> 11) % len(_PROP_VAR)]
    color = _ACCENT[(h >> 17) % len(_ACCENT)]
    # 猛将更红、谋士更青：用定位把色相往该方向拉一档（不超过锚点表的手写强度）
    if arch == "猛将" and (h & 1):
        color = "#8C2B24"
    elif arch == "谋士" and (h & 1):
        color = "#2F4A5A"
    return feel, armor, color, prop


def hero_prompt(h, i):
    arch = archetype(h["wuli"], h["zhili"])
    feel, armor, color, prop = ARCH[arch]
    if h["name"] in HERO_LOOK:      # 逐将锚点优先于定位
        feel, armor, color, prop = HERO_LOOK[h["name"]]
    else:
        feel, armor, color, prop = derive_look(h["name"], arch)'''
assert old in t
t = t.replace(old, new)

# 拼装串里补"年龄感与人数约束"，并让 832x1216 的立绘留出竖屏 HUD 安全区
old2 = '''    return ("三国时期{arch}「{name}」的竖屏游戏立绘，半身像，{feel}，身披{armor}，"
            "主色 {color}，手持{prop}，神情与身份相符。{style}").format('''
new2 = '''    return ("三国时期{arch}「{name}」的竖屏游戏立绘，半身像，单人，{feel}，身披{armor}，"
            "主色 {color}，手持{prop}，神情与身份相符，头部上方留出 8% 空白。{style}").format('''
assert old2 in t
t = t.replace(old2, new2)
p.write_text(t, encoding='utf-8')
print('make_jobs.py: fallback anchors added')
