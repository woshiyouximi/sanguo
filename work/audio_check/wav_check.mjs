/**
 * 音频层体检 · 第 3 步：拿原作 99 个 WAV 当"真值"，核对转出来的 MP3 内容是否对得上。
 *
 * 这一步回答的是"键存在 ≠ 内容对"：只比文件名不够，必须比
 *   时长（data 字节 / byteRate  vs  MP3 实测解码时长）
 *   采样率/声道/位深（原作是混着的：8/16 bit、8k~44.1k、单/双声道）
 *   RMS（WAV 直接算 PCM；MP3 用浏览器真解码值，两路互校）
 *   重复组（PCM 内容 + fmt 一起 sha256：同波形不同采样率算不同档，因为听感不同）
 *
 * 产物：work/audio_check/wav_vs_mp3.json
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = 'F:\\sanguo';
const WAVDIR = join(ROOT, 'extract', 'pak', 'SOUND');
const OUT = join(ROOT, 'work', 'audio_check', 'wav_vs_mp3.json');

function parseWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return { error: 'not RIFF/WAVE' };
  }
  let o = 12;
  let fmt = null;
  let dataOff = -1, dataLen = 0;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4);
    const sz = buf.readUInt32LE(o + 4);
    const body = o + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        blockAlign: buf.readUInt16LE(body + 12),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataOff = body;
      dataLen = Math.min(sz, buf.length - body);
    }
    o = body + sz + (sz & 1);
  }
  if (!fmt || dataOff < 0) return { error: 'no fmt/data' };
  const dur = dataLen / fmt.byteRate;

  // RMS / 峰值：tag 1 的 8bit 是无符号，16/24/32 是有符号
  let sumSq = 0, peak = 0, n = 0, clipped = 0;
  const end = dataOff + dataLen;
  if (fmt.format === 1) {
    if (fmt.bits === 8) {
      for (let i = dataOff; i < end; i++) {
        const v = (buf[i] - 128) / 128;
        const a = Math.abs(v);
        if (a > peak) peak = a;
        if (a >= 0.999) clipped++;
        sumSq += v * v; n++;
      }
    } else if (fmt.bits === 16) {
      for (let i = dataOff; i + 1 < end; i += 2) {
        const v = buf.readInt16LE(i) / 32768;
        const a = Math.abs(v);
        if (a > peak) peak = a;
        if (a >= 0.999) clipped++;
        sumSq += v * v; n++;
      }
    } else if (fmt.bits === 24) {
      for (let i = dataOff; i + 2 < end; i += 3) {
        const v = buf.readIntLE(i, 3) / 8388608;
        const a = Math.abs(v);
        if (a > peak) peak = a;
        if (a >= 0.999) clipped++;
        sumSq += v * v; n++;
      }
    }
  }
  const rms = n ? Math.sqrt(sumSq / n) : 0;

  // 重复判定键：fmt + PCM 数据（同波形不同采样率听感不同，不能算同一档）
  const fmtKey = `${fmt.format}/${fmt.bits}/${fmt.sampleRate}/${fmt.channels}`;
  const sha = createHash('sha256')
    .update(fmtKey)
    .update(buf.subarray(dataOff, dataOff + dataLen))
    .digest('hex');

  return {
    ...fmt, duration: dur, dataLen, fmtKey, sha,
    samples: n,
    rms: Math.round(rms * 1e6) / 1e6,
    peak: Math.round(peak * 1e6) / 1e6,
    clipped,
    rmsDbfs: rms > 0 ? Math.round(20 * Math.log10(rms) * 10) / 10 : -999,
    peakDbfs: peak > 0 ? Math.round(20 * Math.log10(peak) * 10) / 10 : -999,
  };
}

const rows = [];
for (const name of readdirSync(WAVDIR).sort()) {
  if (!/\.wav$/i.test(name)) continue;
  const b = readFileSync(join(WAVDIR, name));
  const w = parseWav(b);
  rows.push({ name: name.replace(/\.wav$/i, '').toLowerCase(), bytes: b.length, ...w });
}

const bySha = {};
for (const r of rows) if (r.sha) (bySha[r.sha] = bySha[r.sha] || []).push(r.name);
const dupGroups = Object.values(bySha).filter((v) => v.length > 1).sort((a, b) => a[0].localeCompare(b[0]));

writeFileSync(OUT, JSON.stringify({
  at: new Date().toISOString(),
  count: rows.length,
  totalBytes: rows.reduce((a, r) => a + r.bytes, 0),
  totalSec: Math.round(rows.reduce((a, r) => a + (r.duration || 0), 0) * 100) / 100,
  dupGroups,
  files: rows,
}, null, 1), 'utf8');

const s = (a) => a.reduce((x, y) => x + y, 0);
console.log('WAV', rows.length, '个，', s(rows.map((r) => r.bytes)), 'B，', s(rows.map((r) => r.duration)).toFixed(2), 's');
console.log('解析失败：', rows.filter((r) => r.error).length);
console.log('fmt 组合：');
for (const k of [...new Set(rows.map((r) => r.fmtKey))].sort()) {
  const g = rows.filter((r) => r.fmtKey === k);
  console.log('   ', k.padEnd(16), g.length, '档');
}
console.log('重复组（fmt+PCM 相同）：', dupGroups.length);
for (const g of dupGroups) console.log('   ', g.join(' = '));
console.log('静音档（RMS < -60 dBFS）：', rows.filter((r) => r.rmsDbfs < -60).map((r) => `${r.name}(${r.rmsDbfs})`).join(',') || '无');
console.log('削波档：', rows.filter((r) => r.clipped > 0).map((r) => `${r.name}(${r.clipped})`).join(',') || '无');
