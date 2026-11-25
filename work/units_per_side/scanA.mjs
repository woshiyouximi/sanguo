const d = require('./dis.cjs');
const {BUF, PE, textSec, va2off, disasm} = d;
const start = textSec.virtualAddress + 0x400000, end = start + textSec.virtualSize;
const hits = new Map();
const bytes = BUF.subarray(textSec.pointerToRawData, textSec.pointerToRawData + textSec.sizeOfRawData);
const insns = disasm(start, end);
for (const ins of insns) {
  const ops = ins.opCount;
  for (let i=0;i<ops;i++){
    const op = ins.opKind(i);
    // Memory operand with absolute disp
    if (op === 3 || op === 4) { // Memory
      const disp = Number(ins.memoryDisplacement);
      if (disp >= 0x4A8000 && disp < 0x4B8000) hits.set(Number(ins.ip), {disp, off: ins.memoryDisplacementSize, text: ins.toString()});
    }
  }
}
const arr = [...hits.values()].sort((a,b)=>a.disp-b.disp);
let prev=null;
for (const h of arr) {
  const gap = prev===null?0:h.disp-prev;
  console.log(h.disp.toString(16).toUpperCase().padStart(8,'0'), 'gap=0x'+gap.toString(16), h.text.replace(/\s+/g,' '));
  prev=h.disp;
}
console.error('total refs', arr.length);
