/**
 * Exportación PNG compuesta (EXP-03, SPEC §7.1): la escena ya dibujada al tamaño pedido y,
 * encima, la leyenda y las ecuaciones compuestas con Canvas 2D (el HTML de la interfaz no
 * forma parte del lienzo WebGL). Las tarjetas copian la de la pantalla: nivel 1, borde, radio
 * de 8 px y los mismos glifos (los trazados SVG de la leyenda, con `Path2D`). Todo en grises:
 * la imagen también es monocroma (RNF-01) y se audita.
 */
import { color, escena, espacio, medidas, radio, tipo } from '../design/tokens';

/** Glifos de la leyenda (mismos trazados que `ui/scene/Leyenda.tsx`, caja de 22 × 12). */
export type GlifoLeyenda =
  | 'flecha'
  | 'doble'
  | 'rombo'
  | 'aspa'
  | 'linea'
  | 'cheuron'
  | 'semilla'
  | 'particula'
  | 'estela'
  | 'anillo'
  | 'nivelCero'
  | { signo: 1 | -1; tipo: 'divergencia' | 'normal' | 'rotacional'; base: string; patron: string }
  | { referencia: number };

export interface BloqueLeyenda {
  rampa?: { titulo: string; paradas: string[]; marcas: [string, string, string] };
  filas: { glifo: GlifoLeyenda; texto: string }[];
  pie: string[];
}

export interface Composicion {
  escena: HTMLCanvasElement;
  /** px reales por px CSS: tamaños de letra, márgenes y glifos se multiplican por ella. */
  escala: number;
  leyenda: BloqueLeyenda[] | null;
  ecuaciones: { titulo: string; lineas: string[] } | null;
}

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface ResultadoComposicion {
  lienzo: HTMLCanvasElement;
  leyenda: Rect | null;
  ecuaciones: Rect | null;
}

const fuente = (px: number, peso = 400, mono = false) => `${peso} ${px}px ${mono ? tipo.familiaMono : tipo.familiaUi}`;

/** Compone la imagen final; la escena ocupa todo el lienzo y las tarjetas van encima. */
export function componer(c: Composicion): ResultadoComposicion {
  const lienzo = document.createElement('canvas');
  lienzo.width = c.escena.width;
  lienzo.height = c.escena.height;
  // Contexto con alfa: el texto se suaviza en gris (sin suavizado subpíxel de color, DESIGN §2.4).
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Sin contexto 2D para componer la imagen');
  ctx.fillStyle = escena.fondo;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(c.escena, 0, 0);
  const s = c.escala;
  const margen = espacio.e4 * s;
  let ecuaciones: Rect | null = null;
  if (c.ecuaciones) ecuaciones = tarjetaEcuaciones(ctx, c.ecuaciones, margen, margen, s);
  let leyenda: Rect | null = null;
  if (c.leyenda && c.leyenda.length) {
    const alto = medirLeyenda(ctx, c.leyenda, s);
    leyenda = { x: margen, y: lienzo.height - margen - alto, ancho: medidas.leyenda * s, alto };
    dibujarLeyenda(ctx, c.leyenda, leyenda, s);
  }
  return { lienzo, leyenda, ecuaciones };
}

function tarjeta(ctx: CanvasRenderingContext2D, r: Rect, s: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x + 0.5 * s, r.y + 0.5 * s, r.ancho - s, r.alto - s, radio.r3 * s);
  ctx.fillStyle = color.fondo1;
  ctx.fill();
  ctx.lineWidth = s;
  ctx.strokeStyle = color.borde;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- ecuaciones

function tarjetaEcuaciones(ctx: CanvasRenderingContext2D, e: { titulo: string; lineas: string[] }, x: number, y: number, s: number): Rect {
  const pad = espacio.e3 * s;
  const [tt, lt] = tipo.titulo;
  const [tc, lc] = tipo.control;
  // Medida a tamaño base y multiplicada: a escala 2, la tarjeta mide exactamente el doble.
  ctx.font = fuente(tt, 600);
  let ancho = ctx.measureText(e.titulo).width;
  ctx.font = fuente(tc, 400, true);
  for (const l of e.lineas) ancho = Math.max(ancho, ctx.measureText(l).width);
  const r: Rect = { x, y, ancho: Math.ceil(ancho + 2 * espacio.e3) * s, alto: Math.ceil(2 * pad + lt * s + espacio.e1 * s + e.lineas.length * lc * s) };
  tarjeta(ctx, r, s);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color.texto1;
  ctx.font = fuente(tt * s, 600);
  ctx.fillText(e.titulo, x + pad, y + pad + (lt * s) / 2);
  ctx.font = fuente(tc * s, 400, true);
  e.lineas.forEach((l, k) => {
    ctx.fillStyle = k < 3 ? color.texto1 : color.texto2;
    ctx.fillText(l, x + pad, y + pad + lt * s + espacio.e1 * s + (k + 0.5) * lc * s);
  });
  return r;
}

// ---------------------------------------------------------------- leyenda

const ALTO_CABECERA = 32;
const ALTO_BARRA = 8;
const ALTO_FILA = 16;

/**
 * Envuelve un texto en líneas que caben en `anchoBase` px CSS, midiendo con la letra a tamaño
 * base: así la composición a escala 2 es exactamente el doble que a escala 1 (mismos cortes).
 */
function envolver(ctx: CanvasRenderingContext2D, texto: string, anchoBase: number, fuenteBase: string): string[] {
  const previa = ctx.font;
  ctx.font = fuenteBase;
  const palabras = texto.split(' ');
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (actual && ctx.measureText(prueba).width > anchoBase) {
      lineas.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  ctx.font = previa;
  return lineas;
}

/** Recorre la leyenda: mide (dibujar = false) o dibuja; devuelve el alto en px reales. */
function recorrerLeyenda(ctx: CanvasRenderingContext2D, bloques: BloqueLeyenda[], x0: number, y0: number, s: number, dibujar: boolean): number {
  const pad = espacio.e3 * s;
  const anchoUtil = medidas.leyenda * s - 2 * pad;
  const [tc] = tipo.control;
  const [tp, lp] = tipo.pie;
  const [tm, lm] = tipo.micro;
  let y = y0;
  ctx.textBaseline = 'middle';
  if (dibujar) {
    ctx.fillStyle = color.texto1;
    ctx.font = fuente(tc * s, 600);
    ctx.fillText('Leyenda', x0 + pad, y + (ALTO_CABECERA * s) / 2);
  }
  y += ALTO_CABECERA * s;
  bloques.forEach((b, i) => {
    if (i > 0) {
      y += espacio.e2 * s;
      if (dibujar) {
        ctx.fillStyle = color.borde;
        ctx.fillRect(x0 + pad, y, anchoUtil, s);
      }
      y += s + espacio.e2 * s;
    }
    if (b.rampa) {
      if (dibujar) {
        ctx.fillStyle = color.texto2;
        ctx.font = fuente(tp * s, 500);
        ctx.fillText(b.rampa.titulo, x0 + pad, y + (lp * s) / 2);
      }
      y += lp * s + espacio.e1 * s;
      if (dibujar) {
        const g = ctx.createLinearGradient(x0 + pad, 0, x0 + pad + anchoUtil, 0);
        b.rampa.paradas.forEach((c, k) => g.addColorStop(k / (b.rampa!.paradas.length - 1), c));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x0 + pad, y, anchoUtil, ALTO_BARRA * s, 2 * s);
        ctx.fill();
      }
      y += ALTO_BARRA * s + espacio.e1 * s;
      if (dibujar) {
        ctx.fillStyle = color.texto2;
        ctx.font = fuente(tm * s, 400, true);
        const [a, m, z] = b.rampa.marcas;
        const ym = y + (lm * s) / 2;
        ctx.textAlign = 'left';
        ctx.fillText(a, x0 + pad, ym);
        ctx.textAlign = 'center';
        ctx.fillText(m, x0 + pad + anchoUtil / 2, ym);
        ctx.textAlign = 'right';
        ctx.fillText(z, x0 + pad + anchoUtil, ym);
        ctx.textAlign = 'left';
      }
      y += lm * s + espacio.e2 * s;
    }
    for (const f of b.filas) {
      const ref = typeof f.glifo === 'object' && 'referencia' in f.glifo ? f.glifo.referencia : 0;
      const anchoGlifo = (ref ? ref + 2 : 22) * s;
      const lineas = envolver(ctx, f.texto, (anchoUtil - anchoGlifo) / s - espacio.e2, fuente(tp, 400));
      const alto = Math.max(ALTO_FILA, lineas.length * lp) * s;
      if (dibujar) {
        glifo(ctx, f.glifo, x0 + pad, y + alto / 2 - 6 * s, s);
        ctx.fillStyle = color.texto2;
        ctx.font = fuente(tp * s, 400);
        lineas.forEach((l, k) => ctx.fillText(l, x0 + pad + anchoGlifo + espacio.e2 * s, y + (k + 0.5) * lp * s + (alto - lineas.length * lp * s) / 2));
      }
      y += alto + espacio.e1 * s;
    }
    for (const p of b.pie) {
      ctx.font = fuente(tm * s, 400);
      for (const l of envolver(ctx, p, anchoUtil / s, fuente(tm, 400))) {
        if (dibujar) {
          ctx.fillStyle = color.texto3;
          ctx.fillText(l, x0 + pad, y + (lm * s) / 2);
        }
        y += lm * s;
      }
    }
  });
  return y - y0 + pad;
}

function medirLeyenda(ctx: CanvasRenderingContext2D, bloques: BloqueLeyenda[], s: number): number {
  return Math.ceil(recorrerLeyenda(ctx, bloques, 0, 0, s, false));
}

function dibujarLeyenda(ctx: CanvasRenderingContext2D, bloques: BloqueLeyenda[], r: Rect, s: number): void {
  tarjeta(ctx, r, s);
  recorrerLeyenda(ctx, bloques, r.x, r.y, s, true);
}

// ---------------------------------------------------------------- glifos (caja 22 × 12)

const TRAZO_SIGNO = {
  divergencia: { pos: 'M7.5 6h7M11 2.5v7', neg: 'M7.5 6h7' },
  normal: { pos: '', neg: 'M8.6 3.6l4.8 4.8M13.4 3.6l-4.8 4.8' },
  rotacional: { pos: 'M7.88 4.2A3.6 3.6 0 1 0 11 2.4M12.9 0.9 11 2.4l1.9 1.6', neg: 'M14.12 4.2A3.6 3.6 0 1 1 11 2.4M9.1 0.9 11 2.4l-1.9 1.6' },
} as const;

function glifo(ctx: CanvasRenderingContext2D, g: GlifoLeyenda, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color.texto2;
  ctx.fillStyle = color.texto2;
  const trazo = (d: string, ancho = 1.5, c: string = color.texto2) => {
    ctx.lineWidth = ancho;
    ctx.strokeStyle = c;
    ctx.stroke(new Path2D(d));
  };
  const relleno = (d: string, c: string = color.texto2) => {
    ctx.fillStyle = c;
    ctx.fill(new Path2D(d));
  };
  const circulo = (cx: number, cy: number, r: number) => {
    const p = new Path2D();
    p.arc(cx, cy, r, 0, 2 * Math.PI);
    return p;
  };
  if (typeof g === 'object' && 'referencia' in g) {
    trazo(`M1 6h${g.referencia - 7}`);
    relleno(`M${g.referencia - 7} 2l7 4-7 4z`);
  } else if (typeof g === 'object') {
    // Muestra del mapa: base oscura con puntos (+) o rayado (−) y el signo con halo.
    ctx.fillStyle = g.base;
    ctx.beginPath();
    ctx.roundRect(0, 0, 22, 12, 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (g.signo > 0) {
      ctx.fillStyle = g.patron;
      for (const px of [2, 6, 10, 14, 18]) for (const py of [2, 6, 10]) ctx.fill(circulo(px + (py === 6 ? 2 : 0), py, 0.9));
    } else trazo('M-12 12 0 0M-6 12 6 0M0 12 12 0M6 12 18 0M12 12 24 0M18 12 30 0', 0.8, g.patron);
    ctx.restore();
    ctx.lineCap = 'round';
    for (const [ancho, c] of [
      [3.5, escena.halo],
      [1.3, escena.cero],
    ] as const) {
      if (g.tipo === 'normal') {
        ctx.lineWidth = ancho;
        ctx.strokeStyle = c;
        ctx.stroke(circulo(11, 6, 4.25));
        if (g.signo > 0) {
          ctx.fillStyle = c;
          ctx.fill(circulo(11, 6, ancho > 2 ? 2.4 : 1.4));
        } else trazo(TRAZO_SIGNO.normal.neg, ancho, c);
      } else trazo(TRAZO_SIGNO[g.tipo][g.signo > 0 ? 'pos' : 'neg'], ancho, c);
    }
  } else {
    switch (g) {
      case 'flecha':
        trazo('M1 6h13');
        relleno('M13 2l7 4-7 4z');
        break;
      case 'doble':
        trazo('M1 6h8');
        relleno('M8 2l7 4-7 4zM13 2l7 4-7 4z');
        break;
      case 'rombo':
        trazo('M11 1.5 15.5 6 11 10.5 6.5 6z');
        break;
      case 'aspa':
        trazo('M7.5 2.5l7 7M14.5 2.5l-7 7');
        break;
      case 'linea':
        trazo('M1 8c5-6 12-6 20-2', 1.5, escena.linea);
        break;
      case 'cheuron':
        trazo('M1 6h20', 1.5, escena.linea);
        trazo('M8.5 2.5 12.5 6l-4 3.5', 1.5, escena.linea);
        break;
      case 'semilla':
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = escena.semilla;
        ctx.stroke(circulo(11, 6, 3.75));
        break;
      case 'particula':
        ctx.fillStyle = escena.particula;
        ctx.fill(circulo(16, 6, 3.2));
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = escena.halo;
        ctx.stroke(circulo(16, 6, 3.2));
        break;
      case 'estela':
        relleno('M2 7.6 15 5 15 7z', escena.estela);
        ctx.fillStyle = escena.particula;
        ctx.fill(circulo(16, 6, 2.6));
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = escena.halo;
        ctx.stroke(circulo(16, 6, 2.6));
        break;
      case 'anillo': {
        trazo('M1 6h13');
        relleno('M13 2l7 4-7 4z');
        const e = new Path2D();
        e.ellipse(7, 6, 2.6, 4.7, 0, 0, 2 * Math.PI);
        ctx.lineWidth = 1.2;
        ctx.stroke(e);
        trazo('M2.9 4.9 4.4 7.6 5.9 4.9', 1.2);
        break;
      }
      case 'nivelCero':
        ctx.setLineDash([4.5, 3]);
        trazo('M1 6h20', 1.5, escena.cero);
        break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- auditoría

/** Píxeles con max(|R−G|, |G−B|, |R−B|) > tolerancia (RNF-01: la imagen es monocroma). */
export function auditarMonocromo(datos: Uint8ClampedArray, tolerancia = 3): { fuera: number; maxDiff: number } {
  let fuera = 0;
  let maxDiff = 0;
  for (let i = 0; i < datos.length; i += 4) {
    const r = datos[i] as number;
    const g = datos[i + 1] as number;
    const b = datos[i + 2] as number;
    const d = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (d > maxDiff) maxDiff = d;
    if (d > tolerancia) fuera++;
  }
  return { fuera, maxDiff };
}

/** PNG de un lienzo. */
export function aPng(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo codificar la imagen'))), 'image/png'));
}
