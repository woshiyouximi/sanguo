/**
 * 音频层体检 · 第 5 步：原作 17 首 BGM 的"全集"测量（死曲目结论的证据）。
 *
 * 源头（tools/export_audio.py:33 SRC_BGM，只读，绝不修改）：
 *   C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\MP3\01..17.mp3
 * 项目只装了 10 首（03/04/05/06/10/11/12/13/14/17），01/02/07/08/09/15/16 是"零触发点的死曲目"。
 * 这里把 17 首逐一走帧测时长/码率/采样率/声道，并与已装的 10 首对比（时长差=转码是否忠实）。
 *
 * 产物：work/audio_check/orig_bgm.json
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';

const ROOT = 'F:\\sanguo';
const SRC = 'C:\\Users\\liutian\\Downloads\\sgqyzzwb_146364\\三国群英传2 修正版 1.05+\\MP3';
const INSTALLED = `${ROOT}\\game\\web\\assets\\audio\\bgm`;
const OUT = `${ROOT}\\work\\audio_check\\orig_bgm.json`;

const BR = {
  1: { 3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] },
  2: { 3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] },
};
const SR = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

function scan(buf) {
  let o = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') {
    const sz = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    o = 10 + sz + (buf[5] & 0x10 ? 10 : 0);
  }
  let frames = 0, samples = 0, ok = 0, bad = 0, first = null;
  const rates = new Set(); const brs = new Set(); const modes = new Set();
  while (o + 4 <= buf.length) {
    const h = buf.readUInt32BE(o);
    // 注意：`h & 0xffe00000` 会被转成 int32（负数），不能直接和 0xffe00000 这个正数比；
    // 用 `h >>> 21` 取最高 11 位，全 1 才是帧同步。
    if ((h >>> 21) !== 0x7ff) { o += 1; bad++; if (bad > 64) break; continue; }
    const verBits = (h >>> 19) & 3;
    const ver = verBits === 3 ? 1 : verBits === 2 ? 2 : verBits === 0 ? 25 : 0;
    const layerBits = (h >>> 17) & 3;
    if (!ver || layerBits !== 1) { o += 1; bad++; continue; }
    const bri = (h >>> 12) & 15, sri = (h >>> 10) & 3, pad = (h >>> 9) & 1;
    if (bri === 0 || bri === 15 || sri === 3) { o += 1; bad++; continue; }
    const kbps = BR[ver === 1 ? 1 : 2][3][bri];
    const sr = SR[ver][sri];
    const coef = ver === 1 ? 144 : 72;
    const len = Math.floor((coef * kbps * 1000) / sr) + pad;
    if (len < 24) { o += 1; bad++; continue; }
    if (!first) first = { ver, kbps, sr, mode: (h >>> 6) & 3 };
    rates.add(sr); brs.add(kbps); modes.add((h >>> 6) & 3);
    samples += ver === 1 ? 1152 : 576;
    frames++; ok++;
    o += len;
  }
  const sr = first ? first.sr : 0;
  return { frames, seconds: sr ? samples / sr : 0, rates: [...rates], brs: [...brs], modes: [...modes], bad, tail: buf.length - o };
}

const M = ['立体声', '联合立体声', '双声道', '单声道'];
const rows = [];
for (const f of readdirSync(SRC).filter((x) => /^\d+\.mp3$/i.test(x)).sort()) {
  const p = `${SRC}\\${f}`;
  const buf = readFileSync(p);
  const s = scan(buf);
  const num = f.replace(/\.mp3$/i, '');
  const inst = `${INSTALLED}\\${num}.mp3`;
  let instSec = null;
  try { instSec = scan(readFileSync(inst)).seconds; } catch { /* 未装 */ }
  rows.push({
    num, bytes: statSync(p).size, seconds: Math.round(s.seconds * 100) / 100,
    kbps: s.brs.join('/'), sampleRate: s.rates.join('/'), channels: s.modes.map((m) => M[m]).join('/'),
    installed: instSec != null, installedSeconds: instSec == null ? null : Math.round(instSec * 100) / 100,
    deltaSec: instSec == null ? null : Math.round((instSec - s.seconds) * 100) / 100,
  });
}
writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), src: SRC, rows }, null, 1), 'utf8');
console.log('原作 BGM', rows.length, '首');
for (const r of rows) {
  console.log(` ${r.num} ${r.installed ? '已装' : '死曲'} ${String(r.seconds).padStart(7)}s ${r.kbps}k ${r.sampleRate} ${r.channels}${r.installed ? ` | 装后 ${r.installedSeconds}s Δ${r.deltaSec}s` : ''}`);
}
console.log('死曲目合计时长', rows.filter((r) => !r.installed).reduce((a, r) => a + r.seconds, 0).toFixed(1), 's');
