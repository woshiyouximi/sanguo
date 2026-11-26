#!/usr/bin/env node
// parity_sweep 取证脚本 1：抽取每个文件的「定义名 → 行号」，用于双端功能覆盖对照。
// 只读源码；输出 JSON + 人读的 txt。用法：
//   node work\parity_sweep\scan_defs.mjs [relPath ...]
// 不给参数则扫 PAIRS 里登记的全部文件。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const OUT = path.join(ROOT, 'work/parity_sweep');

const PAIRS = [
  ['campaign', ['game/web/campaign.html', 'game/cocos/assets/scripts/CampaignRoot.ts', 'game/cocos/assets/scripts/CityListPanel.ts', 'game/cocos/assets/scripts/ForcesPanel.ts']],
  ['city', ['game/web/city.html', 'game/web/city_model.js', 'game/cocos/assets/scripts/CityPanel.ts', 'game/cocos/assets/scripts/CityModel.ts']],
  ['deploy', ['game/web/deploy.html', 'game/cocos/assets/scripts/DeployRoot.ts']],
  ['items', ['game/web/items.html', 'game/web/items_model.js', 'game/cocos/assets/scripts/ItemsPanel.ts', 'game/cocos/assets/scripts/ItemsModel.ts']],
  ['book', ['game/cocos/assets/scripts/GeneralBookPanel.ts', 'game/cocos/assets/scripts/GeneralBook.ts']],
  ['surrender', ['game/cocos/assets/scripts/SurrenderPanel.ts', 'game/cocos/assets/scripts/SurrenderModel.ts', 'game/cocos/assets/scripts/core/capture.ts']],
  ['saves', ['game/web/saves.js', 'game/cocos/assets/scripts/SaveSlots.ts']],
  ['monarch', ['game/web/monarch_model.js', 'game/cocos/assets/scripts/MonarchPanel.ts', 'game/cocos/assets/scripts/MonarchModel.ts']],
  ['ai', ['game/web/ai_model.js', 'game/cocos/assets/scripts/AiModel.ts', 'game/cocos/assets/scripts/AiRunner.ts']],
  ['openend', ['game/cocos/assets/scripts/ScenarioSelect.ts', 'game/cocos/assets/scripts/TitlePanel.ts', 'game/cocos/assets/scripts/EndingPanel.ts', 'game/cocos/assets/scripts/EndingModel.ts', 'game/cocos/assets/scripts/RunSetup.ts']],
  ['audio', ['game/web/audio.js', 'game/cocos/assets/scripts/AudioHost.ts', 'game/cocos/assets/scripts/AudioBus.ts']],
  ['gamestate', ['game/web/era.js', 'game/cocos/assets/scripts/GameState.ts']],
  ['march', ['game/web/march_flow.js', 'game/cocos/assets/scripts/core/march.ts']],
];

const RE_DEFS = [
  // function foo(
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
  // const foo = (  /  const foo = async (
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function)/,
  // class method: two-space indent then name(
  /^\s{2,6}(?:public\s+|private\s+|protected\s+|static\s+|async\s+|override\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?::[^{]+)?\{\s*$/,
  // bare top-level in html script: name(...) { at indent 0-4
  /^\s{0,4}([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{\s*$/,
];

function extract(src) {
  const lines = src.split(/\r?\n/);
  const defs = new Map(); // name -> first line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 240) continue;
    for (const re of RE_DEFS) {
      const m = re.exec(line);
      if (m) {
        const name = m[1];
        if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'do', 'try', 'with'].includes(name)) break;
        if (!defs.has(name)) defs.set(name, i + 1);
        break;
      }
    }
  }
  return defs;
}

function main() {
  const only = process.argv.slice(2);
  const report = { generatedAt: new Date().toISOString(), groups: {} };
  const outLines = [];
  for (const [group, files] of PAIRS) {
    if (only.length && !only.includes(group)) continue;
    report.groups[group] = {};
    outLines.push(`\n## ${group}`);
    for (const rel of files) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) { outLines.push(`  MISSING ${rel}`); continue; }
      const src = fs.readFileSync(abs, 'utf8');
      const defs = extract(src);
      report.groups[group][rel] = Object.fromEntries(defs);
      outLines.push(`  ${rel}  (${src.split(/\r?\n/).length} 行, ${defs.size} 定义)`);
      const names = [...defs.keys()];
      for (let i = 0; i < names.length; i += 8) {
        outLines.push('    ' + names.slice(i, i + 8).map((n) => `${n}@${defs.get(n)}`).join('  '));
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'defs.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(OUT, 'defs.txt'), outLines.join('\n'));
  console.log(`wrote ${path.join(OUT, 'defs.json')} / defs.txt`);
  console.log(outLines.join('\n').slice(0, 2000));
}
main();
