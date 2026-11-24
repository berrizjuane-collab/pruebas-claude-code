"""Láminas nuevas de la web, con la misma maquinaria de la identidad: dos cámaras aéreas sobre el DEM real.

  VII · ruta      La ruta normal: vista aérea de la tarde desde el SO, a 6 500 m sobre el glaciar
                  Godwin-Austen; el K2 a la izquierda y todo el espolón oeste a la vista.
  VIII · panorama La Cresta Ancha: panorámica cilíndrica al atardecer desde el oeste, a 7 100 m;
                  K2, las tres cumbres del Broad Peak y los Gasherbrum.
"""


def ocaso(id_, cam, **kw):
    d = dict(id=id_, titulo='', altura='', hora='atardecer', rumbo_txt='',
             camara=cam, sol=(289.0, 5.0), penumbra=0.004, paleta='ocaso',
             cielo=dict(momento='ocaso', cenit=30.0, k_resplandor=0.55, ancho_resplandor=50.0, cirros=0.30,
                        color_cirros=(250, 214, 190)),
             terreno=dict(nieve_min=5100.0, bruma_km=90.0), luz_objetos=0.62, objetos=None,
             acabado=dict(tiza=(246, 228, 208), k_tiza=0.9))
    d.update(kw)
    return d


def tarde(id_, cam, **kw):
    d = dict(id=id_, titulo='', altura='', hora='tarde', rumbo_txt='', camara=cam,
             sol=(252.0, 36.0), paleta='dia', cielo=dict(momento='altura', cenit=45.0),
             terreno=dict(nieve_min=5100.0, bruma_km=110.0), objetos=None, acabado=dict(k_tiza=0.8))
    d.update(kw)
    return d


ESCENAS = {
    'ruta': tarde('07_ruta', dict(lat=35.772, lon=76.503, alt=6500.0, rumbo=36.0, hfov=78.0, cy=0.43)),
    'panorama': ocaso('08_panorama', dict(lat=35.812, lon=76.470, alt=7100.0, rumbo=70.0, hfov=104.0, cy=0.57,
                                          proy='cil')),
}
