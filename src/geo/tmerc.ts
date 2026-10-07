/**
 * Transversa de Mercator sobre WGS84 (series de Krüger de 6.º orden, Karney 2011).
 *
 * Reproduce el sistema local del pipeline (`+proj=tmerc +lat_0 +lon_0 +k=1`):
 * x = este, y = norte, en metros, con origen en (lat0, lon0). Error < 1 mm en el
 * área de la escena (comprobado contra pyproj en tests/unit/tmerc.test.ts).
 */
const A_AXIS = 6378137;
const F = 1 / 298.257223563;
const N = F / (2 - F);
const E = Math.sqrt(F * (2 - F));
const E2 = F * (2 - F);

const n2 = N * N;
const n3 = n2 * N;
const n4 = n3 * N;
const n5 = n4 * N;
const n6 = n5 * N;

const RECT = (A_AXIS / (1 + N)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);

const ALPHA = [
  N / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
  (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
  (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
  (34729 * n5) / 80640 - (3418889 * n6) / 1995840,
  (212378941 * n6) / 319334400,
];

const BETA = [
  N / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360 - (81 * n5) / 512 + (96199 * n6) / 604800,
  n2 / 48 + n3 / 15 - (437 * n4) / 1440 + (46 * n5) / 105 - (1118711 * n6) / 3870720,
  (17 * n3) / 480 - (37 * n4) / 840 - (209 * n5) / 4480 + (5569 * n6) / 90720,
  (4397 * n4) / 161280 - (11 * n5) / 504 - (830251 * n6) / 7257600,
  (4583 * n5) / 161280 - (108847 * n6) / 3991680,
  (20648693 * n6) / 638668800,
];

const DEG = Math.PI / 180;

/** tan de la latitud conforme a partir de tan(φ). */
function conformalTau(tau: number): number {
  const sigma = Math.sinh(E * Math.atanh((E * tau) / Math.sqrt(1 + tau * tau)));
  return tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
}

/** Inversa de conformalTau por Newton (converge en 2–3 iteraciones). */
function geodeticTau(taup: number): number {
  let tau = taup / (1 - E2);
  for (let i = 0; i < 6; i++) {
    const tp = conformalTau(tau);
    const d =
      ((taup - tp) / Math.sqrt(1 + tp * tp)) * ((1 + (1 - E2) * tau * tau) / ((1 - E2) * Math.sqrt(1 + tau * tau)));
    tau += d;
    if (Math.abs(d) < 1e-14) break;
  }
  return tau;
}

export interface TMercator {
  forward(lon: number, lat: number): [number, number];
  inverse(x: number, y: number): [number, number];
}

export function createTMercator(lat0: number, lon0: number, k0 = 1): TMercator {
  const xi0 = (() => {
    const chi = Math.atan(conformalTau(Math.tan(lat0 * DEG)));
    let xi = chi;
    for (let j = 1; j <= 6; j++) xi += ALPHA[j - 1] * Math.sin(2 * j * chi);
    return xi;
  })();
  const y0 = k0 * RECT * xi0;

  return {
    forward(lon, lat) {
      const lam = (lon - lon0) * DEG;
      const taup = conformalTau(Math.tan(lat * DEG));
      const xip = Math.atan2(taup, Math.cos(lam));
      const etap = Math.asinh(Math.sin(lam) / Math.sqrt(taup * taup + Math.cos(lam) ** 2));
      let xi = xip;
      let eta = etap;
      for (let j = 1; j <= 6; j++) {
        xi += ALPHA[j - 1] * Math.sin(2 * j * xip) * Math.cosh(2 * j * etap);
        eta += ALPHA[j - 1] * Math.cos(2 * j * xip) * Math.sinh(2 * j * etap);
      }
      return [k0 * RECT * eta, k0 * RECT * xi - y0];
    },
    inverse(x, y) {
      const xi = (y + y0) / (k0 * RECT);
      const eta = x / (k0 * RECT);
      let xip = xi;
      let etap = eta;
      for (let j = 1; j <= 6; j++) {
        xip -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
        etap -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
      }
      const taup = Math.sin(xip) / Math.sqrt(Math.sinh(etap) ** 2 + Math.cos(xip) ** 2);
      const lam = Math.atan2(Math.sinh(etap), Math.cos(xip));
      const lat = Math.atan(geodeticTau(taup)) / DEG;
      return [lon0 + lam / DEG, lat];
    },
  };
}
