"""把 SHAPE\\MAGIC 的 819 帧武将技特效导出成战斗视图能直接吃的素材。

两种落盘形态（`--mode auto` 先出 PNG、量到超过阈值再重出图集）：

  png    game/web/assets/fx/<dir>/fNNN.png     + index.json（dirs[*].files / sizes）
  atlas  game/web/assets/fx/atlas_<dir>.png    + index.json（dirs[*].sheet / list）

index.json 里除 `dirs`/`map` 外还写 `seqDirs`：29 个多目录技的分段时间表
（`{"<seq>": [{dir, from, to}]}`，from/to 是 0..1 归一化时间片，`to<=from` 表示
与相邻段同窗叠加）。表在文件下半部分的 SEQUENTIAL / OVERLAY 里，依据是原始
脚本 `magic_so.dis.txt` 的 PUSHS/PUSHI 顺序，改动后可用 `--index-only` 只重写索引。

保留原尺寸、原 RGB，只把 SHP 的色键像素写成 alpha=0；不做任何放大/调色。
锚点直接取 SHP 头里的 hotspot（+0x1C/+0x20），即 `sango_shp.load()` 的 offx/offy。

用法：
  python tools/export_magic_fx.py                 # auto：先 PNG，>3MB 自动换图集
  python tools/export_magic_fx.py --mode atlas    # 强制图集
  python tools/export_magic_fx.py --mode png      # 强制逐帧
  python tools/export_magic_fx.py --index-only    # 只重算 seqDirs、不重出图片
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import sango_shp  # noqa: E402  （同目录的工具，先加 sys.path）

SRC_DIR = os.path.join(ROOT, 'extract', 'pak', 'SHAPE', 'MAGIC')
MAGICS = os.path.join(ROOT, 'game', 'data', 'magics.json')
OUT_DIR = os.path.join(ROOT, 'game', 'web', 'assets', 'fx')

# 图集单页宽度上限：Chrome/Edge 的 canvas 能吃 32768，但 2048 对显存和
# drawImage 采样都更友好；超过就换行。
ATLAS_MAX_W = 2048
# 帧与帧之间留的透明缝。canvas 绘制时坐标是小数（投影后的 p.x 带小数），
# 双线性采样会吃到隔壁帧的边缘像素，留 2px 就够。
ATLAS_GAP = 2
# auto 模式的体积阈值（MB）
SIZE_LIMIT_MB = 3.0

# ---------------------------------------------------------------------------
# 朝向修正（度，指 A 方用的角度；B 方渲染时取负）
#
# 原作是**横版**战场：推进方向是屏幕横向，所以特效帧是照着「横向推进」画的
# （衝車朝左、半月斬的月牙拖着向右的尾迹 = 向左推进）。竖版重制把推进方向改成
# 纵向，帧就必须跟着转 90°，否则衝車会横着开、月牙会竖着劈。
#
# 但有几种帧转了反而错，保持竖直（0°）：
#   - 汉字/字形（013 傷、014 亂）
#   - 纯竖直的柱/束（009 火柱、016 聖光、026 水柱、035 長槍）
#   - 立在地上的物件（034/039 木桶、040 石像、041 交叉劍、025 太極）
#   - 人物/坐騎（012 武將騎馬）——转了就是"人躺下"；网址参数 ?fxrot=90 可强制全转
# ---------------------------------------------------------------------------
ROT_DEFAULT = 90
ROT_UPRIGHT = {'009', '012', '013', '014', '016', '025', '026', '034', '035', '039', '040', '041'}


def rot_of(d: str) -> int:
    return 0 if d in ROT_UPRIGHT else ROT_DEFAULT


def natural_key(name: str):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r'(\d+)', name)]


def frame_files(d: str):
    files = [f for f in os.listdir(d) if f.upper().endswith('.SHP')]
    files.sort(key=natural_key)
    return files


def load_magics():
    with open(MAGICS, encoding='utf-8') as f:
        return json.load(f)


def all_dirs():
    """磁盘上所有含 *.SHP 的子目录（40 个，000..041 缺 002/024）。

    `MAGIC\\M013WINGA6.SHP` 这个散件是怪物翅膀（M013），不是武将技特效，跳过。
    """
    out = []
    for name in sorted(os.listdir(SRC_DIR)):
        p = os.path.join(SRC_DIR, name)
        if os.path.isdir(p) and frame_files(p):
            out.append(name)
    return out


def build_map(magics):
    """seq -> 目录。优先 fx_dir_primary，目录不存在就退到 fx_dir 里第一个存在的。

    7 个伏兵系技能只引用缺失的 002/024，这里直接不生成 map 条目——渲染层
    拿不到目录就走原来的虚线圈兜底。
    """
    seq2dir = {}
    skipped = []
    for m in magics:
        seq = m['SEQUENCE']
        cands = []
        if m.get('fx_dir_primary'):
            cands.append(m['fx_dir_primary'])
        for d in m.get('fx_dir') or []:
            if d not in cands:
                cands.append(d)
        hit = next((d for d in cands if os.path.isdir(os.path.join(SRC_DIR, d))), None)
        if hit:
            seq2dir[str(seq)] = hit
        else:
            skipped.append((seq, m.get('NAME', ''), cands))
    return seq2dir, skipped


def decode_dir(d: str):
    """返回 [(file, PIL.Image, ax, ay)]，按文件名自然序 = 播放序。"""
    path = os.path.join(SRC_DIR, d)
    out = []
    for name in frame_files(path):
        shp = sango_shp.load(os.path.join(path, name))
        img = sango_shp.to_image(shp)
        # SHP 头部 hotspot：原作的(0,0)落点。渲染时把这一点对齐到世界坐标。
        out.append((name, img, int(shp.offx), int(shp.offy)))
    return out


def clear_out(out_dir: str):
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)


def export_png(dirs, out_dir):
    meta = {}
    for d in dirs:
        frames = decode_dir(d)
        if not frames:
            continue
        sub = os.path.join(out_dir, d)
        os.makedirs(sub, exist_ok=True)
        files, sizes = [], []
        for i, (_name, img, ax, ay) in enumerate(frames):
            fn = 'f%03d.png' % i
            img.save(os.path.join(sub, fn), optimize=True)
            files.append(fn)
            sizes.append([img.width, img.height, ax, ay])
        big = max(frames, key=lambda f: f[1].width * f[1].height)
        meta[d] = {
            'frames': len(frames),
            'w': big[1].width,
            'h': big[1].height,
            'anchor': [big[2], big[3]],
            'rot': rot_of(d),
            'files': files,
            'sizes': sizes,
        }
    return meta


def export_atlas(dirs, out_dir):
    """每目录一张横向图集：shelf packing（按高度排序后逐行铺，不按格子对齐）。

    早先按「目录内最大帧」划等大格子，实测填充率只有 19.7%（003 目录 6%），
    36.6 MPix 的图集里 7.2 MPix 才是真内容。改成 shelf packing 后面积降到
    约 1/4，图片字节和浏览器解码占的显存都跟着降。
    """
    from PIL import Image

    meta = {}
    for d in dirs:
        frames = decode_dir(d)
        if not frames:
            continue
        order = sorted(range(len(frames)), key=lambda i: (-frames[i][1].height, -frames[i][1].width))
        placed = [None] * len(frames)          # 下标 = 播放序
        x = y = row_h = 0
        sheet_w = 0
        for i in order:
            img = frames[i][1]
            if x > 0 and x + img.width > ATLAS_MAX_W:
                y += row_h + ATLAS_GAP
                x = 0
                row_h = 0
            placed[i] = (x, y)
            x += img.width + ATLAS_GAP
            row_h = max(row_h, img.height)
            sheet_w = max(sheet_w, x - ATLAS_GAP)
        sheet_h = y + row_h
        sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
        entries = []
        for i, (_name, img, ax, ay) in enumerate(frames):
            cx, cy = placed[i]
            sheet.paste(img, (cx, cy))
            # [sx, sy, sw, sh, ax, ay]；ax/ay 是帧内 hotspot，可能为负（012/014）
            entries.append([cx, cy, img.width, img.height, ax, ay])
        fn = 'atlas_%s.png' % d
        sheet.save(os.path.join(out_dir, fn), optimize=True)
        big = max(frames, key=lambda f: f[1].width * f[1].height)
        meta[d] = {
            'frames': len(frames),
            'w': big[1].width,
            'h': big[1].height,
            'anchor': [big[2], big[3]],
            'rot': rot_of(d),
            'sheet': fn,
            'sheetW': sheet_w,
            'sheetH': sheet_h,
            'list': entries,
        }
    return meta


def dir_size(path: str) -> int:
    total = 0
    for base, _dirs, files in os.walk(path):
        for f in files:
            total += os.path.getsize(os.path.join(base, f))
    return total


# ---------------------------------------------------------------------------
# 多目录技的分段时间表（index.json 的 seqDirs）
# ---------------------------------------------------------------------------
# 依据是原始脚本 `extract/script/magic_so.dis.txt`（doc: docs/05c_MAGIC特效映射.md）：
#   每个效果函数开头一定先 `PUSHS "magic\000\*"`（公共件，本轮不动），再
#   `PUSHS "magic\<主目录>\*"`；之后在 `CALL Create*` 子函数里用
#   `PUSHI <ThingID>` + `SYSCALL 0x011` 把「另一套目录」的帧单独 spawn 出来。
#   ThingID = 10000 + 1000*目录 + k，所以一条 PUSHI 就知道是哪个目录。
#
# 结论：29 个多目录技里，绝大多数其实是**同一招里并发的部件**（整目录载入一个 +
# 循环 spawn 另一个），只有三招是「先出 A 再出 B」的复合演出：
#   - 44 天地無用 / 110 鬼哭神號：FinalX1/FinalX2 全函数没有任何 PUSHI spawn，
#     三个目录只能按 PUSHS 的出现顺序接续播；切点按各自帧数比例（见下）。
#   - 104 神鬼亂舞：DemonDancing 先 24001(WAVE,014) … 14001(衝車,004) 交替 spawn，
#     末尾 CALL CreateLastAttack 再 spawn 24005(WAVE,014) 收尾 —— 衝車在前、WAVE 收尾。
# 其余 26 招写 `OVERLAY`：carrier 占满 0..1，部件写 `{dir, from:0, to:0}` 表示「叠加」，
# 视图侧把 from==to 的段并到相邻非零段的时间窗里同屏画（例：刀劍亂 036 劍 + 026 水柱）。
SEQUENTIAL = {
    # seq: [目录…]，按播出自左向右
    44: ['032', '027', '018'],   # FinalX1 @0x36310：PUSHS 000,032,027,018，无 spawn
    104: ['004', '014'],         # DemonDancing @0x14DE8：衝車 004 → CreateLastAttack 的 WAVE 014
    110: ['012', '025', '031'],  # FinalX2 @0x39D3C：PUSHS 000,012,025,031，无 spawn
}
OVERLAY = {
    # seq: [carrier, 部件…]，carrier 放满 0..1
    12: ['031', '041'],   # Interceptor @0x32A4C：載入 041 拒馬，spawn 41001→031 火球
    27: ['031', '041'],
    40: ['031', '041'],
    43: ['032', '022'],   # Sparkle @0x2AB7C：載入 032 電球，spawn 32001→022 冰霧
    46: ['019', '009'],   # RunningBow @0x1B250：載入 019 弩箭，spawn 19001→009 火
    49: ['036', '026'],   # Slash @0x2EAFC：載入 036 劍，spawn 36001→026 水柱（刀光）
    51: ['011', '001'],   # Tornado @0x129AC：載入 011 龍捲風，spawn 11001→001 半月斬
    54: ['021', '010'],   # FireRing @0x1D5B4：載入 021 火焰，spawn 20001→010 地劍
    62: ['019', '009'],
    63: ['022', '012'],   # Ice @0x1ED78：載入 022 冰霧，spawn 22001→012 劍氣尾光
    70: ['027', '017'],   # FireCow @0x24530：載入 027 火牛，spawn 27001→017 龍/火
    75: ['011', '001'],
    76: ['022', '012'],
    77: ['021', '010'],
    85: ['019', '009'],
    86: ['036', '026'],
    88: ['030', '020'],   # HalfMoonNew @0x28914：載入 030 半月斬，spawn 30001→020 黑洞
    89: ['021', '010'],
    92: ['027', '017'],
    95: ['038', '028'],   # TwisterSword @0x30F20：載入 038 劍A1（112 帧），spawn 38001→028 石頭
    97: ['022', '012'],
    100: ['011', '001'],
    102: ['031', '021'],  # FirePillar @0x2A0AC：載入 031 火柱，spawn 31001×17→021 火焰
    103: ['021', '010'],
    108: ['027', '017'],
    109: ['030', '020'],
    110: None,  # 见 SEQUENTIAL
}
OVERLAY.pop(110, None)


def build_seq_dirs(magics, dirs_meta):
    """生成 index.json 的 `seqDirs`：只给多目录技，单目录技保持 map 回退。

    from/to 是 0..1 的归一化时间片；视图侧拿 `elapsed/life` 直接对照。
    接续段的切点 = 累计帧数 / 总帧数 —— 这样每段里「一帧 ≈ 2.2 tick」，
    和 core 的 `ttl = clamp(round(frames * 2.2), 24, 132)` 完全同源。
    """
    def frames_of(d):
        return int((dirs_meta.get(d) or {}).get('frames') or 0)

    def ok(dirs):
        return all(frames_of(d) > 0 for d in dirs)

    out = {}
    for m in magics:
        seq = m['SEQUENCE']
        want = m.get('fx_dir') or []
        if len(want) <= 1:
            continue
        dirs = SEQUENTIAL.get(seq)
        if dirs and ok(dirs):
            total = sum(frames_of(d) for d in dirs)
            segs, acc = [], 0
            for i, d in enumerate(dirs):
                frm = round(acc / total, 3)
                acc += frames_of(d)
                to = 1.0 if i == len(dirs) - 1 else round(acc / total, 3)
                segs.append({'dir': d, 'from': frm, 'to': to})
            out[str(seq)] = segs
            continue
        dirs = OVERLAY.get(seq)
        if dirs and ok(dirs):
            segs = [{'dir': dirs[0], 'from': 0.0, 'to': 1.0}]
            segs += [{'dir': d, 'from': 0.0, 'to': 0.0} for d in dirs[1:]]
            out[str(seq)] = segs
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


def check_seq_dirs(magics, seq_dirs, dirs_meta):
    want = {str(m['SEQUENCE']) for m in magics if len(m.get('fx_dir') or []) > 1}
    got = set(seq_dirs)
    miss = sorted(want - got, key=int)
    extra = sorted(got - want, key=int)
    if miss:
        print('  WARN 多目录技没排段: %s' % miss)
    if extra:
        print('  WARN seqDirs 里有多余的技: %s' % extra)
    for seq, segs in seq_dirs.items():
        for s in segs:
            if s['dir'] not in dirs_meta:
                print('  WARN seq=%s 段目录 %s 不在图集里' % (seq, s['dir']))
    print('seqDirs: %d 技 / %d 段 (接续技 %d, 叠加技 %d)' % (
        len(seq_dirs),
        sum(len(v) for v in seq_dirs.values()),
        sum(1 for v in seq_dirs.values() if any(s['to'] > s['from'] for s in v) and
            sum(1 for s in v if s['to'] > s['from']) > 1),
        sum(1 for v in seq_dirs.values() if any(s['to'] <= s['from'] for s in v))))


def write_index(out_dir, mode, dirs_meta, seq2dir, extra):
    doc = {
        'version': 1,
        'mode': mode,
        'source': 'extract/pak/SHAPE/MAGIC',
        'tickLife': 30,          # core 的 Fx.ttl 缺省值：30 tick = 1s @30Hz
        'maxSamples': 30,        # 一屏最多取 30 个采样帧（已被逐技 ttl 取代，留作旧版兼容）
        'dirs': dirs_meta,
        'map': dict(sorted(seq2dir.items(), key=lambda kv: int(kv[0]))),
    }
    doc.update(extra)
    path = os.path.join(out_dir, 'index.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    return path


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['auto', 'png', 'atlas'], default='auto')
    ap.add_argument('--dirs', choices=['all', 'mapped'], default='all',
                    help='all=磁盘上全部 40 个目录（含暂时只做叠层的）；mapped=只导 map 用到的')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--limit-mb', type=float, default=SIZE_LIMIT_MB)
    ap.add_argument('--index-only', action='store_true',
                    help='不重导图片，只按现有 index.json 的 dirs 重算 seqDirs 再写回（改表时用）')
    args = ap.parse_args(argv)

    magics = load_magics()
    out_dir = os.path.abspath(args.out)

    if args.index_only:
        path = os.path.join(out_dir, 'index.json')
        with open(path, encoding='utf-8') as f:
            doc = json.load(f)
        seq_dirs = build_seq_dirs(magics, doc['dirs'])
        check_seq_dirs(magics, seq_dirs, doc['dirs'])
        doc['seqDirs'] = seq_dirs
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
        print('index (index-only) -> %s  %d bytes' % (path, os.path.getsize(path)))
        return 0

    seq2dir, skipped = build_map(magics)
    dirs = all_dirs() if args.dirs == 'all' else sorted({d for d in seq2dir.values()})
    print('skills=%d  mapped=%d  dirs=%d  skipped=%d' % (
        len(magics), len(seq2dir), len(dirs), len(skipped)))
    for seq, name, cands in skipped:
        print('  skip seq=%s dirs=%s' % (seq, cands))

    out_dir = os.path.abspath(args.out)
    clear_out(out_dir)

    mode = args.mode
    if mode == 'auto':
        meta = export_png(dirs, out_dir)
        size = dir_size(out_dir)
        mb = size / 1048576
        print('png mode: %.2f MB (%d bytes)' % (mb, size))
        if mb <= args.limit_mb:
            mode = 'png'
        else:
            print('over %.1f MB -> rebuild as atlas' % args.limit_mb)
            clear_out(out_dir)
            mode = 'atlas'
            meta = export_atlas(dirs, out_dir)
    elif mode == 'png':
        meta = export_png(dirs, out_dir)
    else:
        meta = export_atlas(dirs, out_dir)

    size = dir_size(out_dir)
    seq_dirs = build_seq_dirs(magics, meta)
    check_seq_dirs(magics, seq_dirs, meta)
    extra = {'bytes': size, 'dirCount': len(meta), 'seqDirs': seq_dirs}
    write_index(out_dir, mode, meta, seq2dir, extra)

    total_frames = sum(m['frames'] for m in meta.values())
    print('mode=%s frames=%d dirs=%d total=%.2f MB' % (
        mode, total_frames, len(meta), size / 1048576))
    print('index -> %s' % os.path.join(out_dir, 'index.json'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
