// 取本轮改动的精确行号（PowerShell 内联引号会被吃掉，所以走文件）。
import fs from 'node:fs';

const DIR = 'F:/sanguo/game/cocos/assets/scripts/';
const QUERY = {
  CampaignRoot: [
    ['actionSubs: Label', 'field-actionSubs'],
    ['labelSubtitle = this.makeLabel', 'subtitle-create'],
    ["applyTextRole(this.labelSubtitle", 'role-subtitle'],
    ['applyTextRoles(this.actionSubs', 'role-subtitle2'],
    ['sub.string = action.caption', 'sub-caption'],
    ['hBands(x, BUTTON_Y', 'btn-hband'],
    ["vBands(0, 0, DESIGN_W, 7", 'header-top-sheen'],
    ['edgeBands({ x: 0, y: 0, w: DESIGN_W, h: 124 }', 'header-edge'],
    ['vBands(266, 774', 'legend-plate'],
    ['topSheen(LOG_VIEW.x + 2', 'log-sheen'],
    ['innerEdge(LOG_VIEW', 'log-inner'],
  ],
  CityPanel: [
    ['lblBandTitle', 'field'],
    ['this.lblBandTitle =', 'build'],
    ["applyTextRole(this.lblBandTitle", 'role'],
    ['const bandY = ', 'bandY'],
    ['edgeBands(band', 'band-edge'],
    ["vBands(band.x", 'band-gradient'],
  ],
  ItemsPanel: [
    ['private scrollPx', 'field-scroll'],
    ['private measureList', 'measureList'],
    ['private pageAt', 'pageAt'],
    ['private flatEntries', 'flatEntries'],
    ['private placePage', 'placePage'],
    ['private onTouchStart', 'onTouchStart'],
    ['private onTouchMove', 'onTouchMove'],
    ['public scrollTo', 'scrollTo'],
    ['trackX = body.x', 'trackX'],
  ],
  DeployRoot: [
    ['卡片內的光影', 'card-shade'],
    ['for (const card of SECTION_CARDS', 'card-loop'],
    ["vBands(0, 0, DESIGN_W, 7", 'header-top-sheen'],
  ],
};

for (const [name, pairs] of Object.entries(QUERY)) {
  const file = DIR + name + '.ts';
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  console.log('== ' + name + '.ts  (' + lines.length + ' lines)');
  for (const [pat, label] of pairs) {
    const hit = lines.findIndex((l) => l.includes(pat));
    console.log('  ' + label.padEnd(18) + ' L' + (hit + 1) + '   ' + pat);
  }
}
