# -*- coding: utf-8 -*-
"""从 extract/json/*.json 生成 docs/03*.md（表格由数据生成，避免手抄出错）。

用法：python tools/gen_docs.py
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter, OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_ini import write_text          # noqa: E402
from tables_common import OUT, DOC       # noqa: E402


def L(name):
    with open(os.path.join(OUT, name), encoding="utf-8") as f:
        return json.load(f)


def tbl(headers, rows):
    out = ["| " + " | ".join(headers) + " |",
           "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        out.append("| " + " | ".join("" if c is None else str(c) for c in r) + " |")
    return "\n".join(out)


def code(text, lang=""):
    return "```" + lang + "\n" + text.rstrip("\n") + "\n```"


def clean(s):
    return ("" if s is None else str(s)).replace("\t", " ").replace("|", "\\|")


SUMMARY = L("summary.json")
MAGIC = L("magic.json")
THINGS = L("things.json")
SANGO = L("sango.json")
MESSAGE = L("message.json")
COMBINE = L("combine.json")
TIMES = [L(f"times{i}.json") for i in range(1, 6)]
MAGICS = [e for e in MAGIC["entries"] if e["kind"] == "magic"]
WISES = [e for e in MAGIC["entries"] if e["kind"] == "wise"]
CC = SUMMARY["cross_checks"]


# --------------------------------------------------------------------------
def doc_overview():
    rows = []
    for f in SUMMARY["files"]:
        grp = f["section_groups"]
        gtxt = "、".join(f"{k}×{v}" for k, v in grp.items()) if len(grp) <= 6 else f"{len(grp)} 组"
        rows.append([f"`{f['file']}`", f"{f['bytes']:,}", f["lines"], f["sections"],
                     f"{f['field_lines']}", f["encoding"], gtxt, f["purpose"]])
    t = SUMMARY["totals"]

    enc_rows = [
        ["`utf-8-sig`", "失败", "首个中文字节即报错", "不是 UTF-8"],
        ["`gbk` (cp936)", "**失败**",
         "`UnicodeDecodeError: 'gbk' codec can't decode byte 0xa4 in position 106`",
         "任务书中的假设被实测推翻"],
        ["`cp950` (Big5 繁体)", "**成功**", "`A9 D2 C0 F8 B3 5C` → `黃巾賊`", "**实际编码**"],
        ["`big5`", "成功", "与 cp950 结果一致", "同义别名"],
    ]

    rel = """SANGO.INI [SYSTEM].Times01..05 ──> TIMES1..5.INI（五个剧本入口）
SANGO.INI [ITEM] ────────────────> TIMES.General.Weapon / Horse / Thing（按名字引用）
SANGO.INI [FONTS01..07] ─────────> SANGO.20 / SANGO.15 / SANGO.IDX / MINGASC.20 / OLDASC.15
SANGO.INI [TERRAIN] ─────────────> SHAPE\\BG\\*（图层）
TIMES.General.SKILL / WISESKILL ─> MAGIC.INI 的 [MAGIC]×110 / [WISE]×67（按顺序号）
TIMES.General.FACE ──────────────> SHAPE\\FACE\\FACE001..400.SHP（1:1 编号）
TIMES.General.Force ─────────────> THINGS 兵种（13 个，Sequence 100..112）
MAGIC.SCRIPT ────────────────────> SCRIPT\\MAGIC.SO（501..610 共 110 个脚本入口）
THINGS 动画序列（图形名）────────> SHAPE\\<Directory>\\<图形名>.SHP（34220 处引用）
THINGS 动画里的 !nnnn ───────────> SCRIPT\\MAGIC.SO 的脚本号（15 处）
COMBINE.INI [SHAPE] ─────────────> SHAPE\\FACE\\FACE001..004（拼一张 192×192 测试图）"""

    cross_rows = [
        ["THINGS 图形名 ↔ 磁盘文件", "34220 处图形引用逐个核对文件是否存在",
         f"{CC['shape_match']['found']}/{CC['shape_match']['refs']}"
         f"（{CC['shape_match']['rate']*100:.2f}%）",
         "真实物件 100% 命中；25 处缺失全在两段非运行数据上"],
        ["TIMES FACE ↔ SHAPE\\FACE", "401 名武将的 FACE 字段逐个核对文件",
         f"{CC['face_match']['hit']}/{CC['face_match']['generals_per_times']} = 100%（五份剧本同）",
         f"FACE001..400 共 {CC['face_match']['files_in_SHAPE_FACE']} 个文件；模板段复用 FACE001"],
        ["MAGIC.SCRIPT ↔ MAGIC.SO", "脚本号范围 + 与武将 SKILL 编号空间互证",
         f"{CC['magic_script']['script_min']}..{CC['magic_script']['script_max']} 连续 "
         f"{CC['magic_script']['script_distinct']} 个",
         f"{CC['magic_script']['magic_so_bytes']:,}B / 110 ≈ {CC['magic_script']['avg_bytes_per_script']:.0f}B 每脚本"],
        ["书籍加智力 ↔ 修正版说明", "SANGO.INI [ITEM] 的 INT 与 Description 比对",
         "7 / 10 / 13 / 17 / 20 全对",
         "说明文档的 7-10-13-17-20 就是**数据表内**的设定值"],
        ["兵符位掩码 ↔ THINGS 兵种", "13 个兵符 Force 与 Sequence 100..112 对位",
         "13/13 全对", "Force = 1<<k，顺序完全一致"],
        ["GENERAL.CITY ↔ POS 槽位", "CITY 与 POS 第 N 个空格槽比对（N=剧本号）",
         "1999/2001（T5 两例例外）", "司馬昭、司馬師 POS 第 5 槽=許昌 而 CITY=鄴"],
        ["等级/体力上限 ↔ 说明文档", "初始 BaseHP/BaseMP 与 99 / 32767 对照",
         "初始值 ≤ 99，全表无 32767", "32767 是运行时上限，表内只存初始值，二者不矛盾"],
    ]

    sc = CC["structure_constants"]
    const_rows = [
        ["`SANGO.INI [SYSTEM] TotalThings`", sc["SANGO.TotalThings"], sc["actual_items"], "物品数组容量"],
        ["`THINGS.INI [SYSTEM] TotalObjectDefine`", sc["THINGS.TotalObjectDefine"],
         sc["actual_objects"], "物件定义容量（小于实际，更说明不是计数）"],
        ["`TIMES*.INI TotalGeneral`", sc["TIMES.TotalGeneral"], sc["actual_generals"], "武将数组容量"],
        ["`TIMES*.INI TotalCity`", sc["TIMES.TotalCity"], sc["actual_cities"], "城池数组容量"],
        ["`TIMES*.INI TotalKing`", "15/19/9/9/6", "15/19/9/9/6", "**真计数**，与实存君主段相等"],
    ]

    un_rows = [[i + 1, clean(u)] for i, u in enumerate(SUMMARY["unresolved"])]
    find_rows = [[i + 1, clean(f)] for i, f in enumerate(SUMMARY["findings"])]

    api = ('from parse_ini import IniFile, write_json\n'
           '\n'
           'ini = IniFile.load(r"F:\\sanguo\\extract\\pak\\THINGS.INI")   # 自动探测 cp950\n'
           'print(ini.encoding, ini.stats()["sections"])                 # cp950 623\n'
           '\n'
           'sec = ini.sections[1]          # [DEFINE]\n'
           'sec.get("TYPE_MAJOR")          # "4"\n'
           'sec.getall("File")             # 同键多值全部取出\n'
           'sec.num("TotalObjectDefine")   # 数字（支持 0x 前缀）\n'
           '\n'
           'objs = ini.all("OBJECT")       # 同名段全部（620 个）\n'
           'grp = ini.prefix_groups()      # {"KING": 19, "CITY": 60, ...}\n'
           'write_json(r"F:\\sanguo\\extract\\json\\x.json", ini.to_dict())')

    json_rows = [
        ["`combine.json`", "4 条 SHAPE + 坐标解算 + 27388 字节空格填充分析"],
        ["`magic.json`", "177 条技能全字段 + 7 类分类 + 分布 + MAGIC.SO 脚本核对"],
        ["`message.json`", "524 条文本 + 10 个号段 + 格式码/尾码 + 数据缺陷"],
        ["`sango.json`", "SYSTEM/FONTS×7/TERRAIN×12/[SCRIPT]/ITEM×77 全量"],
        ["`things.json`", "621 段物件全量 + 动画 token 化 + DEFINE 常量 + 图形核对"],
        ["`times1-5.json`", "五剧本 KING/CITY/PATH/GENERAL 全量 + 34 项统计"],
        ["`summary.json`", "本文件的全部数字 + 8 项交叉验证 + 8 条未确定"],
    ]

    md = f"""# 03 数据表总览：三国群英传2（1999，宇峻奥汀）的 10 个 INI

> 本文档由 `tools/gen_docs.py` 从 `extract/json/*.json` 生成，所有数字都是解析实测值。
> 解析器 `tools/parse_ini.py`（通用 INI→dict，自动编码探测）；各表导出脚本 `tools/export_*.py`。

## 0. 一句话结论

PAK 内 10 个 INI 共 **{t['bytes']:,} 字节 / {t['lines']:,} 行 / {t['sections']:,} 段 / {t['field_lines']:,} 个字段行**，
构成一套完整的"数据驱动"配置：技能表决定战斗、物件表决定一切图形与动作、
剧本表决定五个时代的武将与城池、物品表决定成长曲线、文本表决定全部对白。

## 1. 编码：实测不是 GBK，而是 Big5（cp950）

任务书假设"INI 都是 GBK(936)"，实测**全部失败**：

{tbl(['编码尝试', '结果', '证据', '说明'], enc_rows)}

- 受影响文件：MAGIC / MESSAGE / SANGO / THINGS / TIMES1-5。
- 例外：`COMBINE.INI` 是纯 ASCII（只有坐标与路径）。
- 判据不止"能解码"：cp950 解出的中文在游戏语境里全部成立
  （`黃巾賊`、`命療術`、`主將L1 (主體) - 劍`、`群雄割據`），gbk 解出的是乱码。
- **原始编码 cp950，需转简体**：本项目文档统一用繁体原文引用字段值，
  正文用简体叙述。若要把数据转简体，注意 `後/后`、`鍾/钟`、`臺/台` 一类一对多映射，
  建议 Big5→Unicode 后再走 opencc `t2s`，不要用 gb18030 往返（会丢字）。
- `tools/parse_ini.py` 因此按 `utf-8-sig → gbk → cp950 → big5 → latin-1` 顺序试解，
  并用"可疑字符惩罚"（西里尔/希腊/制表符/私用区得分高）挑最像中文的那次结果。

## 2. 十个文件总表

{tbl(['文件', '字节', '行', '段', '字段行', '编码', '段分组', '用途'], rows)}

合计：**{t['bytes']:,} 字节**，{t['lines']:,} 行，{t['sections']} 段，{t['field_lines']:,} 个字段行。

## 3. 表间引用关系

{code(rel)}

这张图解释了"为什么字段含义可以确定"：几乎每个字段都能在另一张表里找到对应物。
本项目的字段结论优先采用"有对应物"的推定，其余明确标注**推测**。

## 4. 交叉验证汇总（7 项，另有结构常量见第 5 节）

{tbl(['检查项', '方法', '结果', '结论'], cross_rows)}

## 5. 陷阱：四个 `Total*` 常量不是计数

{tbl(['常量', '值', '实际条目', '判定'], const_rows)}

读表时若拿 `TotalGeneral=512` 去遍历数组会越界；真正的条目数只能数段。

## 6. 七条关键结论

{tbl(['#', '结论'], find_rows)}

## 7. 未确定字段 / 未解问题总清单

{tbl(['#', '项目'], un_rows)}

## 8. 怎么用这批数据

{code(api, 'python')}

### 8.1 JSON 产物

{tbl(['JSON', '内容'], json_rows)}

## 9. 配套文档

- `docs/03a-武将技表MAGIC.md` —— 177 个技能全字段、分类、分布、典型样例
- `docs/03b-物件表THINGS.md` —— 621 段物件、字段字典、动画序列语法、兵种表
- `docs/03c-剧本武将城池TIMES.md` —— 五剧本对照、武将/城池字段、数值分布、抽样全字段
- `docs/03d-文本与配置.md` —— MESSAGE 全表、SANGO（字形/物品/地形）、COMBINE
"""
    write_text(os.path.join(DOC, "03-数据表总览.md"), md)
    print("[doc] 03-数据表总览.md")


# --------------------------------------------------------------------------
def doc_magic():
    st = MAGIC["stats"]
    mp, pw, at = st["mp"], st["power"], st["attack"]
    wl, ex = st["wise_level_value"], st["execute"]
    grade = st["grade"]["top"]
    cls = MAGIC["classification"]["counts"]["top"]

    # ATTRIB 词频：武将技 / 军师技 分开统计
    tag_m = Counter()
    for e in MAGICS:
        tag_m.update(e["attrib_tags"])
    tag_w = Counter()
    for e in WISES:
        tag_w.update(e["attrib_tags"])
    # ACTIVE 掩码
    mask_c = Counter(e["active_mask"] for e in MAGIC["entries"])
    alias = {}
    for e in MAGIC["entries"]:
        if e["active"] and not str(e["active"]).isdigit():
            alias[str(e["active"])] = e["active_mask"]

    def bits(n):
        names = [(1, "我方士兵"), (2, "我方主将"), (4, "敌方士兵"), (8, "敌方主将")]
        if n is None:
            return "—"
        got = [nm for b, nm in names if n & b]
        return "+".join(got) or "0"

    mask_rows = [[m, f"0x{m:X}" if m is not None else "—", bits(m), mask_c.get(m, 0)]
                 for m in sorted(mask_c)]
    alias_rows = [[k, v, bits(v)] for k, v in sorted(alias.items(), key=lambda x: x[1])]

    magic_rows = [[e["sequence"], clean(e["name"]), e["mp"], e["power"], e["attack"],
                   e["script"], clean(e["attrib"]), clean(e["title"]) or "—", e["grade"],
                   clean(e["active"]), clean(e["note_text"]), e["category"]]
                  for e in MAGICS]
    wise_rows = [[e["sequence"], clean(e["name"]), e["level"], e["level_div10"],
                  e["wise_level"], e["execute"], clean(e["attrib"]),
                  "、".join(bits(b) for b in [e["active_mask"]]), e["category"]]
                 for e in WISES]

    by_name = OrderedDict()
    for e in WISES:
        by_name.setdefault(e["name"], []).append(e)
    multi = [(k, v) for k, v in by_name.items() if len(v) > 1]
    multi_rows = [[clean(k), " / ".join(str(x["level"]) for x in v),
                   " / ".join(str(x["wise_level"]) for x in v),
                   " / ".join(str(x["execute"]) for x in v)] for k, v in multi]

    ex_txt = []
    for e in [x for x in MAGICS if x["sequence"] in (1, 2, 3, 4)]:
        ex_txt.append(f"# 表内第 {e['sequence']} 条（源文件第 {e['lineno']} 行）\n"
                      f"[MAGIC]\nSEQUENCE = {e['sequence']}\nNAME = {e['name']}\nMP = {e['mp']}\n"
                      f"POWER = {e['power']}\nATTACK = {e['attack']}\nSCRIPT = {e['script']}\n"
                      f"ATTRIB = {e['attrib']}\nTITLE = {e['title']}\nNOTE = {e['note']}\n"
                      f"ACTIVE = {e['active']}")
    for e in [x for x in WISES if x["name"] == "鼓舞士氣"]:
        ex_txt.append(f"# 军师技（源文件第 {e['lineno']} 行）\n[WISE]\nSEQUENCE = {e['sequence']}\n"
                      f"NAME = {e['name']}\nLevel = {e['level']}\nWiseLevel = {e['wise_level']}\n"
                      f"Execute = {e['execute']}\nATTRIB = {e['attrib']}\nACTIVE = {e['active']}")

    l5 = next((e for e in MAGICS if e["grade"] == "L5"), None)

    field_magic = [
        ["`SEQUENCE`", "技能编号", "1..110 连续", "与武将表 SKILL 第二列、MAGIC.SO 脚本数互证"],
        ["`NAME`", "技能名", "110 个互不重复", "中文，直接显示"],
        ["`MP`", "消耗技力", f"{mp['min']}..{mp['max']}，{mp['distinct']} 个不同值",
         f"均值 {mp['mean']:.2f}、中位 {mp['median']:.1f}；与武将表 BaseMP 同量纲（34..99 的初始技力池）"],
        ["`POWER`", "威力（推测）", "**恒为 100**", "110 条全同 → 不是可变参数"],
        ["`ATTACK`", "攻击力", f"{at['min']}..{at['max']}，{at['distinct']} 个不同值",
         f"均值 {at['mean']:.2f}；0 值常见（纯治疗/纯召唤类）"],
        ["`SCRIPT`", "MAGIC.SO 脚本号", f"{MAGIC['script_check']['script_min']}.."
         f"{MAGIC['script_check']['script_max']} 连续、110 个各不相同",
         "每个武将技一个入口；表序 ≠ 脚本号序（按开发顺序分配）"],
        ["`ATTRIB`", "目标/效果自由标签", "、".join(sorted(set(t for t in tag_m if not t.isdigit()))),
         "自由中文串，可含多个标签（逗号分隔）"],
        ["`TITLE`", "授予称号", f"填充 {st['title_filled']} 条 / 空 {st['title_empty']} 条",
         "如 博士/議郎；武将习得该技后获得的官衔（推测）"],
        ["`NOTE`", "注释", "格式「说明,等级」如 `主將補血,L1`", "唯一带 L1..L5 的地方"],
        ["`ACTIVE`", "作用对象位掩码", "1/2/4/8 及其组合", "见 2.3，4 位含义可反解"],
    ]
    field_wise = [
        ["`SEQUENCE`", "军师技编号", "1..67 连续", "与武将表 WISESKILL 第二列互证"],
        ["`NAME`", "技能名", f"67 条 / {len(multi)} 组重名", "重名 = 同一技能的多档版本"],
        ["`Level`", "习得等级 × 10", f"{wl['min']}..{wl['max']}，步进 10，单调不减",
         f"÷10 得 {wl['min']//10}..{wl['max']//10} 级；同技多档时递增"],
        ["`WiseLevel`", "档位", "0/1/2/3", "第几档强化版本，与 Level 同向递增"],
        ["`Execute`", "效果/脚本索引（推测）",
         f"{ex['min']}..{ex['max']}，**{ex['distinct']} 个值恰好把 1..{ex['max']} 用尽一次**",
         "67 条技能恰好是 1..67 的一个排列 → 更像索引而非消耗（消耗不会恰好无重复用尽）"],
        ["`ATTRIB`", "目标码", "纯数字 " + "/".join(f"{k}({v})" for k, v in tag_w.most_common()),
         "军师技侧退化为数字码，含义未定"],
        ["`ACTIVE`", "作用对象码", "1/2/4/8/12/15 等", "与武将技同一套位掩码"],
    ]

    md = f"""# 03a 武将技表 MAGIC.INI

> 源文件：`extract\\pak\\MAGIC.INI`，{MAGIC['bytes']:,} 字节 / {MAGIC['lines']} 行 /
> {MAGIC['sections']} 段，编码 **cp950(Big5)**。JSON：`extract/json/magic.json`。

## 1. 一个文件里装了两张表

{tbl(['段名', '数量', '字段数', '含义'], [
    ["`[MAGIC]`", MAGIC["magic_count"], 10, "武将技（武将在战场上消耗技力施放）"],
    ["`[WISE]`", MAGIC["wise_count"], 7, "军师技（随军军师提供的被动/战术加成）"],
])}

合计 **{MAGIC['magic_count'] + MAGIC['wise_count']} 条技能**。两类段字段完全不同（10 vs 7），
必须分开解析；用同一套字段签名去读会把军师技读成残缺的武将技。

字段签名（官方原样）：

{code(json.dumps(MAGIC['field_sets'], ensure_ascii=False, indent=1), 'json')}

## 2. 字段详解

### 2.1 `[MAGIC]` 武将技（10 字段）

{tbl(['字段', '含义', '取值域（实测）', '判读依据'], field_magic)}

### 2.2 `[WISE]` 军师技（7 字段）

{tbl(['字段', '含义', '取值域（实测）', '判读依据'], field_wise)}

### 2.3 `ACTIVE` 位掩码的还原

全表 177 条技能用到的位组合：

{tbl(['掩码', '十六进制', '位分解', '条数'], mask_rows)}

中文写法与数值的对应（只能按"能整除出 1/2/4/8"这一套唯一解）：

{tbl(['中文写法', '掩码', '位分解'], alias_rows)}

四位含义 = **我方士兵 / 我方主将 / 敌方士兵 / 敌方主将**。证据：数字写法只出现
1/2/4/8 及其组合；`敵方全軍`=12、`敵我全軍`=15、`敵我士兵`=5 都恰好是这套位的和。

## 3. 分类统计（7 类）

规则（写进 `magic.json.classification.rules`，按顺序命中）：

{code(chr(10).join(MAGIC['classification']['rules']))}

{tbl(['分类', '条数'], [[c['value'], c['n']] for c in cls])}

## 4. 数值分布

{tbl(['指标', '样本', '最小', '最大', '均值', '中位', '不同值数'], [
    ["武将技 MP（技力消耗）", mp["count"], mp["min"], mp["max"], f"{mp['mean']:.2f}", mp["median"], mp["distinct"]],
    ["武将技 POWER", pw["count"], pw["min"], pw["max"], f"{pw['mean']:.1f}", pw["median"], pw["distinct"]],
    ["武将技 ATTACK", at["count"], at["min"], at["max"], f"{at['mean']:.2f}", at["median"], at["distinct"]],
    ["军师技 Level", wl["count"], wl["min"], wl["max"], f"{wl['mean']:.2f}", wl["median"], wl["distinct"]],
    ["军师技 Execute", ex["count"], ex["min"], ex["max"], f"{ex['mean']:.2f}", ex["median"], ex["distinct"]],
])}

**军师技 `Execute` 是一个排列，不是消耗值**：67 个值排序后恰好等于 `1,2,…,67`
（每值出现一次、无重复无缺口）。如果它是"技力消耗"，67 条技能把 1..67 各用一次
的概率极低 → 更可能是另一张表的索引（效果/脚本号），**`[WISE]` 段里根本没有消耗字段**（推测）。
另一条佐证：同一技能的三档 `Execute` 是**连号**的（鼓舞士氣 4/5/6、降敵士氣 1/2/3、
恢復體力 35/36/37、減緩集氣 65/66/67），说明它指向按「技能家族」顺序排布的脚本/效果表。

**ATTACK 的全部 22 个取值**：`{', '.join(str(v) for v in at['values'])}`
—— 明显是"5 的倍数 + 零头"，最大 60，说明伤害是分段档位而不是连续值。

**技能等级（NOTE 尾码 L1..L5）**：

{tbl(['等级', '条数'], [[g['value'], g['n']] for g in grade])}

L5 只有 1 条 —— 全表唯一的 L5 是 `{l5['name'] if l5 else '?'}`
（NOTE = `{l5['note'] if l5 else '?'}`，MP={l5['mp'] if l5 else '?'}，ATTACK={l5['attack'] if l5 else '?'}），
它是"最高级武将技"的独苗，可作为新游戏技能分级的参考锚点。

**武将技 ATTRIB 词频**（同一技能可含多个标签，共 {st['attrib_tags']['count']} 个标签实例）：

{tbl(['标签', '次数'], [[k, v] for k, v in tag_m.most_common()])}

## 5. 110 个武将技全表

列：序列=表内 SEQUENCE；技力=MP；威力=POWER；攻=ATTACK；脚本=MAGIC.SO 脚本号；
等级=NOTE 尾码；目标=ACTIVE；分类=按第 3 节规则。

{tbl(['序列', '技能名', '技力', '威力', '攻', '脚本', 'ATTRIB', '称号', '等级', '目标', 'NOTE 说明', '分类'], magic_rows)}

## 6. 67 个军师技全表

{tbl(['序列', '技能名', 'Level', '等级(÷10)', '档位', 'Execute', 'ATTRIB', '目标', '分类'], wise_rows)}

### 6.1 同一军师技的多档版本（{len(multi)} 组）

{tbl(['技能名', 'Level 序列', '档位序列', 'Execute 序列'], multi_rows)}

这就是"军师技随等级变强"的实现方式：不是运行时算加成，而是**同一技能写多条**，
按 `Level` 门槛逐档解锁。

## 7. 真实样例行（原文，未删节）

{code(chr(10).join(ex_txt))}

## 8. 与其他表的交叉验证

{tbl(['检查', '数据', '结论'], [
    ["脚本号连续性", f"SCRIPT = {MAGIC['script_check']['script_min']}.."
     f"{MAGIC['script_check']['script_max']}，{MAGIC['script_check']['script_id_count']} 个不同值",
     "110 个武将技 ↔ 110 个脚本入口，无缺口无复用"],
    ["脚本体积", f"MAGIC.SO = {MAGIC['script_check']['script_so_bytes']:,} B",
     f"平均 {MAGIC['script_check']['bytes_per_script']:.1f} B/脚本，量级合理"],
    ["武将 SKILL 编号空间", f"第二列最大值 = {CC['magic_script']['skill_id_max_in_generals']}",
     "= 武将技总数 110，证明该列是**本表顺序号**"],
    ["武将 WISESKILL 编号空间", f"第二列最大值 = {CC['magic_script']['wise_id_max_in_generals']}",
     "= 军师技总数 67，同上"],
    ["等级上限", "武将 SKILL 第一列最大 41（等级）", "远低于 99 级上限；41 级后不再有新技能"],
    ["修版说明 #5 恢复技力", "说明称修正为 30-50-70（原版 30-30-70）",
     "该数值不在这张表里（在 EXE 或脚本内），属数据侧无法核实项"],
])}

## 9. 未确定（标注为推测）

{tbl(['字段', '现状', '推测与依据'], [
    ["`POWER`", "110 条全为 100", "像伤害基数/百分比定标（100%=满），而非每技不同的威力值"],
    ["`ATTRIB`", "自由中文标签（全體/主將/主將2/主將3/四周/中間/補兵/兩側/補血）",
     "引擎据此选目标组；`主將` 与 `主將2`/`主將3` 的差别未定（推测为第几号目标）"],
    ["`TITLE`", f"{st['title_empty']} 条为空", "习得后授予的官衔，未在其它表出现，无法交叉验证"],
    ["军师技 `ATTRIB`", f"纯数字 0..3（0 占 {tag_w.most_common(1)[0][1]} 条）", "与武将技中文标签不同源，无法从数据侧反解"],
    ["军师技 `Execute`", f"{ex['min']}..{ex['max']}，{ex['distinct']} 个值互不重复（= 1..{ex['max']} 的排列）",
     "更像另一张表的索引（效果/脚本号）；若当消耗用则无法解释「恰好用尽且不重复」"],
    ["`NOTE` 的 L 等级", "L1..L5 只出现在 NOTE 文本里", "等级没有独立字段，引擎靠解析 NOTE 尾码取等级（推测）"],
])}
"""
    write_text(os.path.join(DOC, "03a-武将技表MAGIC.md"), md)
    print("[doc] 03a-武将技表MAGIC.md")


# --------------------------------------------------------------------------
def doc_things():
    d = THINGS["define"]
    cnt = THINGS["counts"]
    ccx = THINGS["cross_checks"]
    obj = THINGS["objects"]
    soldiers = THINGS["soldiers"]
    tmpl = THINGS["field_template"]

    type_rows = [[f"`{k}`", v] for k, v in d["type_map"].items()]
    proc_rows = [[f"`{k}`", v] for k, v in sorted(d["process_map"].items(), key=lambda x: x[1])]
    flag_rows = [[f"`{k}`", f"0x{v:X}", cnt["flag_usage"].get(k, 0)] for k, v in d["flags"].items()]
    act_rows = [[f"`{k}`", f"0x{v:X}"] for k, v in d["actions"].items()]
    cat_rows = [[c["value"], c["n"]] for c in cnt["by_category"]["top"]]

    # 各分类的编号区间
    rng = {}
    for o in obj:
        if o["no_canonical"] is None:
            continue
        a = rng.setdefault(o["category"], [10 ** 9, 0, 0])
        a[0] = min(a[0], o["no_canonical"])
        a[1] = max(a[1], o["no_canonical"])
        a[2] += 1
    rng_rows = [[clean(k), v[0], v[1], v[2]] for k, v in sorted(rng.items(), key=lambda x: x[1][0])]

    anim_use = {a["value"]: a["n"] for a in cnt["by_anim_field"]["top"]}
    field_rows = []
    for k, v in tmpl["fields"].items():
        if k in ("Name", "Sequence", "Type", "Space", "Flags", "Process", "Directory"):
            continue
        field_rows.append([f"`{k}`", clean(v), anim_use.get(k, 0), "骨架段给出的中文含义"])

    tk = cnt["token_kinds"]
    kw = Counter()
    ev = Counter()
    snd = Counter()
    for o in obj:
        for f, a in o["anims"].items():
            kw.update(a["keywords"])
            ev.update(a["events"])
            snd.update(a["sounds"])
    tok_rows = [
        ["`#n`", tk.get("delay", 0), "帧延时（1..9999，`#9999` 常用作「停在这里」）", "`#16`、`#128`、`#9999`"],
        ["图形名", tk.get("shape", 0), "一帧图形，文件 = `SHAPE\\<Directory>\\<名>.SHP`", "`L1W10001`、`MCA10002`"],
        ["`@%OM_xxx`", tk.get("event", 0), "在该帧向引擎发物件动作事件", "`@%OM_ATTACK`、`@%OM_DEATHSTOP`"],
        ["`$xxx`", tk.get("sound", 0), "播放音效", "`$Hit01`、`$Defense`、`$Horse01`"],
        ["`!nnnn`", tk.get("script", 0), "启动 `SCRIPT\\MAGIC.SO` 中编号 nnnn 的脚本", "`!7005`、`!33002`"],
        ["`SCROVER`", kw.get("SCROVER", 0), "序列到此结束", "动画末尾"],
        ["`NULSHAPE`", kw.get("NULSHAPE", 0), "本帧不画（空图形占位）", "`First = #1, NULSHAPE`"],
    ]
    ev_rows = [[f"`@{e}`", n, f"0x{d['actions'][e]:X}" if e in d["actions"] else "—"]
               for e, n in ev.most_common()]
    snd_rows = [[f"`${s}`", n] for s, n in snd.most_common()]

    script_rows = [[s["no"], clean(s["name"]), f"`{s['field']}`", s["script"]]
                   for s in THINGS["animation_syntax"]["script_marks"]]

    sol_rows = [[s["sequence"], s["no"], clean(s["name"]), s["walk_frames"], s["attack_frames"],
                 s["death_frames"], len(s["anims"]), f"{s['shape_rate']*100:.0f}%"]
                for s in soldiers]

    mdir_rows = [[f"`{k}`", v] for k, v in ccx["magic_dirs"].items()]

    missing_rows = [[m["no"], clean(m["name"]), m["missing"], f"{m['rate']*100:.0f}%"]
                    for m in ccx["objects_with_missing"]]

    all_rows = [[o["obj"] if o["obj"] is not None else "—",
                 o["sequence"] if o["sequence"] is not None else "—",
                 clean(o["name"]), clean(o["type"]) or "—",
                 (o["process_raw"] or "").lstrip("%") or "—",
                 clean(o["directory"]) or "—", o["category"]] for o in obj]

    band_rows = [[clean(b["value"]), b["n"]] for b in cnt["by_band"]["top"]]

    md = f"""# 03b 物件表 THINGS.INI

> 源文件：`extract\\pak\\THINGS.INI`，{THINGS['bytes']:,} 字节 / {THINGS['lines']:,} 行 /
> {THINGS['sections']} 段，编码 **cp950(Big5)**。JSON：`extract/json/things.json`。

这是全项目**信息密度最高**的一张表：兵种、武将造型、武器、马、箭矢、武将技特效、
天气、背景道具全部是"物件"，每个物件靠一段动画序列驱动。

## 1. 段结构与编号空间

{tbl(['段名', '数量', '说明'], [
    ["`[SYSTEM]`", 1, f"`TotalObjectDefine = {THINGS['system']['TotalObjectDefine']}`（容量，不是计数）"],
    ["`[DEFINE]`", 1, "官方自述常量表：类型 / 进程 / 标志位 / 动作码 + 编号分段注释"],
    ["`[OBJECT]`", len(obj) - 1, "正式物件 620 个"],
    ["`[OBJECT2]`", 1, "**测试用物件**（`測試用物件`，Sequence=99），占一个段位但不属于 620"],
])}

### 1.1 编号分段：`[DEFINE]` 自带答案

`[DEFINE]` 里有三行"键是注释、值为空"的记录，就是官方的编号分段说明：

{code(chr(10).join(d['numbering_comments']))}

实测分布（按本文档的**物件编号** = 第几个 `[OBJECT]` 段统计）：

{tbl(['区间', '物件数'], band_rows)}

三段严丝合缝地对上了官方注释：

| 官方注释 | 实测编号 | 内容 | 数量 |
|---|---|---|---|
| `001-099 師團物件` | 1–31 師團与旗帜、32–95 兵种与战马、96–99 箭矢 | 师团级物件 | **99** |
| `100-499 作戰時的物件(兵&主將&武將技&.....)` | 100 预留空段、101–220 主将身体、221–254 武器、255–262 坐骑、263–267 背景、268–499 特效/虚拟/天气 | 战场物件 | **400** |
| `500- Other objects` | 500–620 全为武将技特效 | 其它 | **121** |

`001-099` 恰好收满 99 个、`100` 恰好是一个只写中文说明的空段、`101` 恰好是第一个
主将身体 —— 这三处吻合不可能靠巧合，说明**物件编号 = 第几个 `[OBJECT]` 段**这条规则是对的。

> **一个坑**：中间插了一段 `[OBJECT2]`（`測試用物件`，开发期残留，不占正式编号），
> 所以文件里的**段序号** = 物件编号 + 2（测试段之前）或 + 3（之后）。
> 本文档与 JSON 里 `obj`/`no_canonical` 是物件编号，`no` 是段序号，两者都保留。

### 1.2 TYPE 类型枚举（4 个）

{tbl(['常量', '值'], type_rows)}

`Type` 字段在数据里写作**符号引用** `%TYPE_FORCE` 等，少数段写字面数字。
分布（621 段）：`%TYPE_FORCE` 421、`%TYPE_MAJOR` 162、`%TYPE_BASE` 33（含测试段那 1 个）、
字面 `2` 4 个（早期师团段直接写数字）、空 1 个（骨架段）。

### 1.3 Process（21 种运行时行为）

每个物件挂一个 `Process`，决定引擎用哪个类去跑它 —— 这是"物件类型"的真正枚举：

{tbl(['Process', '值'], proc_rows)}

### 1.4 Flags 物件标志位（23 个常量，含 3 个组合别名）

{tbl(['标志', '位', '实际使用次数'], flag_rows)}

组合别名：`OF_ATTACKENEMY = OF_ENEMYGENERAL|OF_ENEMYFORCE = 0x03000000`、
`OF_ATTACKMY = 0x0C000000`、`OF_ATTACKALL = 0x0F000000`。

写法上 `Flags`（589 段）与 `FLAGS`（31 段）混用；值可以是逗号分隔、加号叠加或纯数字 0。
解析必须大小写不敏感 + 两种分隔符都认。

### 1.5 OM_ 动作码（15 个，动画事件用）

{tbl(['动作', '值'], act_rows)}

## 2. 字段详解：游戏自带的"字段字典段"

`THINGS.INI` 第 **{tmpl['lineno']}** 行有一段 `[OBJECT]`，`Name = 主將L1 (主體)`，
`Sequence`/`Type`/`Space`/`Flags`/`Process`/`Directory` 全空，而每个动画字段的值
**不是图形名，而是中文说明**：

{code(chr(10).join(f"{k} = {clean(v)}" for k, v in tmpl['fields'].items()))}

这是宇峻自己留下的字段字典 —— 下表的动画字段含义**不是推测，是厂商写的**。

### 2.1 公共字段

{tbl(['字段', '含义', '取值/证据'], [
    ["`Name`", "物件名（调试器里显示的名字）", "可带 `\\t` 注释如 `弓箭\\t(射出去的弓箭)`"],
    ["`Sequence`", "**逻辑编号**，与段序号无关", "师团 51-54；旗帜 1-27；兵种 100-172；箭 500-503；主将身体 600-859；武器 700-767；马 900-907；特效 10000+；天气 9994-9996"],
    ["`Type`", "物件大类", "见 1.2"],
    ["`Space`", "四元组 `x,y,w,h`", "实测 `8,8,64,0`（人形）、`4,4,48,0`（师团移动）、`8,8,8,0`（旗帜）"],
    ["`Flags` / `FLAGS`", "标志位组合", "见 1.4"],
    ["`Process`", "运行时行为类", "见 1.3"],
    ["`Directory`", "图形子目录（相对 SHAPE\\）", "`\\MAJOR\\BODY`、`\\Force\\`、`\\magic\\038`（大小写混用）"],
    ["`Life`", "存活时间（**推测**：毫秒）", "仅 16 处：马尸体 `1200`、箭 `2400`；无 Life 的物件不自动消失"],
])}

### 2.2 动画字段（含出现次数）

{tbl(['字段', '官方中文含义', '出现次数', '说明'], field_rows)}

补充（数据侧推断）：

- `Attack2` = "後攻擊"：从 Attack2 起图形名换一位变体位（`L1A6…`/`L1A5…`），
  对应不同武器/攻击方向的动作组。
- `Attack3` = "半月斬"、`Attack4` = "神鬼亂舞"：**专给特定武将技用**，
  印证"主将攻击动画随技能切换"的设计。
- `Attack5` 官方写作 `??`（未实现/预留），但真实数据里 Attack5..Attack8 都有内容，
  说明发售后又扩了动作槽位。
- `Win` = 勝利、`Lose` = 失敗（仅 3 段有 `Lose`，师团专用）。
- 士兵只有 Wait/Walk/Attack/Win/Defense/Pain/Death 7 个动作；主将身体有 22 个。

## 3. 动画序列语法（本表的核心）

动画字段的值是一串 **token**，共 7 类：

{tbl(['token', '出现次数', '含义', '例子'], tok_rows)}

### 3.1 真实样例：主将身体（`主將L1 (主體) - 劍`，Sequence=600）

{code('''Space = 8,8,64,0
Flags = OF_MAN, OF_BIGSHAPE
Process = %ForceMajorObjectProcess
Directory = \\\\MAJOR\\\\BODY
First = #1, NULSHAPE
Wait = L1W10001, #16, L1W10002, #8, L1W10003, #8, L1W10004, #16, L1W10003, #8, L1W10002, #8
Walk = #4, L1R10001, L1R10002, ... L1R10009
Attack = #3, L1A10002, ... L1A10007, @%OM_ATTACK, L1A10008, ... L1A10011, SCROVER
Spell1 = #64, L1L10001, SCROVER
Defense = #8, L1D10002, $Defense, SCROVER
Pain = #4, L1H10002, $Hit01, L1H10002, SCROVER
Death = #5, L1F10001, ... L1F10004, #128, L1F10006, #5, ... , #128, L1F10010, #9999, @%OM_DEATHSTOP, SCROVER''')}

图形名规律：`{{身体}}{{动作字母}}{{变体位}}{{帧:4d}}`
（W=待机 R=跑 A=攻击 L=施法 S=射 D=防御 H=受击 F=倒地 FS=胜利），
变体位即武器型（1=劍 2=槍 3=矛 5/6=其它），帧号与磁盘 4 位文件名一一对应。

### 3.2 `@` 事件全部清单

{tbl(['事件', '次数', 'OM_ 值'], ev_rows)}

`@%OM_ATTACK` 出现在挥击命中的那一帧 —— 引擎在此刻做伤害判定；
`@%OM_DEATHSTOP` 出现在死亡动画末尾 —— 停止死亡动画并保留尸体。

### 3.3 `$` 音效全部清单

{tbl(['音效', '次数'], snd_rows)}

### 3.4 `!nnnn` 启动脚本（修版说明 #15 的官方特性）

修版说明原话："支持在 Things.ini 中，主将/士兵/弓箭动画序列里加入 `!xxxxx` 启动脚本
（类似于武将技物件）"。全表**恰好 15 处**：

{tbl(['物件号', '物件名', '所在字段', '脚本号'], script_rows)}

这 15 处是"物件 → MAGIC.SO 脚本"的唯一接口，也是新引擎最值得保留的扩展点：
物件不只能播动画，还能在指定帧回调一段脚本。

## 4. 621 个物件段的分类（620 正式 + 1 测试段）

{tbl(['分类', '个数'], cat_rows)}

各分类占用的编号区间（正式编号）：

{tbl(['分类', '起始编号', '结束编号', '个数'], rng_rows)}

注意区间是各类的 min..max，**在区间内会交错**（如 268–273 的虚拟物件/影子/天气夹在
武将技特效的编号里，因为它们同属 `\\magic\\` 家族）。要精确查某个号属于哪类，看第 6 节总表。

### 4.1 兵种表（13 个基准兵种 × 4 套配色/骑乘 = 52 个物件）

{tbl(['Sequence', '物件号', '名称', 'Walk 帧', 'Attack 帧', 'Death 帧', '动作数', '图形命中率'], sol_rows)}

四个区段：`100-112` 蓝军步兵、`120-132` 红军步兵、`140-152` 蓝军骑兵、`160-172` 红军骑兵。
骑兵另配 `180-195` 战马物件 12 个。13 个基准兵种：
朴刀兵/長槍兵/大刀兵/弓箭兵/鍊錘兵/飛刀兵/武鬥兵/蠻族兵/鐵鎚兵/籐甲兵/黃巾賊/弩兵/女兵。

### 4.2 主将身体：30 组 × 4 武器变体 = 120

名字格式 `主將L1 (主體) - 劍`：`L0..LE`（15 组）与 `R0..RE`（15 组，红军配色），
每组 4 个变体按武器分（劍/槍/矛/刀）。Sequence 600-859。

### 4.3 武将技特效：`\\magic\\NNN` 目录

{len(mdir_rows)} 个目录实例（含大小写混写）。数据里 `\\MAGIC\\` 与 `\\magic\\` 混用，
同一个编号会分成两行出现（如 `\\MAGIC\\000` 14 + `\\magic\\000` 4 = 18 个物件同属 000 号家族）：

{tbl(['目录', '物件数'], mdir_rows)}

命名即用法：`\\magic\\038` 全是剑光（`劍A1..A16 / 劍B1..B16`），`\\magic\\039` 是桶子与碎片，
`\\magic\\003` 是飞行道具与弓光。这套"一个目录 = 一个技能家族"的组织方式值得新游戏照抄。

### 4.4 虚拟物件与天气

{tbl(['Sequence', '名称', '作用'], [
    [1011, "`虛幻物件 (沒有任何圖形)`", "纯逻辑物件，占一个物件槽做判定/触发"],
    [1012, "`影子 (沒有固定圖形)`", "`ShadowObjectProcess`，运行时按主人图形生成影子"],
    [1013, "`AniObjectProcess` 物件", "通用动画播放器"],
    [2500, "`無形有重力`", "看不见但受重力（落点判定/砸地）"],
    [2501, "`無形無重力`", "看不见也不受重力"],
    ["9994-9996", "`雨水` 等", "`WeatherObjectProcess`，天气层"],
])}

## 5. 交叉验证：图形名 ↔ 磁盘文件

{tbl(['指标', '数值'], [
    ["图形引用总数", ccx["shape_lookup"]["total_refs"]],
    ["命中", ccx["shape_lookup"]["found"]],
    ["缺失", ccx["shape_lookup"]["missing"]],
    ["命中率", f"{ccx['shape_lookup']['rate']*100:.2f}%"],
    ["有缺失的物件数", len(ccx["objects_with_missing"])],
])}

有缺失的只有这两段：

{tbl(['物件号', '名称', '缺失数', '命中率'], missing_rows)}

也就是说**真实物件的图形引用 100% 命中**，25 处缺失全在
`L359 [OBJECT2] 測試用物件`（引用不存在的 `M1R10001-8`）与 `L1324` 骨架段（值是中文说明文字）上。
34220 个文件名不可能靠猜对上 —— 这反过来证明编号/命名规则推导正确。

## 6. 621 个物件段总清单（编号 1..620，另有 1 个测试段）

{tbl(['物件号', 'Sequence', '名称', 'Type', 'Process', 'Directory', '分类'], all_rows)}

## 7. 未确定

{tbl(['字段', '现状', '推测与依据'], [
    ["`Space` 的 w/h", "8,8,64,0 / 4,4,48,0 / 8,8,8,0", "x,y 像锚点，w,h 像判定框；但旗帜 w=h=8 而人形 64，更像「图形格尺寸」（**推测**）"],
    ["`Life`", "16 处，1200 / 2400", "推测毫秒：马尸体 1.2 秒消失、箭 2.4 秒，符合手感"],
    ["`Attack5..Attack8`", "骨架只写到 Attack5=?（未实现）", "真实数据都有内容，推测为发售后扩展的攻击槽"],
    ["`SCROVER` 的准确行为", f"共 {kw.get('SCROVER', 0)} 次", "序列终止；是否回到 Wait 由 Process 决定，数据侧未证实"],
    ["`Type` 空值 1 个", "`[DEFINE]` 段不参与；空值来自骨架段", "骨架段无 Process，运行时不加载"],
])}
"""
    write_text(os.path.join(DOC, "03b-物件表THINGS.md"), md)
    print("[doc] 03b-物件表THINGS.md")


# --------------------------------------------------------------------------
def doc_times():
    rows = []
    for t in TIMES:
        s = t["stats"]
        rows.append([f"T{t['times_index']}", t["system"]["time"], t["system"]["year"],
                     s["king_count"], s["city_count"], s["generals"],
                     s["status"].get("登", 0), s["status"].get("野", 0),
                     s["status"].get("未", 0), s["empty_cities"],
                     f"{t['bytes']:,}", f"{t['lines']:,}"])
    sys_rows = [[f"`{k}`", clean(v)] for k, v in TIMES[0]["system"]["raw"].items()]
    sys_meaning = {
        "TIME": "剧本名", "YEAR": "起始年份", "TotalKing": "君主数（真计数）",
        "TotalGeneral": "武将数组容量（实际 401）", "TotalCity": "城池数组容量（实际 60）",
    }
    sys_rows = [[f"`{k}`", clean(v), sys_meaning.get(k, "—")] for k, v in TIMES[0]["system"]["raw"].items()]

    king_rows = [[f"T{t['times_index']}", t["system"]["time"],
                  "、".join(clean(k["name"]) for k in t["kings"])] for t in TIMES]
    k1 = [[k["index"], clean(k["name"]), k["flag_num"], k["select"], k["type"]] for k in TIMES[0]["kings"]]

    c = TIMES[0]["cities"]
    city_rows = [[x["index"], clean(x["name"]), clean(x["king"]) or "（空城）", clean(x["major"]) or "—",
                  f"{x['population']:,}" if x["population"] is not None else "—",
                  x["defense"], f"{x['money']:,}" if x["money"] else "—",
                  " ".join(str(v) for v in x["pos"]), x["rate"], x["flags"]] for x in c]
    city_field = [
        ["`NAME`", "城池名", "60 个互不重复"],
        ["`KING`", "所属君主", "君主名；空 = 空城"],
        ["`MAJOR`", "太守", "武将名"],
        ["`WISE`", "军师", "多为空（推测：驻扎军师，可提供军师技）"],
        ["`POPULATION`", "人口", "0..411500"],
        ["`DEFENSE`", "城防", "100..521"],
        ["`MONEY`", "金", "0..5336"],
        ["`POS`", "地图坐标", "两个整数 `x y`，如 `1108 90`"],
        ["`FLAGPOS`", "旗帜坐标", "多数与 POS 相同"],
        ["`RATE`", "繁荣/等级（推测）", "只取 0 / 3"],
        ["`FLAGS`", "标志位（推测）", "只取 2 / 4"],
    ]

    def npts(p):
        return sum(len(r) for r in p["points"]) // 2

    path_rows = [[p["index"], clean(p["start"]), clean(p["end"]), p["length"], npts(p)]
                 for p in TIMES[0]["paths"]]
    path_rows = path_rows[:15]
    gen_field = [
        ["`SEQUENCE`", "武将编号", "1..401，与 FACE 号同步"],
        ["`NAME`", "姓名", "按笔画/字典序排列"],
        ["`FACE`", "头像路径", "`FACE\\FACE001` ↔ `SHAPE\\FACE\\FACE001.SHP`"],
        ["`STR`", "武力", "30..100"],
        ["`INT`", "智力", "25..100"],
        ["`BaseHP`", "初始体力", "75..99（**不是**上限 32767）"],
        ["`BaseMP`", "初始技力", "34..99"],
        ["`Loyal`", "忠诚", "31..100"],
        ["`Spirit`", "士气", "29..100"],
        ["`BaseEXP`", "初始经验", "只有 200（盜賊 9999）"],
        ["`POS`", "五个剧本的所在城池", "5 个空格分隔槽位，`未`=未登场"],
        ["`CITY`", "当前剧本所在城池", "= POS 第 N 槽；`未` 时留空"],
        ["`Status`", "登场状态", "`登` 已登场 / `野` 在野 / `未` 未登场"],
        ["`Weapon`", "初始武器", "只有 4 种：直劍/銅殳/眉尖刀/短錐槍"],
        ["`Horse`", "初始坐骑", "401 人全是 `黃鬃馬`"],
        ["`Thing`", "初始道具", "全表为空"],
        ["`BattleArray`", "可用阵法", "如 `方 雁 魚`，共 9 种"],
        ["`UseBattleArray`", "当前阵法", "单个阵名"],
        ["`Force`", "可带兵种", "如 `刀 弓`，13 个单字缩写"],
        ["`UseForce`", "当前兵种", "单个缩写"],
        ["`LoyalKing`", "效忠君主", "几乎全空；修版说明 A13 称其原本失效"],
        ["`BLOOD`", "血缘/亲属（推测）", "几乎全空"],
        ["`CONSTANCY`", "义理（推测）", "1..9"],
        ["`TYPE`", "造型/成长类型（推测）", "1..15 + 盜賊 30"],
        ["`FLAGS`", "标志位", "几乎全空"],
        ["`SKILL` ×n", "武将技习得表", "`等级,技能编号`，每人 2..8 条"],
        ["`WISESKILL` ×n", "军师技习得表", "同上，编号空间 1..67"],
    ]

    st = TIMES[0]["stats"]
    st2 = TIMES[1]["stats"]

    def drow(v, label):
        return [label, v["count"], v["min"], v["max"], f"{v['mean']:.2f}", v["median"], v["distinct"]]

    keys = [("武力 STR", "str"), ("智力 INT", "int"), ("忠诚 Loyal", "loyal"),
            ("士气 Spirit", "spirit"), ("初始体力 BaseHP", "max_hp"),
            ("初始技力 BaseMP", "max_mp"), ("经验 BaseEXP", "base_exp"),
            ("义理 CONSTANCY", "constancy"), ("类型 TYPE", "type")]
    dist_rows = [drow(st[k], lb) for lb, k in keys]
    dist2_rows = [drow(st2[k], lb) for lb, k in keys]

    top = [x for x in st["top_strength"] if clean(x[0]) != "盜賊"]
    top_rows = [[i + 1, clean(n), v] for i, (n, v) in enumerate(top[:20])]
    citynum_rows = [[clean(k), v] for k, v in list(st["generals_per_city"].items())[:15]]
    wt_rows = [[clean(w["value"]), w["n"]] for w in st["weapons"]["top"]]
    fd_rows = [[clean(w["value"]), w["n"]] for w in st["use_force"]["top"]]
    ba_rows = [[clean(w["value"]), w["n"]] for w in st["battle_array_tokens"]["top"]]

    rule_rows = [[f"T{r['times']}", r["generals"], r["ok"], r["bad"],
                  "；".join(f"{clean(e.get('name'))}（POS 第 5 槽={clean(e.get('pos_slot'))}，"
                            f"但 CITY={clean(e.get('city'))}）"
                            for e in r["exceptions"]) or "—"]
                 for r in CC["city_pos_rule"]["rows"]]

    def sample(name):
        return next(x for x in TIMES[0]["generals"] if x["name"] == name)

    def sample_md(g):
        rows = [["SEQUENCE", g["seq"] if g["seq"] is not None else "（无，旧式段）"],
                ["NAME", clean(g["name"])], ["FACE", clean(g["face"])],
                ["STR", g["str"]], ["INT", g["int"]], ["BaseHP", g["max_hp"]],
                ["BaseMP", g["max_mp"]], ["Loyal", g["loyal"]], ["Spirit", g["spirit"]],
                ["BaseEXP", g["base_exp"]], ["POS", " ".join(str(v) for v in g["pos"])],
                ["CITY", clean(g["city"]) or "（空）"], ["Status", clean(g["status"])],
                ["Weapon", clean(g["weapon"])], ["Horse", clean(g["horse"])],
                ["Thing", clean(g["thing"]) or "（空）"],
                ["BattleArray", " ".join(str(v) for v in g["battle_array"])],
                ["UseBattleArray", clean(g["use_battle_array"])],
                ["Force", " ".join(str(v) for v in g["force"])],
                ["UseForce", clean(g["use_force"])],
                ["LoyalKing", clean(g["loyal_king"]) or "（空）"],
                ["BLOOD", clean(g["blood"]) or "（空）"],
                ["CONSTANCY", g["constancy"]], ["TYPE", g["type"]],
                ["SKILL", " / ".join(f"{s['level']},{s['id']}" for s in g["skills"])],
                ["WISESKILL", " / ".join(f"{s['level']},{s['id']}" for s in g["wise_skills"])]]
        return tbl(["字段", "值"], rows)

    g1, g2, g3 = sample("曹操"), sample("呂布"), sample("司馬懿")
    theft = next(x for x in TIMES[0]["generals"] if x["name"] == "盜賊")

    md = f"""# 03c 剧本 / 武将 / 城池 TIMES1-5.INI

> 源文件：`extract\\pak\\TIMES1.INI` .. `TIMES5.INI`，五份合计
> **{sum(t['bytes'] for t in TIMES):,} 字节 / {sum(t['lines'] for t in TIMES):,} 行**，编码 **cp950(Big5)**。
> JSON：`extract/json/times1.json` .. `times5.json`。

五个 .INI 是五个时代的同一个数据库：**同一套 401 名武将、同一套 60 座城池、同一张 116 条路网**，
剧本之间只切换"谁在哪里、谁登场"。

## 1. 五剧本对照

{tbl(['剧本', '名称', '年份', '君主数', '城池数', '武将数', '登场', '在野', '未登场', '空城', '字节', '行'], rows)}

- **君主数**是唯一真实的 `TotalKing`；`TotalGeneral=512`、`TotalCity=64` 五份全是常量，
  而实存 401 / 60 → 它们是**数组容量上限**，不是计数（`docs/03` 第 5 节）。
- 从 184 年到 219 年，登场武将 79 → 114 → 154 → 179 → 192，未登场 259 → 163，
  空城 27 → 19：一条单调的"时代推进"曲线。

## 2. `[SYSTEM]`

{tbl(['字段', 'T1 值', '含义'], sys_rows)}

## 3. `[KINGnn]` 君主表

{tbl(['剧本', '名称', '君主清单'], king_rows)}

T1 逐条：

{tbl(['#', '君主', 'FLAGNUM', 'SELECT', 'Type'], k1)}

字段（四个）：

| 字段 | 含义 | 实测 |
|---|---|---|
| `NAME` | 君主名 | 与城池表 `KING`、武将表 `LoyalKing` 互相对应 |
| `FLAGNUM` | 旗号图编号 | 0..26，对应 THINGS 里 27 个 `Troop Flags` 物件（Sequence 1..27） |
| `SELECT` | 可选性/权重（推测） | 只取 0/7/8/9；前三位君主恒为 8，`盜賊` 恒为 0 |
| `Type` | 势力类型（推测） | 0..4；董卓=0、曹操/孫堅/張角=1、劉備/公孫瓚/劉焉/劉表=2、陶謙/孔融/喬玄=3、孔岫/盜賊=4 |

`SELECT` 的 7/8/9 三档与 `Type` 的 0..4 五档都没有官方说明，只能从人物身份反推
（前三位是剧本主推势力，`盜賊` 是通用野势力），故标**推测**。

## 4. `[CITYnn]` 城池表（60 座）

字段（11 个）：

{tbl(['字段', '含义', '实测'], city_field)}

全表（归属取 T1；归属随剧本变化）：

{tbl(['#', '城名', '君主', '太守', '人口', '城防', '金', '坐标', 'RATE', 'FLAGS'], city_rows)}

分布：人口 {st['city_population']['min']:,}..{st['city_population']['max']:,}
（均值 {st['city_population']['mean']:,.0f}）、城防 {st['city_defense']['min']}..{st['city_defense']['max']}
（均值 {st['city_defense']['mean']:.0f}）、金 {st['city_money']['min']}..{st['city_money']['max']:,}、
`RATE` 只取 {" / ".join(str(v) for v in st['city_rate']['values'])}、
`FLAGS` 只取 {" / ".join(str(v) for v in st['city_flags']['values'])}。

## 5. `[PATHnnn]` 路网（116 条）

字段：`Start` 起点城、`End` 终点城、`Length` 长度、`Point` 折线点（每行一个，可多行）。

前 15 条：

{tbl(['#', '起点', '终点', 'Length', '点数'], path_rows)}

`Length` 范围 {st['path_length']['min']}..{st['path_length']['max']}，中位 {st['path_length']['median']:.0f}。
`Length=30000` 的几条是"不可通行/地图外"哨兵值（推测）。

## 6. `[GENERAL]` 武将表（401 人）

段名全是裸 `[GENERAL]`（无编号），靠 `SEQUENCE` 区分；每段 26-42 个字段。

### 6.1 字段详解

{tbl(['字段', '含义', '实测/证据'], gen_field)}

### 6.2 两个关键字段的判定过程

**`CITY` = `POS` 的第 N 个空格槽（N = 剧本号）**。
曹操 `POS = 洛陽 陳留 許昌 襄陽 鄴` → T1..T5 的 `CITY` 依次 洛陽/陳留/許昌/襄陽/鄴；
孫堅 `POS = 下邳 長沙 未 未 未` → T1=下邳、T2=長沙、T3-T5 `Status=未` 且 `CITY` 空。
逐条校验：

{tbl(['剧本', '武将数', '符合', '例外', '例外明细'], rule_rows)}

**`SKILL` / `WISESKILL` = `习得等级,技能编号`**。三条独立证据：
401 人等级列 100% 单调递增；技能编号最大 **{CC['magic_script']['skill_id_max_in_generals']}**
= 武将技总数；军师技编号最大 **{CC['magic_script']['wise_id_max_in_generals']}** = 军师技总数。
两个上限同时对上，只可能是顺序号。全表 SKILL 共 {st['skill_rows']} 行、WISESKILL {st['wise_skill_rows']} 行，
每人 {st['skills_per_general']['min']}..{st['skills_per_general']['max']} 条武将技、
{st['wise_skills_per_general']['min']}..{st['wise_skills_per_general']['max']} 条军师技。

### 6.3 数值分布

T1：

{tbl(['指标', '样本', '最小', '最大', '均值', '中位', '不同值数'], dist_rows)}

T2 对照：

{tbl(['指标', '样本', '最小', '最大', '均值', '中位', '不同值数'], dist2_rows)}

**同一武将在五个剧本里的 STR/INT/Loyal 完全相同**（T1 与 T2..T5 逐人比对，差异 **0 条**）。
属性是"人物固有"，剧本只改归属与登场状态。

### 6.4 综合属性前 20（武力+智力）

{tbl(['名次', '武将', '武力+智力'], top_rows)}

（已剔除首段模板 `盜賊`：它 STR=INT=99、BaseEXP=9999、TYPE=30，是通用野势力模板，不是可比武将。）

### 6.5 每城武将数（T1 前 15）

{tbl(['城池', '武将数'], citynum_rows)}

### 6.6 初始装备分布

{tbl(['武器', '人数'], wt_rows)}

{tbl(['当前兵种', '人数'], fd_rows)}

{tbl(['阵法（当前）', '人数'], ba_rows)}

初始武器只有 4 种，正好是 SANGO.INI `[ITEM]` 前 4 件 Lv1 武器；
坐骑 401 人全是 `黃鬃馬`（Lv1）。

## 7. 抽样：三个武将的全字段

### 7.1 曹操

{sample_md(g1)}

### 7.2 呂布（武力 100）

{sample_md(g2)}

### 7.3 司馬懿（高智典型）

{sample_md(g3)}

### 7.4 首段 `盜賊`（模板/特殊 NPC 段，键签名与常规武将不同）

该段无 `SEQUENCE`，改用 `Skill`/`LOYAL`/`SKILLLEVEL1..4` 旧式键，
`BaseEXP=9999`、`STR=INT=BaseHP=BaseMP=99`，是"满级野怪/测试对象"，
它的 `POS` 五个槽全是 `未`：

{sample_md(theft)}

## 8. 与其他表的交叉验证

{tbl(['检查', '结果', '说明'], [
    ["FACE ↔ SHAPE\\FACE 文件", f"{CC['face_match']['hit']}/{CC['face_match']['generals_per_times']} = 100%",
     f"目录内 {CC['face_match']['files_in_SHAPE_FACE']} 个文件；模板段复用 FACE001"],
    ["CITY ↔ POS 槽位", "1999/2001 = 99.90%", "唯一例外：司馬昭、司馬師（T5）"],
    ["SKILL 编号 ↔ MAGIC.INI", f"最大 {CC['magic_script']['skill_id_max_in_generals']} = 110 条 [MAGIC]", "顺序号"],
    ["WISESKILL 编号 ↔ MAGIC.INI", f"最大 {CC['magic_script']['wise_id_max_in_generals']} = 67 条 [WISE]", "顺序号"],
    ["Weapon ↔ SANGO.INI [ITEM]", "只有 4 种，= ITEM 前 4 件 Lv1 武器", "直劍/銅殳/眉尖刀/短錐槍"],
    ["Horse ↔ SANGO.INI [ITEM]", "401 人全是 黃鬃馬 = Lv1 坐骑", "初始配置统一"],
    ["Force ↔ THINGS 兵种", "13 个单字缩写 = 13 个兵种", "刀/槍/關/弓/鍊/飛/武/蠻/鐵/籐/賊/弩/女"],
    ["BaseHP/BaseMP ↔ 说明文档", "≤99，全表不出现 32767", "32767 是运行时上限，表内只存初始值"],
])}

### 8.1 关于"修正版 vs 原版数值差异"

本项目只有修正版 1.05+ 的 PAK，**没有原版对照文件**，因此无法做逐字段的原版/修版差分。
能做的：

1. 修版说明里点名改过的数值（书籍加智力 7-10-13-17-20、恢复技力 30-50-70、
   等级上限 99、体力/技力上限 32767），逐条回到数据表核对（见 `docs/03d` 与
   `docs/03a` 第 8 节）。
2. 修版说明的"精简 times1-5"指的是**打包**（塞回 PAK），与 `重新打包说明.txt`
   的措辞一致，不是改内容。
3. 数据侧唯一"像被改过"的痕迹是 T5 司馬昭/司馬師 的 `CITY` 与 `POS` 槽不一致，
   但无法判定是原版遗留还是修版引入。

## 9. 未确定

{tbl(['字段', '现状', '推测与依据'], [
    ["`TYPE`", "1..15（+盜賊 30）", "15 个值恰好等于主将身体组数 `L0..LE`，但 STR/INT 均值也随 TYPE 分层 → 造型组还是成长模板未定（**推测为主将造型类型**）"],
    ["`CONSTANCY`", "1..9", "义理/性格，影响忠诚变化与劝降（推测）"],
    ["`BLOOD`", "几乎全空", "血缘/亲族关系，用于继承或单挑台词（推测）"],
    ["`LoyalKing`", "几乎全空", "修版说明 A13 提到其原本无效并被修复 → 原版可能是弃用字段"],
    ["`FLAGS`", "几乎全空", "位标志，含义无据"],
    ["`CITY.RATE` / `FLAGS`", "只取 0/3 与 2/4", "RATE 像繁荣度/城池等级；只有两个值过于整齐，可能是二值开关"],
    ["`PATH.Length=30000`", "少数几条", "哨兵值（不可通行），未证实"],
    ["`PATH.Point` 坐标单位", "0..1200 量级", "像素还是地图格未定；与 `CITY.POS` 同一坐标系（推测）"],
])}
"""
    write_text(os.path.join(DOC, "03c-剧本武将城池TIMES.md"), md)
    print("[doc] 03c-剧本武将城池TIMES.md")


# --------------------------------------------------------------------------
def doc_msg():
    blocks = sorted(MESSAGE["blocks"], key=lambda b: b["hundred"])
    blk_rows = [[b["hundred"], f"{b['hundred']*100:03d}-{b['hundred']*100+99:03d}",
                 clean(b["label"]), b["count"], b["empty"], b["missing_count"],
                 clean(b["evidence"])[:70]] for b in blocks]
    fc_rows = [[f"`{c['value']}`", c["n"]] for c in MESSAGE["format_codes"]["top"]]
    tl_rows = [[f"`{clean(t['value'])}`", t["n"]] for t in MESSAGE["tails"]["top"]]
    q = MESSAGE["quirks"]

    entries = MESSAGE["entries"]
    by_block = OrderedDict()
    for e in entries:
        by_block.setdefault(e["hundred"], []).append(e)
    listing = []
    for h, items in by_block.items():
        label = next(b["label"] for b in blocks if b["hundred"] == h)
        listing.append(f"\n### {h*100:03d}-{h*100+99:03d} {clean(label)}（{len(items)} 条）\n")
        listing.append(tbl(["编号", "文本"],
                           [[e["key"], "（空）" if e["empty"] else clean(e["text"])] for e in items]))

    fonts = SANGO["fonts"]
    font_rows = []
    for f in fonts:
        font_rows.append([f["font_num"], clean(f["chinese_font"]) or "—",
                          f"{f['chinese_width']}×{f['chinese_height']}" if f["chinese_width"] else "—",
                          f["chinese_bytes"] or "—", f["chinese_per_line_bytes"] or "—",
                          clean(f["english_type"]), clean(f["english_font"]) or "—",
                          f"{f['english_width']}×{f['english_height']}",
                          f["english_bytes"] or "—", f["english_per_line_bytes"] or "—"])
    fcross = SANGO["font_cross_check"]
    fcx_rows = [[f"{c['font_num']}（{c['which']}）", clean(c["file"]), f"{c['bytes']:,}",
                 c["bytes_per_char"], f"{c['char_count']:.0f}",
                 "整数 ✓" if c["integer"] else "非整数"] for c in fcross]

    items = SANGO["items"]
    item_rows = [[it["sequence"], clean(it["name"]), clean(it["type"]).replace("JEWEL_", ""),
                  it["level"], it["sort"], it["rate"],
                  it["str"] if it["str"] is not None else "—",
                  it["int"] if it["int"] is not None else "—",
                  it["force"] if it["force"] is not None else "—",
                  it["battle"] if it["battle"] is not None else "—",
                  it["skill"] if it["skill"] is not None else "—",
                  it["speed"] if it["speed"] is not None else "—",
                  it["spirit"] if it["spirit"] is not None else "—",
                  it["loyal"] if it["loyal"] is not None else "—",
                  clean(it["description"])] for it in items]

    terr_rows = [[t["sequence"], clean(t["name"]), t["soundtrack"], clean(t["floor"]),
                  ",".join(clean(x) for x in t["foreground"]),
                  ",".join(clean(x) for x in t["midground"]),
                  ",".join(clean(x) for x in t["background"])] for t in SANGO["terrain"]]

    books = [[clean(b["name"]), b["int"], clean(b["description"])]
             for b in SANGO["cross_checks"]["books_int"] if b["int"] is not None]
    seals = [[clean(s["name"]), s["force"], f"1<<{s['force'].bit_length()-1}", s["sort"]]
             for s in SANGO["cross_checks"]["seal_force"]]
    horses = [[clean(h["name"]), h["speed"], h["level"]]
              for h in SANGO["cross_checks"]["horse_speed"]]
    grp = {}
    for it in items:
        g = grp.setdefault(it["type"], [10 ** 9, 0, 0])
        g[0] = min(g[0], it["sequence"]); g[1] = max(g[1], it["sequence"]); g[2] += 1
    grp_rows = [[f"{v[0]}-{v[1]}", clean(k), v[2]] for k, v in grp.items()]
    cls_c = Counter(it["class"] for it in items)
    cls_rows = [[clean(k), v] for k, v in cls_c.most_common()]

    g0 = COMBINE["groups"][0]
    shp_rows = [[s["order"], s["x"], s["y"], clean(s["path_ini"]), clean(s["file"]),
                 "是" if s["exists"] else "否", f"{s['bytes']:,}"] for s in g0["shapes"]]
    pad = COMBINE["padding"]

    md = f"""# 03d 文本与配置：MESSAGE / SANGO / COMBINE

> `MESSAGE.INI` {MESSAGE['bytes']:,} B / {MESSAGE['lines']} 行；`SANGO.INI` {SANGO['bytes']:,} B /
> {SANGO['lines']:,} 行 / {SANGO['sections']} 段；`COMBINE.INI` {COMBINE['bytes']:,} B / 8 行。
> 全部 **cp950(Big5)**，`COMBINE.INI` 为纯 ASCII。

# 第一部分 MESSAGE.INI：524 条文本

## 1. 结构

单段 `[MESSAGE]`，`KEY = 文本`，键名 `MSG000`..`MSG988`，**连续编号但不连续存在**
（{MESSAGE['entry_count']} 条）。无重复键；值里可以出现 `=`（如 `TYPE=%d Level=%d`），
解析时必须只按**第一个** `=` 切分。

## 2. 按百位分块（引擎按号段取文本）

{tbl(['号段', '范围', '用途', '条数', '空条目', '缺号', '判读依据'], blk_rows)}

规律：**同一百位 = 同一类场合**。这是最典型的"号段即语义"设计，新游戏可直接照搬。
3xx 与 6xx 都满 100 条 —— 说明每个武将/阵营组合都配了台词。

## 3. 格式码与尾码

{tbl(['码', '次数'], fc_rows)}

- `%X%` 包裹式是本作自定义替换码，`%s`/`%d` 才是标准 printf。
  解析顺序必须**先摘 `%X%`，再找 printf** —— 否则 `%S1%` 会被误切成 `%S` + `1%`。
- 尾码结构：

{tbl(['结尾', '次数'], tl_rows)}

每条台词以 `%k%%e%` 这类两级尾码结束，`k/K` 与 `e/E` 大小写成对出现，
推测是"说话方（我/敌）+ 语气/结果（胜/败/平）"两维（**推测**，引擎内部未验证）。

## 4. 数据缺陷

{tbl(['缺陷', '数量', '明细'], [
    ["空值条目", q["empty_values"], "、".join(q["empty_keys"][:3]) + f" … 共 {len(q['empty_keys'])} 条（MSG410-440 为连续留白占位）"],
    ["结尾多一个双引号", len(q["trailing_quote"]), "、".join(q["trailing_quote"])],
    ["以字面 `\\n` 开头", len(q["literal_backslash_n"]), "、".join(q["literal_backslash_n"])],
])}

这些不是解析错误：原文就是如此。410-440 是留白占位，靠号段规则仍能正确取到"接战台词"。

## 5. 全表（{MESSAGE['entry_count']} 条，按号段分组）
{chr(10).join(listing)}

# 第二部分 SANGO.INI：系统常量 + 字形 + 地形 + 物品

段数 {SANGO['sections']}，但**名叫 SANGO 的文件其实是四张表**：

{tbl(['段', '数量', '内容'], [
    ["`[SYSTEM]`", 1, "全局常量与剧本入口"],
    ["`[FONTS01..07]`", len(fonts), "7 套字形参数（2 套中文点阵 + 5 套英文/数字图形字体）"],
    ["`[TERRAIN]`", len(SANGO["terrain"]), "12 种地形/场景的图层与配乐"],
    ["`[SCRIPT]`", 1, f"载入的 .SO 脚本（{len(SANGO['script_files'])} 行 File=）"],
    ["`[ITEM]`", len(items), "**物品表**：兵符/武器/书籍/马/阵法书/商品"],
])}

## 6. `[SYSTEM]`

{tbl(['字段', '值', '含义'], [
    ["`TotalTimes`", SANGO["system"]["total_times"], "剧本数常量（实际 5 个有内容 + 6 为上界）"],
    ["`TotalGeneralType`", SANGO["system"]["total_general_type"], "武将类型数（**含义未定**，与实际 15/16 类不符）"],
    ["`TotalThings`", SANGO["system"]["total_things"], f"物品数组容量（实际 {len(items)}）"],
    ["`TotalForce`", SANGO["system"]["total_force"], "势力/兵种数（**与 13 兵种矛盾，含义未定**）"],
    ["`FontDirectory`", f"`{SANGO['system']['font_directory']}`", "字形文件目录"],
    ["`DefaultFont`", SANGO["system"]["default_font"], "默认字形号"],
] + [[f"`Times0{t['index']}`", f"`{t['file']}`", f"剧本 {t['index']}：{clean(t['name'])}"]
     for t in SANGO["system"]["times"]])}

## 7. `[FONTSnn]` 字形表（7 套）

字段：`FontNum` / `ChineseFont` / `ChineseIndex` / `ChineseWidth` / `ChineseHeight` /
`ChineseBytes` / `ChinesePerLineBytes` / `EnglishType` / `EnglishFont` / `EnglishWidth` /
`EnglishHeight` / `EnglishBytes` / `EnglishPerLineBytes`。

{tbl(['#', '中文字模', '中文尺寸', '单字字节', '每行字节', '英文类型', '英文字模', '英文尺寸', '单字字节', '每行字节'], font_rows)}

### 7.1 自洽校验（用数字本身证明字段含义）

{tbl(['检查', 'FONTS01 中文', 'FONTS01 英文', 'FONTS04 中文', 'FONTS04 英文'], [
    ["每行字节×高", "3×20=60", "2×20=40", "2×15=30", "1×15=15"],
    ["单字字节", 60, 40, 30, 15],
    ["一致", "✓", "✓", "✓", "✓"],
    ["位/像素", "3×8/20=1.2", "2×8/10=1.6", "2×8/16=1.0", "1×8/8=1.0"],
])}

→ 存储是 **1bpp 位图、按字节行对齐**（20 像素宽用 3 字节=24 位，余 4 位浪费）。
这是从数字推出来的，不依赖点阵解码。

### 7.2 与真实文件尺寸互相验证

{tbl(['字形段', '文件', '字节', '单字字节', '字数', '是否整数'], fcx_rows)}

- `SANGO.20 = 832020 = 13867 × 60`，`SANGO.15 = 416010 = 13867 × 30`
  → 两张中文字模各 **13867 个字形槽**，一一对应（同一套字的 20×20 与 16×15 两个尺寸）。
- `MINGASC.20 = 10240 = 256 × 40`，`OLDASC.15 = 3840 = 256 × 15`
  → 英文点阵恰好 **256 个 ASCII 字符**。
- `SANGO.IDX = 38000`：`38000 / 13867 ≈ 2.74`（非整数），`/2=19000`、`/4=9500` 都不是 13867
  → 不是"每字定长索引"，或索引覆盖的字数少于字模数（推测：码表→字模号的变长/双段索引）。
  **此项未解，留给美术 agent。**

## 8. `[TERRAIN]` 12 种地形

{tbl(['Seq', '名称', '配乐', 'Floor', 'Foreground', 'Midground', 'Background'], terr_rows)}

字段：`Sequence` / `Name` / `SoundTrack`（配乐号）/ `Floor`（地面底图 TGA）/
`Foreground` / `Midground` / `Background`（各 2 层 SHP）。三种"城"（Seq 0/1/2）区分城内/城外。

## 9. `[SCRIPT]`

{code(chr(10).join(f"File = {s}" for s in SANGO["script_files"]))}

只有系统脚本与武将技脚本在 INI 里声明加载。

## 10. `[ITEM]` 物品表（{len(items)} 件，25 字段）

字段：`Sequence` / `Name` / `Attrib` / `TYPE` / `WeaponType` / `WeaponObject` /
`SearchType` / `Sort` / `Level` / `Sprite` / `Rate` / `STR` / `INT` / `MaxHP` / `MaxMP` /
`Force` / `Battle` / `Skill` / `Speed` / `HP` / `MP` / `Spirit` / `Loyal` / `Tire` / `Description`。

按 TYPE 分组的 Sequence 区间：

{tbl(['Sequence 区间', 'TYPE', '数量'], grp_rows)}

按语义分组（`class` 字段是导出时按名称/位置推得）：

{tbl(['分组', '数量'], cls_rows)}

### 10.1 全表

{tbl(['Seq', '名称', 'TYPE', 'Level', 'Sort', 'Rate', 'STR', 'INT', 'Force', 'Battle', 'Skill', 'Speed', 'Spirit', 'Loyal', '说明'], item_rows)}

### 10.2 交叉验证：书籍加智力

修版说明写"显示 7-10-13-17-20"，实测 `[ITEM]` 的 `INT` 与 `Description` **完全一致**：

{tbl(['书籍', 'INT', 'Description'], books)}

结论：`春秋左傳 7 / 史記 10 / 孟德新書 13 / 兵書24篇 17 / 孫子兵法 20` —— 说明文档的
7-10-13-17-20 **就是数据表里的值**。"原版实际 13-15-17-18-20"属引擎侧另算，表内看不出来。

另三本不是加智力：`太平要術` 技力上限 +20、`青囊書` 体力上限 +25、`遁甲天書` 技力上限 +30。

### 10.3 兵符的 Force 是位掩码

{tbl(['兵符', 'Force', '位', 'Sort'], seals)}

13 个兵符 = 13 个 2 的幂 = 13 个兵种，顺序与 `THINGS.INI` 兵种 `Sequence 100..112`
**完全一致**（朴刀兵/長槍兵/大刀兵/弓箭兵/鍊錘兵/飛刀兵/武鬥家/蠻族兵/鐵鎚兵/籐甲兵/黃巾賊/弩兵/女兵）。
这解释了 `GENERAL.Force` 为什么用单字缩写：运行时按位与匹配。

### 10.4 坐骑

{tbl(['马名', 'Speed', 'Level'], horses)}

`Speed` 是移动力（1-6），`Level` 是价格/等级档。赤兔馬 `Speed=6` 最快，
爪黃飛電/的盧/鐵騎馬为 5 —— 与"赤兔第一"的设定一致。

# 第三部分 COMBINE.INI：界面图拼合

## 11. 文件构成

{tbl(['项', '值'], [
    ["文件大小", f"{COMBINE['bytes']:,} B"],
    ["总行数", COMBINE["line_count"]],
    ["段数", COMBINE["section_count"]],
    ["`SHAPE=` 条目", COMBINE["shape_entry_count"]],
    ["填充行", f"第 {pad['lines'][0]['lineno']} 行 = {pad['lines'][0]['bytes']:,} 个空格（占全文件 {pad['ratio']*100:.2f}%）"],
])}

## 12. 四条 SHAPE 与坐标含义

{tbl(['#', 'x', 'y', '路径（INI 写法）', '实际文件', '存在', '字节'], shp_rows)}

**坐标含义**：`SHAPE = x, y, 路径`，`(x, y)` 是这张子图**左上角相对拼接原点的像素偏移**。

- 实测只有 `-96 / 0` 两种取值，两轴各两级 → **2×2 网格**。
- 步长 `step_x = step_y = 96`，包围盒 `x: -96..96, y: -96..96` → **整体 192×192**。
- 因为偏移含负值，原点在拼接图**中心**：`FACE001` 在左上、`FACE004` 在右下。
- 4 个 FACE 文件都是 25236 B（同尺寸），与 96×96 的拼块不矛盾（SHP 头 + 压缩差异）。

这是整个 PAK 里唯一"用 INI 描述图集布局"的表，也是验证"坐标 = 像素偏移"最干净的样本。

> 注意：任务书说"[SHAPE] 段 8 行"，实测**真正的 `SHAPE=` 条目只有 4 条**；
> 另外 4 行是 `NAME=`、空行与一行 27388 空格的填充。文件尾部用空格补齐到 27534 字节，
> 推测是 PAK 打包时的对齐/填充习惯（占全文件 99.47%）。
"""
    write_text(os.path.join(DOC, "03d-文本与配置.md"), md)
    print("[doc] 03d-文本与配置.md")


if __name__ == "__main__":
    os.makedirs(DOC, exist_ok=True)
    doc_overview()
    doc_magic()
    doc_things()
    doc_times()
    doc_msg()
    print("done")
