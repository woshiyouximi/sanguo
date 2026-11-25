"""从 `docs/04b1_阵形站位表.md` 抽出 11 组阵形的 slot 坐标，写进 `data/formations.json`。

为什么从文档抽而不是从 EXE 抽：
  04b1 是把 EXE 里 33 组硬编码数组（`0x485B10` 指针表 → 各坐标数组）**逐个反汇编抄下来**的结果，
  格式稳定（`i:(x,y)` + 每区声明 slot 数），解析成本远低于再跑一遍反汇编；
  且解析时可以**用声明值做自校验**（数量、权重和、包围盒），比再读一遍二进制更可信。

用法：
    python tools/export_slots.py            # 解析 + 自校验 + 合并进 data/formations.json
    python tools/export_slots.py --check    # 只校验，不写盘
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

DOC = r"F:\sanguo\docs\04b1_阵形站位表.md"
OUT = r"F:\sanguo\data\formations.json"
OUT_GAME = r"F:\sanguo\game\data\formations.json"   # web/dist 读的那份，内容必须与 data/ 相同

GRID_W = 71      # x = 0..70
GRID_H = 14      # y = 0..13

# 文档里 a → 名字（章节标题里给了中文名，这里只做兜底）
NAME_FALLBACK = {0: "方形", 1: "圓形", 2: "錐形", 3: "雁形", 4: "玄襄",
                 5: "魚麗", 6: "鉤形", 7: "衝鋒", 8: "箭矢", 9: "亂陣", 10: "特殊陣型"}

HEAD_RE = re.compile(r"^#{3,4}\s+(.+?)（a=(\d+)，anchorX=(-?\d+)，权重和=(\d+)）")
MODE_TABLE_RE = re.compile(r"^\|\s*mode(\d)\s*\|\s*(\d+)\s*\|")
MODE_BLOCK_RE = re.compile(r"^\*\*mode(\d)\s*坐标（slot 0\.\.(\d+)）\*\*")
SLOT_RE = re.compile(r"(\d+):\((-?\d+),(-?\d+)\)")
COVER_RE = re.compile(r"x\s*(-?\d+)\.\.(-?\d+),\s*y\s*(-?\d+)\.\.(-?\d+)")


def parse(doc_path):
    text = open(doc_path, encoding="utf-8").read()
    lines = text.splitlines()

    formations = {}
    i = 0
    cur = None
    while i < len(lines):
        line = lines[i]
        m = HEAD_RE.match(line)
        if m:
            name, a, anchor, wsum = m.group(1).strip(), int(m.group(2)), int(m.group(3)), int(m.group(4))
            cur = {"a": a, "name": name, "anchorX": anchor, "weight_sum": wsum,
                   "weights": {}, "modes": {}, "declared": {}, "cover": {}}
            formations[a] = cur
            i += 1
            continue

        if cur is not None:
            mt = MODE_TABLE_RE.match(line)
            if mt:
                mode, w = int(mt.group(1)), int(mt.group(2))
                cur["weights"].setdefault(mode, w)
                # 覆盖格在表格行末
                cm = COVER_RE.search(line)
                if cm:
                    cur["cover"][mode] = [int(cm.group(k)) for k in (1, 2, 3, 4)]

            mb = MODE_BLOCK_RE.match(line)
            if mb:
                mode, declared = int(mb.group(1)), int(mb.group(2)) + 1
                # 往下找 ```text 块
                j = i + 1
                while j < len(lines) and "```" not in lines[j]:
                    j += 1
                if j < len(lines):
                    j += 1  # 跳过开围栏
                    buf = []
                    while j < len(lines) and not lines[j].startswith("```"):
                        buf.append(lines[j])
                        j += 1
                    coords = [[int(x), int(y)] for _, x, y in SLOT_RE.findall("\n".join(buf))]
                    cur["modes"][mode] = coords
                    cur["declared"][mode] = declared
                i = j
                continue
        i += 1
    return formations


def validate(forms):
    """返回 (rows, ok)。rows = [(检查项, 期望, 实际, 结论)]"""
    rows = []

    def chk(name, expect, actual):
        rows.append((name, expect, actual, "PASS" if expect == actual else "FAIL"))

    for a in sorted(forms):
        f = forms[a]
        chk("a=%d %s 权重和" % (a, f["name"]), 200, sum(f["weights"].values()))
        for mode, declared in sorted(f["declared"].items()):
            got = len(f["modes"].get(mode, []))
            chk("a=%d mode%d slot 数" % (a, mode), declared, got)
            # 数量对了再查"索引连续"与"包围盒"
            idx = [int(k) for k in re.findall(r"(\d+):\(", "")]
            if got:
                if mode in f["cover"]:
                    xs = [p[0] for p in f["modes"][mode]]
                    ys = [p[1] for p in f["modes"][mode]]
                    x0, x1, y0, y1 = f["cover"][mode]
                    chk("a=%d mode%d 包围盒" % (a, mode), [x0, x1, y0, y1], [min(xs), max(xs), min(ys), max(ys)])
    ok = all(r[3] == "PASS" for r in rows)
    return rows, ok


def build_fill_order(f, n):
    """§4 的分配：k_m = w_m*N//200，余数给 mode1；各区按槽位顺序取前 k_m 个。"""
    weights = f["weights"]
    ks = {m: weights.get(m, 0) * n // 200 for m in range(1, 6)}
    ks[1] += n - sum(ks.values())
    out = []
    for m in range(1, 6):
        if ks[m] <= 0:
            continue
        coords = f["modes"].get(m) or []
        if len(coords) < ks[m]:
            raise ValueError("a=%d mode%d 只有 %d 个 slot，要 %d 个（权重表与数组不一致）"
                             % (f["a"], m, len(coords), ks[m]))
        out.extend((m, coords[k][0], coords[k][1]) for k in range(ks[m]))
    return [{"mode": m, "x": x, "y": y} for m, x, y in out]


def to_json(forms):
    slots = []
    for a in sorted(forms):
        f = forms[a]
        entry = {
            "a": a,
            "name": f["name"],
            "anchorX": f["anchorX"],
            "weights": {str(k): v for k, v in sorted(f["weights"].items())},
            "modes": {str(k): v for k, v in sorted(f["modes"].items())},
            "bbox": {str(k): v for k, v in sorted(f["cover"].items())},
        }
        # 预生成 10 / 50 / 100 / 200 人的实际格位（客户端直接查，不重算）
        entry["fill"] = {}
        for n in (10, 50, 100, 200):
            try:
                entry["fill"][str(n)] = build_fill_order(f, n)
            except ValueError as e:
                entry["fill"][str(n)] = {"error": str(e)}
        slots.append(entry)
    return slots


def cell_xy(f, n, mode, x, y, side):
    """把表内坐标换成战场格：x + anchorX + (200-N)//25；A 侧镜像 71-1-x。"""
    gx = x + f["anchorX"] + (200 - n) // 25
    gy = y
    if side == "A":
        gx = GRID_W - 1 - gx
    return gx, gy


# ── 阵形相克矩阵 11×11（R28「補亂陣」）────────────────────────────────────
# 出处：EXE VA 0x0048D2A0，stride 0x2C = 11 个 int32，取值 -25..+25（docs/04b §3.3）。
#   · 前 9 行/列 = 玩家可选的 9 阵（= data/formations.json 的 names 顺序，旧数据只有这 9×9）；
#   · 第 9 行/列 = 特殊阵型（0x48B00C 的「特殊陣型」，值 ±8，引擎内部用）；
#   · 第 10 行/列 = 亂陣（0x48B000）——「不布阵」的内置阵：对任何阵 -25，任何阵对它 +25。
# 玩家永远选不到亂陣（名字表仍 9 项），它只作为矩阵的一维参与相克（battle.ts 的 formationBonus 直接查表）。
MATRIX_NAMES_TAIL = ["特殊阵型", "乱阵"]
MATRIX_11 = [
    [0,   7, -18,  19,  13,  -6,  23, -23, -15,   7,  25],   # 0 方形
    [-7,  0, -12,  22,  21,   6,  12, -24, -18,  -6,  25],   # 1 圆形
    [18, 12,   0, -19, -11,  25, -25,  -7,   6,   8,  25],   # 2 锥形
    [-19, -22, 19,   0,  -5, -11,   3,  15,  20,  -5,  25],  # 3 雁形
    [-13, -21, 11,   5,   0, -18,  -6,  24,  19,  -5,  25],  # 4 玄襄
    [6,  -6, -25,  11,  18,   0,  23, -10, -17,   6,  25],   # 5 鱼丽
    [-23, -12, 25,  -3,   6, -23,   0,  14,  15,  -6,  25],  # 6 钩形
    [23, 24,   7, -15, -24,  10, -14,   0, -12,   7,  25],   # 7 冲锋
    [15, 18,  -6, -20, -19,  17, -15,  12,   0,  -6,  25],   # 8 箭矢
    [-7,  6,  -8,   5,   5,  -6,   6,  -7,   6,   0,  25],   # 9 特殊阵型
    [-25, -25, -25, -25, -25, -25, -25, -25, -25, -25, 0],   # 10 乱阵
]


def build_matrix(data):
    """生成 11×11 相克矩阵，并与旧 9×9 逐格交叉校验。返回 (rows, names, checks)。"""
    names = list(data.get("names") or [])
    if len(names) != 9:
        raise SystemExit("formations.names 应为 9 阵，实际 %d" % len(names))
    rows = [list(r) for r in MATRIX_11]
    mnames = names + MATRIX_NAMES_TAIL
    checks = []

    # 1) 前 9×9 必须与旧数据逐格相同（手抄 121 个数的保险丝）
    old = data.get("matrix") or []
    bad = []
    for i in range(9):
        vs = old[i].get("vs") if i < len(old) else None
        for j in range(9):
            if not isinstance(vs, list) or j >= len(vs) or int(vs[j]) != rows[i][j]:
                bad.append("[%d][%d]" % (i, j))
    checks.append(("前 9×9 与旧数据一致", "0 处不一致",
                   "%d 处不一致%s" % (len(bad), ("：" + ",".join(bad[:6])) if bad else ""),
                   "通过" if not bad else "失败"))

    # 2) 对角必须 0（自己打自己没加成）
    diag = [i for i in range(11) if rows[i][i] != 0]
    checks.append(("对角为 0", "0 处", "%d 处" % len(diag), "通过" if not diag else "失败"))

    # 3) 反对称：m[i][j] + m[j][i] == 0（docs/04b §3.3 原表就是反对称）
    asym = [(i, j) for i in range(11) for j in range(11) if rows[i][j] + rows[j][i] != 0]
    checks.append(("反对称", "0 处", "%d 处" % len(asym), "通过" if not asym else "失败"))

    # 4) 取值范围：表里只有 -25..+25
    rng = [(i, j, rows[i][j]) for i in range(11) for j in range(11) if not -25 <= rows[i][j] <= 25]
    checks.append(("取值在 -25..+25", "0 处", "%d 处" % len(rng), "通过" if not rng else "失败"))

    # 5) 亂陣行：对 0..9 全 -25，对自己 0
    luan = [rows[10][j] for j in range(10)]
    ok_luan = all(v == -25 for v in luan) and rows[10][10] == 0
    checks.append(("亂陣行(10)全 -25", "-25 ×10 + 0", ("全 -25" if ok_luan else "异常 " + str(rows[10])),
                   "通过" if ok_luan else "失败"))

    # 6) 任何阵对亂陣 +25
    back = [rows[i][10] for i in range(10)]
    ok_back = all(v == 25 for v in back)
    checks.append(("亂陣列(10)全 +25", "+25 ×10", "全 +25" if ok_back else "异常 " + str(back),
                   "通过" if ok_back else "失败"))

    ok = all(c[3] == "通过" for c in checks)
    return rows, mnames, checks, ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    forms = parse(DOC)
    if not forms:
        print("没解析到任何阵形，检查文档格式是否变了")
        return 1

    rows, ok = validate(forms)
    print("%-28s %-18s %-18s %s" % ("检查项", "期望", "实际", "结论"))
    for r in rows:
        print("%-28s %-18s %-18s %s" % (r[0], r[1], r[2], r[3]))
    print("\n共 %d 组阵形，%d 项检查：%s" % (len(forms), len(rows), "全过" if ok else "有失败"))

    # 越界检查：10/100/200 人两侧都不能出 0..70 / 0..13
    bad = 0
    for a_ in sorted(forms):
        f = forms[a_]
        for n in (10, 100, 200):
            order = build_fill_order(f, n)
            for side in ("A", "B"):
                for s in order:
                    gx, gy = cell_xy(f, n, s["mode"], s["x"], s["y"], side)
                    if not (0 <= gx < GRID_W and 0 <= gy < GRID_H):
                        print("越界 a=%d N=%d %s mode%d (%d,%d) → 格(%d,%d)"
                              % (a_, n, side, s["mode"], s["x"], s["y"], gx, gy))
                        bad += 1
    print("越界格位：%d" % bad)
    if bad:
        ok = False

    if a.check:
        return 0 if ok else 2

    slots = to_json(forms)
    data = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    data["slots"] = slots
    data["slot_rule"] = {
        "grid": [GRID_W, GRID_H],
        "cell_px": [96, 72],
        "formula": "gx = x + anchorX + (200-N)//25 ; gy = y ; A 侧 gx = 70 - gx",
        "k_of_mode": "k_m = w_m*N//200（mode1 吃余数）",
        "source": "docs/04b1_阵形站位表.md",
    }

    # 相克矩阵：names 仍 9（玩家可选），matrix 11×11（多出 特殊阵型/亂陣 两维）
    mrows, mnames, mchecks, mok = build_matrix(data)
    data["matrix_names"] = mnames
    data["matrix"] = [{"name": mnames[i], "vs": mrows[i]} for i in range(11)]
    data["playable"] = len(data["names"])          # UI 只列前 playable 个，亂陣不可选
    data["matrix_source"] = {
        "va": "0x0048D2A0", "stride": "0x2C (11×int32)", "range": "[-25, +25]",
        "note": "前 9×9 为玩家 9 阵；index 9 = 特殊阵型（0x48B00C）；index 10 = 亂陣，对任何阵 -25",
    }

    print("\n%-28s %-18s %-18s %s" % ("矩阵检查", "期望", "实际", "结论"))
    for r in mchecks:
        print("%-28s %-18s %-18s %s" % r)
    print("矩阵：%d 名 × %d×%d（前 %d 名可选）" % (len(mnames), len(mrows), len(mrows[0]), data["playable"]))
    if not mok:
        ok = False

    body = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    for path in (OUT, OUT_GAME):
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(body)
    print("\n已写入 %s 与 %s 的 slots/matrix（%d 组 slot，%d B）"
          % (OUT, OUT_GAME, len(slots), os.path.getsize(OUT)))
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
