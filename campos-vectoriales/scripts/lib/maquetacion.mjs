/**
 * Auditoría de maquetación (VV-08) que se ejecuta dentro de la página con
 * `page.evaluate(auditarMaquetacion)`.
 *
 * - Desplazamiento horizontal del documento.
 * - Solapamientos entre elementos flotantes (`[data-flotante]`) visibles.
 * - Flotantes que se salen de su contenedor (`[data-region="escena"]`).
 * - Textos recortados: elementos con texto propio cuyo contenido desborda su caja sin
 *   que exista una descripción accesible alternativa (`title` o `aria-label`).
 */
export function auditarMaquetacion() {
  const visibles = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  };
  const caja = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, ancho: r.width, alto: r.height, der: r.right, inf: r.bottom };
  };
  const nombre = (el) => el.getAttribute('data-region') || el.getAttribute('data-flotante') || el.tagName.toLowerCase();
  const cortan = (a, b) => a.x < b.der - 0.5 && b.x < a.der - 0.5 && a.y < b.inf - 0.5 && b.y < a.inf - 0.5;

  const incidencias = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 0.5) {
    incidencias.push({ tipo: 'desplazamiento-horizontal', detalle: `${doc.scrollWidth} > ${window.innerWidth}` });
  }

  const flotantes = [...document.querySelectorAll('[data-flotante]')].filter(visibles);
  for (let i = 0; i < flotantes.length; i++) {
    for (let j = i + 1; j < flotantes.length; j++) {
      if (cortan(caja(flotantes[i]), caja(flotantes[j]))) {
        incidencias.push({ tipo: 'solapamiento', detalle: `${nombre(flotantes[i])} ∩ ${nombre(flotantes[j])}` });
      }
    }
  }

  const escena = document.querySelector('[data-region="escena"]');
  if (escena) {
    const e = caja(escena);
    for (const f of flotantes) {
      if (!escena.contains(f)) continue;
      const c = caja(f);
      if (c.x < e.x - 0.5 || c.y < e.y - 0.5 || c.der > e.der + 0.5 || c.inf > e.inf + 0.5) {
        incidencias.push({ tipo: 'fuera-de-escena', detalle: nombre(f) });
      }
    }
  }

  for (const el of document.querySelectorAll('body *')) {
    if (!visibles(el)) continue;
    if (el.closest('.solo-lector')) continue; // oculto a propósito para lectores de pantalla
    const textoPropio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!textoPropio) continue;
    const cs = getComputedStyle(el);
    const recortaX = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
    const recortaY = cs.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 1;
    if ((recortaX || recortaY) && !el.closest('[title],[aria-label]') && cs.overflowX !== 'auto' && cs.overflowY !== 'auto') {
      incidencias.push({ tipo: 'texto-recortado', detalle: `${nombre(el)}: «${el.textContent.trim().slice(0, 40)}»` });
    }
  }

  return { incidencias, flotantes: flotantes.map((f) => ({ nombre: nombre(f), ...caja(f) })) };
}

/** Tipografía usada en el documento (VV-02). */
export function auditarTipografia() {
  const tamanos = new Set();
  const pesos = new Set();
  const familias = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.katex')) continue;
    const textoPropio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!textoPropio) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    tamanos.add(parseFloat(cs.fontSize));
    pesos.add(Number(cs.fontWeight));
    familias.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
  }
  return { tamanos: [...tamanos].sort((a, b) => a - b), pesos: [...pesos].sort(), familias: [...familias].sort() };
}

/**
 * Alineación y ritmo del panel (VV-04): las etiquetas y los anclajes visuales empiezan a
 * 16 px (±0.5) del borde del panel y la separación vertical entre secciones es múltiplo de 4.
 */
export function auditarAlineacion() {
  const panel = document.querySelector('.panel');
  if (!panel) return { incidencias: [], anclajes: 0 };
  const p = panel.getBoundingClientRect();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const selectores = [
    '.seccion > .seccion-titulo',
    '.seccion-cabecera > .seccion-titulo:not(:has(button))',
    '.seccion-boton > .chevron',
    '.formula-campo',
    '.valores-parametros',
    '.ejemplos',
    '.expresion-etiqueta',
    '.parametro-nombre',
    '.boton-anadir > svg',
    '.interruptor-pista',
    '.fila-etiqueta',
    '.limites-eje',
  ];
  const incidencias = [];
  let anclajes = 0;
  for (const sel of selectores) {
    for (const el of panel.querySelectorAll(sel)) {
      if (!visible(el)) continue;
      anclajes++;
      const dx = el.getBoundingClientRect().left - p.left;
      if (Math.abs(dx - 16) > 0.5) incidencias.push({ tipo: 'alineacion', detalle: `${sel}: ${dx.toFixed(1)} px` });
    }
  }
  const secciones = [...panel.children].filter(visible);
  for (let i = 1; i < secciones.length; i++) {
    const hueco = secciones[i].getBoundingClientRect().top - secciones[i - 1].getBoundingClientRect().bottom;
    const resto = ((hueco % 4) + 4) % 4;
    if (Math.min(resto, 4 - resto) > 0.5) incidencias.push({ tipo: 'ritmo', detalle: `hueco de ${hueco.toFixed(1)} px antes de la sección ${i + 1}` });
  }
  return { incidencias, anclajes };
}

/** Densidad del panel (VV-06): desbordamiento, secciones visibles enteras e interactivos visibles. */
export function auditarDensidad() {
  const panel = document.querySelector('.panel');
  if (!panel) return null;
  const p = panel.getBoundingClientRect();
  const enteras = [...panel.children]
    .filter((s) => {
      const r = s.getBoundingClientRect();
      return r.height > 0 && r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5;
    })
    .map((s) => s.querySelector('h2')?.textContent?.trim() ?? s.className);
  const interactivos = [...document.querySelectorAll('button, input, select, textarea, [tabindex="0"], [role="slider"], [role="combobox"]')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden';
  }).length;
  return { scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, seccionesEnteras: enteras, interactivos };
}
