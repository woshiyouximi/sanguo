import fs from 'node:fs';
const s = fs.readFileSync('F:/sanguo/game/web/campaign.html', 'utf8');
const open = '<script type="module">';
const i = s.indexOf(open);
const j = s.indexOf('</script>', i);
if (i < 0 || j < 0) throw new Error('module script not found');
const code = s.slice(i + open.length, j);
fs.writeFileSync('F:/sanguo/work/webclock/_campaign_check.mjs', code);
console.log('extracted', code.length, 'chars');
