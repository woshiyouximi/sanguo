import pathlib, re, subprocess, json
p = pathlib.Path(r'F:\sanguo\proto\core.js')
src = p.read_text(encoding='utf-8')
pat = re.compile(r'var ATTACK_COOLDOWN = \d+;')
bench = """
const C=require('./core.js'),D=require('./data_bundle.js');
let s=0,first=0;
for(let i=1;i<=10;i++){
  const w=C.createWorld({data:D,seed:i*13,soldiers:100,sides:{A:{formation:0,troop:'大刀',morale:60,general:{str:90}},B:{formation:0,troop:'大刀',morale:60,general:{str:80}}}});
  let t=0; while(!w.over&&t<10800){C.step(w);t++; if(!first&&w.sides.A.aliveCount<100)first=t;}
  s+=t/30;
}
console.log((s/10).toFixed(1)+' '+(first/30).toFixed(1));
"""
for cd in (60, 90, 120, 150):
    p.write_text(pat.sub('var ATTACK_COOLDOWN = %d;' % cd, src), encoding='utf-8')
    out = subprocess.run(['node','-e',bench], capture_output=True, text=True, cwd=r'F:\sanguo\proto')
    print('cd=%3d  平均时长/首死 = %s' % (cd, out.stdout.strip() or out.stderr.strip()[:100]))
p.write_text(src, encoding='utf-8')
print('restored cd=60')
