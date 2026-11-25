# -*- coding: utf-8 -*-
"""从 MAGIC.SO / SYSTEM.SO 的 0x301 / 0x300 调用点提取 (名字, 音量) 静态表。

不重新解码字节码，直接吃 `export/script/*.dis.txt` 里已经生成好的
反汇编文本：每个 `SYSCALL 0x301,` 行往回找最近的 `PUSHS`（名字）与
`PUSHI`（音量），往前找最近的 `; func #` 头得到所属函数。

用途：R52 的"字节码里到底该响什么"的地面真值，测试里断言的期望序列
就是从这份表里挑的。

输出：
  work/sfx_script/sites.json   机器可读
  work/sfx_script/sites.md     人读的表
"""
import json
import os
import re

ROOT = r'F:\sanguo'
SRC = [
    ('MAGIC.SO', os.path.join(ROOT, 'export', 'script', 'magic_so.dis.txt')),
    ('SYSTEM.SO', os.path.join(ROOT, 'export', 'script', 'system_so.dis.txt')),
]
OUT_DIR = os.path.join(ROOT, 'work', 'sfx_script')

RE_FUNC = re.compile(r'^; func #(\d+)\s+(\S+)\s+id=0x([0-9A-F]+) argc=(\d+)\s+@0x([0-9A-F]+)')
RE_SYS = re.compile(r'^([0-9A-F]{6})\s+\S+\s+SYSCALL\s+0x(300|301),\s+0x([0-9A-F]+)')
RE_PUSHS = re.compile(r'^([0-9A-F]{6})\s+\S+\s+PUSHS\s+(\d+)\s+;\s+"(.*)"')
RE_PUSHI = re.compile(r'^([0-9A-F]{6})\s+\S+\s+PUSHI\s+(-?\d+)')


def scan(path, label):
    lines = open(path, encoding='utf-8').read().splitlines()
    cur = {'func': '?', 'id': '?', 'argc': 0, 'off': '?'}
    sites = []
    # 最近一次 PUSHS / PUSHI（在 0x301 之前）
    last_name = None
    last_vol = None
    for ln in lines:
        m = RE_FUNC.match(ln)
        if m:
            cur = {'func': m.group(2), 'id': m.group(3), 'argc': int(m.group(4)), 'off': m.group(5)}
            continue
        m = RE_PUSHS.match(ln)
        if m:
            last_name = m.group(3)
            continue
        m = RE_PUSHI.match(ln)
        if m:
            last_vol = int(m.group(2))
            continue
        m = RE_SYS.match(ln)
        if m:
            sites.append({
                'file': label,
                'op': '0x' + m.group(2),
                'at': m.group(1),
                'func': cur['func'],
                'func_id': cur['id'],
                'func_argc': cur['argc'],
                'func_off': cur['off'],
                'name': last_name,
                'volume': last_vol,
            })
            last_name = None
            last_vol = None
    return sites


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    all_sites = []
    for label, path in SRC:
        if not os.path.exists(path):
            print('missing', path)
            continue
        s = scan(path, label)
        all_sites += s
        print('%s: %d sound sites' % (label, len(s)))

    # 0x301 的音量分布
    from collections import Counter, OrderedDict
    vol = Counter(s['volume'] for s in all_sites if s['op'] == '0x301')
    names = Counter(s['name'] for s in all_sites)
    print('volume histogram (0x301):', dict(sorted(vol.items(), key=lambda kv: -(kv[1]))))
    print('distinct names:', len(names))

    with open(os.path.join(OUT_DIR, 'sites.json'), 'w', encoding='utf-8') as fh:
        json.dump({'sites': all_sites,
                   'volume_hist': {str(k): v for k, v in vol.items()},
                   'distinct': len(names)}, fh, ensure_ascii=False, indent=1)

    md = []
    A = md.append
    A('# 脚本里的音效调用点（静态表）')
    A('')
    A('> 生成器 `work/sfx_script/sites.py`，输入 `export/script/{magic_so,system_so}.dis.txt`。')
    A('')
    A('## 结论')
    A('')
    A('- MAGIC.SO 与 SYSTEM.SO 合计 **%d** 个发声站（0x301 直接播 + 0x300 3D 播）。'
      % len(all_sites))
    A('- 0x301 的音量参数是 **0..255**（不是 0..1）：分布 %s。'
      % ', '.join('%d×%d' % (k, v) for k, v in sorted(vol.items(), key=lambda kv: -kv[1])))
    A('- 名字是资源键（`m016snd01`、`Rush01`、`VICTORY`…），所以"只记录不播"的损失')
    A('  只是最后一步 `audio.sfx(name)` —— 这是 R52 的直接依据。')
    A('')
    A('## 全部调用点')
    A('')
    A('| 文件 | op | 地址 | 函数 | argc | 名字 | 音量 |')
    A('| --- | --- | --- | --- | --- | --- | --- |')
    for s in all_sites:
        A('| %s | %s | 0x%s | `%s` | %d | `%s` | %s |'
          % (s['file'], s['op'], s['at'], s['func'], s['func_argc'],
             s['name'] if s['name'] is not None else '(动态)', 
             s['volume'] if s['volume'] is not None else '(动态)'))
    A('')
    with open(os.path.join(OUT_DIR, 'sites.md'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(md) + '\n')
    print('wrote', OUT_DIR)


if __name__ == '__main__':
    main()
