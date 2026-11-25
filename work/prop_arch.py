import pathlib
p = pathlib.Path(r'F:\sanguo\cloud\make_jobs.py')
t = p.read_text(encoding='utf-8')
old = '''def derive_look(name, arch):
    import zlib
    h = zlib.crc32(name.encode("utf-8"))
    feel = _FEEL_VAR[h % len(_FEEL_VAR)]
    armor = _ARMOR_VAR[(h >> 5) % len(_ARMOR_VAR)]
    prop = _PROP_VAR[(h >> 11) % len(_PROP_VAR)]
    color = _ACCENT[(h >> 17) % len(_ACCENT)]'''
new = '''# 兵器按身份收窄：谋士不能扛大刀，猛将不该拿羽扇。
_PROP_BY_ARCH = {
    "谋士": ["羽扇", "竹简与书卷", "佩剑", "羽扇", "竹简与书卷", "短剑"],
    "猛将": ["长柄大刀", "双戟", "长枪", "鉄鞭", "长戟", "长柄大刀"],
    "帅才": ["佩剑与令旗", "长枪", "佩剑", "长戟", "令旗与佩剑", "长枪"],
    "战将": ["长枪", "环首刀", "强弓与箭囊", "长戟", "长枪", "环首刀"],
    "偏将": ["环首刀", "长枪", "短戟", "佩剑", "环首刀", "长枪"],
}


def derive_look(name, arch):
    import zlib
    h = zlib.crc32(name.encode("utf-8"))
    feel = _FEEL_VAR[h % len(_FEEL_VAR)]
    armor = _ARMOR_VAR[(h >> 5) % len(_ARMOR_VAR)]
    pool = _PROP_BY_ARCH.get(arch) or _PROP_VAR
    prop = pool[(h >> 11) % len(pool)]
    color = _ACCENT[(h >> 17) % len(_ACCENT)]'''
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('weapon-by-arch')
