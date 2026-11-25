/** 臨時：印出兩個面板的節點樹，供報告引用。 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc');
const { EndingPanel } = require('./_sim/EndingPanel.js');
const { CityListPanel } = require('./_sim/CityListPanel.js');
const { endingOf } = require('./_sim/EndingModel.js');

const NAMES = [];
for (let i = 0; i < 60; i += 1) NAMES.push(`城${String(i).padStart(2, '0')}`);
const CITIES = NAMES.map((name, i) => ({ NAME: name, KING: i < 20 ? '劉備' : i < 50 ? '曹操' : 0, MAJOR: i < 20 ? `太守${i}` : '敵將', POPULATION: 12000 }));
const RUNTIME = {};
NAMES.forEach((name, i) => {
  RUNTIME[name] = { owner: i < 20 ? '劉備' : i < 50 ? '曹操' : '', troops: 300 + i, prep: 100 + i, money: 500 + i };
});
const save = { owned: NAMES, month: 28, force: '劉備', monarch: '劉備', cities: RUNTIME, forces: { 劉備: { alive: true }, 曹操: { alive: true } } };

function makeRoot(name) {
  const root = new cc.Node(name);
  root.setPosition(0, 0);
  root.addComponent(cc.UITransform).setContentSize(750, 1334);
  return root;
}
function dump(node, depth = 0, lines = []) {
  const label = node.getComponent(cc.Label);
  const suffix = label ? `  «${label.string.replace(/\n/g, '⏎')}»` : '';
  lines.push(`${'  '.repeat(depth)}${node.name}${suffix}`);
  for (const child of node.children) dump(child, depth + 1, lines);
  return lines;
}

const ending = EndingPanel.show(makeRoot('EndingRoot'), endingOf(save, CITIES, []));
const list = CityListPanel.show(makeRoot('ListRoot'), { save, cities: CITIES, generals: [] });
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));
console.log('=== EndingPanel ===');
console.log(dump(ending.node).join('\n'));
console.log('=== CityListPanel ===');
console.log(dump(list.node).slice(0, 40).join('\n'));
