# -*- coding: utf-8 -*-
"""三国群英传2 竖版重制 · 音频转码（WAV / MP3 -> 网页用 MP3 + index.json）

系统里没有 ffmpeg / ffprobe（已 `where` 确认全空），所以全程纯 Python：
  - WAV 解码：标准库 wave + numpy（原声基本是 8bit 11k/22k，音质本来就低）
  - MP3 解码：miniaudio（坑：汉字路径会 DecodeError(-1)，必须先拷到 ASCII 临时目录）
  - 重采样：numpy 线性插值；降采样前先过一个盒式低通抑制混叠
  - MP3 编码：lameenc

用法：
  python export_audio.py                                   # hi 档 -> game/web/assets/audio
  python export_audio.py --tier lo --out .../assets/audio_lo
  python export_audio.py --only sfx                        # 只重做音效
  python export_audio.py --tracks all                      # 17 首 BGM 全转（默认只转地形用到的 3 首）

依赖：pip install lameenc miniaudio numpy
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
import wave

import numpy as np

# ---------------------------------------------------------------- 路径常量

SRC_SFX = r'F:\sanguo\extract\pak\SOUND'          # 99 个 *.WAV
SRC_BGM = (r'C:\Users\liutian\Downloads\sgqyzzwb_146364'
           r'\三国群英传2 修正版 1.05+\MP3')       # 01..17.mp3，用户原始安装目录（只读！）
SRC_INI = r'F:\sanguo\extract\pak\SANGO.INI'      # Big5，[TERRAIN] 里有 SoundTrack
TMPDIR = r'F:\sanguo\work\audiotmp'               # ASCII 临时目录（给 miniaudio 用）
OUT_DEFAULT = r'F:\sanguo\game\web\assets\audio'

SFX_RATE = 22050          # 统一单声道 22.05k：11k 源不会丢内容，22k 源刚好覆盖
BGM_RATE = 44100

# 码率档位：(sfx_kbps, bgm_kbps, bgm_rate, bgm_channels)
#   hi   = 任务要求的 96-128，默认发布档
#   mid/lo/mini/tiny 只用于 >2MB 时的降档对比；tiny 把 BGM 压到 22.05k 单声道才勉强进 2MB
TIERS = {
    'hi': (96, 128, 44100, 2),
    'mid': (64, 96, 44100, 2),
    'lo': (48, 64, 44100, 2),
    'mini': (32, 32, 44100, 2),
    'tiny': (32, 24, 22050, 1),
    # BGM 懒加载档：SFX 保持 hi（96k/22.05k 单声道），BGM 压到 64 kbps 单声道
    # （原版 MP3 是 256 kbps 立体声；单首 0.55–1.33 MB，见 project/37c §5）
    'bgm64': (96, 64, 44100, 1),
}

# 场景曲目（project/37c §3 的 BGM 表，EXE 触发点已实证）：
#   03 = 主菜单/忠诚度/招降委任   17 = 大地图   10–14 = 内政总览按势力规模 5 档
#   01/02/07/08/09/15/16 是死曲目（零触发点），**故意不装**。
SCENE_TRACKS = [3, 10, 11, 12, 13, 14, 17]

# ---------------------------------------------------------------- 地形表
#
# [确认] 来自 Sango2.exe 0x05315B 的格式串 "mp3\\%02d.mp3"：
#        SANGO.INI 的 SoundTrack 数字**直接就是** MP3 文件名编号。
#        所以 SoundTrack=4/5/6 -> 04.mp3 / 05.mp3 / 06.mp3。
# [确认] 下面 12 行的 (名字, SoundTrack) 是从 SANGO.INI [TERRAIN] 0..11 段读出来的；
#        脚本仍会现场解析一次，解析失败才退回这张表。
TERRAIN_FALLBACK = [
    ('城', 6), ('城', 5), ('城', 4), ('船上', 4), ('草原', 6), ('平原', 5),
    ('山地', 4), ('森林', 6), ('雪原', 6), ('沙漠', 5), ('關卡', 5), ('長城', 4),
]

# 语义别名 -> 具体音效名。audio.js 用 SG.audio.sfx('hit') 这类通用名时会查这张表。
# 有数据引用的写在前面；[推测] 的标在后面。
ALIASES = {
    'hit': 'hit01',        # [确认] THINGS.INI Pain = ..., $Hit01
    'hit2': 'hit02',       # [确认] THINGS.INI Wait = #9999, m000hit02
    'defend': 'defense',   # [确认] THINGS.INI Defense = ..., $Defense
    'defend2': 'defense2',
    'death': 'death',
    'death2': 'death3',
    'horse': 'horse01',    # [确认] THINGS.INI $Horse01
    'horse2': 'horse02',
    'arrow': 'arrow',
    'sword': 'flaysword',  # [推测] 挥剑
    'click': 'accept',     # [确认] exe 菜单热键表里的 ACCEPT
    'spell': 'm005snd01',  # [推测] 通用施法音，借用「雷擊」特效音
    'heal': 'm016snd01',   # [确认] 命療術 / 回天術
    'rush': 'rush01',      # [确认] SYSTEM.SO
    'success': 'success',  # [确认] SYSTEM.SO
    'victory': 'victory',  # [确认] SYSTEM.SO
    'defeat': 'failure2',  # [确认] SYSTEM.SO（失败）
    'silence': 'silence',  # [确认] exe 字面量
    'yell': 'yell01',
    'yell2': 'yell02',
    'yell3': 'yell03',
    'bg': 'bg03a',
}


# ---------------------------------------------------------------- 工具函数

def log(msg=''):
    print(msg, flush=True)


def resample(x: np.ndarray, src: int, dst: int) -> np.ndarray:
    """线性插值重采样。降采样前先做长度为 round(src/dst) 的盒式低通。"""
    if src == dst or x.size == 0:
        return x
    ratio = dst / float(src)
    n = max(1, int(round(x.size * ratio)))
    if ratio < 1.0:
        k = int(round(1.0 / ratio))
        if k >= 2:
            ker = np.ones(k, dtype=np.float64) / k
            x = np.convolve(x, ker, mode='same')
    src_idx = np.arange(x.size, dtype=np.float64)
    dst_idx = np.clip(np.arange(n, dtype=np.float64) / ratio, 0, x.size - 1)
    return np.interp(dst_idx, src_idx, x)


def fade_edges(x: np.ndarray, sr: int, ms: float = 4.0) -> np.ndarray:
    """首尾各加一个 4ms 的淡入淡出，避免 8bit 源切出来的爆音。"""
    k = min(x.size // 2, int(sr * ms / 1000.0))
    if k > 1:
        ramp = np.linspace(0.0, 1.0, k)
        x[:k] *= ramp
        x[-k:] *= ramp[::-1]
    return x


def read_wav_mono(path: str) -> tuple[np.ndarray, int]:
    """读 WAV -> (float64 mono -1..1, 原始采样率)。"""
    with wave.open(path, 'rb') as w:
        ch, sr, sw, n = w.getnchannels(), w.getframerate(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw == 1:                                  # 8bit 无符号
        a = (np.frombuffer(raw, np.uint8).astype(np.float64) - 128.0) / 128.0
    elif sw == 2:                                # 16bit 有符号
        a = np.frombuffer(raw, '<i2').astype(np.float64) / 32768.0
    elif sw == 3:                                # 24bit
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        a = v.astype(np.float64) / float(1 << 23)
    elif sw == 4:
        a = np.frombuffer(raw, '<i4').astype(np.float64) / 2147483648.0
    else:
        raise ValueError('unsupported sample width %d in %s' % (sw, path))
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def to_pcm16(x: np.ndarray) -> bytes:
    return (np.clip(x, -1.0, 1.0) * 32767.0).astype('<i2').tobytes()


def mp3_encode(pcm: bytes, rate: int, channels: int, kbps: int) -> bytes:
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(int(kbps))
    enc.set_in_sample_rate(int(rate))
    enc.set_out_sample_rate(int(rate))
    enc.set_channels(int(channels))
    enc.set_quality(2)
    return bytes(enc.encode(pcm)) + bytes(enc.flush())


def ascii_scratch(src: str) -> str:
    """miniaudio 用汉字路径会 DecodeError(-1)，先拷到 ASCII 临时目录。"""
    os.makedirs(TMPDIR, exist_ok=True)
    dst = os.path.join(TMPDIR, 'bgm_src.mp3')
    shutil.copyfile(src, dst)
    return dst


def decode_mp3(path: str, rate: int = BGM_RATE, channels: int = 2):
    """MP3 -> (float64 [n,ch] -1..1, 采样率)。汉字路径请先过 ascii_scratch()。"""
    import miniaudio
    d = miniaudio.decode_file(path, output_format=miniaudio.SampleFormat.SIGNED16,
                              nchannels=channels, sample_rate=rate)
    a = np.frombuffer(bytes(np.asarray(d.samples, dtype='<i2').tobytes()),
                      '<i2').astype(np.float64) / 32768.0
    return a.reshape(-1, channels), d.sample_rate


def pcm16_interleaved(x: np.ndarray) -> bytes:
    return (np.clip(x, -1.0, 1.0) * 32767.0).astype('<i2').tobytes()


# ---------------------------------------------------------------- SANGO.INI

def parse_terrain(ini_path: str):
    """解析 SANGO.INI 的 [TERRAIN] 段 -> [(Name, SoundTrack), ...]。失败返回 None。"""
    if not os.path.exists(ini_path):
        return None
    raw = open(ini_path, 'rb').read()
    for enc in ('big5', 'cp950', 'gbk', 'utf-8'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode('big5', 'replace')

    sections, cur, name = [], {}, None
    for line in text.splitlines():
        s = line.strip()
        if s.startswith('[') and s.endswith(']'):
            if name is not None:
                sections.append((name, cur))
            name, cur = s[1:-1].strip().upper(), {}
            continue
        if '=' in s and name is not None:
            k, v = s.split('=', 1)
            cur[k.strip().lower()] = v.strip()
    if name is not None:
        sections.append((name, cur))

    rows = []
    for sec, kv in sections:
        if sec != 'TERRAIN':
            continue
        try:
            rows.append((int(kv.get('sequence', len(rows))),
                         kv.get('name', '?'),
                         int(kv.get('soundtrack', '0'))))
        except ValueError:
            continue
    if len(rows) != 12:
        return None
    rows.sort(key=lambda r: r[0])
    return [(n, t) for _, n, t in rows]


# ---------------------------------------------------------------- 主流程

def do_sfx(out_dir: str, kbps: int) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    names = sorted(f for f in os.listdir(SRC_SFX) if f.lower().endswith('.wav'))
    sizes, total_in = {}, 0
    t0 = time.time()
    for i, fn in enumerate(names, 1):
        src = os.path.join(SRC_SFX, fn)
        x, sr = read_wav_mono(src)
        x = resample(x, sr, SFX_RATE)
        x = fade_edges(x, SFX_RATE)
        data = mp3_encode(to_pcm16(x), SFX_RATE, 1, kbps)
        stem = os.path.splitext(fn)[0].lower()
        dst = os.path.join(out_dir, stem + '.mp3')
        with open(dst, 'wb') as f:
            f.write(data)
        sizes[stem] = len(data)
        total_in += os.path.getsize(src)
        if i % 20 == 0 or i == len(names):
            log('  sfx %3d/%d  %6.2fs' % (i, len(names), time.time() - t0))
    log('  音效：%d 个，WAV %.2f MB -> MP3 %.2f MB（%d kbps 单声道 %d Hz）'
        % (len(names), total_in / 1048576, sum(sizes.values()) / 1048576, kbps, SFX_RATE))
    return sizes


def do_bgm(out_dir: str, kbps: int, track_nums, rate: int = BGM_RATE,
           channels: int = 2) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    info = {}
    t0 = time.time()
    for num in track_nums:
        src = os.path.join(SRC_BGM, '%02d.mp3' % num)
        if not os.path.exists(src):
            log('  ! 缺文件 %s' % src)
            continue
        scratch = ascii_scratch(src)
        x, sr = decode_mp3(scratch, rate, channels)
        data = mp3_encode(pcm16_interleaved(x), sr, channels, kbps)
        dst = os.path.join(out_dir, '%02d.mp3' % num)
        with open(dst, 'wb') as f:
            f.write(data)
        info[str(num)] = {'file': '%02d.mp3' % num, 'bytes': len(data),
                          'sec': round(x.shape[0] / float(sr), 2),
                          'srcBytes': os.path.getsize(src),
                          'kbps': kbps, 'rate': sr, 'channels': channels}
        log('  bgm %02d.mp3  %5.1fs -> %5.2f MB  (源 %.2f MB)'
            % (num, x.shape[0] / float(sr), len(data) / 1048576,
               os.path.getsize(src) / 1048576))
    log('  音乐：%d 首，共 %.2f MB（%d kbps %s %d Hz，%.1fs）'
        % (len(info), sum(v['bytes'] for v in info.values()) / 1048576,
           kbps, '立体声' if channels == 2 else '单声道', rate, time.time() - t0))
    return info


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='三国群英传2 竖版重制 · 音频转码')
    ap.add_argument('--tier', default='hi', choices=sorted(TIERS), help='码率档位')
    ap.add_argument('--out', default=None, help='输出目录，默认 game/web/assets/audio')
    ap.add_argument('--only', default='all', choices=['all', 'sfx', 'bgm'])
    ap.add_argument('--tracks', default='terrain',
                    choices=['terrain', 'scenes', 'all'],
                    help='terrain=地形引用到的 3 首，scenes=菜单/大地图/内政 7 首（SCENE_TRACKS），all=17 首全转')
    ap.add_argument('--sfx-kbps', type=int, default=None)
    ap.add_argument('--bgm-kbps', type=int, default=None)
    args = ap.parse_args(argv)

    sfx_kbps, bgm_kbps, bgm_rate, bgm_ch = TIERS[args.tier]
    if args.sfx_kbps:
        sfx_kbps = args.sfx_kbps
    if args.bgm_kbps:
        bgm_kbps = args.bgm_kbps
    out_dir = args.out or OUT_DEFAULT

    log('== 三国群英传2 音频转码：tier=%s  sfx=%dk  bgm=%dk/%dHz/%dch  -> %s'
        % (args.tier, sfx_kbps, bgm_kbps, bgm_rate, bgm_ch, out_dir))

    # 1) 地形表
    terrain = parse_terrain(SRC_INI)
    if terrain:
        log(' 地形：从 SANGO.INI 解析到 %d 条 [TERRAIN]' % len(terrain))
    else:
        terrain = list(TERRAIN_FALLBACK)
        log(' 地形：! SANGO.INI 解析失败，退回内置表（%d 条）' % len(terrain))
    used_tracks = sorted({t for _, t in terrain})
    log(' 地形引用到的曲目号：%s' % used_tracks)

    # 2) 目录
    sfx_dir = os.path.join(out_dir, 'sfx')
    bgm_dir = os.path.join(out_dir, 'bgm')

    # 3) 转码
    sfx_sizes = {}
    if args.only in ('all', 'sfx'):
        log('[1/2] 音效 ...')
        sfx_sizes = do_sfx(sfx_dir, sfx_kbps)
    elif os.path.isdir(sfx_dir):
        sfx_sizes = {os.path.splitext(f)[0]: os.path.getsize(os.path.join(sfx_dir, f))
                     for f in os.listdir(sfx_dir) if f.lower().endswith('.mp3')}

    track_nums = list(range(1, 18)) if args.tracks == 'all' else (
        list(SCENE_TRACKS) if args.tracks == 'scenes' else used_tracks)
    bgm_info = {}
    if args.only in ('all', 'bgm'):
        log('[2/2] 音乐 ...')
        bgm_info = do_bgm(bgm_dir, bgm_kbps, track_nums, bgm_rate, bgm_ch)
    elif os.path.isdir(bgm_dir):
        for f in os.listdir(bgm_dir):
            if f.lower().endswith('.mp3'):
                num = os.path.splitext(f)[0]
                bgm_info[num] = {'file': f, 'bytes': os.path.getsize(os.path.join(bgm_dir, f))}

    # 3.5) 只转了一部分曲目时，把 index.json 里没重转的条目原样并回来
    #      （否则 --only bgm --tracks scenes 会把 04/05/06 的元数据冲掉）
    idx_path = os.path.join(out_dir, 'index.json')
    old_bgm, old_fmt = {}, None
    if os.path.exists(idx_path):
        try:
            with open(idx_path, 'r', encoding='utf-8') as f:
                old = json.load(f)
            old_bgm = old.get('bgm') or {}
            old_fmt = old.get('bgmFormat')
        except Exception as e:  # 老文件坏了就整体重写，不算失败
            log('  ! 旧 index.json 读不出（%s），按全新 rewrite' % e)
    if old_bgm:
        for k, v in old_bgm.items():
            if k in bgm_info:
                continue
            v = dict(v)
            if old_fmt and 'kbps' not in v:   # 老条目补上它当年用的格式
                v.update({kk: old_fmt[kk] for kk in ('kbps', 'rate', 'channels')
                          if kk in old_fmt})
            bgm_info[k] = v
        log('  index.json：并入未重转的 %d 首旧曲目' % (len(bgm_info) - len(track_nums)))

    # 4) index.json
    index = {
        'version': 1,
        'tier': args.tier,
        'generated': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'sfxFormat': {'codec': 'mp3', 'kbps': sfx_kbps, 'rate': SFX_RATE, 'channels': 1},
        'bgmFormat': {'codec': 'mp3', 'kbps': bgm_kbps, 'rate': bgm_rate,
                      'channels': bgm_ch},
        'sfx': dict(sorted(sfx_sizes.items())),
        'bgm': {k: bgm_info[k] for k in sorted(bgm_info)},
        # 场景曲目号（audio.js 的 BGM_ALBUM 与之一致；死曲目不在这里）
        'sceneTracks': list(SCENE_TRACKS),
        'terrain': {str(i): {'name': n, 'track': t, 'bgm': '%02d.mp3' % t}
                    for i, (n, t) in enumerate(terrain)},
        'aliases': dict(ALIASES),
    }
    with open(idx_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(index, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write('\n')

    # 5) 汇总
    sfx_mb = sum(sfx_sizes.values()) / 1048576
    bgm_mb = sum(v['bytes'] for v in bgm_info.values()) / 1048576
    log('')
    log('== 体积 ==')
    log('   sfx %3d 个  %7.2f MB' % (len(sfx_sizes), sfx_mb))
    log('   bgm %3d 首  %7.2f MB' % (len(bgm_info), bgm_mb))
    log('   index.json %7.2f KB' % (os.path.getsize(idx_path) / 1024.0))
    log('   合计        %7.2f MB' % (sfx_mb + bgm_mb + os.path.getsize(idx_path) / 1048576))
    return 0


if __name__ == '__main__':
    sys.exit(main())
