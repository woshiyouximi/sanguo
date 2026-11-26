// 探针：用「剧本 1 + 空 roster」跑 officersOfCity('平原')，看 張角 会不会被播进来。
import io from 'node:fs';
import { officersOfCity } from '../game/cocos/assets/scripts/OfficersOfCity.ts';

const D = 'F:/sanguo/game/cocos/assets/bundles/res/data';
const read = (f) => JSON.parse(io.readFileSync(`${D}/${f}`, 'utf8'));
const generals = read('generals.json');
const scen = read('scenarios.json');
const genRows = Array.isArray(generals) ? generals : generals.generals;

const save = { owned: ['平原'], roster: {}, cities: { '平原': { owner: '劉備', major: '劉備' } } };
const ctx = { generals: genRows, scenIdx: 1, playerForce: '劉備', scenarioCities: scen[1].cities };

console.log('officersOfCity =', officersOfCity(save, '平原', ctx).map((o) => o.name));
