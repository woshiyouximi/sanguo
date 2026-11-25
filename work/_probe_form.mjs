import { readFileSync } from "node:fs";
const t = JSON.parse(readFileSync("data/formations.json", "utf8"));
for (const f of [0,1,2]) {
  const s = t.slots[f];
  console.log("form", f, s.name, "anchor", s.anchorX, "weights", JSON.stringify(s.weights));
  for (const n of ["10","50","100","200"]) {
    const arr = s.fill[n];
    const xs = arr.map(e=>e.x), ys = arr.map(e=>e.y);
    console.log("  fill", n, "len", arr.length, "x", Math.min(...xs), "..", Math.max(...xs), "y", Math.min(...ys), "..", Math.max(...ys), "modes", [...new Set(arr.map(e=>e.mode))].join(","));
  }
  const order=[1,3,4,5,2], w=s.weights;
  for (const N of [10,50,100,200]) {
    let P=0, prev=0, take=[];
    for (const m of order){ P += w[String(m)]||0; const k=Math.floor(P*N/200)-Math.floor(prev*N/200); prev=Math.floor(P*N/200); take.push([m,k]); }
    const cells=[];
    for (const [m,k] of take){ const list=s.modes[String(m)]||[]; for(let i=0;i<k && i<list.length;i++) cells.push({m,x:list[i][0],y:list[i][1]}); }
    const shift=Math.floor((200-N)/25);
    const gx=cells.map(c=>c.x+s.anchorX+shift);
    console.log("  gen", N, "n", cells.length, "x", Math.min(...gx), "..", Math.max(...gx), "takes", JSON.stringify(take));
  }
}
