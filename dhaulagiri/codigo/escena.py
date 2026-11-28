"""Tubería completa de una lámina (README §1): escena -> T + reg -> θ -> pintor -> utilería ->
rebrush -> reducción LANCZOS -> acabado."""
import math
import time
import numpy as np
from PIL import Image, ImageDraw
import terreno as TR
import render3d as R3
import sombreado as SH
import cielo as CI
import pintor as PT
import objetos as OB
from util import smooth, mix, unidad, desenfoque

_TERR = {}


def terreno():
    if 'niv' not in _TERR:
        _TERR['niv'], _TERR['cum'], _TERR['extra'] = TR.construir(verbose=False)
    return _TERR['niv'], _TERR['cum'], _TERR['extra']


def altura_suelo(x, y):
    """Altura del relieve en (x, y) con la misma mezcla de niveles que el trazado (fuera de L0 usa L1 y L2)."""
    niv, _, _ = terreno()
    if 'g' not in _TERR:
        _TERR['g'] = [n.z for n in niv] + [R3._g(n) for n in niv]
    Z0, Z1, Z2, g0, g1, g2 = _TERR['g']
    return float(R3.altura(float(x), float(y), 0.0, Z0, g0, Z1, g1, Z2, g2, 1e12))


def camara_de(esc, W, H):
    if 'latlon' in esc:
        x, y = TR.ll2xy(*esc['latlon'])
    elif 'en_cumbre' in esc:
        _, cum, _ = terreno()
        x, y = cum[esc['en_cumbre']][:2]
    else:
        x, y = esc['xy']
    z = esc['z_abs'] if 'z_abs' in esc else altura_suelo(x, y) + esc.get('ojo', 1.7)
    return R3.Camara(x, y, z, esc['rumbo'], esc['hfov'], W, H, esc['cy'])


def componer_T(esc, W, H, rng, log=print, buf=None):
    """Imagen objetivo T, regiones, θ por defecto, cámara y datos auxiliares."""
    niv, cum, extra = terreno()
    U = unidad(W, H)[1]
    cam = camara_de(esc, W, H)
    t0 = time.time()
    luzv = R3.vector_sol(*esc['sol'])
    if buf is None:
        buf = R3.render(cam, niv, sol=luzv, dlod=esc.get('dlod', 32000.0), pen=esc.get('penumbra', 0.03))
    log(f'  render 3D {time.time() - t0:.1f}s  (cámara z={cam.z:.0f} m)')
    t0 = time.time()
    Tt, reg, theta, info = SH.sombrear(buf, cam, niv, extra, esc, rng)
    log(f'  sombreado {time.time() - t0:.1f}s')
    sky, tsky = CI.cielo(cam, esc, rng, U)
    terr = np.isfinite(buf['dist'])
    # el cielo, un píxel de antialias en la silueta
    alfa_t = terr.astype(np.float32)
    alfa_t = np.clip(desenfoque(alfa_t, 0.5), 0, 1) if esc.get('aa_silueta', True) else alfa_t
    alfa_t = np.where(terr, np.maximum(alfa_t, 0.5), alfa_t * 0.9)
    T = mix(sky, Tt, alfa_t[..., None])
    reg = np.where(terr, reg, 0).astype(np.uint8)
    prof = np.where(terr, buf['dist'], np.inf).astype(np.float32)
    # nubes cúmulo detrás o delante según su distancia
    for nb in esc.get('cumulos', []):
        r = CI.cumulo(H, W, U, rng, nb['u'], nb['v'], nb['w'] * W, nb['h'] * H, nb.get('n', 60),
                      luz=nb.get('luz', (0.58, -0.62, 0.53)), soft=nb.get('soft', 1.0),
                      corte=nb.get('corte', (0.06, 0.16)), contraste=nb.get('contraste', 1.0),
                      calida=nb.get('calida', False), tonos=nb.get('tonos'))
        if r is None:
            continue
        col, a, (x0, y0, x1, y1) = r
        a = a * nb.get('opacidad', 1.0)
        dn = nb.get('dist', 1e9)
        detras = prof[y0:y1, x0:x1] < dn
        a = np.where(detras, 0.0, a)
        T[y0:y1, x0:x1] = mix(T[y0:y1, x0:x1], col, a[..., None])
        sub = reg[y0:y1, x0:x1]; sub[a > 0.5] = 1
        theta[y0:y1, x0:x1][a > 0.5] = np.nan
    # mar de nubes
    if 'mar_nubes' in esc:
        col, a, dpl = CI.mar_de_nubes(buf, cam, esc, rng, U)
        T = mix(T, col, a[..., None])
        reg[a > 0.5] = 1
        theta[a > 0.5] = np.nan
        prof = np.where(a > 0.5, np.minimum(prof, dpl), prof)
    # bandas de bruma / niebla horizontales
    for bn in esc.get('brumas', []):
        unit = math.sqrt(W * H)
        from util import fbm
        vv = (np.arange(H, dtype=np.float32) / H)[:, None]
        banda = smooth(bn.get('ancho', 0.105), 0, np.abs(vv - bn['v']))
        tex = smooth(0.28, 0.66, fbm((H, W), 3, 4, rng, unit, sx=0.45, sy=1.6))
        a = tex * banda * bn.get('k', 0.86)
        dn = bn.get('dist', 0)
        a = np.where(prof > dn, a, 0)
        T = mix(T, np.array(bn.get('color', (232, 236, 242)), np.float32), a[..., None])
        reg[(a > 0.45) & (reg != 0)] = 1
    info.update(dict(prof=prof, U=U, terr=terr, tsky=tsky, px=buf['px'], py=buf['py'], pz=buf['pz']))
    return T.astype(np.float32), reg, theta, cam, buf, info


def lamina(esc, W, H, SS=2, semilla=1, log=print, solo_T=False):
    rng = np.random.default_rng(semilla)
    t_ini = time.time()
    U = unidad(W, H)[1]
    T, reg, theta, cam, buf, info = componer_T(esc, W, H, rng, log)
    # utilería que cambia la imagen objetivo (antes de pintar): p. ej. sendas, cuerdas fijas tenues
    if solo_T:
        return T, reg, cam, info
    t0 = time.time()
    th = PT.campo_orientacion(T, reg, theta, U, rng)
    lienzo, Tc = PT.pintar(T, reg, th, U, SS, rng, log=log)
    del Tc, th
    import gc; gc.collect()
    log(f'  pintor {time.time() - t0:.1f}s')
    t0 = time.time()
    mascara = OB.dibujar_utileria(lienzo, esc, cam, info, U, SS, rng)
    if mascara is not None and esc.get('rebrush', True):
        lienzo = PT.rebrush(lienzo, mascara, U, SS, rng, log=log)
    OB.dibujar_sin_rebrush(lienzo, esc, cam, info, U, SS, rng)
    log(f'  utilería + rebrush {time.time() - t0:.1f}s')
    img = lienzo.resize((W, H), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    regf = reg
    t0 = time.time()
    a = PT.acabado(a, regf, U, rng, esc, log=log)
    log(f'  acabado {time.time() - t0:.1f}s   total {time.time() - t_ini:.1f}s')
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), T, reg, cam, info
