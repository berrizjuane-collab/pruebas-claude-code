"""Lámina VIII · «La ruta»: vista aérea oblicua desde el oeste, por el eje del Cwm Occidental."""

CFG = dict(
    titulo='La ruta del Collado Sur', sub='Del Campo Base a la cumbre: la cascada del Khumbu, el Cwm Occidental, la cara del Lhotse y la arista sureste',
    pos=(27.9905, 86.7650), zabs=9800.0, dz=0.0, rumbo=91.0, hfov=56.0, pitch=-15.0, vh=0.5,
    sol=(212.0, 30.0), paleta='tarde', seed=1808, rho_min=40.0, paso_min=2.0,
    penacho=dict(largo=3800.0, ancho=380.0, opacidad=0.85),
    mar=4850.0,
    nubes=[], niebla=[], ajustes=dict(bruma_D=52000.0, umbral_roca=47.0), cirros=0.35)


def registrar(ESC, **cambios):
    cfg = dict(CFG)
    cfg.update(cambios)
    ESC.ESCENAS['ruta'] = cfg
    return cfg
