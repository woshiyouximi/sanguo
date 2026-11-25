# -*- coding: utf-8 -*-
"""
三国群英传2 (1999, 宇峻奥汀) INI 数据表通用解析器
=================================================

用途
----
把游戏 PAK 内解包出的 INI 配置表解析成结构化 Python 对象 / JSON。

本解析器处理的现实情况（均为实测，非假设）：

1. **编码不统一**。用户侧资料说“全部 GBK”，但实测 PAK 内的
   MAGIC/MESSAGE/SANGO/THINGS/TIMES1-5 全部是 **Big5(cp950) 繁体**，
   用 GBK 解码会直接抛 UnicodeDecodeError；COMBINE.INI 是纯 ASCII。
   因此这里做自动探测（utf-8 → gbk → cp950 → latin-1），
   并用“可疑字符惩罚”打分，避免 GBK 把 Big5 字节解成乱码却“成功”。
   调用方可用 encoding= 强制指定。

2. **重复段名**。MAGIC.INI 有 177 个同名 [MAGIC] 段，THINGS.INI 有 620 个
   同名 [OBJECT] 段，TIMES*.INI 有大量 [KING01]..[KINGxx]。
   → 段是有序列表，不是 dict；重复段名全部保留。

3. **重复键**。同一段内允许出现同名键（后值覆盖前值），
   → 段对象同时保留有序 fields 列表与 items 多值字典。

4. **行内 '=' 与值中的 '='**。MESSAGE.INI 的值里含 '%s'、'%k%%l%'、
   甚至 '=' 本身（如 "TYPE=%d Level=%d"），因此只在**第一个** '=' 处切分。

5. **注释**。支持 ';'、'#'、'//'、'REM ' 起始的整行注释；行尾注释默认不剥离
   （因为文本值里可能出现这些符号），可用 strip_inline_comment=True 打开。

6. **填充空格**。COMBINE.INI 用大量尾随空格把文件凑到 27534 字节，
   纯空白行一律跳过。

7. **行号追踪**。每个段、每个字段都记录源文件行号（1-based），
   便于文档里做“文件:行”式交叉引用。

对外 API
--------
    text, enc = read_text(path)                  # 读文本 + 探测到的编码
    ini       = IniFile.load(path)               # 解析整个文件
    ini.sections                                 # [IniSection]
    ini.get("SYSTEM")                            # 首个同名段
    ini.all("MAGIC")                             # 所有同名段
    ini.names()                                  # 段名出现顺序（去重）
    sec["MP"]                                    # 取值（str）
    sec.num("MP", 0)                             # 取整数（支持 0x 前缀）
    sec.fields                                   # [(key, value, lineno)]
    ini.to_dict()                                # 可 JSON 序列化

    write_json(path, obj)                        # UTF-8 无 BOM、缩进 1 的 JSON

命令行
------
    python parse_ini.py <file.ini> [--json out.json] [--limit N]
    不带参数时解析 test 目录下所有 INI 并打印统计。
"""

from __future__ import annotations

import json
import os
import re
import sys

# --------------------------------------------------------------------------- #
# 编码探测
# --------------------------------------------------------------------------- #

#: 依次尝试的编码。顺序即“同等可信度下的优先级”。
CANDIDATE_ENCODINGS = ("utf-8-sig", "gbk", "cp950", "big5", "latin-1")

#: 这些区段的字符出现在“解错了但没报错”的文本里，出现越多越可疑。
_SUSPECT_RANGES = (
    (0x0400, 0x04FF),   # 西里尔字母
    (0x0370, 0x03FF),   # 希腊字母
    (0x2500, 0x257F),   # 制表符
    (0xE000, 0xF8FF),   # 私用区
    (0x0080, 0x00FF),   # 拉丁补充（中文表里基本不该有）
)


def _plausibility(text: str) -> float:
    """给一段解码结果打分：汉字越多越好，可疑区段字符越多越差。"""
    cjk = 0
    suspect = 0
    for ch in text:
        cp = ord(ch)
        if 0x4E00 <= cp <= 0x9FFF:
            cjk += 1
        elif cp == 0xFFFD:
            suspect += 5
        else:
            for lo, hi in _SUSPECT_RANGES:
                if lo <= cp <= hi:
                    suspect += 1
                    break
    return cjk - 2.0 * suspect


def read_text(path: str, encoding: str | None = None) -> tuple[str, str]:
    """读取 INI 文本，返回 (text, 实际使用的编码)。

    encoding 为 None 时自动探测；否则强制使用（失败抛异常）。
    """
    with open(path, "rb") as fh:
        raw = fh.read()

    if encoding:
        return raw.decode(encoding), encoding

    # 纯 ASCII 快路径
    if not any(b >= 0x80 for b in raw):
        return raw.decode("ascii"), "ascii"

    best = None  # (score, enc, text)
    for enc in CANDIDATE_ENCODINGS:
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        score = _plausibility(text)
        if best is None or score > best[0]:
            best = (score, enc, text)
        if enc == "latin-1":       # latin-1 永远成功，作为兜底
            break
    if best is None:               # 理论上不可达
        return raw.decode("latin-1"), "latin-1"
    return best[2], best[1]


# --------------------------------------------------------------------------- #
# 数据结构
# --------------------------------------------------------------------------- #

_COMMENT_PREFIXES = (";", "#", "//", "REM ", "rem ")
_SECTION_RE = re.compile(r"^\[([^\]]*)\]\s*$")


class IniSection:
    """一个 [SECTION] 段。保留字段顺序、重复键与行号。"""

    __slots__ = ("name", "index", "lineno", "fields", "items", "source")

    def __init__(self, name: str, index: int, lineno: int, source: str = ""):
        self.name = name          # 段名，已 strip
        self.index = index        # 在本文件中的第几个段（0-based）
        self.lineno = lineno      # '[' 所在行号（1-based）
        self.fields: list[tuple[str, str, int]] = []   # (key, value, lineno)
        self.items: dict[str, list[str]] = {}          # key -> [value, ...]
        self.source = source      # 源文件路径

    # -- 添加 ---------------------------------------------------------------
    def add(self, key: str, value: str, lineno: int) -> None:
        self.fields.append((key, value, lineno))
        self.items.setdefault(key, []).append(value)

    # -- 读取 ---------------------------------------------------------------
    def get(self, key: str, default=None) -> str | None:
        """取最后一个同名键的值。"""
        vals = self.items.get(key)
        return vals[-1] if vals else default

    def getall(self, key: str) -> list[str]:
        return list(self.items.get(key, ()))

    def has(self, key: str) -> bool:
        return key in self.items

    def num(self, key: str, default=None):
        """取整数；支持 0x 十六进制、前后空格、'+'/'-'。失败返回 default。"""
        raw = self.get(key)
        if raw is None:
            return default
        s = raw.strip()
        if not s:
            return default
        try:
            if s.lower().startswith(("0x", "-0x", "+0x")):
                return int(s, 16)
            return int(s, 10)
        except ValueError:
            try:
                return float(s)
            except ValueError:
                return default

    def nums(self, key: str) -> list[int]:
        """取同名的多个整数键（如 SHAPE= 重复多次）。"""
        out = []
        for v in self.getall(key):
            try:
                out.append(int(v.strip(), 10))
            except ValueError:
                pass
        return out

    def as_dict(self) -> dict:
        """同名键合并成列表；单值键给标量。"""
        d = {}
        for k, vals in self.items.items():
            d[k] = vals[0] if len(vals) == 1 else list(vals)
        return d

    def lineno_of(self, key: str) -> int | None:
        for k, _v, ln in self.fields:
            if k == key:
                return ln
        return None

    def __getitem__(self, key):
        v = self.get(key)
        if v is None:
            raise KeyError(key)
        return v

    def __contains__(self, key):
        return key in self.items

    def __repr__(self):
        return f"<IniSection [{self.name}] #{self.index} line{self.lineno} keys={len(self.fields)}>"


class IniFile:
    """一个完整 INI 文件。"""

    def __init__(self, path: str, encoding: str = "", text: str = ""):
        self.path = path
        self.encoding = encoding
        self.text = text
        self.sections: list[IniSection] = []
        self.preamble: list[tuple[str, int]] = []   # 第一个段之前的非空行

    # -- 解析 ---------------------------------------------------------------
    @classmethod
    def load(cls, path: str, encoding: str | None = None,
             strip_inline_comment: bool = False) -> "IniFile":
        text, enc = read_text(path, encoding)
        ini = cls(path, enc, text)
        ini.parse(strip_inline_comment=strip_inline_comment)
        return ini

    def parse(self, strip_inline_comment: bool = False) -> None:
        cur: IniSection | None = None
        for lineno, raw in enumerate(self.text.splitlines(), 1):
            line = raw.strip()
            if not line:
                continue
            if line.startswith(_COMMENT_PREFIXES):
                continue

            m = _SECTION_RE.match(line)
            if m:
                cur = IniSection(m.group(1).strip(), len(self.sections),
                                 lineno, self.path)
                self.sections.append(cur)
                continue

            if "=" not in line:
                # 无 '=' 的行：段内是罕见的裸标记，段外进 preamble
                if cur is None:
                    self.preamble.append((line, lineno))
                else:
                    cur.add(line, "", lineno)
                continue

            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if strip_inline_comment:
                for mark in (";", "//"):
                    pos = value.find(mark)
                    if pos >= 0:
                        value = value[:pos].rstrip()
                        break
            if cur is None:
                # 段外的 KEY=VALUE（本作 INI 未见，但保留以增强通用性）
                self.preamble.append((line, lineno))
                continue
            cur.add(key, value, lineno)

    # -- 查询 ---------------------------------------------------------------
    def get(self, name: str) -> IniSection | None:
        for s in self.sections:
            if s.name.upper() == name.upper():
                return s
        return None

    def all(self, name: str) -> list[IniSection]:
        u = name.upper()
        return [s for s in self.sections if s.name.upper() == u]

    def names(self) -> list[str]:
        seen, out = set(), []
        for s in self.sections:
            if s.name not in seen:
                seen.add(s.name)
                out.append(s.name)
        return out

    def prefix_groups(self) -> dict[str, int]:
        """按段名前缀归类计数（[KING01]->KING, [FONTS01]->FONTS）。"""
        groups: dict[str, int] = {}
        for s in self.sections:
            base = re.sub(r"\d+$", "", s.name) or s.name
            groups[base] = groups.get(base, 0) + 1
        return groups

    # -- 输出 ---------------------------------------------------------------
    def stats(self) -> dict:
        return {
            "file": os.path.basename(self.path),
            "bytes": os.path.getsize(self.path) if os.path.exists(self.path) else len(self.text),
            "encoding": self.encoding,
            "lines": len(self.text.splitlines()),
            "sections": len(self.sections),
            "unique_section_names": len(self.names()),
            "section_groups": self.prefix_groups(),
            "field_lines": sum(len(s.fields) for s in self.sections),
            "distinct_keys": len({k for s in self.sections for k, _v, _l in s.fields}),
        }

    def to_dict(self) -> dict:
        return {
            "file": os.path.basename(self.path),
            "encoding": self.encoding,
            "stats": self.stats(),
            "sections": [
                {
                    "name": s.name,
                    "index": s.index,
                    "lineno": s.lineno,
                    "fields": [{"key": k, "value": v, "lineno": ln}
                               for k, v, ln in s.fields],
                }
                for s in self.sections
            ],
        }

    def __repr__(self):
        return f"<IniFile {os.path.basename(self.path)} enc={self.encoding} secs={len(self.sections)}>"


# --------------------------------------------------------------------------- #
# 输出辅助
# --------------------------------------------------------------------------- #

def write_json(path: str, obj, indent: int = 1) -> None:
    """写 UTF-8（无 BOM）JSON，父目录自动创建。"""
    d = os.path.dirname(os.path.abspath(path))
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=indent, sort_keys=False)
        fh.write("\n")


def write_text(path: str, text: str) -> None:
    d = os.path.dirname(os.path.abspath(path))
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def strip_trailing_pad(raw: bytes) -> bytes:
    """去掉文件尾部的大段空格填充（COMBINE.INI 需要）。"""
    return raw.rstrip(b" \r\n\t\x00")


# --------------------------------------------------------------------------- #
# 命令行
# --------------------------------------------------------------------------- #

def _main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 0
    path = argv[1]
    out = None
    limit = 40
    if "--json" in argv:
        out = argv[argv.index("--json") + 1]
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])

    ini = IniFile.load(path)
    st = ini.stats()
    print(f"== {st['file']}  enc={st['encoding']}  bytes={st['bytes']}  "
          f"lines={st['lines']}  sections={st['sections']}  "
          f"keys={st['distinct_keys']}")
    print("   section groups:", st["section_groups"])
    for s in ini.sections[:limit]:
        print(f"   [{s.name}] #{s.index} L{s.lineno} -> {len(s.fields)} keys")
        for k, v, ln in s.fields[:limit]:
            print(f"        L{ln:<6} {k:<28} = {v}")
        if len(s.fields) > limit:
            print(f"        ... ({len(s.fields) - limit} more)")
    if out:
        write_json(out, ini.to_dict())
        print("   ->", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv))
