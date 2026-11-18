"""
familia.py — familia de nubes «a medida del texto».

Cada sprite se genera alrededor de un área de texto (núcleo) de proporción dada. Los márgenes
(copos arriba, base abajo, laterales) dependen del lado corto del núcleo, así que una nube para
dos líneas es baja y alargada y una para un párrafo alto es más alta. La web elige el sprite cuya
proporción de núcleo se parece más a la del texto medido y lo escala para que el núcleo coincida
exactamente con la caja del texto.

    python3 familia.py <salida> <indice_trabajo> <n_trabajos>
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nubes_real import vol5
from tiza_fn import tiza

CUMULO = [0.5, 0.65, 0.8, 1.0, 1.25, 1.55, 1.95, 2.45, 3.1, 3.9, 4.9, 6.2, 7.8]
LENTI = [3.2, 4.6, 6.4]
ESTAND = [2.2, 3.4]


def css_core_w(a):
    """ancho típico en pantalla (px CSS) del área de texto con esta proporción: fija la escala de la tiza"""
    if a < 1:
        return 290
    if a < 2.2:
        return 380
    if a < 4.4:
        return 520
    return 330


def spec(fam, a):
    area = 0.42e6 if a < 4.4 else 0.26e6
    cw = min(math.sqrt(area * a), 1500.0); ch = cw / a
    if fam == 'cumulo':
        if a >= 1:
            L = R = 0.40 * ch + 0.045 * cw; T = 0.66 * ch + 0.03 * cw; B = 0.40 * ch + 0.02 * cw
        else:
            L = R = 0.25 * cw + 0.035 * ch; T = 0.52 * cw + 0.05 * ch; B = 0.34 * cw + 0.02 * ch
        kw = {}
    elif fam == 'lenticular':
        L = R = 0.22 * cw; T = 1.45 * ch; B = 1.1 * ch
        kw = dict(lens=True, noise=0.55, calm=0.5, wispy=0.3)
    else:  # estandarte: cabeza densa sobre el texto y cola hacia la derecha
        L = 0.40 * ch + 0.05 * cw; R = 0.85 * cw; T = 0.66 * ch; B = 0.40 * ch
        kw = dict(stream=1.0, sides=False)
    W, H = int(cw + L + R), int(ch + T + B)
    core = (L / W, T / H, (L + cw) / W, (T + ch) / H)
    return W, H, core, kw


def jobs():
    J = []
    for fam, lst in (('cumulo', CUMULO), ('lenticular', LENTI), ('estandarte', ESTAND)):
        for a in lst:
            for v in (0, 1):
                if fam != 'cumulo' and v == 1 and fam == 'estandarte':
                    continue
                J.append((fam, a, v))
    J.append(('jiron', 0, 0)); J.append(('jiron', 0, 1))
    return J


def run(out, idx, n):
    os.makedirs(out, exist_ok=True)
    meta = []
    for k, (fam, a, v) in enumerate(jobs()):
        if k % n != idx:
            continue
        seed = 700 + k * 13
        if fam == 'jiron':
            W, H = 2000, 560
            core = (0.16, 0.40, 0.84, 0.60)
            im, _ = vol5(W, H, core, seed, noise=1.25, calm=0.0, wispy=1.0, lift=0.0, crown=0.35, sides=False)
            im = tiza(im, (0, 0, 1, 1), U=3.0, seed=seed)
            name = f'jiron_{v}'
            im.save(os.path.join(out, name + '.webp'), 'WEBP', quality=80, method=6, exact=True)
            meta.append(dict(f='jiron', n=name, w=W, h=H)); print(name, flush=True)
            continue
        W, H, core, kw = spec(fam, a)
        im, _ = vol5(W, H, core, seed, **kw)
        cpx = (core[0] * W, core[1] * H, core[2] * W, core[3] * H)
        scale = (cpx[2] - cpx[0]) / css_core_w(a)          # px de sprite por px CSS
        im = tiza(im, cpx, U=max(1.2, 1.15 * scale), seed=seed)
        name = f'{fam}_{str(a).replace(".", "_")}_{v}'
        im.save(os.path.join(out, name + '.webp'), 'WEBP', quality=80, method=6, exact=True)
        meta.append(dict(f=fam, n=name, a=a, w=W, h=H, c=[round(x, 5) for x in core]))
        print(name, W, H, flush=True)
    json.dump(meta, open(os.path.join(out, f'meta_{idx}.json'), 'w'))


if __name__ == '__main__':
    run(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
