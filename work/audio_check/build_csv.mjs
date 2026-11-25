/**
 * 音频层体检 · 第 6 步：把三路测量合成 109 行 CSV（work/audio_check/files.csv）。
 *
 * 三路来源（互相独立、互相校验）：
 *   1. static.json     —— 纯 Node 走 MPEG 帧头：帧数/码率/采样率/声道/尾部残字节/0x00 占比
 *   2. decoded.json    —— Edge headless + WebAudio decodeAudioData 真解码：时长/RMS/峰值/削波/最长静音
 *   3. wav_vs_mp3.json —— 原作 SOUND\*.WAV 真值：时长/RMS/位深/采样率/fmt 组
 *
 * 输出列（中文表头，UTF-8 BOM 方便 Excel 直接开）：
 *   文件,组,字节,sha256前12,静态时长s,解码时长s,两者差ms,采样率,声道,码率kbps,帧数,
 *   RMS_dBFS,峰值_dBFS,削波样点,最长静音s,尾部静音s,尾部残字节,0x00占比,
 *   原作WAV,原作曲长s,时长差ms,原作RMS,原作位深/采样率/声道,重复组,判定
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'F:\\sanguo';
const D = `${ROOT}\\work\\audio_check`;
const st = JSON.parse(readFileSync(`${D}\\static.json`, 'utf8'));
const de = JSON.parse(readFileSync(`${D}\\decoded.json`, 'utf8'));
const wv = JSON.parse(readFileSync(`${D}\\wav_vs_mp3.json`, 'utf8'));

const decMap = new Map(de.files.map((f) => [f.file, f]));
const wavMap = new Map(wv.files.map((f) => [f.name, f]));

// 重复组：按整文件 sha256 分组（与原作 WAV 的 fmt+PCM 分组对照）
const shaGroups = {};
for (const f of st.files) (shaGroups[f.sha256] = shaGroups[f.sha256] || []).push(f.file);
const dupOf = {};
for (const g of Object.values(shaGroups)) {
  if (g.length < 2) continue;
  const names = g.map((x) => x.replace(/^sfx\//, '').replace(/\.mp3$/, ''));
  for (const f of g) dupOf[f] = names.filter((n) => n !== f.replace(/^sfx\//, '').replace(/\.mp3$/, '')).join('=');
}

const rows = [];
for (const f of st.files) {
  const d = decMap.get(f.file) || {};
  const stem = f.file.replace(/^sfx\//, '').replace(/\.mp3$/, '');
  const w = wavMap.get(stem.toLowerCase());
  const durMs = d.duration != null ? (d.duration - f.durationSec) * 1000 : null;
  const wavMs = w && d.duration != null ? (d.duration - w.duration) * 1000 : null;
  const flags = [];
  if (d.rmsDbfs != null && d.rmsDbfs < -60) flags.push('整段静音');
  if (f.durationSec < 0.3) flags.push('<0.3s');
  if (f.durationSec > 300) flags.push('>5min');
  if (dupOf[f.file]) flags.push('重复');
  if (f.tailBytes > 0) flags.push('尾部残字节');
  if (f.errors && f.errors.length) flags.push('静态异常');
  if (d.ok === false) flags.push('解码失败');
  if (!flags.length) flags.push('正常');
  rows.push([
    f.file, f.group, f.bytes, f.sha256.slice(0, 12),
    f.durationSec.toFixed(3), d.duration != null ? d.duration.toFixed(3) : '',
    durMs != null ? durMs.toFixed(1) : '',
    f.sr, f.channels, f.kbpsAvg, f.frames,
    d.rmsDbfs != null ? d.rmsDbfs : '', d.peakDbfs != null ? d.peakDbfs : '',
    d.clipped != null ? d.clipped : '', d.maxSilenceSec != null ? d.maxSilenceSec : '',
    d.tailSilenceSec != null ? d.tailSilenceSec : '',
    f.tailBytes, f.zeroRatioAvg,
    w ? '有' : '', w ? w.duration.toFixed(3) : '', wavMs != null ? wavMs.toFixed(1) : '',
    w ? w.rmsDbfs : '', w ? `${w.bits}bit/${w.sampleRate}/${w.channels}ch` : '',
    dupOf[f.file] || '', flags.join('+'),
  ]);
}

const head = ['文件', '组', '字节', 'sha256前12', '静态时长s', '解码时长s', '两者差ms', '采样率', '声道',
  '码率kbps', '帧数', 'RMS_dBFS', '峰值_dBFS', '削波样点', '最长静音s', '尾部静音s', '尾部残字节',
  '0x00占比', '原作WAV', '原作曲长s', '时长差ms', '原作RMS', '原作格式', '重复组', '判定'];

const csv = [head.join(','), ...rows.map((r) => r.map((v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))].join('\r\n');
writeFileSync(`${D}\\files.csv`, '\ufeff' + csv + '\r\n', 'utf8');

// ---- 控制台汇总 ----
const bgm = st.files.filter((f) => f.group === 'bgm');
const sfx = st.files.filter((f) => f.group === 'sfx');
const sum = (a, k) => a.reduce((x, y) => x + (y[k] || 0), 0);
console.log('写 files.csv', rows.length, '行');
console.log('bgm', bgm.length, sum(bgm, 'bytes'), 'B', sum(bgm, 'durationSec').toFixed(2), 's');
console.log('sfx', sfx.length, sum(sfx, 'bytes'), 'B', sum(sfx, 'durationSec').toFixed(2), 's');
console.log('合计', st.count, sum(st.files, 'bytes'), 'B', sum(st.files, 'durationSec').toFixed(2), 's');
console.log('解码失败', de.failed, '| 时长差 |ms| max', Math.max(...rows.map((r) => Math.abs(Number(r[6]) || 0))).toFixed(1));
console.log('重复组', Object.values(shaGroups).filter((g) => g.length > 1).length);
