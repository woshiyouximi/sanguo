import fs from "node:fs";
const A="game/data/formations.json", B="game/cocos/assets/bundles/res/data/formations.json";
const a=JSON.parse(fs.readFileSync(A,"utf8")), b=JSON.parse(fs.readFileSync(B,"utf8"));
console.log("web matrix rows", a.matrix.length, "lens", a.matrix.map(r=>r.vs.length).join(","));
console.log("coc matrix rows", b.matrix.length, "lens", b.matrix.map(r=>r.vs.length).join(","));
let same=0, diff=0, first=null;
for(let i=0;i<Math.min(a.matrix.length,b.matrix.length);i++){
  const x=a.matrix[i].vs, y=b.matrix[i].vs;
  const n=Math.min(x.length,y.length);
  let ok=true;
  for(let j=0;j<n;j++) if(x[j]!==y[j]){ ok=false; if(!first) first={i,j,wx:x[j],cy:y[j]}; }
  if(x.length!==y.length) ok=false;
  if(ok) same++; else diff++;
}
console.log("rows equal", same, "rows diff", diff, "first diff", JSON.stringify(first));
console.log("web row0", JSON.stringify(a.matrix[0].vs));
console.log("coc row0", JSON.stringify(b.matrix[0].vs));
