import fs from 'node:fs';
import * as S from 'file:///F:/sanguo/game/web/saves.js';

const RAW = JSON.parse(fs.readFileSync('F:/sanguo/game/data/scenarios.json', 'utf8'));
const S0 = { ...RAW[0], id: 1, name: 'S1' };
const snap = S.newCampaign(S0, { ts: 1 });
const cd1 = S0.cities[1];
console.log('cd1', cd1.NAME, JSON.stringify(cd1.KING), 'state owner', JSON.stringify(snap.cities[cd1.NAME].owner));
const one = S.citySummaryOf(cd1, snap.cities[cd1.NAME], { owner: '劉焉', major: 'M', wise: 'W', roster: ['a'] });
console.log('summary', JSON.stringify({ owner: one.owner, major: one.major, wise: one.wise }));
const r = S.fillCitySummaries(snap, S0.cities, { info: (n) => ({ owner: n === cd1.NAME ? '劉焉' : '', major: '', wise: '', roster: [] }) });
console.log('fill', JSON.stringify(r), 'owner now', JSON.stringify(snap.cities[cd1.NAME].owner));
