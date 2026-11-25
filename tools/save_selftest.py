#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
save_selftest.py — 给 save_layout.py 造一个"合成存档"，验证头解析与七段 dump 全流程。

本机 SAVES 目录为空、没有真实样本，所以用本脚本按 07b 的结构表反向构造一个最小
合法存档（1 个势力 / 2 座城 / 3 个部队 / 4 名武将 / 1 条路径 / 5 个点 / 128 字节标志），
再调用 save_layout.dump() 打印，确认偏移与字段解析都自洽。

用法：
    python save_selftest.py            # 写到 %TEMP%\\fake.SAV 并 dump
    python save_selftest.py <out.SAV>  # 指定输出路径
"""
import os
import struct
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import save_layout as S


def build(path):
    counts = {1: 1, 2: 2, 3: 3, 4: 4, 5: 1, 6: 5, 7: 0x80}
    strides = {1: 0x352, 2: 0xB2, 3: 0x70, 4: 0x11F, 5: 0x18, 6: 8, 7: 1}
    size = S.HDR_SIZE + sum(counts[k] * strides[k] for k in counts)
    buf = bytearray(size)
    struct.pack_into('<II', buf, 0, S.MAGIC, S.VERSION)
    struct.pack_into('<I', buf, 0x58, 189)         # 当前年
    struct.pack_into('<H', buf, 0x5C, 7)           # 当前月
    struct.pack_into('<I', buf, 0x30, 12)          # 月内倒计时

    off = S.HDR_SIZE
    # 段1 势力
    struct.pack_into('<II', buf, 0x68, counts[1], off)
    struct.pack_into('<I', buf, off, strides[1])
    buf[off + 4:off + 16] = u'何進'.encode('cp950').ljust(12, b'\0')
    off += counts[1] * strides[1]
    # 段2 城池
    struct.pack_into('<II', buf, 0x7C, counts[2], off)
    for i, (nm, pop, df, money) in enumerate([(u'襄平', 79500, 377, 2846),
                                              (u'洛陽', 412000, 900, 15200)]):
        o = off + i * strides[2]
        struct.pack_into('<I', buf, o, strides[2])
        struct.pack_into('<I', buf, o + 0x04, 1)
        buf[o + 8:o + 20] = nm.encode('cp950').ljust(12, b'\0')
        struct.pack_into('<I', buf, o + 0x70, 3)          # Rate
        struct.pack_into('<I', buf, o + 0x86, min(pop // 2500 + 110, 600))
        struct.pack_into('<I', buf, o + 0x8E, pop)
        struct.pack_into('<I', buf, o + 0x92, df)
        struct.pack_into('<I', buf, o + 0x96, money)
        struct.pack_into('<I', buf, o + 0x9A, i)
    off += counts[2] * strides[2]
    # 段3 部队
    struct.pack_into('<II', buf, 0x190, counts[3], off)
    for i in range(counts[3]):
        struct.pack_into('<I', buf, off + i * strides[3], strides[3])
    off += counts[3] * strides[3]
    # 段4 武将
    struct.pack_into('<II', buf, 0x1A4, counts[4], off)
    for i, (nm, lv, strv) in enumerate([(u'丁奉', 5, 80), (u'關羽', 9, 97),
                                        (u'張飛', 8, 96), (u'趙雲', 8, 96)]):
        o = off + i * strides[4]
        struct.pack_into('<I', buf, o, strides[4])
        struct.pack_into('<I', buf, o + 0x04, i)
        buf[o + 8:o + 20] = nm.encode('cp950').ljust(12, b'\0')
        struct.pack_into('<H', buf, o + 0x4E, lv)          # 等级
        struct.pack_into('<H', buf, o + 0x50, strv)        # 武力
        struct.pack_into('<I', buf, o + 0xB9, 1)           # STATUS 登用
    off += counts[4] * strides[4]
    # 段5 路径
    struct.pack_into('<II', buf, 0x1B8, counts[5], off)
    struct.pack_into('<I', buf, off, strides[5])
    struct.pack_into('<III', buf, off + 4, 0, 1, 260)       # 起点/终点/长度
    struct.pack_into('<II', buf, off + 0x10, counts[6], 0)  # 点数 / 点池起始下标
    off += counts[5] * strides[5]
    # 段6 路径点
    struct.pack_into('<II', buf, 0x1C0, counts[6], off)
    for i, (x, y) in enumerate([(1108, 90), (1066, 66), (1038, 64), (1013, 70), (1002, 92)]):
        o = off + i * strides[6]
        struct.pack_into('<Ihh', buf, o, strides[6], x, y)
    off += counts[6] * strides[6]
    # 段7 标志
    struct.pack_into('<II', buf, 0x1C8, 0x80, off)
    buf[off] = 0x5A
    open(path, 'wb').write(buf)
    return len(buf)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'fake.SAV')
    n = build(out)
    print('合成存档: %s (%d B)\n' % (out, n))
    S.dump(out)
