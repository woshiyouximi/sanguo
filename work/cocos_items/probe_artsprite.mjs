import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cc = require('./_sim/node_modules/cc/index.js');
const { ArtSprite, loadFrame } = require('./_sim/ArtLayer.js');

cc.__setAsset('face/full/385');
const host = new cc.Node('host');
const art = new ArtSprite(host, 'ItemsPortrait', { x: 34, y: 108, w: 72, h: 92 }, 'contain');
console.log('art.state', art.state, 'node', art.node && art.node.name, 'children', host.children.length);
const comp = art.node.getComponent(cc.Sprite);
console.log('sprite comp?', !!comp);
loadFrame('face/full/385', (f) => {
  const okApply = art.apply(f);
  console.log('apply ->', okApply, 'state', art.state, 'spriteFrame?', !!comp.spriteFrame, 'node.active', art.node.active);
  if (!okApply) {
    try { art.apply(f); } catch (e) { console.log('apply threw:', e && e.message); }
  }
});
