"""从原作数据生成出图任务清单（CSV）。

用法：
    python make_jobs.py --top 8  --out jobs_v0_heroes8.csv      # V0 验证用 8 将
    python make_jobs.py --top 40 --out jobs_heroes40.csv        # 全量 40 将
    python make_jobs.py --kind soldier --out jobs_soldiers.csv  # 兵种双视角概念图

数据源（只读，不修改）：F:\\sanguo\\extract\\json\\xls_群英2.json
  - 列：1 姓名 / 2 武力 / 3 智力 / 5.. 必杀技；剧本 1 的 37 城市 / 38 状态
  - 编码是 UTF-8 JSON，不是 cp950（xls 解出来的已经转码）
"""
import argparse
import csv
import json
import os
import sys

XLS = r"F:\sanguo\extract\json\xls_群英2.json"

STYLE = ("新国风厚涂风格，厚实可见的笔触，电影感侧逆光，高级灰调，暗色虚化背景，"
         "高细节，画面干净，竖构图")
NEG = "低质量，模糊，多余手指，畸形手，文字，水印，logo，多人，现代服饰，日式动漫"

# 逐将辨识锚点：定位只决定"气质档位"，这三样才决定"这是谁"（脸/武器/主色）
HERO_LOOK = {
    "姜维": ("少年英气、眉清目朗、无须", "银蓝山文甲配白羽披风", "#3E5C7A", "亮银枪"),
    "赵云": ("面如冠玉、目若朗星、薄须", "白袍银甲、龙纹护肩", "#D8DCE3", "龙胆亮银枪"),
    "关羽": ("丹凤眼、卧蚕眉、三尺长髯垂胸", "绿袍罩柳叶甲，兽面护心镜", "#2E5B3A", "青龙偃月刀"),
    "张辽": ("剑眉锐目、短须、面有风霜", "银白鱼鳞甲配紫罗披风", "#5A5F6B", "长柄钩镰枪"),
    "孙坚": ("额缠赤巾、虬髯、虎目", "古铜札甲，虎纹护腰", "#8A5A2B", "古锭刀与虎头盾"),
    "曹操": ("细长鹰目、短髯、神情阴沉", "黑金错银甲，玄色大氅", "#1E2230", "倚天剑"),
    "邓艾": ("面容清瘦、蹙眉、鬓角斑白", "粗布褐甲，绳结束腰", "#6E5B45", "短柄矛"),
    "孙策": ("浓眉豹眼、朗笑带狂气", "赤金兽面甲配猩红披风", "#A8322A", "霸王长枪"),
    "周瑜": ("眉目清俊、唇线薄、无须", "银灰鱼鳞甲配靛青战袍", "#3C4F6B", "长剑与古琴"),
    "吕蒙": ("阔面重眉、短须", "墨绿札甲、皮护臂", "#3F4B3A", "环首长刀"),
    "陆逊": ("清秀少年相、目光锐利", "素白文士甲、青绦束发", "#7A8B99", "吴钩与白羽扇"),
    "孙权": ("紫髯碧眼、方脸", "紫金细铠、玉带", "#5B2F6B", "双股剑"),
    "曹仁": ("面阔鼻直、络腮短须", "重装玄甲、铁面护颈", "#2B2F38", "大刀与巨盾"),
    "陆抗": ("清癯、长眉、素须", "青灰细鳞甲", "#4A5A5A", "长剑"),
    "司马懿": ("高颧深目、阴鸷、三绺长须", "墨色鹤氅覆玄甲", "#24262E", "羽扇与佩剑"),
    "郝昭": ("面色黝黑、短须、坚毅", "土黄守城甲", "#6B5A3F", "长槊与守城盾"),
    "诸葛亮": ("眉目疏朗、面如冠玉、三绺须", "白羽鹤氅、纶巾", "#E8E4D8", "白羽扇"),
    "庞德": ("赤面虬髯、怒目", "赤褐重甲、白袍衬里", "#7A2A20", "长柄大刀"),
    "太史慈": ("长身猿臂、浓眉、微须", "青铜兽面甲", "#4E5E3A", "双戟"),
    "鲁肃": ("面圆体厚、温厚之相", "深青文官袍配轻甲", "#33505B", "竹简与长剑"),
    "夏侯惇": ("一目缠布、虬髯", "黑铁重甲", "#2E2620", "长柄大刀"),
    "程普": ("鬓发斑白、面容沉稳", "江东赤色旧甲", "#7A3A2E", "铁脊蛇矛"),
    "陈泰": ("清瘦、眉细、短须", "灰蓝军甲", "#4C5866", "长枪"),
    "庞统": ("浓眉短髯、面貌粗豪", "褐布道袍配皮甲", "#6A5233", "铁鞭与竹简"),
    "黄忠": ("白发白须、筋骨强健", "苍青老甲、红缨", "#556B5A", "大刀与强弓"),
    "徐晃": ("面方、短须、沉毅", "玄铁重甲", "#33383F", "开山大斧"),
    "徐庶": ("清瘦儒雅、布巾束发", "素青布衣配皮甲", "#4B5F5A", "长剑与竹简"),
    "朱桓": ("短须、目有锐气", "吴军朱红甲", "#8A3B2B", "长枪"),
    "王双": ("面黑体壮、虬髯", "铁甲加骨饰", "#3A3630", "流星锤"),
    "严颜": ("白须、面皱而威严", "蜀中老甲", "#5F4B33", "大刀"),
    "李严": ("眉眼精明、短须", "灰绿军甲", "#4A5A44", "长枪"),
    "刘备": ("双耳垂肩、面如冠玉、微须", "黄龙纹甲配赤袍", "#B0752F", "双股剑"),
    "李典": ("面白清瘦、目光沉静", "青灰札甲", "#4F5B63", "长枪"),
    "张郃": ("眉细目长、机敏之相", "紫褐巧变甲", "#5A3E52", "长枪"),
    "诸葛诞": ("面容方正、短须", "深灰重甲", "#3E4248", "长戟"),
    "全琮": ("面圆、含笑意、短须", "吴军青灰甲", "#46605C", "长刀"),
    "王浚": ("长须文相、目光深远", "儒将青袍覆甲", "#3F4E62", "楼船令旗与长剑"),
    "马谡": ("面白俊秀、目有才气", "素银轻甲", "#8A8F96", "长剑与兵书"),
    "甘宁": ("面黑、耳戴环、锦帆之豪", "锦缎战袍配铜甲", "#A8452A", "铁链与短刀"),
    "关兴": ("面如重枣、目有神、短须", "绿甲配赤缨", "#3A6B45", "短柄青龙刀与强弓"),
}

# 定位 → 气质与甲胄语言（与 03 §3.9 的笔触分级一致：主将更概括、对比更强）
ARCH = {
    "猛将": ("体魄雄壮、虬髯怒目、气势逼人", "重甲兽面吞头铠", "#8C2B24", "长柄大刀"),
    "谋士": ("清瘦沉稳、目光内敛、羽扇轻摇", "深青文士袍配皮护腕", "#2F4A5A", "羽扇与竹简"),
    "帅才": ("身形挺拔、眉目疏朗、不怒自威", "玄色鱼鳞甲配朱红披风", "#3A3F4B", "令旗与佩剑"),
    "战将": ("精悍干练、面带风霜", "札甲配皮甲裙", "#6B4A2F", "长枪"),
    "偏将": ("面庞敦厚、神情谨慎", "半身札甲配布巾", "#5A5348", "环首刀"),
}


def archetype(wuli, zhili):
    if wuli >= 90 and zhili < 70:
        return "猛将"
    if zhili >= 90 and wuli < 70:
        return "谋士"
    if wuli >= 85 and zhili >= 85:
        return "帅才"
    if wuli >= zhili:
        return "战将"
    return "偏将"


def load_heroes(top):
    data = json.load(open(XLS, encoding="utf-8"))
    rows = data["rows"] if isinstance(data, dict) else data
    heroes = []
    for r in rows:
        try:
            name = str(r[1]).strip()
            wuli = int(float(r[2]))
            zhili = int(float(r[3]))
        except (ValueError, TypeError, IndexError):
            continue
        if not name or name in ("姓名", "nan"):
            continue
        heroes.append({"name": name, "wuli": wuli, "zhili": zhili})
    seen, uniq = set(), []
    for h in heroes:
        if h["name"] in seen:
            continue
        seen.add(h["name"])
        uniq.append(h)
    uniq.sort(key=lambda h: -(h["wuli"] + h["zhili"]))
    return uniq[:top]


# ---- 未手写锚点的 360 人：按"定位 + 名字哈希"派生确定性锚点 ----
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


# 兵器按身份收窄：谋士不能扛大刀，猛将不该拿羽扇。
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
        feel, armor, color, prop = derive_look(h["name"], arch)
    return ("三国时期{arch}「{name}」的竖屏游戏立绘，半身像，单人，{feel}，身披{armor}，"
            "主色 {color}，手持{prop}，神情与身份相符，头部上方留出 8% 空白。{style}").format(
        arch=arch, name=h["name"], feel=feel, armor=armor, color=color, prop=prop, style=STYLE)


SOLDIERS = [
    ("M1", "朴刀兵", "近战步兵，横刀，蓝色布甲配皮护腕，头戴笠帽"),
    ("MF", "弓箭兵", "远程弓兵，长弓与箭囊，蓝色轻甲，头戴巾帻"),
    ("MB", "弩兵", "远程弩兵，弩机与腰囊，蓝色札甲"),
    ("MC", "长枪兵", "近战枪兵，长枪，蓝色布甲"),
]

VIEWS = {
    "front": "正视图：从正前方看，能看见脸与胸前甲片",
    "back": "背视图：从正后方看，看不见脸，只能看见后脑与背甲",
}


def soldier_jobs():
    jobs = []
    for code, cname, desc in SOLDIERS:
        for view, vdesc in VIEWS.items():
            jobs.append({
                "id": "soldier_%s_%s" % (code, view),
                "kind": "t2i", "width": 512, "height": 768, "steps": 24, "cfg": 3.0,
                "seed": 900 + len(jobs),
                "prompt": "三国时期士兵全身概念图，{desc}，{vdesc}，浅灰纯色背景，全身站姿，单人。{style}".format(
                    desc=desc, vdesc=vdesc, style=STYLE),
                "negative": NEG,
            })
    return jobs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", default="hero", choices=["hero", "soldier"])
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed0", type=int, default=1101)
    a = ap.parse_args()

    if a.kind == "soldier":
        jobs = soldier_jobs()
        header = ["id", "kind", "prompt", "negative", "width", "height", "seed", "steps", "cfg", "length", "image"]
        with open(a.out, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=header)
            w.writeheader()
            for j in jobs:
                w.writerow({k: j.get(k, "") for k in header})
        print("写出 %d 条 → %s" % (len(jobs), a.out))
        return 0

    heroes = load_heroes(a.top)
    if not heroes:
        print("没读到武将，检查 %s" % XLS, file=sys.stderr)
        return 1
    header = ["id", "kind", "prompt", "negative", "width", "height", "seed", "steps", "cfg", "length", "image"]
    with open(a.out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        for i, h in enumerate(heroes):
            w.writerow({
                "id": "hero_%s" % h["name"], "kind": "t2i",
                "prompt": hero_prompt(h, i), "negative": NEG,
                "width": 832, "height": 1216, "seed": a.seed0 + i, "steps": 20, "cfg": 3.0,
                "length": "", "image": "",
            })
    print("写出 %d 条 → %s" % (len(heroes), a.out))
    for h in heroes[:5]:
        print("  %s %d/%d → %s" % (h["name"], h["wuli"], h["zhili"], archetype(h["wuli"], h["zhili"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
