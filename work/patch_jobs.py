import pathlib
p = pathlib.Path(r'F:\sanguo\cloud\make_jobs.py')
t = p.read_text(encoding='utf-8')

look = '''
# 逐将辨识锚点：定位只决定"气质档位"，这三样才决定"这是谁"（脸/武器/主色）
HERO_LOOK = {
    "关羽": ("丹凤眼、卧蚕眉、三尺长髯垂胸", "绿袍罩柳叶甲，兽面护心镜", "#2E5B3A", "青龙偃月刀"),
    "张辽": ("剑眉锐目、短须、面有风霜", "银白鱼鳞甲配紫罗披风", "#5A5F6B", "长柄钩镰枪"),
    "孙坚": ("额缠赤巾、虬髯、虎目", "古铜札甲，虎纹护腰", "#8A5A2B", "古锭刀与虎头盾"),
    "曹操": ("细长鹰目、短髯、神情阴沉", "黑金错银甲，玄色大氅", "#1E2230", "倚天剑"),
    "姜维": ("少年英气、眉清目朗、无须", "银蓝山文甲配白羽披风", "#3E5C7A", "亮银枪"),
    "赵云": ("面如冠玉、目若朗星、薄须", "白袍银甲，龙纹护肩", "#D8DCE3", "龙胆亮银枪"),
    "邓艾": ("面容清瘦、结巴般紧绷、鬓角斑白", "粗布褐甲，绳结束腰", "#6E5B45", "短柄矛"),
    "孙策": ("浓眉豹眼、朗笑带狂气", "赤金兽面甲配猩红披风", "#A8322A", "霸王长枪"),
}
'''
anchor = "# 定位 → 气质与甲胄语言"
t = t.replace(anchor, look.strip() + "\n\n" + anchor)

old = '    arch = archetype(h["wuli"], h["zhili"])\n    feel, armor, color, prop = ARCH[arch]'
new = ('    arch = archetype(h["wuli"], h["zhili"])\n'
       '    feel, armor, color, prop = ARCH[arch]\n'
       '    if h["name"] in HERO_LOOK:      # 逐将锚点优先于定位\n'
       '        feel, armor, color, prop = HERO_LOOK[h["name"]]')
assert old in t
t = t.replace(old, new)
p.write_text(t, encoding='utf-8')
print('HERO_LOOK added')
