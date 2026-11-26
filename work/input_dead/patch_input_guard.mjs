// Batch-wrap every global input.on/off registration with guardTouch() (R228).
// ASCII-only; target files stay UTF-8 with their original newline style / BOM.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'F:\\sanguo\\game\\cocos\\assets\\scripts';

const LABELS = {
  'ArmyLayer.ts': 'ArmyMenu',
  'BattleRoot.ts': 'BattleRoot',
  'BootRoot.ts': 'BootRoot',
  'CampaignRoot.ts': 'CampaignRoot',
  'CityListPanel.ts': 'CityListPanel',
  'CityPanel.ts': 'CityPanel',
  'DeployRoot.ts': 'DeployRoot',
  'EndingPanel.ts': 'EndingPanel',
  'ForcesPanel.ts': 'ForcesPanel',
  'GeneralBookPanel.ts': 'GeneralBookPanel',
  'ItemsPanel.ts': 'ItemsPanel',
  'MonarchPanel.ts': 'MonarchPanel',
  'SaveSlots.ts': 'SaveSlotsPanel',
  'ScenarioSelect.ts': 'ScenarioSelect',
  'SurrenderPanel.ts': 'SurrenderPanel',
  'TitlePanel.ts': 'TitlePanel',
};

const ROOTS = new Set(['BootRoot.ts', 'CampaignRoot.ts', 'DeployRoot.ts', 'BattleRoot.ts']);

const REG_RE = /input\.(on|off)\(\s*(Input\.EventType\.(?:TOUCH_END|TOUCH_START|TOUCH_MOVE))\s*,\s*this\.(onTouch(?:Start|Move)?)\s*,\s*this\s*\)/g;

function readText(p) {
  const buf = readFileSync(p);
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let text = buf.toString('utf8');
  if (bom) text = text.slice(1);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  return { text, nl, bom };
}

function writeText(p, text, nl, bom) {
  let out = text.replace(/\r\n/g, '\n');
  if (nl === '\r\n') out = out.replace(/\n/g, '\r\n');
  const payload = Buffer.from(out, 'utf8');
  writeFileSync(p, bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), payload]) : payload);
}

const changed = [];
const skipped = [];

for (const [name, label] of Object.entries(LABELS)) {
  const p = join(ROOT, name);
  const { text: orig, nl, bom } = readText(p);
  let text = orig;
  let count = 0;
  text = text.replace(REG_RE, (_m, kind, evt, method) => {
    count += 1;
    return `input.${kind}(${evt}, guardTouch(this, '${method}', '${label}'), this)`;
  });
  if (count === 0) {
    skipped.push(name);
    continue;
  }

  const needed = ROOTS.has(name) ? 'guardTouch, installInputResilience' : 'guardTouch';
  if (!text.includes("from './InputGuard'")) {
    const lines = text.split('\n');
    let idx = -1;
    lines.forEach((line, i) => { if (line.includes("from './InputLatch'")) idx = i; });
    if (idx < 0) {
      lines.forEach((line, i) => { if (/^import\b/.test(line)) idx = i; });
    }
    if (idx < 0) throw new Error(`no import anchor in ${name}`);
    lines.splice(idx + 1, 0, `import { ${needed} } from './InputGuard';`);
    text = lines.join('\n');
  }

  if (ROOTS.has(name) && !text.includes('installInputResilience();')) {
    const m = /onLoad\(\): void \{\n/.exec(text);
    if (!m) throw new Error(`no onLoad anchor in ${name}`);
    const at = m.index + m[0].length;
    text = text.slice(0, at) + '    installInputResilience();\n' + text.slice(at);
  }

  if (text !== orig) writeText(p, text, nl, bom);
  changed.push(`${name}(${count})`);
}

console.log('changed:', changed.join(', '));
if (skipped.length) console.log('SKIPPED (no registration):', skipped.join(', '));
