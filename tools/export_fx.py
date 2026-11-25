"""把 `docs/05c_MAGIC特效映射.md` 的 110 行映射表并进 `data/magics.json`。

产物字段（只增不改，原有 INI 字段全部保留）：
    fx_dir      : ["016"]            特效所在 `SHAPE\\MAGIC\\<dir>`（可能多个）
    fx_dir_primary : "016"           主目录（第一列）
    fx_frames   : 6                  该技引用的帧数（文档统计值，供排期参考）
    fx_bytes    : 248396             该目录总字节
    fx_basis    : "两者"             证据等级（目录/对象号/两者）
    fx_func     : "Magic1"           脚本函数名

自校验：
    1) 行数 == 110，且序号 1..110 连续；
    2) `Script` 列与 `magics.json` 的 `SCRIPT` 字段一一对应（这是最强的正确性证据）；
    3) 目录号在 `SHAPE\\MAGIC` 里存在（002/024 已知缺失，白名单放过）。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

DOC = r"F:\sanguo\docs\05c_MAGIC特效映射.md"
MAGICS = r"F:\sanguo\data\magics.json"
MAGIC_DIR = r"F:\sanguo\extract\pak\SHAPE\MAGIC"

ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|")
DIR_RE = re.compile(r"\b(\d{3})\b")

# 文档已确认：这两目录游戏里本来就不存在（伏兵类，兵由 FORCE 出）
KNOWN_MISSING = {"002", "024"}


def parse_rows(text):
    rows = []
    for line in text.splitlines():
        if not ROW_RE.match(line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 10:
            continue
        try:
            idx = int(cells[0])
        except ValueError:
            continue
        rows.append({
            "idx": idx,
            "name": cells[1],
            "cat": cells[2],
            "mp": cells[3],
            "script": cells[4],
            "func": cells[5].strip("`"),
            "dirs": DIR_RE.findall(cells[6]),
            "frames": cells[7],
            "bytes": cells[8],
            "basis": cells[9],
        })
    return rows


def to_int(v):
    m = re.search(r"-?\d+", str(v))
    return int(m.group()) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    rows = parse_rows(open(DOC, encoding="utf-8").read())
    magics = json.load(open(MAGICS, encoding="utf-8"))

    problems = []

    # 1) 行数与序号
    idxs = [r["idx"] for r in rows]
    if len(rows) != 110:
        problems.append("行数 %d != 110" % len(rows))
    if idxs != list(range(1, 111)):
        missing = sorted(set(range(1, 111)) - set(idxs))
        dup = [i for i in set(idxs) if idxs.count(i) > 1]
        problems.append("序号不连续 / 重复：缺 %s 重 %s" % (missing[:8], dup[:8]))

    # 2) Script ↔ SCRIPT 一一对应
    by_script = {int(m["SCRIPT"]): m for m in magics if str(m.get("SCRIPT", "")).isdigit()}
    mismatch = 0
    for r in rows:
        if not r["script"].isdigit():
            problems.append("#%d Script 非数字：%s" % (r["idx"], r["script"]))
            continue
        s = int(r["script"])
        m = by_script.get(s)
        if m is None:
            problems.append("#%d Script=%d 在 magics.json 里找不到" % (r["idx"], s))
            mismatch += 1
        elif m.get("NAME") and r["name"] and m["NAME"] not in r["name"] and r["name"] not in m["NAME"]:
            problems.append("#%d 技名不一致：文档 %s / 数据 %s" % (r["idx"], r["name"], m["NAME"]))
            mismatch += 1

    # 3) 目录存在性
    have = set()
    if os.path.isdir(MAGIC_DIR):
        have = {d for d in os.listdir(MAGIC_DIR) if os.path.isdir(os.path.join(MAGIC_DIR, d))}
    missing_dirs = {}
    for r in rows:
        for d in r["dirs"]:
            if d not in have and d not in KNOWN_MISSING:
                missing_dirs[d] = missing_dirs.get(d, 0) + 1
    for d, n in sorted(missing_dirs.items()):
        problems.append("目录 %s 不存在（被 %d 个技引用）" % (d, n))

    print("解析 %d 行；Script 对不上的 %d 条；不存在的目录 %s"
          % (len(rows), mismatch, sorted(missing_dirs) or "无"))
    if problems:
        print("\n发现问题：")
        for p in problems[:20]:
            print("  -", p)

    if a.check:
        return 0 if not problems else 2

    # 合并
    patched = 0
    for r in rows:
        if not r["script"].isdigit():
            continue
        m = by_script.get(int(r["script"]))
        if m is None:
            continue
        m["fx_dir"] = r["dirs"]
        m["fx_dir_primary"] = r["dirs"][0] if r["dirs"] else None
        m["fx_frames"] = to_int(r["frames"])
        m["fx_bytes"] = to_int(r["bytes"])
        m["fx_basis"] = r["basis"]
        m["fx_func"] = r["func"]
        patched += 1

    with open(MAGICS, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(magics, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("已合并 %d / %d 条到 %s（%d B）"
          % (patched, len(magics), MAGICS, os.path.getsize(MAGICS)))
    return 0 if not problems else 2


if __name__ == "__main__":
    sys.exit(main())
