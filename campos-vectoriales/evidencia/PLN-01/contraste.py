def lin(c):
    c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def Y(h): v=int(h[1:3],16); return lin(v)
def cr(a,b):
    ya,yb=Y(a),Y(b); hi,lo=max(ya,yb),min(ya,yb); return (hi+0.05)/(lo+0.05)
def Lstar(h):
    y=Y(h); f=y**(1/3) if y>216/24389 else (24389/27*y+16)/116
    return 116*f-16
def hexL(L):  # gray with given L*
    fy=(L+16)/116; y=fy**3 if fy**3>216/24389 else (L)/(24389/27)
    c=12.92*y if y<=0.0031308 else 1.055*y**(1/2.4)-0.055
    v=round(c*255); return '#%02X%02X%02X'%(v,v,v)
pal={'bg':'#101010','surface':'#181818','raised':'#242424','border':'#404040','text2':'#B0B0B0','text1':'#F5F5F5'}
print('token     hex      L*     vs bg   vs surf  vs raised')
for k,h in pal.items():
    print(f"{k:9} {h}  {Lstar(h):5.1f}  {cr(h,'#101010'):6.2f}  {cr(h,'#181818'):6.2f}  {cr(h,'#242424'):6.2f}")
print('\ncandidates (vs #101010 / #181818 / #242424):')
for h in ['#2E2E2E','#333333','#3A3A3A','#4A4A4A','#5C5C5C','#6B6B6B','#707070','#757575','#7A7A7A','#808080','#8A8A8A','#8C8C8C','#9A9A9A','#A0A0A0','#B8B8B8','#C8C8C8','#D9D9D9','#E6E6E6','#FFFFFF']:
    print(f"{h}  L*={Lstar(h):5.1f}  {cr(h,'#101010'):5.2f} {cr(h,'#181818'):5.2f} {cr(h,'#242424'):5.2f}")
print('\nmagnitude ramp: uniform L* from 38 to 97, 9 steps (min contrast vs bg):')
steps=[38+i*(97-38)/8 for i in range(9)]
for L in steps:
    h=hexL(L); print(f"L*={L:5.1f} {h} cr_bg={cr(h,'#101010'):5.2f}")
print('\nfocus ring #F5F5F5 vs raised', round(cr('#F5F5F5','#242424'),2), ' text1 on #404040', round(cr('#F5F5F5','#404040'),2), ' text2 on raised', round(cr('#B0B0B0','#242424'),2))
