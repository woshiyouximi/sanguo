/**
 * 音频层体检 · 第 1 步：纯 Node 静态解析（无第三方依赖、无 ffmpeg/python）
 *
 * 为什么自己写：本机没有 python（只有 Microsoft Store 占位 exe）、没有 ffmpeg/ffprobe、
 * game/node_modules 里没有任何音频库。所以直接按 MPEG-1/2/2.5 Layer III 帧头走帧：
 *   - ID3v2 跳过（含 footer）
 *   - 逐帧读 4 字节头 → 版本/层/比特率/采样率/填充/声道模式
 *   - 帧长 = floor(coef*bitrate/samplerate)+padding（MPEG1: coef=144，MPEG2/2.5: coef=72）
 *   - 每帧样本 = 1152（MPEG1）/ 576（MPEG2/2.5）
 *   - Xing/Info/VBRI 头里若有帧数，用来交叉校验
 *   - 尾部残字节 = 截断/附加数据（ID3v1、APEv2）
 *   - 静音代理指标：每帧 payload 里 0x00 占比。数字静音在 MP3 里几乎全是零填充，
 *     所以 zeroRatio≈1 的帧基本等于静音帧（真 RMS 由 decode_probe.mjs 用浏览器
 *     的 WebAudio decodeAudioData 实测，两路互为校验）。
 *
 * 产物：work/audio_check/static.json
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const ROOT = 'F:\\sanguo';
const AUDIO = join(ROOT, 'game', 'web', 'assets', 'audio');
const OUT = join(ROOT, 'work', 'audio_check', 'static.json');

const BITRATE = {
  // [版本][layerIdx 1/2/3] -> kbps 表（index 1..14）；layerIdx: 1=Layer I, 2=Layer II, 3=Layer III
  1: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  },
  2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
};
const RATE = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

function id3v2Size(b) {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0;
  const sz = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  const footer = (b[5] & 0x10) ? 10 : 0;
  return 10 + sz + footer;
}

function parseFrameHeader(b, o) {
  if (o + 4 > b.length) return null;
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const verBits = (b[o + 1] >> 3) & 0x03;      // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layerBits = (b[o + 1] >> 1) & 0x03;    // 1=Layer III
  const brIdx = (b[o + 2] >> 4) & 0x0f;
  const srIdx = (b[o + 2] >> 2) & 0x03;
  const pad = (b[o + 2] >> 1) & 0x01;
  const mode = (b[o + 3] >> 6) & 0x03;         // 3=mono
  if (verBits === 1 || layerBits === 0 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const ver = verBits === 3 ? 1 : verBits === 2 ? 2 : 25;
  const layerIdx = 4 - layerBits;              // 1..3
  const tableVer = ver === 1 ? 1 : 2;
  const brKbps = BITRATE[tableVer][layerIdx][brIdx];
  const sr = RATE[ver][srIdx];
  if (!brKbps || !sr) return null;
  // Layer III: 帧长 = floor(coef*bitrate/samplerate)+padding，MPEG1 coef=144、MPEG2/2.5 coef=72
  // （第一版把条件写反了，导致 MPEG2 的 96 kbps 档按 144 算，帧长翻倍、第 2 帧就失步）
  const coef = layerIdx === 3 ? (ver === 1 ? 144 : 72) : 144;
  const len = Math.floor((coef * brKbps * 1000) / sr) + pad;
  const spf = layerIdx === 3 ? (ver === 1 ? 1152 : 576) : 1152; // 本项目全是 Layer III
  const sideInfo = layerIdx === 1 ? (ver === 1 ? (mode === 3 ? 17 : 32) : (mode === 3 ? 9 : 17)) : 0;
  return { ver, layerIdx, brKbps, sr, pad, mode, len, spf, sideInfo };
}

function zeroRatio(b, from, to) {
  let z = 0;
  const n = to - from;
  if (n <= 0) return 0;
  for (let i = from; i < to; i++) if (b[i] === 0) z++;
  return z / n;
}

function analyze(file) {
  const b = readFileSync(file);
  const sha = createHash('sha256').update(b).digest('hex');
  const res = {
    file: relative(AUDIO, file).replace(/\\/g, '/'),
    bytes: b.length,
    sha256: sha,
    id3v2: id3v2Size(b),
    frames: 0,
    durationSec: 0,
    sr: null, channels: null, ver: null, layer: null,
    kbpsMin: 0, kbpsMax: 0, kbpsAvg: 0, vbr: false,
    xingFrames: null,
    tailBytes: 0,
    tailKind: '',
    zeroRatioAvg: 0,
    silentFrames: 0,
    maxSilentRunSec: 0,
    errors: [],
    firstFrameOffset: -1,
    frameLenBad: 0,
  };
  let o = res.id3v2;
  const kbpsList = [];
  let sumSamples = 0;
  let sumZero = 0, nZeroFrames = 0;
  let runStart = -1, bestRun = 0;
  let sr = null, ch = null;
  const t0 = Date.now();
  const scanStart = o;
  while (o + 4 <= b.length) {
    const h = parseFrameHeader(b, o);
    if (!h) {
      // 允许一帧内出现残字节，但若是"下一个同步"找不到就记错
      if (res.frames === 0) {
        o++;
        if (o - scanStart > 65536) { res.errors.push('前 64KB 找不到帧同步'); break; }
        continue;
      }
      res.errors.push(`帧 ${res.frames} 后失去同步 @${o}（剩 ${b.length - o} B）`);
      break;
    }
    if (res.firstFrameOffset < 0) res.firstFrameOffset = o;
    if (sr === null) { sr = h.sr; ch = h.mode === 3 ? 1 : 2; res.sr = sr; res.channels = ch; res.ver = h.ver; res.layer = h.layerIdx; }
    if (h.sr !== sr || (h.mode === 3 ? 1 : 2) !== ch) res.errors.push(`第 ${res.frames} 帧 采样率/声道变化 ${h.sr}/${h.mode === 3 ? 1 : 2}`);
    const next = o + h.len;
    if (next > b.length) { res.errors.push(`最后一帧不完整：需要 ${h.len} B，只剩 ${b.length - o} B（截断）`); break; }
    // Xing/Info 在第一帧
    if (res.frames === 0) {
      const xs = o + 4 + h.sideInfo;
      const tag = String.fromCharCode(b[xs], b[xs + 1], b[xs + 2], b[xs + 3]);
      if (tag === 'Xing' || tag === 'Info') {
        const flags = (b[xs + 4] << 24) | (b[xs + 5] << 16) | (b[xs + 6] << 8) | b[xs + 7];
        if (flags & 1) res.xingFrames = (b[xs + 8] << 24) | (b[xs + 9] << 16) | (b[xs + 10] << 8) | b[xs + 11];
        res.hasXing = true;
      } else res.hasXing = false;
    }
    kbpsList.push(h.brKbps);
    sumSamples += h.spf;
    const zr = zeroRatio(b, o + 4 + h.sideInfo, next);
    sumZero += zr; nZeroFrames++;
    if (zr > 0.97) { res.silentFrames++; if (runStart < 0) runStart = o; }
    else if (runStart >= 0) {
      const sec = ((o - runStart) / h.len) * (h.spf / h.sr);
      if (sec > bestRun) bestRun = sec;
      runStart = -1;
    }
    res.frames++;
    o = next;
  }
  if (runStart >= 0) {
    const sec = ((o - runStart) / (o > 0 ? o : 1)) * (sumSamples / Math.max(1, res.frames) / (sr || 44100));
    if (sec > bestRun) bestRun = sec;
  }
  res.tailBytes = Math.max(0, b.length - o);
  if (res.tailBytes > 0) {
    const t = b.subarray(o, Math.min(o + 3, b.length));
    res.tailKind = (t[0] === 0x54 && t[1] === 0x41 && t[2] === 0x47) ? 'ID3v1'
      : (t[0] === 0x41 && t[1] === 0x50 && t[2] === 0x45) ? 'APEv2' : 'garbage';
  }
  res.durationSec = sr ? sumSamples / sr : 0;
  if (kbpsList.length) {
    res.kbpsMin = Math.min(...kbpsList);
    res.kbpsMax = Math.max(...kbpsList);
    res.vbr = res.kbpsMin !== res.kbpsMax;
    res.kbpsAvg = Math.round(b.length * 8 / res.durationSec / 1000 * 10) / 10;
  }
  res.zeroRatioAvg = nZeroFrames ? Math.round((sumZero / nZeroFrames) * 1000) / 1000 : 0;
  res.maxSilentRunSec = Math.round(bestRun * 100) / 100;
  res.parseMs = Date.now() - t0;
  return res;
}

const files = [];
for (const grp of ['bgm', 'sfx']) {
  const dir = join(AUDIO, grp);
  for (const name of readdirSync(dir).sort()) {
    if (!/\.mp3$/i.test(name)) continue;
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    files.push({ ...analyze(p), group: grp });
  }
}
const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
const totalSec = files.reduce((a, f) => a + f.durationSec, 0);
writeFileSync(OUT, JSON.stringify({
  scannedAt: new Date().toISOString(),
  method: 'pure-node MPEG frame walk（无 ffmpeg/python）',
  count: files.length,
  totalBytes,
  totalSec: Math.round(totalSec * 100) / 100,
  files,
}, null, 1), 'utf8');
console.log(`scan ${files.length} files, ${totalBytes} B, ${totalSec.toFixed(1)} s -> ${OUT}`);
const bad = files.filter((f) => f.errors.length || !f.frames);
console.log('异常文件：', bad.length, bad.map((f) => f.file + ' :: ' + f.errors.join('; ')).join(' | ') || '无');
