# -*- coding: utf-8 -*-
"""MESSAGE.INI -> extract/json/message.json

MESSAGE.INI 是**单段** [MESSAGE] 表，524 条 KEY=VALUE，KEY 形如 MSG000..MSG988。
KEY 的数字部分就是引擎里的消息号（源码里通常写作 MSG_xxx 常量）。

本脚本导出全部条目，并做三项统计：
  1. 按百位分块并给每块一个用途标签（标签是人工判读，判读依据写在 docs/03d）；
  2. 统计格式串代码（%s/%d 是 C printf 风格，%S1%/%S2%/%S3%/%s1%/%k%/%K%/%e%/%E%/%l%
     是游戏自有的替换标记）；
  3. 记录数据缺陷：34 条空值、6 条结尾多一个引号、3 条以字面 \\n 开头。
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_ini import IniFile, write_json        # noqa: E402
from tables_common import PAK, OUT, dist_text    # noqa: E402

SRC = os.path.join(PAK, "MESSAGE.INI")
DST = os.path.join(OUT, "message.json")

#: 百位 -> (用途标签, 判读依据)。依据全部是条目原文，随手可复核。
BLOCKS = {
    0: ("调试/自检", "MSG000 檔案開啟錯誤、MSG001-003 訊息測試/中文測試"),
    1: ("启动与资源加载错误", "MSG100 城市太守資料錯誤、MSG106 記憶體不足、"
                            "MSG109 找不到中文字型檔…… 均带 %s/%d 的 printf 风格"),
    2: ("单挑·险胜/平手台词", "MSG240 險勝！險勝！、MSG262 險勝！下次遇到得多注意、"
                              "MSG270 勝負就留到下一次吧（240-263 险胜，270-290 平手）"),
    3: ("单挑·叫阵报名台词", "MSG300 我乃%s1%是也！、MSG301 和我%S1%交手是你一生最大的錯誤"),
    4: ("单挑·接战台词", "MSG400-409 只有『別廢話多說，一決勝負吧！』"
                        "『只動嘴巴是不會贏的，來吧！』两句轮换 5 次；410-440 为空占位"),
    5: ("单挑·追击败逃台词", "MSG500 不知羞恥的傢伙，有膽回頭再和我較量、MSG534 逃的還真快"),
    6: ("单挑·完胜台词", "MSG600 真是不堪一擊、MSG601 憑這兩三招也敢出來獻醜（100 条全满）"),
    7: ("单挑·完胜台词（续）", "MSG700-705，与 6xx 同语气，仅 6 条"),
    8: ("招降/成年/加入对话", "MSG800 我找到了%S3%將軍，請大人會見他、MSG810 願效犬馬之勞；"
                            "MSG890-899 为『成年/父子』分支，结尾多一个引号"),
    9: ("加入/处斩/释放结果", "MSG900 我等這一天已經很久了、MSG910 真是不忍錯殺一條好漢、"
                             "MSG917 我可不是一個怕死的人（处斩/释放分支）"),
}

FMT_RE = re.compile(r"%([A-Za-z]\d?)%")
PRINTF_RE = re.compile(r"%[sd]")
TAIL_RE = re.compile(r"(%[kK]%%[leE]%)$")


def codes_of(text: str) -> list[str]:
    """先摘掉 %X% 包裹式标记，剩下的 %s/%d 才是真正的 printf 占位符。"""
    out = ["%" + m + "%" for m in FMT_RE.findall(text)]
    rest = FMT_RE.sub("", text)
    out += PRINTF_RE.findall(rest)
    return sorted(set(out))


def main() -> int:
    ini = IniFile.load(SRC)
    sec = ini.sections[0]

    entries = []
    for i, (k, v, ln) in enumerate(sec.fields, 1):
        m = re.match(r"^MSG(\d+)$", k)
        num = int(m.group(1)) if m else None
        hundred = (num // 100) if num is not None else None
        label = BLOCKS.get(hundred, ("未归类", ""))[0]
        tail = TAIL_RE.search(v)
        codes = codes_of(v)
        entries.append({
            "index": i,
            "key": k,
            "number": num,
            "hundred": hundred,
            "block": label,
            "text": v,
            "chars": len(v),
            "lineno": ln,
            "format_codes": codes,
            "tail": tail.group(1) if tail else None,
            "empty": v == "",
            "quirk": ("结尾多一个引号" if v.endswith('"') else
                      ("字面 \\n 开头" if v.startswith("\\n") else None)),
        })

    nums = [e["number"] for e in entries if e["number"] is not None]
    key_count = {}
    for e in entries:
        key_count[e["key"]] = key_count.get(e["key"], 0) + 1
    dup_keys = sorted(k for k, n in key_count.items() if n > 1)
    blocks = []
    for h in sorted(BLOCKS):
        sub = [e for e in entries if e["hundred"] == h]
        if not sub:
            continue
        blocks.append({
            "hundred": h,
            "label": BLOCKS[h][0],
            "evidence": BLOCKS[h][1],
            "count": len(sub),
            "first_key": sub[0]["key"],
            "last_key": sub[-1]["key"],
            "empty": sum(1 for e in sub if e["empty"]),
        })

    # 每块的编号缺口
    gaps = []
    for b in blocks:
        have = {e["number"] for e in entries if e["hundred"] == b["hundred"]}
        lo, hi = b["hundred"] * 100, b["hundred"] * 100 + 99
        miss = [n for n in range(lo, hi + 1) if n not in have]
        b["missing_count"] = len(miss)
        b["missing"] = miss if len(miss) <= 60 else f"{len(miss)} 个（{miss[0]}..{miss[-1]}）"

    data = {
        "source": "MESSAGE.INI",
        "bytes": os.path.getsize(SRC),
        "encoding": ini.encoding,
        "lines": ini.stats()["lines"],
        "sections": 1,
        "section": sec.name,
        "entry_count": len(entries),
        "numbering": {
            "key_pattern": "MSG<3 位以上数字>",
            "min": min(nums), "max": max(nums),
            "distinct": len(set(nums)),
            "duplicated_keys": dup_keys,
        },
        "format_codes": dist_text([c for e in entries for c in e["format_codes"]], 40),
        "tails": dist_text([e["tail"] for e in entries if e["tail"]], 20),
        "quirks": {
            "empty_values": sum(1 for e in entries if e["empty"]),
            "empty_keys": [e["key"] for e in entries if e["empty"]],
            "trailing_quote": [e["key"] for e in entries if e["quirk"] == "结尾多一个引号"],
            "literal_backslash_n": [e["key"] for e in entries
                                    if e["quirk"] == "字面 \\n 开头"],
        },
        "blocks": blocks,
        "entries": entries,
    }
    write_json(DST, data)

    print(f"[message] {len(entries)} entries, keys {min(nums)}..{max(nums)} -> {DST}")
    for b in blocks:
        print(f"   {b['hundred']}xx {b['label']:<16} n={b['count']:<3} "
              f"empty={b['empty']:<2} missing={b['missing_count']}")
    print("   format codes:", [(d["value"], d["n"]) for d in data["format_codes"]["top"]])
    print("   tails:", [(d["value"], d["n"]) for d in data["tails"]["top"]])
    print("   quirks:", data["quirks"]["empty_values"], "empty /",
          len(data["quirks"]["trailing_quote"]), "quote /",
          len(data["quirks"]["literal_backslash_n"]), "backslash-n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
