import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('F:/sanguo/game/web/anim/atlas.json', 'utf8'));
const names = j.pages[0].sprites.map((s) => s.name);
const back = names.filter((n) => n.startsWith('walk_back')).sort();
const front = names.filter((n) => n.startsWith('walk_front')).sort();
console.log('total', names.length);
console.log('back', back.length, back[0], back[back.length - 1]);
console.log('front', front.length, front[0], front[front.length - 1]);
console.log('attack', names.filter((n) => n.startsWith('attack_front')).length);
