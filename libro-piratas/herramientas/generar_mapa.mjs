// Genera el mapa del Caribe (estilo carta náutica antigua) a partir de Natural Earth 1:50m.
// Salida: SVG en milímetros, pensado para insertarse en línea en la maqueta (usa sus fuentes).
// Uso: node herramientas/generar_mapa.mjs recursos/datos/countries-50m.json recursos/ilustraciones/mapa_caribe.svg
import fs from "node:fs";
import { geoMercator, geoPath, geoGraticule } from "d3-geo";
import { feature } from "topojson-client";

const [, , src, out] = process.argv;
const W = 185, H = 242;           // tamaño del mapa en mm
const topo = JSON.parse(fs.readFileSync(src, "utf8"));
const land = feature(topo, topo.objects.countries);

// Encuadre: Carolina del Norte (40°N) hasta la costa de Venezuela (7°N)
const bbox = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-88, 7], [-88, 40], [-60, 40], [-60, 7], [-88, 7]]] } };
const proj = geoMercator().fitExtent([[0, 0], [W, H]], bbox).clipExtent([[-10, -10], [W + 10, H + 10]]);
const path = geoPath(proj).digits(2);
const P = (lon, lat) => proj([lon, lat]).map(v => +v.toFixed(2));

const ink = "#5e4828", navy = "#16314e", red = "#8b1e1e", gold = "#c9a24b";
const landD = path(land);
const grat = geoGraticule().extent([[-90, 5], [-55, 45]]).step([5, 5]);

let s = `<svg xmlns="http://www.w3.org/2000/svg" class="mapa-caribe" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">
<defs><clipPath id="mc-clip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>
<g clip-path="url(#mc-clip)">
<rect x="0" y="0" width="${W}" height="${H}" fill="#efe2bf" fill-opacity="0.55"/>
<path d="${path(grat())}" fill="none" stroke="${ink}" stroke-width="0.18" stroke-dasharray="1.2 1.2" stroke-opacity="0.55"/>
`;
// Sombreado costero: bandas azules que se desvanecen mar adentro (vectorial, sin máscaras)
for (const [w, o] of [[7, 0.05], [4.6, 0.07], [2.8, 0.09], [1.4, 0.12]]) {
  s += `<path d="${landD}" fill="none" stroke="${navy}" stroke-width="${w}" stroke-opacity="${o}" stroke-linejoin="round"/>\n`;
}
s += `<path d="${landD}" fill="#d9c08a" stroke="${ink}" stroke-width="0.32" stroke-linejoin="round"/>\n`;

// Ruta de los últimos meses de Barbanegra (ilustrativa): Nassau -> Charleston -> Beaufort -> Ocracoke
const route = [[-77.35, 25.06], [-78.6, 28.6], [-79.6, 32.5], [-78.0, 33.6], [-76.66, 34.62], [-75.98, 35.05]].map(([a, b]) => P(a, b));
s += `<path d="M${route.map(p => p.join(",")).join(" L")}" fill="none" stroke="${red}" stroke-width="0.55" stroke-dasharray="1.6 1.1" stroke-linecap="round"/>\n`;

const label = (lon, lat, text, o = {}) => {
  const [x, y] = P(lon, lat);
  const size = o.size || 3.2, anchor = o.anchor || "middle", style = o.italic === false ? "normal" : "italic";
  const ls = o.ls ?? 0.25, fill = o.fill || ink, weight = o.weight || 500;
  return `<text x="${x}" y="${y}" font-family="EB Garamond" font-size="${size}" font-style="${style}" font-weight="${weight}" letter-spacing="${ls}" text-anchor="${anchor}" fill="${fill}">${text}</text>\n`;
};
// Mares y tierras
s += label(-70.6, 14.0, "MAR  CARIBE", { size: 6.2, ls: 1.6, fill: navy });
s += label(-64.6, 22.6, "OCÉANO", { size: 4.6, ls: 1.2, fill: navy });
s += label(-64.6, 21.5, "ATLÁNTICO", { size: 4.6, ls: 1.2, fill: navy });
s += label(-86.3, 26.8, "GOLFO DE", { size: 3.6, ls: 0.8, fill: navy, anchor: "start" });
s += label(-86.3, 26.1, "MÉXICO", { size: 3.6, ls: 0.8, fill: navy, anchor: "start" });
s += label(-79.2, 21.9, "CUBA", { size: 3.6, ls: 1.2 });
s += label(-71.2, 18.75, "LA ESPAÑOLA", { size: 3.1, ls: 0.6 });
s += label(-77.35, 18.45, "JAMAICA", { size: 2.8, ls: 0.5 });
s += label(-66.4, 18.0, "PUERTO RICO", { size: 2.6, ls: 0.4, anchor: "middle" });
s += label(-81.6, 28.6, "FLORIDA", { size: 3.2, ls: 1 });
s += label(-80.8, 35.6, "CAROLINA", { size: 3.4, ls: 1.2 });
s += label(-68.6, 10.0, "TIERRA FIRME", { size: 3.4, ls: 1.4 });
s += label(-62.8, 15.4, "Antillas Menores", { size: 2.7, ls: 0.2, anchor: "middle" });
s += label(-74.9, 23.6, "Bahamas", { size: 2.8, ls: 0.3, anchor: "start" });

// Puertos: punto rojo con aro dorado
const port = (lon, lat, name, dx, dy, anchor, num) => {
  const [x, y] = P(lon, lat);
  let g = `<circle cx="${x}" cy="${y}" r="1.25" fill="${red}" stroke="${gold}" stroke-width="0.45"/>\n`;
  g += `<text x="${(x + dx).toFixed(2)}" y="${(y + dy).toFixed(2)}" font-family="EB Garamond" font-size="3.3" font-weight="600" text-anchor="${anchor}" fill="#2a1b12">${name}</text>\n`;
  if (num) {
    const nx = x + (num.dx || 0), ny = y + (num.dy || 0);
    g += `<circle cx="${nx}" cy="${ny}" r="2.4" fill="${red}" stroke="${gold}" stroke-width="0.4"/>`;
    g += `<text x="${nx}" y="${ny + 1.15}" font-family="EB Garamond" font-size="3.3" font-weight="700" text-anchor="middle" fill="#f1e4c3">${num.n}</text>\n`;
  }
  return g;
};
s += port(-76.84, 17.94, "Port Royal", -2.2, 4.4, "end", { n: 1, dx: 3.2, dy: 3.6 });
s += port(-72.78, 20.05, "Tortuga", -2.2, -1.6, "end", { n: 2, dx: 3.8, dy: -3.4 });
s += port(-77.35, 25.06, "Nassau", 2.4, 1.2, "start", { n: 3, dx: -4.2, dy: -2.6 });
s += port(-79.93, 32.78, "Charleston", -2.2, 1.1, "end");
s += port(-76.66, 34.72, "Beaufort", -2.2, 1.6, "end");
s += port(-75.98, 35.11, "Ocracoke", 2.4, -0.6, "start");

// Leyenda de la ruta
s += `<g transform="translate(5 5)">
<rect x="0" y="0" width="64" height="11" rx="0.8" fill="#f1e4c3" fill-opacity="0.85" stroke="${ink}" stroke-width="0.25"/>
<path d="M3 5.5 L15 5.5" stroke="${red}" stroke-width="0.55" stroke-dasharray="1.6 1.1"/>
<text x="18" y="4.6" font-family="EB Garamond" font-size="3" font-style="italic" fill="#2a1b12">Últimos meses de Barbanegra</text>
<text x="18" y="8.4" font-family="EB Garamond" font-size="2.6" fill="#2a1b12">Nassau · Charleston · Beaufort · Ocracoke (1718)</text>
</g>
`;
// Marco de carta antigua con escala de grados
s += `</g>
<rect x="0.6" y="0.6" width="${W - 1.2}" height="${H - 1.2}" fill="none" stroke="${ink}" stroke-width="0.6"/>
<rect x="2.2" y="2.2" width="${W - 4.4}" height="${H - 4.4}" fill="none" stroke="${ink}" stroke-width="0.25"/>
`;
for (let lat = 10; lat <= 40; lat += 5) {
  const [, y] = P(-88, lat);
  if (y > 6 && y < H - 6) s += `<text x="${W - 3.4}" y="${y - 0.8}" font-family="EB Garamond" font-size="2.4" text-anchor="end" fill="${ink}">${lat}° N</text>\n`;
}
for (let lon = -85; lon <= -60; lon += 5) {
  const [x] = P(lon, 7);
  if (x > 8 && x < W - 8) s += `<text x="${x + 0.8}" y="${H - 3.6}" font-family="EB Garamond" font-size="2.4" fill="${ink}">${-lon}° O</text>\n`;
}
s += `</svg>\n`;
fs.writeFileSync(out, s);
console.log("mapa", out, (s.length / 1024).toFixed(0) + " KB");
// Posiciones útiles para colocar elementos encima (mm dentro del mapa)
console.log(JSON.stringify({ portRoyal: P(-76.84, 17.94), tortuga: P(-72.78, 20.05), nassau: P(-77.35, 25.06), atl: P(-66, 26), caribe: P(-72, 14) }));
