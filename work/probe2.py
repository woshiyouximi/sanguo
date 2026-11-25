# -*- coding: utf-8 -*-
"""探针 2：TIMES 段编号 / 异常段 / SANGO 细节 / THINGS OBJECT 清单。"""
import os
import sys
import collections
import re

sys.path.insert(0, r"F:\sanguo\tools")
from parse_ini import IniFile, write_text

PAK = r"F:\sanguo\extract\pak"
WORK = r"F:\sanguo\work"


def dump(sec, n=100):
    out = [f"[{sec.name}] #{sec.index} L{sec.lineno} ({len(sec.fields)})"]
    for k, v, ln in sec.fields[:n]:
        out.append(f"   L{ln:<6} {k:<24} = {v}")
    return "\n".join(out)


# ---------------- TIMES1 ----------------
tm = IniFile.load(os.path.join(PAK, "TIMES1.INI"))
out = ["#### 段名顺序（前 90 / 后 30）"]
out.append(", ".join(s.name for s in tm.sections[:90]))
out.append("...")
out.append(", ".join(s.name for s in tm.sections[-30:]))

out.append("\n#### 唯一的那个异常 GENERAL（键集含 LOYAL/SKILLLEVEL）")
for s in tm.all("GENERAL"):
    if s.has("LOYAL"):
        out.append(dump(s))

out.append("\n#### 前 2 个 GENERAL 完整")
for s in tm.all("GENERAL")[:2]:
    out.append(dump(s))

out.append("\n#### 前 2 个 CITY 完整")
for s in tm.all("CITY")[:2]:
    out.append(dump(s))

out.append("\n#### 前 3 个 PATH 完整")
for s in tm.all("PATH")[:3]:
    out.append(dump(s))

out.append("\n#### 全部 KING")
for s in tm.all("KING"):
    out.append(dump(s))

# 名字/编号一致性
out.append("\n#### GENERAL 段名与 SEQUENCE 关系（前 20）")
for s in tm.all("GENERAL")[:20]:
    out.append(f"   {s.name:<12} SEQUENCE={s.get('SEQUENCE')} NAME={s.get('NAME')} FACE={s.get('FACE')}")
write_text(os.path.join(WORK, "probe_times_sections.txt"), "\n".join(out) + "\n")

# ---------------- SANGO ----------------
sg = IniFile.load(os.path.join(PAK, "SANGO.INI"))
out = ["#### [SYSTEM]"]
out.append(dump(sg.get("SYSTEM")))
out.append("\n#### 全部 FONTS 段")
for s in sg.all("FONTS01") + sg.all("FONTS02") + sg.all("FONTS03") + sg.all("FONTS04") \
        + sg.all("FONTS05") + sg.all("FONTS06") + sg.all("FONTS07"):
    out.append(dump(s))
for s in sg.sections:
    if s.name.upper().startswith("FONTS"):
        out.append(dump(s))
out.append("\n#### [SCRIPT]")
out.append(dump(sg.get("SCRIPT")))
out.append("\n#### 前 2 个 TERRAIN")
for s in sg.all("TERRAIN")[:2]:
    out.append(dump(s))
out.append("\n#### 全部 TERRAIN 的 Name/Sequence")
for s in sg.all("TERRAIN"):
    out.append(f"   [{s.name}] Sequence={s.get('Sequence')} Name={s.get('Name')}")
out.append("\n#### 前 3 个 ITEM 完整")
for s in sg.all("ITEM")[:3]:
    out.append(dump(s))
out.append("\n#### 全部 ITEM 的 Name/Type/Level/Sort/Sequence")
for s in sg.all("ITEM"):
    out.append(f"   [{s.name}] Seq={s.get('Sequence'):<4} Type={s.get('TYPE'):<2} Lv={s.get('Level'):<3} "
               f"Sort={s.get('Sort'):<3} Name={s.get('Name')}")
write_text(os.path.join(WORK, "probe_sango.txt"), "\n".join(out) + "\n")

# ---------------- THINGS ----------------
th = IniFile.load(os.path.join(PAK, "THINGS.INI"))
objs = th.all("OBJECT")
out = [f"OBJECT 段数 = {len(objs)}"]
out.append("idx\tType\tSeq\tProcess\tDirectory\tName\tFlags")
for i, s in enumerate(objs, 1):
    out.append(f"{i}\t{s.get('Type')}\t{s.get('Sequence')}\t{s.get('Process')}\t"
               f"{s.get('Directory')}\t{s.get('Name')}\t{s.get('Flags') or s.get('FLAGS')}")
write_text(os.path.join(WORK, "probe_objects.txt"), "\n".join(out) + "\n")

# 分布
out = ["#### Type 分布", str(collections.Counter(s.get('Type') for s in objs))]
out.append("#### Process 分布")
for k, c in collections.Counter(s.get('Process') for s in objs).most_common():
    out.append(f"   {c:<4} {k}")
out.append("#### Directory 分布")
for k, c in collections.Counter(s.get('Directory') for s in objs).most_common():
    out.append(f"   {c:<4} {k}")
out.append("#### 段内出现的键（含大小写变体）")
for k, c in collections.Counter(k for s in objs for k, _v, _l in s.fields).most_common():
    out.append(f"   {c:<4} {k}")
out.append("#### Space 取值样例")
for s in objs[:25]:
    out.append(f"   {s.get('Type')} {s.get('Name')[:20]:<22} Space={s.get('Space')}")
write_text(os.path.join(WORK, "probe_things_dist.txt"), "\n".join(out) + "\n")

print("ok")
