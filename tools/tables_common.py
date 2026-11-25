# -*- coding: utf-8 -*-
"""各表导出脚本共用的路径常量与小组件。

只做三件事：
  1. 统一 PAK / JSON / DOC 目录（避免每个脚本重复拼路径）；
  2. SHAPE 目录的**大小写不敏感**文件名索引（THINGS.INI 里同时写了
     \\magic\\000 与 \\MAGIC\\000，磁盘上却是 MAGIC\\000）；
  3. 动画序列行 -> token 列表 的切分与分类（THINGS.INI 专用）。

动画序列语法（本文件是全项目唯一实现，结论见 docs/03b）：
    行内容 = 逗号分隔的 token 流
    '#n'        帧延时（等待 n 个时间单位）
    '@%OM_XXX'  动画事件：播放到该帧时向引擎发一个 OM_ 动作码
    '$XXX'      音效：播放 SOUND 目录下的 XXX
    '!nnnn'     在动画中启动 SCRIPT\\MAGIC.SO 的脚本 nnnn
    'SCROVER'   序列终止（后面不再循环）
    'NULSHAPE'  空图形（不显示，只占时间）
    'XXXX0000'  图形名：SHAPE\\<Directory>\\<该名字>.SHP
"""

from __future__ import annotations

import os

PAK = r"F:\sanguo\extract\pak"
OUT = r"F:\sanguo\extract\json"
DOC = r"F:\sanguo\docs"
WORK = r"F:\sanguo\work"
SHAPE = os.path.join(PAK, "SHAPE")


# --------------------------------------------------------------------------- #
# 段取值小工具（字段名大小写在本作 INI 里不统一：Flags / FLAGS，Loyal / LOYAL）
# --------------------------------------------------------------------------- #
def get_ci(sec, key, default=None):
    """大小写不敏感地取段字段的最后一次出现。"""
    v = sec.get(key)
    if v is not None:
        return v
    low = key.lower()
    for k, vals in sec.items.items():
        if k.lower() == low:
            return vals[-1]
    return default


def has_ci(sec, key) -> bool:
    low = key.lower()
    return any(k.lower() == low for k in sec.items)


def ints(text, sep=","):
    """把 '8,8,64,0' / '1108 90' 拆成 int 列表，容忍多余空格与空项。"""
    if not text:
        return []
    out = []
    for part in text.replace(",", " ").split():
        try:
            out.append(int(part, 0))
        except ValueError:
            out.append(None)
    return out


# --------------------------------------------------------------------------- #
# SHAPE 目录索引（大小写不敏感）
# --------------------------------------------------------------------------- #
class ShapeIndex:
    """SHAPE\\ 下所有 .SHP 的大小写不敏感索引：'face/face001' -> 真实路径。"""

    def __init__(self, root: str = SHAPE):
        self.root = root
        self.files = {}        # 小写相对路径（不含 .SHP） -> 真实相对路径
        self.sizes = {}        # 小写相对路径 -> 字节数
        self.dirs = set()      # 小写目录名
        for dirpath, _dirnames, filenames in os.walk(root):
            rel = os.path.relpath(dirpath, root)
            rel = "" if rel == "." else rel.replace(os.sep, "/")
            self.dirs.add(rel.lower())
            for fn in filenames:
                stem, ext = os.path.splitext(fn)
                if ext.lower() != ".shp":
                    continue
                key = (rel + "/" + stem).lower().lstrip("/")
                self.files[key] = (rel + "/" + stem).lstrip("/")
                self.sizes[key] = os.path.getsize(os.path.join(dirpath, fn))

    def lookup(self, directory: str, name: str):
        """按 THINGS.INI 的 Directory + 图形名查真实文件，返回 (相对路径, 字节) 或 (None, 0)。"""
        d = (directory or "").replace("\\", "/").strip("/")
        key = (d + "/" + name).lower() if d else name.lower()
        if key in self.files:
            return self.files[key], self.sizes[key]
        return None, 0


# --------------------------------------------------------------------------- #
# 动画序列解析
# --------------------------------------------------------------------------- #
ANIM_FIELDS = (
    "First", "Wait", "Walk",
    "Attack", "Attack2", "Attack3", "Attack4", "Attack5",
    "Attack6", "Attack7", "Attack8",
    "Spell1", "Spell2", "Shot1", "Shot2", "Shot3",
    "Defense", "Pain", "Death", "Win", "Lose", "Life",
)

#: 帧延时 token 的语义猜测区间——只做记录，不改行为
KEYWORDS = ("SCROVER", "NULSHAPE")


def anim_tokens(text: str) -> list[dict]:
    """把一行动画序列切成 token 列表，并标注每类 token 的语义。"""
    out = []
    for raw in text.split(","):
        t = raw.strip()
        if not t:
            continue
        if t.startswith("#"):
            n = t[1:].strip()
            out.append({"raw": t, "kind": "delay",
                        "value": int(n) if n.isdigit() else None})
        elif t.startswith("@"):
            out.append({"raw": t, "kind": "event", "value": t[1:]})
        elif t.startswith("$"):
            out.append({"raw": t, "kind": "sound", "value": t[1:]})
        elif t.startswith("!"):
            body = t[1:].strip()
            out.append({"raw": t, "kind": "script",
                        "value": int(body) if body.isdigit() else body})
        elif t in KEYWORDS:
            out.append({"raw": t, "kind": "keyword", "value": t})
        else:
            out.append({"raw": t, "kind": "shape", "value": t})
    return out


# --------------------------------------------------------------------------- #
# 数值分布
# --------------------------------------------------------------------------- #
def dist(values) -> dict:
    """数值分布摘要：min/max/mean/中位数/直方（前若干桶）。"""
    v = [x for x in values if isinstance(x, (int, float))]
    if not v:
        return {"count": 0}
    v2 = sorted(v)
    n = len(v2)
    return {
        "count": n,
        "min": v2[0],
        "max": v2[-1],
        "mean": round(sum(v2) / n, 3),
        "median": v2[n // 2] if n % 2 else round((v2[n // 2 - 1] + v2[n // 2]) / 2, 3),
        "distinct": len(set(v2)),
        "values": sorted(set(v2))[:40] if len(set(v2)) <= 40 else None,
    }


def dist_text(values, top: int = 30) -> dict:
    """字符串字段分布：出现次数排序。"""
    c = {}
    for x in values:
        c[x] = c.get(x, 0) + 1
    items = sorted(c.items(), key=lambda kv: (-kv[1], str(kv[0])))
    return {"count": len(values), "distinct": len(c),
            "top": [{"value": k, "n": n} for k, n in items[:top]]}
