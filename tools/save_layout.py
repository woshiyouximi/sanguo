#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
save_layout.py — 《三国群英传2》存档 (SAVES\\SANGOxx.SAV) 结构表 + dump 工具

结构来源：Sango2.exe 写档函数 0x43207C 及其调用的 7 个段序列化函数
          读档校验 0x433D60 起（magic/版本检查）
本机没有存档样本（SAVES 目录为空），所以本工具只做"结构定义 + 有样本时 dump"。

用法：
    python save_layout.py                     # 打印结构总表
    python save_layout.py <xxx.SAV>           # dump 成可读文本
    python save_layout.py <xxx.SAV> --hex     # 同时打印原始 hex

字段定义格式：(offset, size, type, name, source)
    source = 该字段在内存对象里的来源偏移（None 表示未定位），来自写档指令的实际读取。
    记录内偏移 0 永远是 u32 自身长度（= 段 stride），所以对象字段从 +4 开始。
"""
import struct
import sys

HDR_SIZE = 0x1D0
MAGIC = 0x56415353          # b"SSAV"
VERSION = 0x20000           # 2.0

# ---------------------------------------------------------------- 头部 0x1D0
# 证据：0x43207C 写档函数 + 0x433D60 读档校验
HEADER = [
    (0x00, 4, 'u32', 'magic "SSAV"', None),
    (0x04, 4, 'u32', 'version = 0x20000', None),
    (0x08, 4, 'u32', '未定位（写档未显式赋值，恒 0）', None),
    (0x0C, 0x40, 'raw', '清零区（保留）', None),
    (0x30, 4, 'u32', '月内倒计时 [0x4C30E0]', None),
    (0x34, 0x18, 'raw', '未定位（保留）', None),
    (0x4C, 4, 'u32', '0x4388BB() Obj3 全局值', None),
    (0x50, 4, 'u32', '玩家势力序号 Xform([0x4A64F0])', None),
    (0x54, 4, 'u32', '玩家势力序号2 Xform([0x4A64F4])', None),
    (0x58, 4, 'u32', '当前年 [0x4BD390]', None),
    (0x5C, 2, 'u16', '当前月 [0x4A64BC]（0-based）', None),
    (0x5E, 2, 'u16', '年进位标志 [0x4A64FC]', None),
    (0x60, 4, 'u32', '[0x4C30D8] 未定位', None),
    (0x64, 4, 'u32', '[0x4C30DC] 未定位', None),
    (0x68, 4, 'u32', '段1 条数 (势力)', None),
    (0x6C, 4, 'u32', '段1 文件偏移', None),
    (0x70, 4, 'u32', 'Xform(0x40947B()) 全局统计1', None),
    (0x74, 4, 'u32', 'Xform(0x409485()) 全局统计2', None),
    (0x78, 4, 'u32', 'Xform(0x40948F()) 全局统计3', None),
    (0x7C, 4, 'u32', '段2 条数 (城池)', None),
    (0x80, 4, 'u32', '段2 文件偏移', None),
    (0x84, 4, 'u32', 'Xform(0x405356()) 城池统计1', None),
    (0x88, 4, 'u32', 'Xform(0x405360()) 城池统计2', None),
    (0x8C, 4, 'u32', 'Xform(0x40536A()) 城池统计3', None),
    (0x90, 0x100, 'u32[64]', '64 座城池摘要（Xform(0x405450(i))）', None),
    (0x190, 4, 'u32', '段3 条数 (部队)', None),
    (0x194, 4, 'u32', '段3 文件偏移', None),
    (0x198, 4, 'u32', 'Xform(0x43886C()) Obj3 统计1', None),
    (0x19C, 4, 'u32', 'Xform(0x438876()) Obj3 统计2', None),
    (0x1A0, 4, 'u32', 'Xform(0x438880()) Obj3 统计3', None),
    (0x1A4, 4, 'u32', '段4 条数 (武将)', None),
    (0x1A8, 4, 'u32', '段4 文件偏移', None),
    (0x1AC, 4, 'u32', 'Xform(0x406A98()) 武将统计1', None),
    (0x1B0, 4, 'u32', 'Xform(0x406AA2()) 武将统计2', None),
    (0x1B4, 4, 'u32', 'Xform(0x406AAC()) 武将统计3', None),
    (0x1B8, 4, 'u32', '段5 条数 (路径)', None),
    (0x1BC, 4, 'u32', '段5 文件偏移', None),
    (0x1C0, 4, 'u32', '段6 条数 (路径点)', None),
    (0x1C4, 4, 'u32', '段6 文件偏移', None),
    (0x1C8, 4, 'u32', '段7 字节数 = 0x80（常量，非条数）', None),
    (0x1CC, 4, 'u32', '段7 文件偏移', None),
]

# ------------------------------------------------- 段1 势力 (King) 32 × 0x352
# King 节点 = 0x34A 字节，池基址 [0x4A6190]（由 Xform 0x409430 的 div 0x34A 证实）
SEC1 = [
    (0x00, 4, 'u32', '记录长度 = 0x352', None),
    (0x04, 0x0C, 'raw', '君主名/前缀 12 B（King+0x00..0x0B 原样）', 0x00),
    (0x10, 4, 'u32', 'Xform(King+0x0C 指针)', 0x0C),
    (0x14, 4, 'u32', '恒 0（读档侧显式清 0）', 0x10),
    (0x18, 4, 'u32', '恒 0（读档侧显式清 0）', 0x14),
    (0x1C, 4, 'u32', 'Xform(King+0x18 指针)', 0x18),
    (0x20, 4, 'u32', 'King+0x1C', 0x1C),
    (0x24, 4, 'u32', 'King+0x20', 0x20),
    (0x28, 4, 'u32', 'King+0x24', 0x24),
    (0x2C, 4, 'u32', 'King+0x28', 0x28),
    (0x30, 4, 'u32', 'King+0x2C', 0x2C),
    (0x34, 4, 'u32', 'King+0x30', 0x30),
    (0x38, 4, 'u32', 'King+0x34', 0x34),
    (0x38, 0x100, 'raw', '定长块 0x100（memcpy 原样，含义未定位）', 0x34),
    (0x138, 0x200, 'raw', '定长块 0x200（memcpy 原样；512 = TotalGeneral 提示为每武将 1 B）', 0x134),
    (0x338, 4, 'u32', '恒 0（读档侧清 0，运行时重建城池链）', 0x334),
    (0x33C, 4, 'u32', 'Xform(King+0x338 **势力城池链头**)', 0x338),
    (0x340, 4, 'u32', 'Xform(King+0x33C Obj3 指针)', 0x33C),
    (0x344, 2, 'u16', 'King+0x340', 0x340),
    (0x346, 4, 'u32', 'King+0x342', 0x342),
    (0x34A, 4, 'u32', 'Xform(King+0x346 **池内 next**)', 0x346),
    (0x34E, 4, 'u32', '附加字段（超出 0x34A 节点体，语义未定位）', None),
]

# ---------------------------------------------- 段2 城池 (City) 64 × 0xB2
# City 节点 = 0xAA 字节，池基址 [0x4A6170]，64 × 0xAA = 0x2A80
SEC2 = [
    (0x00, 4, 'u32', '记录长度 = 0xB2', None),
    (0x04, 4, 'u32', 'City+0x00 有效标志(=1)', 0x00),
    (0x08, 0x0C, 'char[12]', 'City+0x04 城名（memcpy 0xC，实际 name[] 更长）', 0x04),
    (0x14, 4, 'u32', 'Xform(City+0x10 **所属君主 King***)', 0x10),
    (0x18, 4, 'u32', 'Xform(City+0x14 **太守 General***)', 0x14),
    (0x1C, 4, 'u32', 'Xform(City+0x18 **军师 General***)', 0x18),
    (0x20, 4, 'u32', 'Xform(City+0x1C General*)', 0x1C),
    (0x24, 4, 'u32', 'Xform(City+0x20 General*)', 0x20),
    (0x28, 4, 'u32', 'Xform(City+0x24 **城内武将链头 General***)', 0x24),
    (0x2C, 4, 'u32', 'Xform(City+0x28 General*)', 0x28),
    (0x30, 4, 'u32', 'City+0x2C', 0x2C),
    (0x34, 4, 'u32', 'City+0x30 **城内总兵数**', 0x30),
    (0x38, 4, 'u32', 'City+0x34', 0x34),
    (0x3C, 4, 'u32', 'City+0x38 **到目标城的路径距离**', 0x38),
    (0x40, 4, 'u32', 'City+0x3C **可出兵标志**（AI 0x40CAF1 判 !=0）', 0x3C),
    (0x44, 4, 'u32', 'City+0x40', 0x40),
    (0x48, 4, 'u32', 'City+0x44', 0x44),
    (0x4C, 36, 'u32[9]', 'Xform(City+0x46+i*4) **9 个相邻城池序号**（不可通行者=-1）', 0x46),
    (0x70, 4, 'u32', 'City+0x6C **Rate 开发率(1..5)**', 0x6C),
    (0x74, 18, 'u16[9]', 'City+0x70..0x80 九个 u16（邻接距离/方向，未定名）', 0x70),
    (0x86, 4, 'u32', 'City+0x82 **预备兵上限** = min(人口/2500+110, 600)', 0x82),
    (0x8A, 4, 'u32', 'City+0x86 **现有预备兵**', 0x86),
    (0x8E, 4, 'u32', 'City+0x8A **人口**', 0x8A),
    (0x92, 4, 'u32', 'City+0x8E **防御力**', 0x8E),
    (0x96, 4, 'u32', 'City+0x92 **金钱**', 0x92),
    (0x9A, 4, 'u32', 'City+0x96 **永久自索引**', 0x96),
    (0x9E, 4, 'u32', 'City+0x9A', 0x9A),
    (0xA2, 4, 'u32', 'City+0x9E **FLAGS（1=关卡）**', 0x9E),
    (0xA6, 4, 'u32', 'Xform(City+0xA2 **势力城池链 next**)', 0xA2),
    (0xAA, 4, 'u32', 'Xform(City+0xA6 **池内 next**)', 0xA6),
]

# --------------------------------- 段3 部队 (Obj3) 128 × 0x70
# Obj3 节点 = 0x6C；池 = malloc(0x3600) = 128×0x6C，指针 [0x4A662C]（0x438530 初始化）
SEC3 = [
    (0x00, 4, 'u32', '记录长度 = 0x70', None),
    (0x04, 4, 'u32', 'Obj3+0x00', 0x00),
    (0x08, 4, 'u32', 'Obj3+0x04', 0x04),
    (0x0C, 4, 'u32', 'Xform(Obj3+0x08 **所属君主 King***)', 0x08),
    (0x10, 4, 'u32', 'Xform(Obj3+0x0C General*) 武将槽1', 0x0C),
    (0x14, 4, 'u32', 'Xform(Obj3+0x10 General*) 武将槽2', 0x10),
    (0x18, 4, 'u32', 'Xform(Obj3+0x14 General*) 武将槽3', 0x14),
    (0x1C, 4, 'u32', 'Xform(Obj3+0x18 General*) 武将槽4', 0x18),
    (0x20, 4, 'u32', 'Xform(Obj3+0x1C General*) 武将槽5', 0x1C),
    (0x24, 4, 'u32', 'Obj3+0x20', 0x20),
    (0x28, 4, 'u32', 'Obj3+0x24', 0x24),
    (0x2C, 4, 'u32', 'Obj3+0x28', 0x28),
    (0x30, 4, 'u32', 'Obj3+0x2C', 0x2C),
    (0x34, 2, 'u16', 'Obj3+0x30', 0x30),
    (0x36, 2, 'u16', 'Obj3+0x32', 0x32),
    (0x38, 2, 'u16', 'Obj3+0x34', 0x34),
    (0x3A, 2, 'u16', 'Obj3+0x36', 0x36),
    (0x3C, 4, 'u32', 'Xform(Obj3+0x38 City*)', 0x38),
    (0x40, 4, 'u32', 'Xform(Obj3+0x3C City*)', 0x3C),
    (0x44, 4, 'u32', 'Xform(Obj3+0x40 City*)', 0x40),
    (0x48, 4, 'u32', 'Xform(Obj3+0x44 City*)', 0x44),
    (0x4C, 4, 'u32', '路径表下标 (0x422DE1 → 0x4BD5C0)', 0x48),
    (0x50, 4, 'u32', 'Obj3+0x4C', 0x4C),
    (0x54, 4, 'u32', 'Obj3+0x50', 0x50),
    (0x58, 4, 'u32', 'Obj3+0x54', 0x54),
    (0x5C, 4, 'u32', 'Obj3+0x58', 0x58),
    (0x60, 4, 'u32', '恒 0', 0x5C),
    (0x64, 4, 'u32', '恒 0', 0x60),
    (0x68, 4, 'u32', 'Xform(Obj3+0x64 prev)', 0x64),
    (0x6C, 4, 'u32', 'Xform(Obj3+0x68 next)', 0x68),
]

# --------------------------------- 段4 武将 (General) 512 × 0x11F
# 源对象 = General 节点 0xF7，池 0x4A6180（Xform 0x406A4A 的 div 0xF7 证实）
# 注意：记录是"重排/压缩"布局，与 General 偏移不是恒定位移（前段 +0x20，后段 +0x28）
SEC4_HEAD = [
    (0x00, 4, 'u32', '记录长度 = 0x11F', None),
    (0x04, 4, 'u32', '武将序号 Xform(General*)', None),
    (0x08, 12, 'char[12]', '武将名（strcpy）', None),
    (0x10, 1, 'u8', '恒 0', None),
    (0x11, 0x1F, 'raw', '未定位（写档未显式赋值区）', None),
]
SEC4_BODY = [
    (0x30, 2, 'u16', '体力（当前）', 0x10),
    (0x32, 2, 'u16', '体力（最大）', 0x12),
    (0x34, 2, 'u16', '技力（当前）', 0x14),
    (0x36, 2, 'u16', '技力（最大）', 0x16),
    (0x38, 2, 'u16', 'BASEHP', 0x18),
    (0x3A, 2, 'u16', 'BASEMP', 0x1A),
    (0x3C, 2, 'u16', 'General+0x1C', 0x1C),
    (0x3E, 2, 'u16', 'General+0x1E', 0x1E),
    (0x40, 2, 'u16', 'General+0x20', 0x20),
    (0x42, 2, 'u16', 'General+0x22', 0x22),
    (0x44, 2, 'u16', 'General+0x24', 0x24),
    (0x46, 2, 'u16', 'General+0x26', 0x26),
    (0x48, 2, 'u16', 'General+0x28', 0x28),
    (0x4A, 4, 'u32', 'BASEEXP', 0x2A),
    (0x4E, 2, 'u16', '等级（1..20）', 0x2E),
    (0x50, 2, 'u16', '武力 STR', 0x30),
    (0x52, 2, 'u16', '智力 INT', 0x32),
    (0x54, 2, 'u16', 'STR2', 0x34),
    (0x56, 2, 'u16', 'INT2', 0x36),
    (0x58, 2, 'u16', 'General+0x38', 0x38),
    (0x5A, 2, 'u16', '功勋（04b 标注 +0x3A）', 0x3A),
    (0x5C, 2, 'u16', '疲劳（04b 标注 +0x3C）', 0x3C),
    (0x5E, 2, 'u16', 'General+0x3E', 0x3E),
    (0x60, 2, 'u16', 'General+0x40', 0x40),
    (0x62, 2, 'u16', '带兵数上限（=min(等级×5,100)）', 0x42),
    (0x64, 2, 'u16', '带兵数当前', 0x44),
    (0x66, 2, 'u16', '骑兵数上限', 0x46),
    (0x68, 2, 'u16', '骑兵数当前', 0x48),
    (0x6A, 10, 'u16[5]', 'POS[5] 出场城池序号（5 个剧本）', 0x4A),
    (0x74, 16, 'u16[8]', 'General+0x54 起的 8 个 u8 逐字节扩成 u16', 0x54),
    (0x84, 8, 'u8[8]', 'General+0x5C 8 字节（技能等级？）', 0x5C),
    (0x8C, 1, 'u8', 'General+0x64', 0x64),
    (0x8D, 16, 'raw', '8 组 (u8 已学, u8 等级) 武将技表 ← General+0x65', 0x65),
    (0x9D, 16, 'raw', '8 组 (u8 已学, u8 等级) 军师技表 ← General+0x75', 0x75),
    (0xAD, 2, 'u16', 'General+0x85', 0x85),
    (0xAF, 4, 'u32', 'FORCE 兵种', 0x87),
    (0xB3, 4, 'u32', 'USEFORCE 当前兵种', 0x8B),
    (0xB7, 2, 'u16', 'TYPE', 0x8F),
    (0xB9, 4, 'u32', 'STATUS（8=在野 1=登用 2=俘虜）', 0x91),
    (0xBD, 4, 'u32', 'General+0x95', 0x95),
    (0xC1, 2, 'u16', 'HORSE 马', 0x99),
    (0xC3, 2, 'u16', 'WEAPON 武器', 0x9B),
    (0xC5, 2, 'u16', 'THING 物品', 0x9D),
    (0xC7, 2, 'u16', 'General+0x9F', 0x9F),
    (0xC9, 2, 'u16', 'General+0xA1', 0xA1),
    (0xCB, 2, 'u16', 'General+0xA3', 0xA3),
    (0xCD, 2, 'u16', 'General+0xA5', 0xA5),
    (0xCF, 4, 'u32', 'BattleArray 已会阵形位掩码', 0xA7),
    (0xD3, 2, 'u16', 'UseBattleArray 当前阵形', 0xAB),
    (0xD5, 10, 'u16[5]', 'General+0xAD 5 个 u16', 0xAD),
    (0xDF, 1, 'u8', 'General+0xB7?（未定位具体源）', None),
    (0xE0, 7, 'raw', '未定位（写档未显式赋值区）', None),
    (0xE7, 4, 'u32', 'Xform(King*) ← General+0xBF', 0xBF),
    (0xEB, 4, 'u32', 'Xform(General*) ← General+0xC3', 0xC3),
    (0xEF, 2, 'u16', 'General+0xC7', 0xC7),
    (0xF1, 2, 'u16', 'General+0xC9', 0xC9),
    (0xF3, 4, 'u32', 'Xform(King*) ← General+0xCB', 0xCB),
    (0xF7, 4, 'u32', 'Xform(King*) ← General+0xCF', 0xCF),
    (0xFB, 4, 'u32', 'Xform(Obj3*) ← General+0xD3', 0xD3),
    (0xFF, 4, 'u32', 'Xform(City*) ← General+0xD7', 0xD7),
    (0x103, 4, 'u32', 'Xform(General*) ← General+0xDB', 0xDB),
    (0x107, 4, 'u32', 'Xform(General*) ← General+0xDF', 0xDF),
    (0x10B, 4, 'u32', 'Xform(General*) ← General+0xE3', 0xE3),
    (0x10F, 4, 'u32', 'Xform(General*) ← General+0xE7', 0xE7),
    (0x113, 4, 'u32', 'Xform(General*) ← General+0xEB', 0xEB),
    (0x117, 4, 'u32', 'Xform(General*) ← General+0xEF', 0xEF),
    (0x11B, 4, 'u32', 'Xform(General*) ← General+0xF3 **池内 next**', 0xF3),
]
SEC4 = SEC4_HEAD + SEC4_BODY

# --------------------------------- 段5 路径表 118 × 0x18 / 上限 256
# 运行时表 0x4BD5C0，stride 0x14，count [0x4A64AC]，添加函数 0x422CCE
SEC5 = [
    (0x00, 4, 'u32', '记录长度 = 0x18', None),
    (0x04, 4, 'u32', 'Xform(City*) 起点城序号', 0x00),
    (0x08, 4, 'u32', 'Xform(City*) 终点城序号', 0x04),
    (0x0C, 4, 'u32', '路径长度 Length', 0x08),
    (0x10, 4, 'u32', '路径点数（Point 个数）', 0x0C),
    (0x14, 4, 'u32', '本条路径的点数组在全局点池 0x4BE9C0 中的起始下标', 0x10),
]

# --------------------------------- 段6 路径点池（≤2048 点，每点 8 B）
SEC6 = [
    (0x00, 4, 'u32', '记录长度 = 8', None),
    (0x04, 2, 'i16', '点 x 坐标', 0x00),
    (0x06, 2, 'i16', '点 y 坐标', 0x02),
]

# --------------------------------- 段7 128 字节标志表
SEC7 = [
    (0x00, 1, 'u8', '取自 128×0x56 表 [0x4C3A74]+i*0x56 的 +0x0C(i16) 低字节；表语义未定位', None),
]

SECTIONS = [
    ('段1 势力 King', SEC1, 0x352, 32, '第 1 势力数恒 32（[SYSTEM] TotalKing=15，其余为空槽）'),
    ('段2 城池 City', SEC2, 0xB2, 64, '条数 = [SYSTEM] TotalCity = 64'),
    ('段3 部队 Obj3', SEC3, 0x70, 128, '条数恒 128（对象池固定 malloc 0x3600）'),
    ('段4 武将 General', SEC4, 0x11F, 512, '条数 = [SYSTEM] TotalGeneral = 512'),
    ('段5 路径 Path', SEC5, 0x18, 118, '条数 = [0x4A64AC]，上限 0x100=256；TIMES1 为 118 条'),
    ('段6 路径点 PathPoint', SEC6, 8, 2048, '条数 = [0x4A64B0]，上限 0x800=2048 点'),
    ('段7 标志位 Flag128', SEC7, 1, 128, '字节数固定 0x80'),
]


def print_layout():
    print('=== 头部 0x%X ===' % HDR_SIZE)
    for off, size, typ, name, src in HEADER:
        print('  +0x%03X  %-4d  %-9s %s' % (off, size, typ, name))
    total = HDR_SIZE
    for title, fields, stride, count, note in SECTIONS:
        print('\n=== %s  stride=0x%X  count=%d  (%s) ===' % (title, stride, count, note))
        for off, size, typ, name, src in fields:
            s = '' if src is None else ' <- 源 +0x%X' % src
            print('  +0x%03X  %-4d  %-9s %s%s' % (off, size, typ, name, s))
        total += stride * count
    print('\n理论上限文件大小 = 0x%X (%d B)' % (total, total))


def dump(path, show_hex=False):
    data = open(path, 'rb').read()
    print('文件: %s  (%d B)' % (path, len(data)))
    if len(data) < HDR_SIZE:
        print('!! 不足一个头部，非本格式')
        return
    hdr = data[:HDR_SIZE]
    magic, ver = struct.unpack_from('<II', hdr, 0)
    print('magic=%08X (%s)  version=%08X (%s)' % (
        magic, hdr[:4].decode('latin1'), ver, 'OK' if ver == VERSION else '不匹配'))
    if show_hex:
        for i in range(0, HDR_SIZE, 16):
            print('  %04X  %s' % (i, hdr[i:i + 16].hex(' ')))
    print('\n--- 头部关键字段 ---')
    for name, off, fmt in [
        ('月内倒计时', 0x30, '<I'), ('玩家势力', 0x50, '<I'), ('当前年', 0x58, '<I'),
        ('当前月', 0x5C, '<H'), ('年进位', 0x5E, '<H'),
    ]:
        print('  %s = %d' % (name, struct.unpack_from(fmt, hdr, off)[0]))

    for idx, (title, fields, stride, count, note) in enumerate(SECTIONS, start=1):
        cnt = struct.unpack_from('<I', hdr, {1: 0x68, 2: 0x7C, 3: 0x190, 4: 0x1A4,
                                            5: 0x1B8, 6: 0x1C0, 7: 0x1C8}[idx])[0]
        base = struct.unpack_from('<I', hdr, {1: 0x6C, 2: 0x80, 3: 0x194, 4: 0x1A8,
                                             5: 0x1BC, 6: 0x1C4, 7: 0x1CC}[idx])[0]
        print('\n=== %s : count=%d base=0x%X stride=0x%X ===' % (title, cnt, base, stride))
        if base + cnt * stride > len(data):
            print('  !! 段数据超出文件尾（base+count*stride > size），文件可能被截断')
            cnt = max(0, (len(data) - base) // stride)
        if stride < 4:                                  # 段7：纯字节表
            print('  ' + data[base:base + min(cnt, 64)].hex(' '))
            continue
        for i in range(min(cnt, 8)):
            off = base + i * stride
            rec = data[off:off + stride]
            if len(rec) < 4:
                break
            ln = struct.unpack_from('<I', rec, 0)[0]
            print('  [%03d] @0x%06X  len=0x%X' % (i, off, ln))
            for foff, fsize, ftyp, fname, src in fields:
                if ftyp == 'raw':
                    continue
                if foff + fsize > len(rec):
                    continue
                if ftyp in ('u8',):
                    v = rec[foff]
                elif ftyp == 'u16':
                    v = struct.unpack_from('<H', rec, foff)[0]
                elif ftyp == 'i16':
                    v = struct.unpack_from('<h', rec, foff)[0]
                elif ftyp in ('u32', 'char[12]'):
                    v = struct.unpack_from('<I', rec, foff)[0] if ftyp == 'u32' else rec[foff:foff + fsize].split(b'\0')[0].decode('cp950', 'replace')
                else:
                    continue
                print('       +0x%03X %-46s = %s' % (foff, fname[:46], v))
        if cnt > 8:
            print('  ...（仅显示前 8 条）')


if __name__ == '__main__':
    if len(sys.argv) >= 2:
        dump(sys.argv[1], '--hex' in sys.argv)
    else:
        print_layout()
