# Fundamentos matemáticos

Todo el núcleo físico usa unidades geométricas $G = c = M = 1$: longitudes en $r_g = GM/c^2$ y
tiempos en $t_g = GM/c^3$. Para Sgr A* con $M = 4{,}0 \times 10^6\,M_\odot$ y $D = 8{,}2$ kpc:

| Escala | Valor |
|---|---|
| $r_g = GM/c^2$ | $5{,}91 \times 10^9$ m (0,039 UA; 8,5 radios solares) |
| $r_s = 2r_g$ | $1{,}18 \times 10^{10}$ m |
| $t_g = GM/c^3$ | 19,7 s |
| $\theta_g = r_g/D$ | 4,81 μas |

El código de cada sección se indica entre paréntesis (`src/…`).

---

## 1. Métrica de Kerr en coordenadas de Kerr–Schild

En Boyer–Lindquist (BL) la métrica de Kerr es singular en los horizontes ($\Delta = 0$). El
observatorio usa la **forma de Kerr–Schild cartesiana entrante** (`physics/metrics/kerrSchild.ts`):

$$
g_{\mu\nu} = \eta_{\mu\nu} + f\, l_\mu l_\nu,\qquad
f = \frac{2 r^3}{r^4 + a^2 z^2},\qquad
l_\mu = \left(1,\ \frac{r x + a y}{r^2 + a^2},\ \frac{r y - a x}{r^2 + a^2},\ \frac{z}{r}\right)
$$

donde $r(x,y,z)$ es la raíz positiva de

$$
\frac{x^2 + y^2}{r^2 + a^2} + \frac{z^2}{r^2} = 1
\ \Longrightarrow\
r^2 = \tfrac12\left(\rho^2 - a^2 + \sqrt{(\rho^2 - a^2)^2 + 4 a^2 z^2}\right),\quad \rho^2 = x^2+y^2+z^2 .
$$

Como $l$ es nulo respecto de $\eta$ y de $g$, la inversa es exacta y barata:

$$
g^{\mu\nu} = \eta^{\mu\nu} - f\, l^\mu l^\nu,\qquad l^\mu = \eta^{\mu\nu} l_\nu = (-1,\ l_x,\ l_y,\ l_z).
$$

La métrica es **regular en $r_+$**; solo es singular en el anillo $r = 0$, $z = 0$ ($x^2 + y^2 = a^2$).
Las derivadas $\partial_i r$, $\partial_i f$, $\partial_i l_j$ se calculan analíticamente.

**Relación con BL** (`physics/metrics/kerr.ts`, `ksMinusBL`): con las mismas $r$ y $\theta$,

$$
dt_{KS} = dt_{BL} + \frac{2 M r}{\Delta}\, dr,\qquad d\tilde\phi = d\phi + \frac{a}{\Delta}\, dr,\qquad \Delta = r^2 - 2Mr + a^2 .
$$

**Estructura** (fórmulas cerradas de Bardeen, Press y Teukolsky 1972):

- Horizontes: $r_\pm = M \pm \sqrt{M^2 - a^2}$.
- Ergosfera (límite estático): $r_E(\theta) = M + \sqrt{M^2 - a^2\cos^2\theta}$.
- Órbitas fotónicas circulares ecuatoriales: $r_{ph} = 2M\left[1 + \cos\left(\tfrac23 \arccos(\mp a/M)\right)\right]$.
- ISCO: $r_{ISCO} = M\left[3 + Z_2 \mp \sqrt{(3 - Z_1)(3 + Z_1 + 2Z_2)}\right]$.
- Kretschmann (exacto): $K = \dfrac{48 M^2 (r^6 - 15 a^2 r^4 c^2 + 15 a^4 r^2 c^4 - a^6 c^6)}{(r^2 + a^2 c^2)^6}$, $c = \cos\theta$.

## 2. Geodésicas como sistema hamiltoniano

$$
H(x, p) = \tfrac12\, g^{\mu\nu}(x)\, p_\mu p_\nu,\qquad
\frac{dx^\mu}{d\lambda} = \frac{\partial H}{\partial p_\mu},\qquad
\frac{dp_\mu}{d\lambda} = -\frac{\partial H}{\partial x^\mu}
$$

con $H = -\tfrac12$ (cuerpos, $\lambda = \tau$ tiempo propio) o $H = 0$ (fotones).

**Variable independiente: $t_{KS}$.** Como $g^{tt} = -1 - f < 0$ para $r > 0$, $t$ es una función
temporal global: $dt/d\lambda > 0$ a lo largo de toda curva causal futura, **también dentro del
horizonte**. Se integra en $t$ (`physics/geodesics/geodesic.ts`):

$$
\frac{dx^i}{dt} = \frac{\partial H/\partial p_i}{\partial H/\partial p_t},\qquad
\frac{dp_i}{dt} = -\frac{\partial H/\partial x^i}{\partial H/\partial p_t},\qquad
\frac{d\lambda}{dt} = \frac{1}{\partial H/\partial p_t},\qquad p_t = \text{cte}.
$$

Ventajas: el horizonte se cruza en $t$ finito sin ninguna singularidad de coordenadas, el muestreo
uniforme en $t$ es natural para la animación y todos los objetos comparten el mismo reloj.

**Integrador:** Dormand–Prince 5(4) con control de paso PI, salida densa de 4.º orden y tolerancias
$10^{-10}$ (relativa) / $10^{-12}$ (absoluta) por defecto (`physics/integrators/dopri5.ts`). El paso
se limita a $0{,}25\, r$ (escala física local).

**Eventos** (localizados con la salida densa y búsqueda de raíz): cruce de $r_+$, del ISCO y de la
ergosfera ($r - r_E(\theta) = 0$), pericentro y apocentro ($dr/dt = 0$), escape ($r > 4000\,M$
alejándose) y final del dominio.

**Final del dominio clásico** (`domainCutoffRadius`):

- $a > 0$ (con $r_- > 2\times10^{-3}$): se detiene al llegar al **horizonte interior** $r_-$ (horizonte de
  Cauchy). Más allá la predicción clásica no es fiable (inestabilidad de inflación de masa) y el
  observatorio no la extrapola.
- $a \approx 0$: se detiene en $r = 2 \times 10^{-3} M$. La singularidad se alcanza en tiempo propio
  finito (en caída radial desde el reposo en el infinito, $\tau = 4M/3$ desde el horizonte; nunca más
  de $\pi M$), pero no se integra a través de ella.

## 3. Constantes del movimiento

$$
E = -p_t,\qquad L_z = p_\phi = x\,p_y - y\,p_x,\qquad \mu^2 = -g^{\mu\nu}p_\mu p_\nu,
$$
$$
Q = p_\theta^2 + \cos^2\theta\left[a^2(\mu^2 - E^2) + \frac{L_z^2}{\sin^2\theta}\right]\qquad\text{(Carter 1968)}.
$$

$p_\theta$ se obtiene transformando el covector cartesiano a las coordenadas de Kerr entrantes
(idéntico en BL). Su deriva a lo largo de la integración mide el error numérico y se muestra en
Research Mode.

**Estado orbital:** ligado si $E < 1$ (energía por unidad de masa en reposo). **No se usa la velocidad
de escape newtoniana.** Los escenarios de sobrevuelo, captura y trayectoria crítica fijan el momento
angular frente al **momento angular crítico de captura** $L_c(E)$: el valor para el que el potencial
radial

$$
R(r) = \left[E(r^2 + a^2) - a L\right]^2 - \Delta\left[\mu^2 r^2 + (L - aE)^2 + Q\right]
$$

tiene una raíz doble (separatriz). Para $a = 0$, $E = 1$: $L_c = 4M$.

## 4. Observadores y tétradas

| Observador | 4-velocidad | Existe |
|---|---|---|
| Estático | $u \propto \partial_t$ | solo fuera de la ergosfera ($g_{tt} < 0$) |
| ZAMO | $u_\mu = -\alpha\,\nabla_\mu t_{BL}$ (momento angular nulo, gira con $\omega = -g_{t\phi}/g_{\phi\phi}$) | fuera del horizonte |
| En órbita | $u \propto \partial_t + \Omega_K \partial_\phi$ | donde $u$ es temporal |
| Lluvia (Doran) | caída libre desde el reposo en el infinito ($E = 1$, $L = 0$) | en todas partes, también dentro de $r_+$ |

Las tétradas ortonormales $\{e_{(0)} = u, e_{(i)}\}$ se construyen con Gram–Schmidt respecto de $g$
a partir de $\partial_\phi$, $\partial_\theta$, $\partial_r$ (en ese orden, para que $e_{(\phi)}$ sea
exactamente la dirección de rotación) (`physics/observers/observers.ts`).

**Velocidades locales.** Una velocidad $\vec v$ medida por el observador ($|\vec v| < c$) da
$u = \gamma\,(e_{(0)} + v^i e_{(i)})$, $\gamma = (1 - v^2)^{-1/2}$, y $p_\mu = g_{\mu\nu}u^\nu$. Toda
velocidad de la interfaz se define así (`simulation/initial.ts`).

## 5. La cámara y el trazado de rayos

La cámara es un observador con tétrada $\{e_0, e_1, e_2, e_3\}$ (derecha, arriba, adelante). Para el
píxel con dirección unitaria $\vec n$ en su marco, el fotón que llega tiene vector de onda
$k = E\,(e_0 - n^i e_i)$. Se integra **hacia el pasado** con el vector tangente $q = -e_0 + n^i e_i$
(nulo y dirigido al pasado), desde la posición y el instante de la cámara.

**GPU** (`rendering/raytracer/*.ts`, GLSL ES 3.00, precisión simple): RK4 con paso

$$
h = \eta\,\frac{\min(r,\ 4\,|r - r_+|)}{|\dot x|},\qquad \eta = 0{,}07\ \text{(interactivo)},\ 0{,}025\ \text{(alta fidelidad)},
$$

más un tope de $0{,}35\,M$ ($0{,}12\,M$) dentro del plasma. Terminación: escape ($r > r_{esc}$),
captura ($r < 1{,}02\,r_+$, o 60 pasos dentro de $1{,}3\,r_+$ con $r$ decreciente), región pasada (cámara
interior) o número máximo de pasos. La referencia en doble precisión es `physics/optics/cpuTracer.ts`
(Dormand–Prince, $10^{-10}$); la validación compara ambos píxel a píxel.

**Desplazamiento de frecuencia** entre emisor y observador:

$$
g = \frac{\nu_{obs}}{\nu_{em}} = \frac{(k\cdot u)_{obs}}{(k\cdot u)_{em}} .
$$

Incluye a la vez el efecto gravitacional, el Doppler y la aberración. $I_\nu/\nu^3$ es invariante.

## 6. Transferencia radiativa

A lo largo del rayo (`GLSL_EMISSION`, `cpuTracer.ts`):

$$
\frac{d}{d\lambda}\left(\frac{I_\nu}{\nu^3}\right) = \frac{j_\nu}{\nu^2} - \nu\,\alpha_\nu\, \frac{I_\nu}{\nu^3}
$$

evaluada en el marco del fluido con $\nu_{fl} = \nu_{obs}/g$. En cada paso se usa el integrador
exponencial exacto para coeficientes constantes:

$$
I \leftarrow I\,e^{-\Delta\tau} + S\,(1 - e^{-\Delta\tau}),\qquad S = j_\nu/\alpha_\nu,\qquad \Delta\tau = \alpha_\nu\,\Delta s .
$$

**Sincrotrón térmico** (Leung, Gammie y Noble 2011):

$$
j_\nu = \frac{n_e \sqrt2\,\pi e^2 \nu_s}{3 K_2(1/\Theta_e)\, c}\left(X^{1/2} + 2^{11/12} X^{1/6}\right)^2 e^{-X^{1/3}},\quad
X = \frac{\nu}{\nu_s},\quad \nu_s = \frac29 \frac{eB}{2\pi m_e c}\Theta_e^2 \sin\theta_B,
$$

con $\Theta_e = k T_e / m_e c^2$, y absorción de Kirchhoff $\alpha_\nu = j_\nu / B_\nu(T_e)$.

## 7. Flujo de acreción RIAF (modelo)

Inspirado en Broderick y Loeb (2006) con los perfiles de Yuan, Quataert y Narayan (2003)
(`physics/emission/riaf.ts`):

$$
n_e = n_0\, r^{-1{,}1}\, e^{-z^2/(2 h^2 \rho^2)},\qquad
T_e = T_0\, r^{-0{,}84},\qquad
\frac{B^2}{8\pi} = \beta^{-1}\, \frac{n_e m_p c^2}{6 r}.
$$

- Cinemática: rotación kepleriana en capas ($\Omega = \kappa\,\Omega_K(r)$) fuera del ISCO; dentro,
  caída con las constantes $(E, L)$ del ISCO usando la raíz regular de $u_r$ en Kerr–Schild
  (válida también dentro del horizonte); transición suave en torno al ISCO.
- Campo magnético toroidal para el ángulo de emisión $\theta_B$.
- Variabilidad: punto caliente kepleriano en $r = 8\,M$ (cf. GRAVITY 2018) y fluctuaciones de densidad
  log-normales arrastradas por la rotación diferencial (semilla fija, periodo de renovación 150 M).
- Calibración: $T_0 = 3\times10^{11}$ K, $n_0 = 1{,}56\times10^7$ cm⁻³, $\beta = 10$, $h = 1$ ⇒
  $F_{230} \approx 2{,}35$ Jy para $a = 0{,}5$, $i = 30°$ (Wielgus et al. 2022), con profundidad óptica
  máxima $\approx 1{,}5$ a 230 GHz (`scripts/calibrar-riaf.ts`).

**No es GRMHD.** Es un modelo semianalítico calibrado; ver docs/LIMITACIONES.md.

## 8. Cielo de fondo con lente

Cada rayo que escapa llega al «cielo de origen» en una dirección $\hat s$. La posición, la
magnificación y el color de las estrellas se calculan con la geodésica (`GLSL_SKY`):

- El jacobiano $J = \partial \hat s / \partial(\text{píxel})$ se obtiene con derivadas de pantalla; el
  ángulo sólido de origen por píxel es $|J_1 \times J_2|$ y la magnificación su cociente con el del píxel.
- Cada estrella es una fuente puntual con PSF gaussiana en el plano imagen: su flujo se reparte según
  $J^{-1}(\hat s_\star - \hat s)$, de modo que las imágenes múltiples y los arcos aparecen solos.
- Flujo bolométrico observado $\propto g^4$ (de $I_\nu/\nu^3$ invariante) y color de cuerpo negro a
  $T\,g$ (tabla CIE 1931).
- Capas no resueltas (muchas estrellas por píxel): radiancia media, para que el fondo no tenga huecos.

## 9. Mareas y cuerpos extensos

**Tensor de Riemann** numérico a partir de los símbolos de Christoffel analíticos, con derivadas por
diferencias centradas y extrapolación de Richardson (`physics/tidal/riemann.ts`). Se valida con el
escalar de Kretschmann analítico (error relativo $\sim 10^{-11}$).

**Tensor de marea** en el marco del cuerpo $\{e_i\}$ ortogonal a $u$:

$$
E_{ij} = R_{\mu\alpha\nu\beta}\, e_i^\mu u^\alpha e_j^\nu u^\beta,\qquad
\frac{D^2\xi^i}{d\tau^2} = -E^i{}_j\,\xi^j .
$$

En Schwarzschild, para un observador estático o en caída radial,
$E = \mathrm{diag}(-2, 1, 1)\,M/r^3$: estiramiento radial $\lambda = 2M/r^3$ y compresión transversal.

**Marco del cuerpo:** $e_i$ se transporta en paralelo a lo largo de la geodésica,
$\dfrac{de_i^\mu}{dt} = -\Gamma^\mu_{\alpha\beta}\dfrac{dx^\alpha}{dt}\, e_i^\beta$ (giróscopos libres).

**Unidades físicas:** $E$ en s⁻² $= E_{(M)}\,/\,t_g^2$; $\xi$ en metros.

**Rotura** (modelo cuasiestático, `simulation/catalog.ts`):

- Monolito o agregado de radio $R$: $\lambda_c = \tfrac{4\pi}{3}G\rho + \dfrac{2\sigma_t}{\rho R^2}$.
- Estructura esbelta: $\lambda_c = \dfrac{8\sigma_t A}{m L}$.

Las piezas resultantes siguen la desviación geodésica linealizada y se vuelven a partir en cascada
($\lambda_c \propto 1/s^2$ para una pieza de tamaño relativo $s$).

**Deformación elástica** (vista B): $\varepsilon \approx -\dfrac{\rho L^2}{8 Y} E$ (adimensional,
ampliable a petición del usuario y siempre indicado).

**Agua del contenedor:** potencial de marea $\Phi = \tfrac12 \xi^T E \xi$; superficie libre
$\Phi = \Phi_0$ con el volumen fijado; número de Bond $Bo = \rho\lambda L^3/\sigma$.

## 10. La señal que recibe la cámara (problema emisor–observador)

Para cada instante de recepción $t_r$ se busca la geodésica nula pasada que sale de la cámara y corta
la línea de universo del emisor (`simulation/signalTracker.ts`):

1. La línea de universo se interpola con Hermite cúbico usando su 4-velocidad.
2. Se dispara un rayo con dos ángulos $(\alpha, \beta)$ en el marco de la cámara, integrado con
   Dormand–Prince ($10^{-11}$), y se mide la distancia mínima a la línea de universo.
3. Newton con jacobiano por diferencias ajusta $(\alpha, \beta)$ hasta el impacto.
4. Resultado: $g = 1/(q\cdot u_{em})$ (con la normalización de la cámara), el tiempo propio del
   emisor en la emisión y el tiempo coordenado de emisión.

Al acercarse el emisor a $r_+$, las soluciones se acumulan exponencialmente cerca del horizonte:
$g \to 0$ y $\tau_{em} \to \tau_{cruce}$. La imagen se **enrojece, se ralentiza y se apaga**, mientras
que en el modelo el reloj del objeto sigue avanzando y cruza el horizonte en tiempo propio finito.
La validación compara con la solución radial exacta en Schwarzschild ($g$ a $10^{-5}$, retardo a
$10^{-4}$ M).

## 11. Caída libre de la cámara

La única trayectoria **física** de la cámara (`camera/RelativisticCamera.ts`): desde el reposo
respecto del observador actual se integra una geodésica temporal; el reloj de la simulación avanza en
tiempo propio de la cámara. Dentro del horizonte no hay vuelta atrás por movimiento físico;
«reiniciar» es una operación de software, declarada en pantalla.

## 12. Diagramas (SPACE-TIME GEOMETRY)

- **Trayectorias:** curvas calculadas en coordenadas cartesianas de Kerr–Schild con proyección
  euclídea (diagrama, no luz).
- **Conos de luz locales:** el conjunto de velocidades coordenadas de la luz en un punto es el
  elipsoide $g_{ij}v^iv^j + 2g_{ti}v^i + g_{tt} = 0$. Fuera de la ergosfera contiene $v = 0$; dentro
  del horizonte queda entero del lado de $r$ decreciente.
- **Incrustación:** el corte ecuatorial $t_{BL}$ = cte como superficie de revolución con radio
  circunferencial $R(r) = \sqrt{(r^2+a^2)^2 - a^2\Delta}\,/\,r$ y
  $dZ/dr = \sqrt{g_{rr} - R'(r)^2}$, $g_{rr} = r^2/\Delta$. Para $a = 0$: paraboloide de Flamm
  $Z = \sqrt{8M(r - 2M)}$.
- **Diagrama $(t, r)$ de la perspectiva C:** conos de luz radiales formados por las direcciones nulas
  principales en tiempo de Kerr–Schild: entrante $dt/dr = -1$ y saliente
  $dt/dr = (r^2 + a^2 + 2Mr)/\Delta$. Dentro de $r_+$ ($\Delta < 0$) también la «saliente» tiene
  $dr < 0$: el cono entero apunta hacia $r$ decreciente.
- **Curvatura:** $\log_{10}|K|$ en un corte meridional, con su signo.

## 13. Imagen sintética EHT

Observador estático en $r = 10^4\,M$ en la dirección de la vista; el rayo central apunta al agujero y
el campo es $\pm$ campo$\cdot r_g$ en el plano del cielo ($\theta = b\,\theta_g$). Se muestra
$I_{230}$ lineal normalizado (mapa *afmhot*), con convolución opcional por un haz gaussiano
(FWHM 20 μas por defecto). Se miden el **flujo total**
$F = \sum I\,\Delta\Omega$ (Jy) y el **diámetro del anillo** (pico del perfil promediado en acimut) para
compararlos con $51{,}8 \pm 2{,}3$ μas y $\approx 2{,}35$ Jy.
