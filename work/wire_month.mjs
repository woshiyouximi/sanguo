import fs from 'node:fs';

function patch(file, from, to, label) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes(from)) {
    console.log(`MISS ${label}`);
    return false;
  }
  fs.writeFileSync(file, src.replace(from, to));
  console.log(`OK ${label}`);
  return true;
}

patch(
  'game/cocos/assets/scripts/CampaignRoot.ts',
  'income += GameState.advanceMonth(this.cities);',
  'income += GameState.advanceMonth(this.cities, { data: this.data });',
  'CampaignRoot.advanceMonth(data)',
);

const bridge = `    // [F-03] 月流水收進 core：把「內政存檔合併器」註冊給 GameState，
    // 讓 CampaignRoot 的每月推進（endInterior）也能跑自治代行 + 金→預備兵，
    // 而不是只有玩家進內政頁時補跑一次。CityPanel 其餘邏輯不動。
    GameState.setCityMonthBridge({
      data: options.data,
      civic: () => {
        // GameState 已換月/徵稅；內政真源在 extras ⇒ 每次先重併，再跑 autonomyTick
        // （內部以 autoMonth 做幂等 guard，重跑不會重複發錢），跑完立刻 persist 回寫兩份存檔。
        this.save = this.mergeSave();
        const tick = M.autonomyTick(this.save, this.cities(), this.ctx);
        this.persist();
        return tick;
      },
    });
`;

const cityFile = 'game/cocos/assets/scripts/CityPanel.ts';
const city = fs.readFileSync(cityFile, 'utf8');
const anchor = /(\n\s*this\.persist\(\);\s*\n\s*this\.refresh\(\);\s*\n)/;
if (anchor.test(city)) {
  fs.writeFileSync(cityFile, city.replace(anchor, `$1${bridge}`));
  console.log('OK CityPanel bridge');
} else {
  console.log('MISS CityPanel anchor');
}
