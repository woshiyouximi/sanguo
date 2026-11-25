/**
 * work/persp_edge/units.mjs —— 把 shots.json 里四张截图的布局，用**页面同一份**编译产物
 * （game/dist/view/projection.js）投一遍，输出每个单位的 s x/sy/scale 与脚底、头顶设计坐标。
 * 这样像素判定用的坐标和浏览器里看到的完全同源，不是我在报告里另抄一份常数。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { projectUnit } from '../../game/dist/view/projection.js';

const FOOT = 26; // ACTION_FOOT_Y：帧内脚底距帧底 26 设计像素（animSelect.ts）
const TALLEST = 106; // tiechui_atk_04：75x106，场上最高的一帧

const shots = JSON.parse(readFileSync('F:\\sanguo\\work\\persp_edge\\shots.json', 'utf8'));
const out = [];
for (const s of shots.shots) {
  const units = s.alive.map(([side, gx, gy]) => {
    const p = projectUnit(gx, gy, s.camX);
    return {
      side, gx, gy,
      sx: p.sx, sy: p.sy, scale: p.scale,
      foot: p.sy + FOOT * p.scale,
      top: p.sy + FOOT * p.scale - TALLEST * p.scale,
      inBand: p.sy >= 100 && p.sy <= 1000,
    };
  });
  out.push({ name: s.name, file: s.file, camX: s.camX, units, lowest: units.filter((u) => u.inBand).sort((a, b) => b.sy - a.sy)[0] ?? null });
  const l = out[out.length - 1].lowest;
  console.log(`${s.name}: camX=${s.camX} 可见单位=${units.filter((u) => u.inBand).length} 最低可见行=${l ? `gx=${l.gx} sy=${l.sy.toFixed(2)} 脚底=${l.foot.toFixed(2)}` : 'none'} 窗外单位=${units.filter((u) => !u.inBand).map((u) => `gx${u.gx}@sy${u.sy.toFixed(0)}`).join(',') || '无'}`);
}
writeFileSync('F:\\sanguo\\work\\persp_edge\\units.json', JSON.stringify({ foot: FOOT, tallest: TALLEST, shots: out }, null, 2), 'utf8');
