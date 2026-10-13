/**
 * Información: qué se ve, ecuaciones (KaTeX), clasificación de cada elemento, limitaciones,
 * controles y referencias.
 */
import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Badge, Section } from './components';
import { OBSERVATIONS, PARAMETER_SETS } from '../physics/sgra';

function TeX({ src, display = true }: { src: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(src, { displayMode: display, throwOnError: false, strict: false }), [src, display]);
  return <div className="eq" dangerouslySetInnerHTML={{ __html: html }} />;
}

const CLASSES: Array<[Parameters<typeof Badge>[0]['kind'], string]> = [
  ['exacto', 'Métrica de Kerr en Kerr–Schild; geodésicas temporales y nulas (Dormand–Prince 5(4), tolerancia 10⁻¹⁰); constantes E, L_z, Q; horizontes, ergosfera, ISCO, órbitas fotónicas; cruce del horizonte; tensor de Riemann y marea; desplazamiento al rojo de la señal (problema emisor–observador).'],
  ['aprox', 'Trazado en GPU con RK4 en precisión simple (contrastado con la referencia en CPU: error angular mediano ~10⁻⁶ rad); interpolación lineal entre muestras cada 0,25 M; desviación geodésica linealizada para las piezas de un cuerpo; criterio de rotura cuasiestático.'],
  ['modelo', 'Flujo de acreción RIAF (perfiles de n_e, T_e, B, cinemática), sincrotrón térmico (ajuste de Leung et al. 2011), punto caliente, turbulencia log-normal, parámetros de materiales.'],
  ['ilustrativo', 'Balizas ampliadas de los objetos en la vista exterior, campo estelar procedimental, banda galáctica, forma de los fragmentos y del agua, iluminación de los modelos 3D en la vista B (mapa de entorno trazado más una luz de relleno), diagramas (trayectorias en coordenadas, conos, incrustación).'],
  ['estetico', 'Paleta cinematográfica, compresión logarítmica, bloom, ACES, interfaz.'],
];

export function InfoPanel() {
  return (
    <>
      <Section title="Qué estás viendo">
        <p className="note">
          <b>A · Cámara exterior.</b> Cada píxel es una geodésica nula integrada hacia el pasado desde el marco local de la cámara. Lo que aparece es lo que llegaría a un detector: lente, sombra, anillos fotónicos, Doppler y desplazamiento al rojo gravitacional. Los objetos se ven por su baliza con <b>tiempo retardado</b>: al acercarse al horizonte su señal se enrojece, se ralentiza y se apaga, sin desaparecer artificialmente.
        </p>
        <p className="note">
          <b>B · Marco del objeto.</b> Cámara comóvil con el objeto. Su reloj marca tiempo propio y cruza el horizonte en un tiempo propio finito: no hay pared, ni superficie luminosa, ni explosión. La marea depende de la masa del agujero, del tamaño y de la resistencia del cuerpo. Por defecto se ve en luz óptica: el flujo de acreción de Sgr A* es transparente y casi no emite en el visible, así que se ven la sombra y el cielo con lente; en milimétrico, la cámara está dentro del plasma que brilla.
        </p>
        <p className="note">
          <b>C · Diagrama.</b> La trayectoria calculada frente a la estructura causal: el cruce del horizonte se ve aquí, aunque ninguna cámara exterior pueda recibir luz de ese evento.
        </p>
      </Section>
      <Section title="Sgr A*: datos y fuentes" defaultOpen={false}>
        {PARAMETER_SETS.map((p) => (
          <p className="note" key={p.id}>
            <b>{p.label}.</b> {p.source}
          </p>
        ))}
        <p className="note">{OBSERVATIONS.ehtRingDiameterMuas.source}</p>
        <p className="note">{OBSERVATIONS.ehtShadowDiameterMuas.source}</p>
        <p className="note">{OBSERVATIONS.flux230GHzJy.source}</p>
        <p className="note">{OBSERVATIONS.gravityFlares.source}</p>
        <p className="note">
          Sombra ≠ horizonte ≠ anillo de fotones ≠ anillo de emisión: la sombra es la imagen de la región de captura (≈ 5,2 r_g de radio para a = 0, frente a r₊ = 2 r_g); el anillo de fotones son imágenes de orden alto; el anillo observado por el EHT es emisión del plasma, ligeramente mayor.
        </p>
      </Section>
      <Section title="Ecuaciones" defaultOpen={false}>
        <p className="note">Métrica de Kerr en coordenadas de Kerr–Schild (G = c = M = 1), regular en el horizonte:</p>
        <TeX src={String.raw`g_{\mu\nu}=\eta_{\mu\nu}+f\,l_\mu l_\nu,\quad f=\frac{2r^3}{r^4+a^2z^2},\quad l_\mu=\Big(1,\tfrac{rx+ay}{r^2+a^2},\tfrac{ry-ax}{r^2+a^2},\tfrac{z}{r}\Big)`} />
        <p className="note">Geodésicas como sistema hamiltoniano (fotones: H = 0; cuerpos: H = −½, λ = τ):</p>
        <TeX src={String.raw`H=\tfrac12 g^{\mu\nu}p_\mu p_\nu,\qquad \frac{dx^\mu}{d\lambda}=\frac{\partial H}{\partial p_\mu},\qquad \frac{dp_\mu}{d\lambda}=-\frac{\partial H}{\partial x^\mu}`} />
        <p className="note">Constantes del movimiento (Carter 1968):</p>
        <TeX src={String.raw`E=-p_t,\quad L_z=p_\phi,\quad Q=p_\theta^2+\cos^2\theta\Big[a^2(\mu^2-E^2)+\frac{L_z^2}{\sin^2\theta}\Big]`} />
        <p className="note">Horizontes, ergosfera y frecuencia observada:</p>
        <TeX src={String.raw`r_\pm=M\pm\sqrt{M^2-a^2},\qquad r_E(\theta)=M+\sqrt{M^2-a^2\cos^2\theta},\qquad g=\frac{\nu_\text{obs}}{\nu_\text{em}}=\frac{(k\cdot u)_\text{obs}}{(k\cdot u)_\text{em}}`} />
        <p className="note">Transferencia radiativa invariante a lo largo del rayo (emisión sincrotrón térmica, Kirchhoff):</p>
        <TeX src={String.raw`\frac{d}{d\lambda}\Big(\frac{I_\nu}{\nu^3}\Big)=\frac{j_\nu}{\nu^2}-\nu\,\alpha_\nu\frac{I_\nu}{\nu^3},\qquad \alpha_\nu=\frac{j_\nu}{B_\nu(T_e)}`} />
        <p className="note">Desviación geodésica (marea) y escalar de Kretschmann:</p>
        <TeX src={String.raw`\frac{D^2\xi^\mu}{d\tau^2}=-R^\mu{}_{\nu\alpha\beta}\,u^\nu\xi^\alpha u^\beta,\qquad K=48M^2\frac{r^6-15a^2r^4c^2+15a^4r^2c^4-a^6c^6}{(r^2+a^2c^2)^6}`} />
      </Section>
      <Section title="Clasificación de cada elemento" defaultOpen={false}>
        {CLASSES.map(([k, t]) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Badge kind={k} />
            <p className="note">{t}</p>
          </div>
        ))}
      </Section>
      <Section title="Límites del modelo" defaultOpen={false}>
        <p className="note">• No es GRMHD: el plasma es un modelo parametrizado; la variabilidad es estocástica, no dinámica.</p>
        <p className="note">• La integración clásica termina en el horizonte interior r₋ (Kerr) o en r = 2·10⁻³ M (a = 0): no se extrapola hacia la singularidad.</p>
        <p className="note">• Los cuerpos extensos usan desviación geodésica linealizada y un criterio de rotura cuasiestático con resistencias típicas: no hay mecánica de fractura ni hidrodinámica completa.</p>
        <p className="note">• Las balizas de la vista exterior están ampliadas; el desplazamiento al rojo exacto de la señal se calcula aparte (Research Mode).</p>
        <p className="note">• Las estrellas de fondo son procedimentales (no un catálogo) y el plasma es transparente en óptico.</p>
        <p className="note">Tabla completa: docs/LIMITACIONES.md.</p>
      </Section>
      <Section title="Controles" defaultOpen={false}>
        <p className="note">
          Ratón: arrastrar = orbitar/mirar · botón derecho o Mayús = desplazar · rueda = acercar (Alt: zoom óptico). Teclado: WASD (+Q/E) mover · Mayús acelerar · Espacio pausa · R restablecer · F seguir · C enfocar · H ocultar interfaz · T arrojar · [ ] cambiar objeto · 1/2/3 perspectivas · I Research Mode. Táctil: un dedo orbita, dos dedos acercan y desplazan.
        </p>
      </Section>
      <Section title="Referencias" defaultOpen={false}>
        {[
          'Kerr 1963, PRL 11, 237 · Boyer & Lindquist 1967, J. Math. Phys. 8, 265 · Carter 1968, Phys. Rev. 174, 1559.',
          'Bardeen, Press & Teukolsky 1972, ApJ 178, 347 (ISCO, ZAMO) · Bardeen 1973 (sombra) · Teo 2003, GRG 35, 1909 (órbitas fotónicas esféricas).',
          'Visser 2007, arXiv:0706.0622 (forma de Kerr–Schild) · Misner, Thorne & Wheeler 1973 · Chandrasekhar 1983.',
          'Dormand & Prince 1980, J. Comp. Appl. Math. 6, 19 · Hairer, Nørsett & Wanner, «Solving ODE I».',
          'Hamilton & Lisle 2008, Am. J. Phys. 76, 519 (modelo del río) · Doran 2000, PRD 61, 067503.',
          'Broderick & Loeb 2006, ApJ 636, L109 · Broderick et al. 2011, ApJ 735, 110 · Yuan, Quataert & Narayan 2003, ApJ 598, 301.',
          'Leung, Gammie & Noble 2011, ApJ 737, 21 (sincrotrón térmico) · Abramowitz & Stegun 1964 (Bessel).',
          'Event Horizon Telescope Collaboration 2022, ApJL 930, L12–L17 (Sgr A* Papers I–VI).',
          'GRAVITY Collaboration 2018, A&A 618, L10; 2022, A&A 657, L12 · Wielgus et al. 2022, ApJL 930, L19.',
          'James, von Tunzelmann, Franklin & Thorne 2015, CQG 32, 065001 (renderizado de estrellas con lente).',
          'Bronzwaer et al. 2018, A&A 613, A2 (RAPTOR) · Gold et al. 2020, ApJ 897, 148 (comparación de códigos).',
          'Cutler, Kennefick & Poisson 1994, PRD 50, 3816 (precesión exacta) · Wyman, Sloan & Shirley 2013, JCGT 2 (CIE).',
        ].map((r) => (
          <p className="note" key={r}>
            {r}
          </p>
        ))}
      </Section>
    </>
  );
}
