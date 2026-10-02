import math
def norm(v): return math.sqrt(sum(c*c for c in v))
def add(a,b,s=1.0): return [a[i]+s*b[i] for i in range(3)]
def rk4(G,r,h):
    k1=G(r); k2=G(add(r,k1,h/2)); k3=G(add(r,k2,h/2)); k4=G(add(r,k3,h))
    return [r[i]+h/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]) for i in range(3)]
def unit(F):
    def G(r):
        f=F(r); n=norm(f); return [c/n for c in f]
    return G
rot=lambda r:[-r[1],r[0],0.0]
def hel(a): return lambda r:[-r[1],r[0],a]
sad=lambda r:[r[0],-r[1],0.0]
uni=lambda r:[1.0,0.0,0.0]

print("== Circunferencia (rotacional), rho0=1, sigma=2*pi*rho0")
errs=[]
for h in [0.4,0.2,0.1,0.0625,0.01]:
    r=[1.0,0,0]; n=round(2*math.pi/h); hh=2*math.pi/n
    maxdr=0
    for _ in range(n):
        r=rk4(unit(rot),r,hh); maxdr=max(maxdr,abs(math.hypot(r[0],r[1])-1))
    e=norm(add(r,[1.0,0,0],-1)); errs.append((hh,e))
    print(f"h={hh:.4f} err_pos={e:.3e} max|rho-1|={maxdr:.3e}")
for (h1,e1),(h2,e2) in zip(errs,errs[1:4]):
    print(f"  orden observado {h1:.3f}->{h2:.3f}: p={math.log(e1/e2)/math.log(h1/h2):.3f}")

print("== Helice a=0.25, rho0=1: una vuelta (sigma=2*pi*sqrt(1+a^2))")
for a in [0.25,-0.25]:
  for h in [0.0625,0.01]:
    L=2*math.pi*math.sqrt(1+a*a); n=round(L/h); hh=L/n; r=[1.0,0,0]; maxdr=0
    for _ in range(n):
        r=rk4(unit(hel(a)),r,hh); maxdr=max(maxdr,abs(math.hypot(r[0],r[1])-1))
    print(f"a={a:+} h={hh:.4f} dz={r[2]:.12f} (exacto {2*math.pi*a:.12f}) rel={abs(r[2]-2*math.pi*a)/abs(2*math.pi*a):.2e} |dxy|={math.hypot(r[0]-1,r[1]):.2e} max|rho-1|={maxdr:.2e}")

print("== Silla: invariante xy desde (0.2,1.5,0) hasta salir de [-2,2]")
for h in [0.0625,0.01]:
    r=[0.2,1.5,0.0]; c0=r[0]*r[1]; mx=0; L=0
    while abs(r[0])<=2 and abs(r[1])<=2 and L<20:
        r=rk4(unit(sad),r,h); L+=h; mx=max(mx,abs(r[0]*r[1]-c0))
    print(f"h={h} max|xy-c0|/|c0|={mx/abs(c0):.2e}")

print("== Uniforme: rectitud")
r=[-2,0.3,-0.7]; mx=0
for _ in range(64): r=rk4(unit(uni),r,0.0625); mx=max(mx,abs(r[1]-0.3),abs(r[2]+0.7))
print(f"desviacion max={mx:.2e}")

print("== Particulas (silla, t): x=x0 e^t, y=y0 e^-t, t=1")
pe=[]
for dt in [0.1,0.05,0.025,0.01]:
    r=[0.3,1.2,0.0]; n=round(1/dt)
    for _ in range(n): r=rk4(sad,r,dt)
    ex=[0.3*math.e,1.2/math.e,0]; e=norm(add(r,ex,-1))/norm(ex); pe.append((dt,e))
    print(f"dt={dt} err_rel={e:.2e}")
for (h1,e1),(h2,e2) in zip(pe,pe[1:3]): print(f"  orden p={math.log(e1/e2)/math.log(h1/h2):.3f}")

print("== Diferencias finitas centradas sobre T1 = (sin(yz), x^2 e^z, y^3 cos x)")
P=lambda x,y,z: math.sin(y*z); Q=lambda x,y,z: x*x*math.exp(z); R=lambda x,y,z: y**3*math.cos(x)
def div_exact(x,y,z): return 0+0+0  # dP/dx=0, dQ/dy=0, dR/dz=0
def curl_exact(x,y,z): return [3*y*y*math.cos(x)-x*x*math.exp(z), y*math.cos(y*z)+y**3*math.sin(x), 2*x*math.exp(z)-z*math.cos(y*z)]
def fd(f,p,j,h):
    # pasos efectivos (SPEC §5.4): se divide por el incremento realmente aplicado
    a=list(p); b=list(p); a[j]=p[j]+h; b[j]=p[j]-h
    hp=a[j]-p[j]; hm=p[j]-b[j]
    return (f(*a)-f(*b))/(hp+hm)
eps=2.0**-52; c=eps**(1/3)
import random; random.seed(1); worst=0; worstrel=0
for _ in range(2000):
    p=[random.uniform(-2,2) for _ in range(3)]
    hs=[c*max(abs(p[j]),2.0) for j in range(3)]  # L = 2 (mitad del lado de [-2,2]^3)
    cu=[fd(R,p,1,hs[1])-fd(Q,p,2,hs[2]), fd(P,p,2,hs[2])-fd(R,p,0,hs[0]), fd(Q,p,0,hs[0])-fd(P,p,1,hs[1])]
    ce=curl_exact(*p)
    for i in range(3):
        e=abs(cu[i]-ce[i]); worst=max(worst,e); worstrel=max(worstrel,e/(1+abs(ce[i])))
print(f"h_j=eps^(1/3)*max(|x|,L=2), pasos efectivos  max|err|={worst:.2e}  max err/(1+|v|)={worstrel:.2e}")
p=[0.7,-1.1,0.4]; ce=curl_exact(*p)[2]; prev=None
for h in [1e-1,5e-2,2.5e-2,1.25e-2]:
    e=abs(fd(Q,p,0,h)-fd(P,p,1,h)-ce)
    if prev: print(f"  h={h:.4f} err={e:.3e} p={math.log(prev/e)/math.log(2):.3f}")
    else: print(f"  h={h:.4f} err={e:.3e}")
    prev=e
