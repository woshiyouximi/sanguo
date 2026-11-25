"""给 .ps1 加/查 UTF-8 BOM（PS 5.1 读无 BOM 的 UTF-8 会按 GBK 解，中文全乱）。

为什么要有这个小工具：本轮硬性约束是「禁止用 PowerShell 改任何源码/文档」，
而 .ps1 必须带 BOM 才能被 PS 5.1 正确读出中文 —— 所以 .ps1 一律用 python 以
utf-8-sig 写，然后由 PowerShell 只做只读校验（[Parser]::ParseFile）。

用法：
    python work/enc/ps1.py write <src> <dst>   # src 读 utf-8（可已有 BOM），dst 写 utf-8-sig
    python work/enc/ps1.py check <file...>     # 只读：打印 BOM / 大小 / sha256 前 12 位
"""
import hashlib
import sys
from pathlib import Path

BOM = b"\xef\xbb\xbf"


def read_text(p: Path) -> str:
    raw = p.read_bytes()
    if raw.startswith(BOM):
        raw = raw[3:]
    return raw.decode("utf-8")


def cmd_write(src: str, dst: str) -> int:
    s = Path(src)
    d = Path(dst)
    text = read_text(s)
    if "\ufffd" in text:
        print(f"refuse: {src} contains U+FFFD, fix it before writing")
        return 1
    body = text.replace("\r\n", "\n").encode("utf-8")
    data = BOM + body
    d.parent.mkdir(parents=True, exist_ok=True)
    d.write_bytes(data)
    print(f"wrote {dst}  {len(data)} bytes  bom=yes  sha256={hashlib.sha256(data).hexdigest()[:12]}")
    return 0


def cmd_check(paths) -> int:
    for arg in paths:
        p = Path(arg)
        if not p.exists():
            print(f"{arg}  MISSING")
            continue
        raw = p.read_bytes()
        has = raw.startswith(BOM)
        body = raw[3:] if has else raw
        try:
            text = body.decode("utf-8")
            dec = "utf-8 ok"
        except UnicodeDecodeError as e:
            text = ""
            dec = f"utf-8 FAIL at {e.start}"
        print(
            f"{arg}  {len(raw)} bytes  bom={'YES' if has else 'NO'}  {dec}  "
            f"fffd={text.count(chr(0xFFFD))}  crlf={raw.count(b'\\r\\n')}  "
            f"sha256={hashlib.sha256(raw).hexdigest()[:12]}"
        )
    return 0


def main(argv) -> int:
    if len(argv) >= 3 and argv[0] == "write":
        return cmd_write(argv[1], argv[2])
    if len(argv) >= 2 and argv[0] == "check":
        return cmd_check(argv[1:])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
