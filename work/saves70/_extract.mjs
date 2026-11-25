import fs from 'node:fs';
const s = fs.readFileSync('game/web/campaign.html', 'utf8');
const open = '<script type="module">';
const i = s.indexOf(open);
const j = s.indexOf('</' + 'script>', i);
const body = s.slice(i + open.length, j);
fs.writeFileSync('work/saves70/_campaign_module.mjs', body, 'utf8');
console.log('bytes', body.length);
