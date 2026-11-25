# -*- coding: utf-8 -*-
"""核对 05c 文档里引用的统计数字（导入 magic_map 复用其解析）。"""
import sys, os, re, collections
sys.path.insert(0, r'F:\sanguo\tools')
sys.path.insert(0, r'F:\sanguo\work')
import magic_map as M

so = M.load_so()
seqmap = M.things_seqmap()
skills = M.build_skills(so, seqmap) if hasattr(M, 'build_skills') else None
print('magic_map attrs:', [a for a in dir(M) if not a.startswith('_')][:40])
print('so funcs:', len(so.funcs) if hasattr(so, 'funcs') else '?')
print('seqmap size:', len(seqmap))
