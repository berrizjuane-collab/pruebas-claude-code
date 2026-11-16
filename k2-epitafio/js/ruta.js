// La ruta del Espolón de los Abruzos.
//
// La línea roja no se dibuja con SVG: está pintada en una segunda versión de la ilustración
// (misma pincelada, mismo grano). Aquí solo se destapa: una máscara recorre el mismo trazado
// y deja ver la capa pintada a medida que el lector baja. Las carpas y el banderín aparecen
// con círculos de la misma máscara al llegar a cada campo.

import { alMedir } from './reloj.js';
import { capitulo, fijarCamara, esVertical, camaraPorDefecto } from './escenario.js';
import { fijarAltitud } from './altimetro.js';
import { RUTA } from './datos.js';
import { mezclar, suave, rampa, porTramos, $, $$ } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';
const [ANCHO, ALTO] = RUTA.tam;

export function iniciarRuta() {
  const cap = capitulo('ruta');
  const trazo = $('#ruta-trazo');
  const cabeza = $('#ruta-cabeza');
  const capa = $('#ruta-capa');
  const pasos = $$('#pasos .paso');

  // ── geometría ──────────────────────────────────────────────────────────────
  const pts = RUTA.puntos;
  trazo.setAttribute('d', 'M' + pts.map((p) => p.join(' ')).join('L'));
  const acum = [0];
  for (let i = 1; i < pts.length; i++) {
    acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const largo = acum[acum.length - 1];
  const fraccion = (i) => acum[Math.round(i)] / largo;
  const punto = (s) => {                       // punto de la línea a la fracción s de su longitud
    const d = s * largo;
    let i = 1;
    while (i < acum.length - 1 && acum[i] < d) i++;
    const t = (d - acum[i - 1]) / (acum[i] - acum[i - 1] || 1);
    return [mezclar(pts[i - 1][0], pts[i][0], t), mezclar(pts[i - 1][1], pts[i][1], t)];
  };

  capa.setAttribute('x', RUTA.capa.x);
  capa.setAttribute('y', RUTA.capa.y);
  capa.setAttribute('width', RUTA.capa.w);
  capa.setAttribute('height', RUTA.capa.h);
  capa.setAttribute('href', cap.img.dataset.base + '_linea.webp');

  // Los cuatro campos pintados y los tramos intermedios, como fracción de la línea.
  const [c1, c2, c3, c4] = RUTA.campos.map((c) => c.i);
  const ultimo = pts.length - 1;
  const TRAMOS = {
    inicio: 0.012,
    c1: fraccion(c1),
    chimenea: fraccion(mezclar(c1, c2, 0.84)),
    c2: fraccion(c2),
    piramide: fraccion(mezclar(c2, c3, 0.5)),
    c3: fraccion(c3),
    c4: fraccion(c4),
    cuello: fraccion(mezclar(c4, ultimo, 0.42)),
    cumbre: 1,
  };
  const fracciones = pasos.map((p) => TRAMOS[p.dataset.tramo]);
  const altitudes = pasos.map((p) => Number(p.dataset.altitud));

  // Hitos de la máscara (carpas, banderín) y rótulos C1…C4.
  const hitos = $('#ruta-hitos');
  const rotulos = $('#ruta-rotulos');
  const marcas = RUTA.campos.map((c, k) => {
    const circulo = document.createElementNS(SVG, 'circle');
    circulo.setAttribute('cx', c.carpa[0]);
    circulo.setAttribute('cy', c.carpa[1] - 18);
    circulo.setAttribute('r', 0);
    hitos.append(circulo);
    const texto = document.createElementNS(SVG, 'text');
    texto.setAttribute('x', c.carpa[0] + 62);
    texto.setAttribute('y', c.carpa[1] + 4);
    texto.textContent = 'C' + (k + 1);
    rotulos.append(texto);
    return { s: fraccion(c.i), circulo, texto, radio: 62 };
  });
  const bandera = document.createElementNS(SVG, 'circle');
  bandera.setAttribute('cx', RUTA.cumbre[0] + 12);
  bandera.setAttribute('cy', RUTA.cumbre[1] - 24);
  bandera.setAttribute('r', 0);
  hitos.append(bandera);
  marcas.push({ s: 0.992, circulo: bandera, texto: null, radio: 64 });

  // ── sincronía con los pasos ────────────────────────────────────────────────
  let centros = [];
  alMedir(() => {
    const base = window.scrollY;
    centros = pasos.map((p) => {
      const r = p.getBoundingClientRect();
      return r.top + base + r.height / 2;
    });
  });

  let s = 0, activo = -1, dibujado = -1, altitud = altitudes[0];
  const ancla = (e) => e.y + e.sh * (esVertical(e) ? 0.7 : 0.5);

  fijarAltitud('ruta', () => altitud);

  fijarCamara('ruta', (c, e) => {
    const a = ancla(e);
    s = porTramos(centros, fracciones, a);
    altitud = porTramos(centros, altitudes, a);
    const [hx, hy] = punto(s);

    // línea, carpas y cabeza
    if (Math.abs(s - dibujado) > 0.0004) {
      dibujado = s;
      trazo.setAttribute('stroke-dashoffset', (1 - s).toFixed(4));
      for (const m of marcas) {
        const k = suave(rampa(m.s - 0.012, m.s + 0.02, s));
        m.circulo.setAttribute('r', (k * m.radio).toFixed(1));
        if (m.texto) m.texto.classList.toggle('visto', k > 0.6);
      }
      cabeza.setAttribute('transform', 'translate(' + hx.toFixed(1) + ' ' + hy.toFixed(1) + ')');
    }
    cabeza.classList.toggle('viva', a > centros[0] - e.sh * 0.45 && s < 0.997);

    // paso activo: el más cercano al ancla
    let cerca = -1, dist = e.sh * 0.42;
    centros.forEach((y, i) => {
      const d = Math.abs(y - a);
      if (d < dist) { dist = d; cerca = i; }
    });
    if (cerca !== activo) {
      activo = cerca;
      pasos.forEach((p, i) => p.classList.toggle('activo', i === activo));
    }

    // cámara: sigue a la cabeza de cerca y se aleja al final para ver la línea entera
    const vertical = esVertical(e);
    const zoom = vertical
      ? mezclar(1.22, 1.0, suave(rampa(0.82, 1, s)))
      : mezclar(mezclar(1.8, 1.5, suave(rampa(0, 0.75, s))), 1.02, suave(rampa(0.8, 1, s)));
    // dónde debe quedar la cabeza en pantalla (los pasos ocupan la izquierda; en móvil, la parte baja)
    const px = vertical ? 0.5 : 0.63;
    const py = vertical ? 0.34 : 0.52;
    const sigue = {
      x: hx / ANCHO - ((px - 0.5) * e.sw) / (c.pw * zoom),
      y: hy / ALTO - ((py - 0.5) * e.sh) / (c.ph * zoom),
      s: zoom,
    };
    const reposo = camaraPorDefecto(c, e);
    const fin = centros[centros.length - 1];
    const entra = suave(rampa(centros[0] - e.sh * 0.8, centros[0] - e.sh * 0.05, a));
    const sale = suave(rampa(fin + e.sh * 0.25, fin + e.sh * 0.9, a));
    const k = entra * (1 - sale);
    return {
      x: mezclar(reposo.x, sigue.x, k),
      y: mezclar(reposo.y, sigue.y, k),
      s: mezclar(reposo.s, sigue.s, k),
    };
  });
}
