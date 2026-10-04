/**
 * Escenas de la revisión visual (VALIDATION §7.2), compartidas por `scripts/capturas.mjs` y
 * las capturas de referencia de `tests/visual/` (§7.5): tamaños de pantalla, preparación de
 * cada captura con interacciones reales y páginas que no son la aplicación.
 */
/**
 * Preparación de cada captura (VALIDATION §7.2) con interacciones reales: escribir en las
 * ecuaciones y salir del campo, como haría el usuario.
 */
export const PREPARAR = {
  C5: async (page) => {
    await page.locator('[data-prueba="expr-Q"]').fill('x*(');
    await page.locator('[data-prueba="expr-Q"]').press('Tab');
    await page.locator('[data-prueba="error-Q"]').waitFor();
    await page.locator('[data-prueba="aviso-escena"]').waitFor();
  },
  // Helicoidal con líneas y partículas, en pausa y con el reloj determinista (estela inicial).
  C2: async (page) => {
    await page.locator('body').press('p');
    await page.waitForFunction(() => window.__campos.escena().particulas?.visible === true);
    if ((await page.locator('[data-prueba="boton-animacion"]').getAttribute('aria-label')) === 'Pausar la animación') {
      await page.locator('[data-prueba="boton-animacion"]').click();
    }
    await esperarCalculo(page);
  },
  // Rotacional con la rueda de paletas en P = (1, 0, 0) (la tarjeta del inspector llega con INS-02).
  C4: async (page) => {
    // En el modo consulta las tarjetas están en la hoja inferior: se abre, se elige y se pliega.
    const hoja = page.locator('.panel-hoja [data-prueba="boton-panel"]');
    const enHoja = (await hoja.count()) > 0;
    if (enHoja) await hoja.click();
    await page.locator('[data-campo="rotacional"]').click();
    if (enHoja) await hoja.click();
    await esperarCalculo(page);
    await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, punto: [1, 0, 0] })));
    await page.waitForFunction(() => window.__campos.escena().rueda?.visible === true && window.__campos.escena().seleccion?.flecha === true);
    await page.locator('[data-prueba="inspector"]').waitFor();
  },
  // Radial saliente con la densidad máxima, 21³ (estrés visual, VV-05).
  C7: async (page) => {
    await page.locator('[data-campo="radial-saliente"]').click();
    await page.getByRole('button', { name: 'Dominio y muestreo' }).click();
    await page.locator('[data-prueba="n"]').fill('21');
    await page.locator('[data-prueba="n"]').press('Enter');
    await page.waitForFunction(() => window.__campos.resultados().malla?.total === 9261, null, { timeout: 60000 });
    await esperarCalculo(page);
  },
  // Rotacional con «Glifos: rot F» y el corte con «rot F · n».
  C11: async (page) => {
    await page.locator('[data-campo="rotacional"]').click();
    await page.locator('body').press('g');
    await activarCorte(page, 'XY', null);
    await page.getByRole('combobox', { name: 'Escalar sobre el corte' }).click();
    await page.getByRole('option', { name: 'rot F · n' }).click();
    await page.waitForFunction(() => window.__campos.resultados().malla?.glifos === 'rotacional');
    await esperarCalculo(page);
  },
  C3: async (page) => {
    await escribirCampo(page, { P: 'x^2', Q: 'y', R: '0' });
    await activarCorte(page, 'XY', null);
    await page.getByRole('combobox', { name: 'Escalar sobre el corte' }).click();
    await page.getByRole('option', { name: 'div F' }).click();
    await esperarCalculo(page);
  },
  // Los tres planos del corte (evidencia de REN-05), con «Flechas: solo corte».
  'CORTE-XY': (page) => cortePlano(page, 'XY', '0.5'),
  'CORTE-XZ': (page) => cortePlano(page, 'XZ', '-1'),
  'CORTE-YZ': (page) => cortePlano(page, 'YZ', '-0.5'),
  // Modos de magnitud (evidencia de REN-04): proporcional (inicial), normalizada y logarítmica.
  'MAG-PROP': async (page) => {
    await esperarCalculo(page);
  },
  'MAG-NORM': async (page) => {
    await page.getByRole('button', { name: 'Avanzado' }).click();
    await page.getByRole('group', { name: 'Longitud de las flechas' }).getByRole('button', { name: 'Normalizada' }).click();
    await esperarCalculo(page);
  },
  'MAG-LOG': async (page) => {
    await page.getByRole('button', { name: 'Avanzado' }).click();
    await page.getByRole('group', { name: 'Luminancia de las flechas' }).getByRole('button', { name: 'Log' }).click();
    await esperarCalculo(page);
  },
  // Glifos de rot F con ω = ±1 (evidencia de REN-07), solo en el corte z = 0 para leerlos.
  'ROT+1': (page) => glifosRot(page, 1),
  'ROT-1': (page) => glifosRot(page, -1),
  // Solo partículas, en pausa (evidencia de REN-08).
  PARTICULAS: async (page) => {
    await page.evaluate(() => window.__campos.fijarEstado((s) => ({ ...s, capas: { ...s.capas, flechas: false, lineas: false, particulas: true } })));
    await page.waitForFunction(() => window.__campos.escena().particulas?.visible === true);
  },
  // Secciones nuevas del panel (evidencia de UI-08) con T6.
  'PANEL-LINEAS': async (page) => {
    await page.getByRole('button', { name: 'Líneas de corriente', exact: true }).click();
    await page.getByRole('button', { name: 'Detalles del cálculo' }).click();
    await esperarCalculo(page);
    await page.evaluate(() => document.querySelector('[data-prueba="seccion-lineas"]').scrollIntoView({ block: 'start' }));
  },
  'PANEL-DERIVADAS': async (page) => {
    await escribirCampo(page, { P: 'x^2', Q: 'y', R: '0' });
    await page.getByRole('button', { name: 'Divergencia y rotacional' }).click();
    await esperarCalculo(page);
    await page.evaluate(() => document.querySelector('[data-prueba="seccion-derivadas"]').scrollIntoView({ block: 'start' }));
  },
  C10: async (page) => {
    await page.locator('[data-prueba="expr-P"]').fill('sqrt(-1-x^2)');
    await page.locator('[data-prueba="expr-P"]').press('Tab');
    await page.locator('[data-prueba="estado-vacio"]').waitFor();
  },
  // Cajón de ayuda abierto en «Divergencia» desde su «?» (UI-06).
  C6: async (page) => {
    await esperarCalculo(page);
    const boton = page.locator('[data-ayuda="divergencia"]');
    await boton.scrollIntoViewIfNeeded();
    await boton.click();
    await page.locator('[data-apartado="divergencia"]').waitFor();
    await page.mouse.move(1, 1);
  },
  // Diálogo de exportación PNG con su vista previa (EXP-03).
  C9: async (page) => {
    await esperarCalculo(page);
    await page.getByRole('button', { name: 'Exportar', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Imagen PNG…' }).click();
    await page.locator('[data-prueba="vista-previa-png"]').waitFor();
    await page.mouse.move(1, 1);
  },
  // Movimiento reducido (el contexto ya lo emula) y foco visible en la escena (anillo interior).
  C12: async (page) => {
    await esperarCalculo(page);
    await page.locator('[data-prueba="lienzo"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
  },
  // 1.1 · Lluvia con ráfagas en t = 2: flechas, líneas instantáneas y partículas (reloj fijo).
  C13: async (page) => {
    await elegirCampo(page, 'lluvia');
    await fijarInstante(page, 2);
    await esperarCalculo(page);
  },
  // 1.1 · Vista libre dentro del helicoidal: solo la escena (DESIGN §5.5).
  C14: async (page) => {
    await esperarCalculo(page);
    await page.locator('[data-prueba="boton-vista-libre"]').click();
    await page.waitForFunction(() => window.__campos.vistaLibre().activa === true);
    // Pose fija dentro de Ω, mirando hacia el eje de las hélices (reproducible).
    await page.evaluate(() => window.__campos.fijarPoseVuelo([1.7, -1.6, -0.9], 2.2, 0.28));
  },
  // 1.1 · Viento giratorio en t = 1.5 con la sección «Tiempo» a la vista: líneas rectas, partículas en circunferencias.
  C15: async (page) => {
    await elegirCampo(page, 'viento-giratorio');
    await fijarInstante(page, 1.5);
    await page.locator('[data-prueba="seccion-tiempo"]').scrollIntoViewIfNeeded();
    await esperarCalculo(page);
  },
};
async function elegirCampo(page, id) {
  const hoja = page.locator('.panel-hoja [data-prueba="boton-panel"]');
  const enHoja = (await hoja.count()) > 0;
  if (enHoja) await hoja.click();
  await page.locator(`[data-campo="${id}"]`).click();
  if (enHoja) await hoja.click();
  await esperarCalculo(page);
}
/** Fija el instante del reloj (las partículas renacen en ese instante, D-69) y espera el cálculo de ese t. */
async function fijarInstante(page, t) {
  await page.evaluate((v) => window.__campos.fijarEstado((s) => ({ ...s, tiempo: { ...s.tiempo, t: v } })), t);
  await page.waitForFunction((v) => window.__campos.reloj() === v && window.__campos.resultados().malla?.t === v, t);
}
async function escribirCampo(page, campo) {
  for (const [c, v] of Object.entries(campo)) {
    await page.locator(`[data-prueba="expr-${c}"]`).fill(v);
    await page.locator(`[data-prueba="expr-${c}"]`).press('Tab');
  }
}
async function activarCorte(page, plano, c) {
  await page.getByRole('button', { name: 'Corte', exact: true }).click();
  await page.getByRole('switch', { name: 'Mostrar el plano de corte' }).click();
  await page.getByRole('group', { name: 'Plano del corte' }).getByRole('button', { name: `Plano ${plano}` }).click();
  if (c !== null) {
    await page.locator('[data-prueba="corte-c"]').fill(c);
    await page.locator('[data-prueba="corte-c"]').press('Enter');
  }
}
export async function esperarCalculo(page) {
  await page.waitForFunction(() => {
    const c = window.__campos;
    const p = c.pendiente();
    return c.resultados().malla && !p.malla && !p.lineas && !p.corte;
  });
}
async function glifosRot(page, omega) {
  await page.locator('[data-campo="rotacional"]').click();
  await page.evaluate((w) => window.__campos.fijarEstado((s) => ({ ...s, parametros: s.parametros.map((p) => ({ ...p, valor: w })), capas: { ...s.capas, lineas: false, glifos: 'rotacional' }, muestreo: { ...s.muestreo, n: [7, 7, 7] }, corte: { ...s.corte, activo: true, plano: 'XY', c: 0, flechas: 'corte' } })), omega);
  await page.waitForFunction(() => window.__campos.resultados().malla?.glifos === 'rotacional' && window.__campos.resultados().malla?.corte);
  await esperarCalculo(page);
}
async function cortePlano(page, plano, c) {
  await activarCorte(page, plano, c);
  await page.getByRole('group', { name: 'Flechas del corte' }).getByRole('button', { name: 'Solo corte' }).click();
  await esperarCalculo(page);
}

/** Capturas de otras páginas: la galería ocupa toda su altura (se amplía la ventana). */
export const PAGINA = { C8: 'muestras' };

export const TAMANOS = {
  V1: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  V2: { width: 1440, height: 900, deviceScaleFactor: 2 },
  V3: { width: 1280, height: 720, deviceScaleFactor: 1 },
  V4: { width: 1024, height: 768, deviceScaleFactor: 1 },
  V5: { width: 390, height: 844, deviceScaleFactor: 3 },
};

