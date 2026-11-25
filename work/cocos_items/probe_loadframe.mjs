import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const { loadFrame } = require('./_sim/ArtLayer.js');
const { loadPortrait, portraitChain } = require('./_sim/Portrait.js');

cc.__setAsset('face/full/385');
cc.__setAsset('bg/map_bg');
console.log('assets has 385:', cc.__assets.has('face/full/385'));
loadFrame('face/full/385', (f) => console.log('loadFrame face/full/385 ->', f ? `frame ok, path=${f.path}` : 'null'));
loadFrame('bg/map_bg', (f) => console.log('loadFrame bg/map_bg ->', f ? 'frame ok' : 'null'));
console.log('chain 關羽:', JSON.stringify(portraitChain('關羽', 'full')));
const tgt = { apply: (f) => console.log('apply', f ? 'frame' : 'null'), setVisible: (v) => console.log('setVisible', v), node: null };
loadPortrait(tgt, '關羽', 'full', loadFrame, (r) => console.log('loadPortrait result:', JSON.stringify(r)));
console.log('loadLog:', cc.__loadLog.join(' | '));
