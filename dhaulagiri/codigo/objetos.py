"""Utilería vectorial (README §5): carpas domo, comedor, banderas de oración, escaladores, piedras,
cuerdas fijas, frontales, estrellas y luna.  Todo se coloca en coordenadas del mundo (se proyecta con
la cámara de la escena), se ordena de atrás hacia adelante y se dibuja en el lienzo a SS×.
dibujar_utileria() registra cada objeto en una máscara para el re-pincelado (§5.4); las estrellas,
los frontales y su halo no se repintan."""
import math
import numpy as np
from PIL import Image, ImageDraw
import render3d as R3

COLORES_CARPA = [(222, 168, 44), (214, 104, 38), (196, 58, 44), (226, 196, 70), (64, 112, 168), (92, 140, 70),
                 (230, 122, 30)]
BANDERAS = [(46, 84, 170), (236, 236, 228), (196, 52, 44), (52, 140, 74), (232, 192, 46)]


def _tono(c, k):
    return tuple(int(np.clip(v * k, 0, 255)) for v in c)


class Proxy:
    """Dibuja a la vez en el lienzo y en la máscara de rebrush (README §5.4)."""

    def __init__(self, lienzo, mascara):
        self.d = ImageDraw.Draw(lienzo)
        self.m = ImageDraw.Draw(mascara) if mascara is not None else None

    def polygon(self, pts, fill):
        self.d.polygon(pts, fill=fill)
        if self.m: self.m.polygon(pts, fill=255)

    def ellipse(self, box, fill):
        self.d.ellipse(box, fill=fill)
        if self.m: self.m.ellipse(box, fill=255)

    def line(self, pts, fill, width):
        self.d.line(pts, fill=fill, width=max(1, int(round(width))), joint='curve')
        if self.m: self.m.line(pts, fill=255, width=max(1, int(round(width))))

    def chord(self, box, a0, a1, fill):
        self.d.chord(box, a0, a1, fill=fill)
        if self.m: self.m.chord(box, a0, a1, fill=255)

    def pieslice(self, box, a0, a1, fill):
        self.d.pieslice(box, a0, a1, fill=fill)
        if self.m: self.m.pieslice(box, a0, a1, fill=255)


def _lado_sol(esc, cam):
    """+1 si el sol ilumina el lado derecho de los objetos en pantalla, -1 si el izquierdo."""
    az = math.radians(esc['sol'][0])
    s = math.sin(az - cam.rumbo)
    return 1.0 if s >= 0 else -1.0


def _visible(info, u, v, d, cam, tol=0.04):
    H, W = info['prof'].shape
    ui, vi = int(np.clip(u, 0, W - 1)), int(np.clip(v - 1, 0, H - 1))
    p = info['prof'][vi, ui]
    return (not np.isfinite(p)) or p > d * (1 - tol) - 3


def suelo(x, y):
    import escena as E
    return E.altura_suelo(x, y)


def carpa(P, u, v, esc_px, color, lado, rng, tipo='domo'):
    """Carpa domo: semielipse, mitad en sombra (×0.62), gajo de luz y puerta oscura."""
    w = 2.3 * esc_px * rng.uniform(0.9, 1.15)
    h = 1.25 * esc_px * rng.uniform(0.9, 1.1)
    box = [u - w / 2, v - h, u + w / 2, v + h]
    sombra = _tono(color, 0.62)
    P.chord(box, 180, 360, fill=sombra)
    if lado > 0:
        P.pieslice(box, 270, 360, fill=color)
        P.pieslice([u - w * 0.12, v - h * 0.95, u + w * 0.42, v + h * 0.95], 270, 330, fill=_tono(color, 1.12))
    else:
        P.pieslice(box, 180, 270, fill=color)
        P.pieslice([u - w * 0.42, v - h * 0.95, u + w * 0.12, v + h * 0.95], 210, 270, fill=_tono(color, 1.12))
    # varillas
    P.line([u - w / 2, v, u - w * 0.05, v - h, u + w / 2, v], fill=_tono(color, 0.45), width=max(1, 0.05 * esc_px))
    # puerta
    pw = w * 0.22; ph = h * 0.62
    P.chord([u - pw / 2 - lado * w * 0.12, v - ph, u + pw / 2 - lado * w * 0.12, v + ph], 180, 360, fill=(36, 30, 34))
    # base / nieve apilada
    P.line([u - w * 0.55, v + 0.02 * esc_px, u + w * 0.55, v + 0.02 * esc_px], fill=(230, 232, 236), width=0.12 * esc_px)


def comedor(P, u, v, esc_px, color, lado, rng):
    """Tienda comedor de campo base: cuerpo trapecial con techo a dos aguas."""
    w = 4.8 * esc_px; h = 2.2 * esc_px; hr = 0.8 * esc_px
    cuerpo = [(u - w / 2, v), (u + w / 2, v), (u + w / 2 - 0.1 * esc_px, v - h), (u - w / 2 + 0.1 * esc_px, v - h)]
    P.polygon(cuerpo, fill=_tono(color, 0.75 if lado < 0 else 0.95))
    techo = [(u - w / 2 + 0.1 * esc_px, v - h), (u + w / 2 - 0.1 * esc_px, v - h), (u + w * 0.15, v - h - hr), (u - w * 0.15, v - h - hr)]
    P.polygon(techo, fill=_tono(color, 1.08))
    P.polygon([(u - 0.5 * esc_px, v), (u + 0.5 * esc_px, v), (u + 0.45 * esc_px, v - 1.5 * esc_px), (u - 0.45 * esc_px, v - 1.5 * esc_px)], fill=(40, 34, 36))


def banderas(P, pts_uv, ancho_px, rng):
    """Banderas de oración en catenaria entre dos puntos de pantalla."""
    (u0, v0), (u1, v1) = pts_uv
    L = math.hypot(u1 - u0, v1 - v0)
    n = max(6, int(L / (ancho_px * 1.25)))
    comba = 0.10 * L
    cuerda = []
    for k in range(41):
        t = k / 40
        cuerda += [u0 + (u1 - u0) * t, v0 + (v1 - v0) * t + comba * 4 * t * (1 - t)]
    P.line(cuerda, fill=(60, 56, 52), width=max(1, ancho_px * 0.06))
    for i in range(n):
        t = (i + 0.5) / n
        x = u0 + (u1 - u0) * t
        y = v0 + (v1 - v0) * t + comba * 4 * t * (1 - t)
        c = BANDERAS[i % 5]
        c = _tono(c, rng.uniform(0.85, 1.05))
        w = ancho_px * rng.uniform(0.75, 0.95); h = ancho_px * rng.uniform(0.85, 1.1)
        sway = rng.uniform(-0.25, 0.25) * w
        P.polygon([(x - w / 2, y), (x + w / 2, y), (x + w / 2 + sway, y + h), (x - w / 2 + sway, y + h)], fill=c)


def escalador(P, u, v, esc_px, color, lado, rng, inclinacion=0.25, piolet=True, mochila=(70, 64, 60)):
    """Escalador: piernas, torso inclinado, mochila, casco y piolet (siluetas planas de 2–3 tonos)."""
    h = 1.75 * esc_px
    s = lado
    luz = _tono(color, 1.1); somb = _tono(color, 0.62)
    cadera = (u, v - 0.5 * h)
    # piernas
    P.line([u - 0.10 * h, v, cadera[0], cadera[1]], fill=(46, 44, 52), width=0.11 * h)
    P.line([u + 0.12 * h, v - 0.02 * h, cadera[0] + 0.02 * h, cadera[1]], fill=(60, 58, 66), width=0.11 * h)
    # torso inclinado
    hombro = (cadera[0] + inclinacion * 0.32 * h, cadera[1] - 0.32 * h)
    P.line([cadera[0], cadera[1], hombro[0], hombro[1]], fill=color, width=0.20 * h)
    P.line([cadera[0] + s * 0.03 * h, cadera[1], hombro[0] + s * 0.03 * h, hombro[1]], fill=luz, width=0.07 * h)
    # mochila (detrás)
    mx = (cadera[0] + hombro[0]) / 2 - 0.10 * h; my = (cadera[1] + hombro[1]) / 2 - 0.02 * h
    P.polygon([(mx - 0.08 * h, my - 0.14 * h), (mx + 0.04 * h, my - 0.16 * h), (mx + 0.05 * h, my + 0.12 * h),
               (mx - 0.08 * h, my + 0.12 * h)], fill=mochila)
    # brazo y piolet
    mano = (hombro[0] + 0.16 * h, hombro[1] + 0.20 * h)
    P.line([hombro[0], hombro[1], mano[0], mano[1]], fill=somb, width=0.07 * h)
    if piolet:
        P.line([mano[0], mano[1] - 0.04 * h, mano[0] + 0.05 * h, mano[1] + 0.30 * h], fill=(50, 50, 56), width=0.025 * h)
    # casco
    r = 0.075 * h
    P.ellipse([hombro[0] + 0.02 * h - r, hombro[1] - 0.12 * h - r, hombro[0] + 0.02 * h + r, hombro[1] - 0.12 * h + r],
              fill=(230, 222, 200))


def porteador(P, u, v, esc_px, color, lado, rng, inclinacion=0.42, carga='bidon'):
    """Porteador balti (añadido para la lámina «La caravana»): gorro de lana, tronco inclinado bajo la carga,
    bastón y, a la espalda, un bidón azul o un fardo blanco atado con cuerda."""
    h = 1.7 * esc_px
    f = 1.0 if inclinacion >= 0 else -1.0       # hacia dónde camina
    s = lado                                    # lado iluminado
    luz = _tono(color, 1.12); somb = _tono(color, 0.6)
    cadera = (u, v - 0.5 * h)
    P.line([u - 0.11 * h * f, v, cadera[0], cadera[1]], fill=_tono(color, 0.72), width=0.13 * h)
    P.line([u + 0.10 * h * f, v - 0.02 * h, cadera[0] + 0.02 * h * f, cadera[1]], fill=_tono(color, 0.84), width=0.13 * h)
    hombro = (cadera[0] + f * abs(inclinacion) * 0.34 * h, cadera[1] - 0.30 * h)
    P.line([cadera[0], cadera[1], hombro[0], hombro[1]], fill=color, width=0.21 * h)
    P.line([cadera[0] + s * 0.03 * h, cadera[1], hombro[0] + s * 0.03 * h, hombro[1]], fill=luz, width=0.07 * h)
    bx = (cadera[0] + hombro[0]) / 2 - f * 0.19 * h
    by = hombro[1] - 0.03 * h
    if carga == 'bidon':
        w, hh = 0.30 * h, 0.42 * h
        P.polygon([(bx - w / 2, by - hh / 2), (bx + w / 2, by - hh / 2), (bx + w / 2, by + hh / 2), (bx - w / 2, by + hh / 2)],
                  fill=(38, 69, 176))
        P.ellipse([bx - w / 2, by - hh / 2 - 0.045 * h, bx + w / 2, by - hh / 2 + 0.045 * h], fill=(58, 94, 204))
        for k in (-0.2, 0.2):
            P.line([bx - w / 2, by + hh * k, bx + w / 2, by + hh * k], fill=(24, 44, 122), width=0.026 * h)
        P.line([bx + s * w * 0.3, by - hh / 2, bx + s * w * 0.3, by + hh / 2], fill=(76, 110, 218), width=0.045 * h)
    else:
        w, hh = 0.36 * h, 0.36 * h
        P.polygon([(bx - w / 2, by - hh / 2 + 0.03 * h), (bx - w / 2 + 0.04 * h, by - hh / 2), (bx + w / 2 - 0.04 * h, by - hh / 2),
                   (bx + w / 2, by - hh / 2 + 0.03 * h), (bx + w / 2, by + hh / 2 - 0.03 * h), (bx + w / 2 - 0.04 * h, by + hh / 2),
                   (bx - w / 2 + 0.04 * h, by + hh / 2), (bx - w / 2, by + hh / 2 - 0.03 * h)], fill=(226, 228, 232))
        P.line([bx - w / 2, by - hh * 0.3, bx + w / 2, by - hh * 0.3], fill=(46, 76, 184), width=0.03 * h)
        P.line([bx - w / 2, by + hh * 0.12, bx + w / 2, by + hh * 0.12], fill=(170, 160, 140), width=0.026 * h)
        P.line([bx, by - hh / 2, bx, by + hh / 2], fill=(170, 160, 140), width=0.026 * h)
        P.line([bx + s * w * 0.32, by - hh / 2, bx + s * w * 0.32, by + hh / 2], fill=(246, 246, 248), width=0.04 * h)
    P.line([bx + f * w / 2, by - hh * 0.32, hombro[0], hombro[1]], fill=(86, 72, 58), width=0.032 * h)
    mano = (hombro[0] + f * 0.13 * h, hombro[1] + 0.25 * h)
    P.line([hombro[0], hombro[1], mano[0], mano[1]], fill=somb, width=0.07 * h)
    P.line([mano[0] + f * 0.01 * h, mano[1] - 0.10 * h, mano[0] + f * 0.11 * h, v + 0.01 * h], fill=(96, 80, 62), width=0.024 * h)
    r = 0.07 * h
    hx, hy = hombro[0] + f * 0.06 * h, hombro[1] - 0.105 * h
    P.ellipse([hx - r, hy - r, hx + r, hy + r], fill=(142, 106, 82))
    P.ellipse([hx - r * 1.12, hy - r * 1.3, hx + r * 1.12, hy - r * 0.05], fill=(204, 194, 174))


def piedra(P, u, v, r, lado, rng, base=(58, 56, 62), clara=(150, 138, 124)):
    n = rng.integers(6, 10)
    ang = np.sort(rng.uniform(0, 2 * np.pi, n))
    rad = r * rng.uniform(0.65, 1.0, n)
    pts = [(u + rad[i] * math.cos(ang[i]) * 1.25, v + rad[i] * math.sin(ang[i]) * 0.72 - 0.3 * r) for i in range(n)]
    P.polygon(pts, fill=_tono(base, rng.uniform(0.85, 1.15)))
    # cara clara desplazada hacia el sol y arriba
    k = 0.62
    pts2 = [(u + lado * 0.16 * r + rad[i] * k * math.cos(ang[i]) * 1.2, v - 0.42 * r + rad[i] * k * math.sin(ang[i]) * 0.6)
            for i in range(n)]
    P.polygon(pts2, fill=_tono(clara, rng.uniform(0.85, 1.1)))


def cresta_np(lienzo, mascara, puntos, rng, U, luz=(250, 246, 236), sombra=(138, 158, 204), sol_izq=True,
              textura=None):
    """Cresta de nieve (o morrena) en primer plano, donde se apoya la cámara: borde superior irregular
    con cornisa, degradado de luz a sombra hacia abajo y ondas de viento (o manchas de piedra).  Se pinta
    en el lienzo con NumPy solo sobre la franja de filas que ocupa y se registra en la máscara."""
    from scipy import ndimage as ndi
    W2, H2 = lienzo.size
    us = np.array([p[0] for p in puntos]) * W2
    vs = np.array([p[1] for p in puntos]) * H2
    xx = np.arange(W2, dtype=np.float32)
    borde = np.interp(xx, us, vs).astype(np.float32)
    ruido = np.convolve(rng.normal(0, 1, W2 + 400), np.ones(61) / 61, mode='same')[200:200 + W2]
    ruido2 = np.convolve(rng.normal(0, 1, W2 + 400), np.ones(9) / 9, mode='same')[200:200 + W2]
    borde = (borde + ruido * 0.030 * H2 + ruido2 * 0.0045 * H2).astype(np.float32)
    y0 = int(max(0, np.floor(borde.min()) - 2))
    if y0 >= H2:
        return borde
    hb = H2 - y0
    Y = (np.arange(y0, H2, dtype=np.float32))[:, None]
    prof = Y - borde[None, :]
    dentro = prof > 0
    L = np.array(luz, np.float32); S_ = np.array(sombra, np.float32)
    k = np.clip(prof / np.float32(0.16 * H2), 0, 1) ** np.float32(0.8)
    i_cima = float(np.argmin(borde))
    t = np.clip((xx - (i_cima - 0.04 * W2)) / (0.16 * W2), 0, 1).astype(np.float32)
    t = t * t * (3 - 2 * t)
    lado = t if sol_izq else 1 - t
    k = np.clip(k * 0.6 + lado[None, :] * 0.38 * np.clip(prof / np.float32(0.03 * H2), 0, 1), 0, 1)
    col = L[None, None, :] * (1 - k[..., None]) + S_[None, None, :] * k[..., None]
    del k
    if textura == 'morrena':
        acc = np.zeros((hb, W2), np.float32)
        for esc, w in ((0.045, 0.55), (0.016, 0.3), (0.006, 0.15)):
            cel = max(3.0, esc * H2 * 3)
            g = rng.random((max(4, int(hb / cel) + 2), max(4, int(W2 / cel) + 2))).astype(np.float32)
            z = ndi.zoom(g, (hb / (g.shape[0] - 1), W2 / (g.shape[1] - 1)), order=1)[:hb, :W2]
            acc[:z.shape[0], :z.shape[1]] += w * np.clip(z, 0, 1)
        manch = np.clip((acc - 0.5) * 2.6, -1, 1)
        hielo = np.clip((acc - 0.62) * 6, 0, 1)[..., None] * np.float32(0.6)
        col *= (1 + 0.28 * manch[..., None])
        col = col * (1 - hielo) + np.array([196, 206, 216], np.float32) * hielo
        del acc, manch, hielo
    else:
        fase = np.cumsum(rng.normal(0, 0.3, W2)).astype(np.float32) * np.float32(0.5)
        ondas = np.sin((Y * 0.9 + fase[None, :]) / np.float32(0.004 * H2)).astype(np.float32)
        col *= (1 + 0.035 * ondas[..., None] * (prof[..., None] > 0.01 * H2))
        del ondas
    bajo = np.exp(-((prof - np.float32(0.008 * H2)) / np.float32(0.004 * H2)) ** 2).astype(np.float32) * np.float32(0.22)
    col = col * (1 - bajo[..., None]) + S_ * bajo[..., None]
    del bajo
    banda = np.asarray(lienzo.crop((0, y0, W2, H2))).astype(np.float32)
    banda = np.where(dentro[..., None], col, banda)
    lienzo.paste(Image.fromarray(np.clip(banda, 0, 255).astype(np.uint8)), (0, y0))
    if mascara is not None:
        m = Image.fromarray((dentro * 255).astype(np.uint8))
        mascara.paste(255, (0, y0), m)
    return borde


def _xy_de_uv(ob, info, cam):
    """Si el objeto trae uv (fracciones del cuadro), devuelve el punto del relieve visible en ese píxel."""
    if 'uv' not in ob:
        return ob['xy']
    H, W = info['prof'].shape
    u = int(np.clip(ob['uv'][0] * W, 0, W - 1)); v = int(np.clip(ob['uv'][1] * H, 0, H - 1))
    if not np.isfinite(info['prof'][v, u]):
        return None
    return float(info['px'][v, u]), float(info['py'][v, u])


def _proy(cam, x, y, z):
    u, v, d = cam.proyectar(np.array([x]), np.array([y]), np.array([z]))
    return float(u[0]), float(v[0]), float(d[0])


def dibujar_utileria(lienzo, esc, cam, info, U, SS, rng):
    objs = esc.get('objetos', [])
    if not objs:
        return None
    W2, H2 = lienzo.size
    mascara = Image.new('L', (W2, H2), 0)
    P = Proxy(lienzo, mascara)
    lado = _lado_sol(esc, cam)
    lista = []   # (v_base, función)
    for ob in objs:
        t = ob['tipo']
        if t in ('estrellas', 'frontales', 'luna', 'resplandor'):
            continue
        if t == 'cresta':
            lista.append((cam.H * 2, lambda ob=ob: cresta_np(lienzo, mascara, ob['puntos'], rng, U * SS,
                                                             ob.get('luz', (250, 246, 236)), ob.get('sombra', (138, 158, 204)),
                                                             lado < 0, ob.get('textura'))))
            for sub in ob.get('encima', []):
                if sub['tipo'] == 'piedras':
                    # piedras en pantalla dentro de una banda; más grandes cuanto más abajo
                    u0, u1, v0, v1 = sub['caja']
                    for _ in range(sub.get('n', 200)):
                        u = rng.uniform(u0, u1); v = v0 + (v1 - v0) * rng.random() ** 0.8
                        r = (sub['r'][0] + (sub['r'][1] - sub['r'][0]) * ((v - v0) / max(1e-6, v1 - v0)) ** 1.5) * H2
                        r *= rng.uniform(0.5, 1.4)
                        lista.append((cam.H * 2 + 0.5 + v, lambda u=u, v=v, r=r, sub=sub: piedra(
                            P, u * W2, v * H2, r, lado, rng, sub.get('base', (58, 56, 62)), sub.get('clara', (150, 138, 124)))))
                if sub['tipo'] == 'comedor':
                    u, v = sub['uv'][0] * W2, sub['uv'][1] * H2
                    lista.append((cam.H * 2 + 1 + sub['uv'][1], lambda u=u, v=v, sub=sub: comedor(
                        P, u, v, sub['ancho'] * W2 / 4.8, tuple(sub['color']), lado, rng)))
                if sub['tipo'] == 'mastil_banderas':
                    (ua, va, ha), (ub, vb, hb) = sub['de'], sub['a']
                    lista.append((cam.H * 2 + 0.9 + max(va, vb), lambda ua=ua, va=va, ha=ha, ub=ub, vb=vb, hb=hb, sub=sub: (
                        P.line([ua * W2, va * H2, ua * W2, (va - ha) * H2], (70, 60, 54), 0.0025 * H2),
                        P.line([ub * W2, vb * H2, ub * W2, (vb - hb) * H2], (70, 60, 54), 0.0025 * H2),
                        banderas(P, [(ua * W2, (va - ha) * H2), (ub * W2, (vb - hb) * H2)], sub.get('ancho', 0.012) * H2, rng))))
                if sub['tipo'] == 'carpa':
                    u, v = sub['uv'][0] * W2, sub['uv'][1] * H2
                    lista.append((cam.H * 2 + 1 + sub['uv'][1], lambda u=u, v=v, sub=sub: carpa(
                        P, u, v, sub['ancho'] * W2 / 2.3, tuple(sub['color']), lado, rng)))
                if sub['tipo'] == 'escalador':
                    u, v = sub['uv'][0] * W2, sub['uv'][1] * H2
                    lista.append((cam.H * 2 + 1, lambda u=u, v=v, sub=sub: escalador(
                        P, u, v, sub['alto'] * H2 / 1.75, sub['color'], lado * sub.get('mira', 1), rng,
                        sub.get('inclinacion', 0.0), sub.get('piolet', True))))
                elif sub['tipo'] == 'banderas':
                    (ua, va), (ub, vb) = sub['de'], sub['a']
                    lista.append((cam.H * 2 + 2, lambda ua=ua, va=va, ub=ub, vb=vb, sub=sub: banderas(
                        P, [(ua * W2, va * H2), (ub * W2, vb * H2)], sub.get('ancho', 0.018) * H2, rng)))
            continue
        if t == 'piedras':
            # piedras esparcidas sobre el terreno cercano, en el sector visible
            n = ob.get('n', 200)
            for _ in range(n):
                dd = ob['dmin'] * (ob['dmax'] / ob['dmin']) ** rng.random()
                az = cam.rumbo + math.radians(rng.uniform(-1, 1) * ob.get('sector', 40))
                x = cam.x + dd * math.sin(az); y = cam.y + dd * math.cos(az)
                z = suelo(x, y)
                u, v, d = _proy(cam, x, y, z)
                if not (np.isfinite(u) and -50 < u < cam.W + 50 and 0 < v < cam.H + 50):
                    continue
                if not _visible(info, u, v, d, cam):
                    continue
                r = ob.get('r', 0.35) * rng.uniform(0.4, 1.6) ** 1.5 * cam.f / d * SS
                if r < 0.9 * U * SS:
                    continue
                lista.append((v, lambda u=u, v=v, r=r: piedra(P, u * SS, v * SS, r, lado, rng,
                                                               ob.get('base', (58, 56, 62)), ob.get('clara', (150, 138, 124)))))
            continue
        if t in ('carpa', 'comedor', 'escalador', 'porteador'):
            xy = _xy_de_uv(ob, info, cam)
            if xy is None:
                continue
            x, y = xy
            z = suelo(x, y) + ob.get('dz', 0.0)
            u, v, d = _proy(cam, x, y, z)
            if not (np.isfinite(u) and -200 < u < cam.W + 200):
                continue
            if ob.get('oclusion', True) and not _visible(info, u, v, d, cam, 0.06):
                continue
            px_m = cam.f / d * SS
            col = tuple(ob.get('color', COLORES_CARPA[rng.integers(len(COLORES_CARPA))]))
            if t == 'carpa':
                lista.append((v, lambda u=u, v=v, px_m=px_m, col=col: carpa(P, u * SS, v * SS, px_m, col, lado, rng)))
            elif t == 'comedor':
                lista.append((v, lambda u=u, v=v, px_m=px_m, col=col: comedor(P, u * SS, v * SS, px_m, col, lado, rng)))
            elif t == 'porteador':
                lista.append((v, lambda u=u, v=v, px_m=px_m, col=col, ob=ob: porteador(
                    P, u * SS, v * SS, px_m, col, lado * ob.get('mira', 1), rng, ob.get('inclinacion', 0.42),
                    ob.get('carga', 'bidon'))))
            else:
                lista.append((v, lambda u=u, v=v, px_m=px_m, col=col, ob=ob: escalador(
                    P, u * SS, v * SS, px_m, col, lado * ob.get('mira', 1), rng, ob.get('inclinacion', 0.25),
                    ob.get('piolet', True))))
            continue
        if t == 'banderas':
            (xa, ya, ha), (xb, yb, hb) = ob['de'], ob['a']
            ua, va, da = _proy(cam, xa, ya, suelo(xa, ya) + ha)
            ub, vb, db = _proy(cam, xb, yb, suelo(xb, yb) + hb)
            if not (np.isfinite(ua) and np.isfinite(ub)):
                continue
            ancho = 0.32 * cam.f / ((da + db) / 2) * SS
            # mástiles
            ua0, va0, _ = _proy(cam, xa, ya, suelo(xa, ya)); ub0, vb0, _ = _proy(cam, xb, yb, suelo(xb, yb))
            lista.append((max(va0, vb0), lambda ua=ua, va=va, ub=ub, vb=vb, ancho=ancho, ua0=ua0, va0=va0, ub0=ub0, vb0=vb0: (
                P.line([ua0 * SS, va0 * SS, ua * SS, va * SS], (70, 60, 54), ancho * 0.12),
                P.line([ub0 * SS, vb0 * SS, ub * SS, vb * SS], (70, 60, 54), ancho * 0.12),
                banderas(P, [(ua * SS, va * SS), (ub * SS, vb * SS)], ancho, rng))))
            continue
        if t == 'cuerda':
            pts = []
            ruta = ob['ruta'] if 'ruta' in ob else [(*xy, ob.get('altura', 0.9) + suelo(*xy)) for xy in
                                                     (_xy_de_uv(dict(uv=q), info, cam) for q in ob['uvs']) if xy is not None]
            for (x, y, z) in ruta:
                u, v, d = _proy(cam, x, y, z if z is not None else suelo(x, y) + 0.5)
                if np.isfinite(u):
                    pts += [u * SS, v * SS]
            if len(pts) >= 4:
                lista.append((max(pts[1::2]) / SS, lambda pts=pts: P.line(pts, ob.get('color', (176, 60, 50)), ob.get('ancho', 0.9) * U * SS)))
            continue
    lista.sort(key=lambda e: e[0])
    for _, f in lista:
        f()
    m = np.asarray(mascara) > 127
    return m if m.any() else None


def dibujar_sin_rebrush(lienzo, esc, cam, info, U, SS, rng):
    """Estrellas, luna y frontales: se dibujan después del rebrush (no se emborronan)."""
    objs = esc.get('objetos', [])
    if not objs:
        return
    W2, H2 = lienzo.size
    d = ImageDraw.Draw(lienzo, 'RGBA')
    for ob in objs:
        t = ob['tipo']
        if t == 'cresta':
            for sub in ob.get('encima', []):
                u, v = sub.get('uv', (0, 0))[0] * W2, sub.get('uv', (0, 0))[1] * H2
                if sub['tipo'] == 'resplandor':
                    r = sub.get('r', 0.05) * H2
                    for k in range(12, 0, -1):
                        rr = r * (0.4 + k * 0.18)
                        d.ellipse([u - rr, v - rr * 0.6, u + rr, v + rr * 0.6], fill=(255, 196, 120, 10))
                elif sub['tipo'] == 'frontal':
                    r = sub.get('r', 0.004) * H2
                    for k in range(10, 0, -1):
                        rr = r * (1 + k * 0.9)
                        d.ellipse([u - rr, v - rr, u + rr, v + rr], fill=(255, 236, 190, 12))
                    d.ellipse([u - r, v - r, u + r, v + r], fill=(255, 250, 232, 255))
                    if 'haz' in sub:     # haz de la linterna hacia un punto
                        hu, hv = sub['haz'][0] * W2, sub['haz'][1] * H2
                        ang = math.atan2(hv - v, hu - u); L = math.hypot(hu - u, hv - v)
                        for k in range(6):
                            a0 = ang + (k - 2.5) * 0.035
                            d.polygon([(u, v), (u + L * math.cos(a0 - 0.05), v + L * math.sin(a0 - 0.05)),
                                       (u + L * math.cos(a0 + 0.05), v + L * math.sin(a0 + 0.05))], fill=(255, 240, 200, 9))
            continue
        if t == 'estrellas':
            sky = ~info['terr']
            n = ob.get('n', 1800)
            us = rng.uniform(0, cam.W, n); vs = rng.uniform(0, cam.H, n) ** 1.0
            mag = rng.random(n) ** 3.2
            for u, v, m in zip(us, vs, mag):
                ui, vi = int(u), int(v)
                if not sky[min(vi, cam.H - 1), min(ui, cam.W - 1)]:
                    continue
                if info['prof'][min(vi, cam.H - 1), min(ui, cam.W - 1)] < np.inf:
                    continue
                r = (0.35 + 1.6 * m) * U * SS
                a = int(90 + 165 * m)
                c = (230, 236, 255, a) if rng.random() < 0.8 else (255, 236, 210, a)
                d.ellipse([u * SS - r, v * SS - r, u * SS + r, v * SS + r], fill=c)
                if m > 0.75:
                    rr = r * 4
                    d.line([u * SS - rr, v * SS, u * SS + rr, v * SS], fill=(230, 236, 255, 70), width=max(1, int(r * 0.5)))
                    d.line([u * SS, v * SS - rr, u * SS, v * SS + rr], fill=(230, 236, 255, 70), width=max(1, int(r * 0.5)))
        elif t == 'luna':
            u = cam.W / 2 + cam.f * math.tan(math.radians(ob['az']) - cam.rumbo)
            v = cam.cy - cam.f * math.tan(math.radians(ob['elev'])) / math.cos(math.radians(ob['az']) - cam.rumbo)
            r = ob.get('r', 9) * U * SS
            for k in range(14, 0, -1):
                rr = r * (1 + k * 0.55)
                d.ellipse([u * SS - rr, v * SS - rr, u * SS + rr, v * SS + rr], fill=(200, 210, 240, 7))
            d.ellipse([u * SS - r, v * SS - r, u * SS + r, v * SS + r], fill=(246, 244, 230, 255))
            d.ellipse([u * SS - r * 0.55, v * SS - r * 0.4, u * SS - r * 0.05, v * SS + r * 0.1], fill=(220, 220, 212, 255))
        elif t == 'frontales':
            ruta = ob['ruta'] if 'ruta' in ob else [(*_xy_de_uv(dict(uv=q), info, cam), None) for q in ob['uvs']
                                                     if _xy_de_uv(dict(uv=q), info, cam) is not None]
            for (x, y, z) in ruta:
                zz = z if z is not None else suelo(x, y) + 1.5
                u, v, dd = _proy(cam, x, y, zz)
                if not np.isfinite(u) or not (0 <= u < cam.W and 0 <= v < cam.H):
                    continue
                if not _visible(info, u, v + 2, dd, cam, 0.08):
                    continue
                r = max(0.9 * U, min(3.2 * U, 900.0 / dd * U)) * SS
                for k in range(10, 0, -1):
                    rr = r * (1 + k * 0.9)
                    d.ellipse([u * SS - rr, v * SS - rr, u * SS + rr, v * SS + rr], fill=(255, 236, 190, 10))
                d.ellipse([u * SS - r, v * SS - r, u * SS + r, v * SS + r], fill=(255, 250, 232, 255))
        elif t == 'resplandor':
            # resplandor interior de carpas de noche
            xy = _xy_de_uv(ob, info, cam)
            if xy is None:
                continue
            x, y = xy
            u, v, dd = _proy(cam, x, y, suelo(x, y) + 0.6)
            if np.isfinite(u):
                r = 2.2 * cam.f / dd * SS
                for k in range(12, 0, -1):
                    rr = r * (0.4 + k * 0.18)
                    d.ellipse([u * SS - rr, v * SS - rr * 0.6, u * SS + rr, v * SS + rr * 0.6], fill=(255, 200, 120, 9))
