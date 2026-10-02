import math
exec(open('calibrar.py').read().split('print("== Circunferencia')[0])
sad=lambda r:[r[0],-r[1],0.0]
def run(F,r0,sig,h):
    n=round(sig/h); hh=sig/n; r=list(r0)
    for _ in range(n): r=rk4(unit(F),r,hh)
    return r,hh
print("== Circunferencia, arco parcial sigma=1.5, error frente a exacta")
prev=None
for h in [0.3,0.15,0.075,0.0375,0.01875]:
    r,hh=run(rot,[1.0,0,0],1.5,h); e=math.hypot(r[0]-math.cos(1.5),r[1]-math.sin(1.5))
    print(f"h={hh:.5f} err={e:.3e}"+(f"  p={math.log(prev/e)/math.log(2):.3f}" if prev else "")); prev=e
print("== Silla normalizada: autoconvergencia |r_h - r_{h/2}|, sigma=2 desde (0.2,1.5,0)")
prev=None; ref=None
res=[]
for h in [0.2,0.1,0.05,0.025,0.0125]:
    r,hh=run(sad,[0.2,1.5,0.0],2.0,h); res.append(r)
for i in range(len(res)-1):
    d=math.dist(res[i],res[i+1])
    print(f"h={[0.2,0.1,0.05,0.025][i]} |r_h-r_h/2|={d:.3e}"+(f" p={math.log(prev/d)/math.log(2):.3f}" if prev else "")); prev=d
