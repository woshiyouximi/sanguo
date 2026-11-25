import { readFileSync } from 'node:fs';
const magics = JSON.parse(readFileSync('data/magics.json', 'utf8'));
console.log('keys', Object.keys(magics[0]));
console.log('sample', JSON.stringify(magics[0]).slice(0, 200));
const m95 = magics.find((x) => x.SEQUENCE === 95 || x.SEQ === 95 || x.id === 95);
console.log('m95', JSON.stringify(m95));
