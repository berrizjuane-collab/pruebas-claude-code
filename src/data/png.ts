/**
 * Lector mínimo de PNG para datos (alturas de 16 bits, máscaras de 8 bits).
 *
 * No se usa <img>/canvas porque el navegador puede aplicar gestión de color o
 * premultiplicar alfa, y porque los PNG de 16 bits se degradan a 8 bits. Soporta
 * escala de grises, RGB y RGBA de 8/16 bits sin entrelazado (lo que escribe
 * pipeline/k2/png16.py).
 */
import { unzlibSync } from 'fflate';

export interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  depth: 8 | 16;
  data: Uint8Array | Uint16Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(buffer: ArrayBuffer | Uint8Array): DecodedPng {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('PNG: firma no válida');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  let idatLen = 0;
  while (off < bytes.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const body = bytes.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(off + 8);
      height = view.getUint32(off + 12);
      depth = bytes[off + 16];
      colorType = bytes[off + 17];
      if (bytes[off + 20] !== 0) throw new Error('PNG: entrelazado no soportado');
    } else if (type === 'IDAT') {
      idat.push(body);
      idatLen += body.length;
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : 0;
  if (!channels || (depth !== 8 && depth !== 16)) throw new Error(`PNG: formato no soportado (tipo ${colorType}, ${depth} bits)`);
  const joined = new Uint8Array(idatLen);
  let p = 0;
  for (const c of idat) {
    joined.set(c, p);
    p += c.length;
  }
  const raw = unzlibSync(joined);
  const bpp = channels * (depth / 8);
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let r: number;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error(`PNG: filtro ${filter} no válido`);
      }
      out[row + x] = r & 0xff;
    }
  }
  if (depth === 8) return { width, height, channels, depth: 8, data: out };
  const n = width * height * channels;
  const data16 = new Uint16Array(n);
  for (let k = 0; k < n; k++) data16[k] = (out[2 * k] << 8) | out[2 * k + 1];
  return { width, height, channels, depth: 16, data: data16 };
}

/** Alturas de un PNG de 16 bits: H = offset + escala · v. */
export function decodeHeights(png: DecodedPng, offset: number, scale: number): Float32Array {
  if (png.depth !== 16 || png.channels !== 1) throw new Error('alturas: se esperaba PNG gris de 16 bits');
  const out = new Float32Array(png.data.length);
  for (let k = 0; k < out.length; k++) out[k] = offset + scale * png.data[k];
  return out;
}
