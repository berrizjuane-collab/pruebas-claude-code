"""Cielo (README §2.1), cúmulos de semiesferas (§2.2), bancos de niebla y mar de nubes en 3D."""
import math
import numpy as np
from scipy import ndimage as ndi
from util import smooth, mix, fbm, ruido_valor, desenfoque, gradiente_paradas
import render3d as R3

CIELOS = {
    'dia': [(0, (84, 112, 158)), (0.55, (146, 174, 204)), (1, (222, 220, 210))],
    'altura': [(0, (22, 44, 104)), (0.5, (58, 98, 164)), (0.85, (140, 176, 212)), (1, (212, 224, 234))],
    'alba': [(0, (30, 44, 100)), (0.35, (66, 80, 148)), (0.62, (150, 126, 170)), (0.82, (238, 164, 140)),
             (1, (255, 208, 150))],
    'ocaso': [(0, (34, 40, 96)), (0.38, (78, 78, 146)), (0.64, (168, 122, 160)), (0.84, (240, 152, 120)),
              (1, (255, 196, 136))],
    # tarde dorada mirando al este: azul limpio arriba, horizonte cálido apagado
    'dorada': [(0, (52, 82, 146)), (0.5, (112, 146, 196)), (0.82, (196, 200, 214)), (1, (232, 214, 196))],
    # ocaso mirando al este: cinturón de Venus rosado sobre la sombra azul de la Tierra
    'venus': [(0, (40, 52, 112)), (0.45, (96, 100, 160)), (0.70, (196, 150, 182)), (0.84, (238, 176, 170)),
              (0.93, (196, 170, 196)), (1, (126, 134, 182))],
}


def angulos_pixel(cam):
    """Elevación (rad) y acimut (rad) de cada píxel."""
    H, W = cam.H, cam.W
    u = np.arange(W, dtype=np.float32) + 0.5 - W / 2
    v = np.arange(H, dtype=np.float32) + 0.5
    fu = np.sqrt(cam.f ** 2 + u ** 2)
    elev = np.arctan((cam.cy - v[:, None]) / fu[None, :])
    az = cam.rumbo + np.arctan2(u, cam.f)
    return elev.astype(np.float32), np.broadcast_to(az[None, :], (H, W)).astype(np.float32)


def cielo(cam, escena, rng, U):
    H, W = cam.H, cam.W
    unit = math.sqrt(W * H)
    elev, az = angulos_pixel(cam)
    momento = escena.get('cielo', 'dia')
    E = math.radians(escena.get('cielo_E', 34.0))
    # la "base" del cielo es el horizonte aparente (con la depresión por altura)
    dip = math.sqrt(2 * max(cam.z - 4000, 0) / R3.R_EF)
    t = np.clip(1 - (elev + dip * 0.6) / E, -0.2, 1.15)
    if momento == 'noche':
        tt = np.clip(t, 0, 1) ** 1.4
        T = mix(np.array([6, 9, 28], np.float32), np.array([34, 50, 100], np.float32), tt[..., None])
    else:
        T = gradiente_paradas(t, CIELOS[momento])
    # resplandor cálido del lado del sol
    sol_az = math.radians(escena.get('sol', (180, 40))[0])
    dz = np.cos(az - sol_az)
    g = ((1 + dz) / 2) ** 2.2
    glow_c = np.array(escena.get('resplandor', (246, 228, 192)), np.float32)
    k_glow = escena.get('resplandor_k', 0.55)
    if momento != 'noche':
        T = mix(T, glow_c, (k_glow * g * smooth(0.25, 0.95, t))[..., None])
    # ruido de baja frecuencia
    n = fbm((H, W), 2.5, 4, rng, unit, sx=0.5)
    amp = 30 if momento != 'noche' else 8
    T = T + ((n - 0.5) * amp)[..., None] * np.array([1, 1, 0.9], np.float32)
    # cirros
    if escena.get('cirros', 0.42) > 0 and momento != 'noche':
        c = smooth(0.56, 0.82, fbm((H, W), 3.2, 4, rng, unit, sx=0.22, sy=2.6)) * smooth(0.62, 0.25, t)
        cc = np.array(escena.get('cirros_color', (232, 236, 240)), np.float32)
        T = mix(T, cc, (escena.get('cirros', 0.42) * c)[..., None])
    return np.clip(T, 0, 255).astype(np.float32), t


def cumulo(H, W, U, rng, cu, cv_base, w, hg, n_manchas, luz=(0.58, -0.62, 0.53), soft=1.0,
           corte=(0.06, 0.16), contraste=1.0, calida=False, tonos=None):
    """Una nube como racimo de semiesferas (README §2.2).  Devuelve (color, alfa, caja) en un recorte."""
    unit = math.sqrt(W * H)
    pad = int(14 * U + w * 0.2)
    x0 = int(max(0, cu * W - w - pad)); x1 = int(min(W, cu * W + w + pad))
    base = cv_base * H
    y0 = int(max(0, base - hg * 1.25 - pad)); y1 = int(min(H, base + 0.25 * hg + pad))
    if x1 <= x0 + 2 or y1 <= y0 + 2:
        return None
    h, ww = y1 - y0, x1 - x0
    Y, X = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    Hf = np.zeros((h, ww), np.float32)
    rn = ruido_valor((h, ww), 6, rng, unit) - 0.5
    for _ in range(n_manchas):
        fx = rng.normal(0, 0.45)
        if abs(fx) > 1:
            continue
        pxx = cu * W + fx * w
        top = hg * (1 - fx * fx) ** 0.55
        fr = rng.random() ** 0.9
        pyy = base - fr * top
        rad = min(w, 1.5 * hg) * (0.10 + 0.42 * rng.random() ** 2) * (0.45 + 0.75 * (1 - fr))
        if rad < 1:
            continue
        a0, a1 = int(max(x0, pxx - rad)), int(min(x1, pxx + rad + 1))
        b0, b1 = int(max(y0, pyy - rad)), int(min(y1, pyy + rad + 1))
        if a1 <= a0 or b1 <= b0:
            continue
        sx = slice(a0 - x0, a1 - x0); sy = slice(b0 - y0, b1 - y0)
        dd = (X[sy, sx] - pxx) ** 2 + (Y[sy, sx] - pyy) ** 2
        alt = rad * np.sqrt(np.maximum(0, 1 - dd / (rad * rad)))
        Hf[sy, sx] = np.maximum(Hf[sy, sx], alt)
    # corte de base plana
    Hf *= smooth(base + corte[0] * hg, base - corte[1] * hg, Y + rn * 0.08 * hg)
    # deformación por dos campos de ruido (13 U)
    dxn = (ruido_valor((h, ww), 9, rng, unit) - 0.5) * 2 * 13 * U
    dyn = (ruido_valor((h, ww), 9, rng, unit) - 0.5) * 2 * 13 * U
    J, I = np.mgrid[0:h, 0:ww].astype(np.float32)
    Hf = ndi.map_coordinates(Hf, [J + dyn, I + dxn], order=1, mode='constant')
    Hf *= (0.70 + 0.6 * ruido_valor((h, ww), 14, rng, unit))
    fino = ruido_valor((h, ww), 40, rng, unit)
    Hb = desenfoque(Hf, 1.8 * U * soft)
    alfa = smooth(0.6 * U, 8 * U * soft, Hb) * np.clip(0.62 + 0.8 * fino, 0, 1)
    alfa = np.clip(alfa * contraste + (1 - contraste) * alfa * 0.0, 0, 1)
    # sombreado lambertiano con Hf como mapa de alturas
    gy, gx = np.gradient(desenfoque(Hf, 2.5 * U * soft))
    L = np.array(luz, np.float32); L /= np.linalg.norm(L)
    nz = np.ones_like(gx)
    nn = np.sqrt(gx * gx + gy * gy + nz)
    lam = np.clip((-gx * L[0] + gy * L[1] * -1 + nz * L[2]) / nn, 0, 1)
    rel = Hf / (Hf.max() + 1e-6)
    lam = lam * (0.45 + 0.55 * smooth(0, 0.5, rel))
    if tonos is None:
        tonos = ((184, 172, 182), (238, 224, 208), (255, 247, 228)) if calida else \
                ((146, 160, 196), (218, 224, 236), (255, 253, 247))
    s_, m_, l_ = (np.array(t, np.float32) for t in tonos)
    lam3 = lam[..., None]
    col = np.where(lam3 < 0.5, mix(s_, m_, lam3 * 2), mix(m_, l_, (lam3 - 0.5) * 2))
    if contraste != 1.0:
        col = mix(m_, col, contraste)
    return col, alfa, (x0, y0, x1, y1)


def mar_de_nubes(buf, cam, escena, rng, U):
    """Capa de nubes horizontal en 3D a `nivel` m: color, alfa y distancia de cada píxel."""
    H, W = cam.H, cam.W
    nivel = escena['mar_nubes']['nivel']
    escala = escena['mar_nubes'].get('escala', 2600.0)
    elev, az = angulos_pixel(cam)
    s = np.tan(elev)
    dz = cam.z - nivel
    Rp = R3.R_EF
    disc = s * s - 2 * dz / Rp
    ok = (dz > 0) & (s < 0) & (disc > 0)
    dpl = np.where(ok, (-s - np.sqrt(np.maximum(disc, 0))) * Rp, np.inf).astype(np.float32)
    X = cam.x + dpl * np.sin(az); Y = cam.y + dpl * np.cos(az)
    # textura 1 - billow fBm en coordenadas de mundo (tesela con envoltura en espejo)
    N = 1024
    if 'tex_mar' not in escena:
        tex = np.zeros((N, N), np.float32)
        a, tot = 1.0, 0
        for o, f in enumerate((4, 8, 16, 32, 64)):
            g = rng.random((f + 3, f + 3)).astype(np.float32)
            z = ndi.zoom(g, N / f, order=3, mode='grid-wrap')[:N, :N]
            tex += a * np.abs(2 * np.clip(z, 0, 1) - 1); tot += a; a *= 0.5
        escena['tex_mar'] = 1 - tex / tot
    tex = escena['tex_mar']
    def muestra(xx, yy, esc):
        qx = np.abs(np.mod(xx / esc * N / 4, 2 * N) - N)
        qy = np.abs(np.mod(yy / esc * N / 4, 2 * N) - N)
        return ndi.map_coordinates(tex, [np.clip(qy, 0, N - 1.001), np.clip(qx, 0, N - 1.001)], order=1)
    sel = np.isfinite(dpl)
    hgt = np.zeros((H, W), np.float32)
    hgt[sel] = muestra(X[sel], Y[sel], escala)
    # sombreado como mapa de alturas (en pantalla, suavizado según distancia)
    hb = desenfoque(hgt, 1.2 * U)
    gy, gx = np.gradient(hb)
    sol = escena.get('sol', (180, 30))
    luzv = R3.vector_sol(*sol)
    sx_scr = math.sin(math.radians(sol[0]) - cam.rumbo)
    lam = np.clip(0.62 + (-gx * sx_scr * 3.0 + gy * 2.0) * 40 * U, 0, 1) * (0.55 + 0.45 * hb)
    tonos = escena['mar_nubes'].get('tonos', ((146, 160, 196), (218, 224, 236), (255, 253, 247)))
    s_, m_, l_ = (np.array(t, np.float32) for t in tonos)
    l3 = lam[..., None]
    col = np.where(l3 < 0.5, mix(s_, m_, l3 * 2), mix(m_, l_, (l3 - 0.5) * 2))
    # claros oscuros entre nubes
    claros = smooth(0.30, 0.16, hgt) * escena['mar_nubes'].get('claros', 0.5)
    col = mix(col, np.array(escena['mar_nubes'].get('claro_color', (44, 66, 112)), np.float32), claros[..., None])
    # bruma hacia el horizonte
    hz = smooth(0.0, 1.0, (np.where(sel, dpl, 1e7) / escena['mar_nubes'].get('bruma_D', 90000.0)) ** 0.7)
    col = mix(col, np.array(escena['mar_nubes'].get('bruma', (206, 218, 234)), np.float32), hz[..., None])
    alfa = np.where(sel, 1.0, 0.0).astype(np.float32)
    # el relieve asoma por encima del nivel (con transición suave)
    zt = buf['pz']; terr = np.isfinite(buf['dist'])
    asoma = smooth(-40.0, 60.0, zt - (nivel + (hgt - 0.5) * escena['mar_nubes'].get('relieve', 220.0)))
    alfa = np.where(terr & (buf['dist'] < dpl), alfa * (1 - asoma), alfa)
    alfa = np.where(terr & (buf['dist'] >= dpl), alfa, alfa)
    return col.astype(np.float32), alfa.astype(np.float32), dpl
