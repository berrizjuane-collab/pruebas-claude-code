# Los diez objetos arrojables

Todos los objetos usan la **misma física**: el centro de masas sigue una geodésica temporal de Kerr
(Dormand–Prince 5(4), tolerancia relativa 10⁻¹⁰), el marco del cuerpo se transporta en paralelo
(giróscopos) y el tensor de marea `E_ij` se evalúa en ese marco con el tensor de Riemann numérico.
Lo que cambia entre objetos es **qué demuestra cada uno**: tamaño, masa, material y modelo de rotura.

Los materiales son **valores de ingeniería típicos** (orden de magnitud), no datos de un objeto real
concreto. Fuente de los parámetros: `src/simulation/catalog.ts`.

## Criterio de rotura (modelo cuasiestático)

`λ` es el mayor autovalor de estiramiento del tensor de marea (`−E`), en s⁻²: la aceleración relativa
por metro de separación. Un cuerpo se rompe cuando `λ` supera su gradiente crítico `λ_c`:

| Modelo | Gradiente crítico | Idea física |
|---|---|---|
| Monolito o agregado autogravitante de radio `R` | `λ_c = (4π/3)·G·ρ + 2σ_t / (ρ R²)` | la tensión central `≈ ρ λ R²/2` supera la resistencia más la autogravedad |
| Estructura esbelta de masa `m`, longitud `L` y sección resistente `A` | `λ_c = 8 σ_t A / (m L)` | la tracción en la sección media `T = m λ L / 8` supera `σ_t A` |

Tras la primera rotura cada fragmento se vuelve a evaluar con su propio tamaño (la mitad ⇒ `λ_c ×4`):
**fragmentación en cascada**, hasta 48 piezas. Las piezas siguen la ecuación de desviación geodésica
linealizada `d²ξⁱ/dτ² = −Eⁱ_j ξʲ` desde su posición en el cuerpo; si se separan más del 5 % del radio
de curvatura, la aplicación avisa de que la linealización pierde precisión.

## ¿Dónde se rompe cada objeto en Sgr A*?

Estimación con la marea radial de Schwarzschild para una caída radial, `λ(r) = 2GM/r³`
(para 4 × 10⁶ M☉: `λ = 5,15·10⁻³ / x³ s⁻²` con `r = x·r_g`). La aplicación calcula el valor exacto de
Kerr en cada instante y para cada trayectoria; esta tabla solo orienta.

| Objeto | Modelo | `λ_c` [s⁻²] | Rotura estimada | Resultado en Sgr A* (a* = 0,5) |
|---|---|---|---|---|
| Esfera de acero | monolito, `R = 0,5 m`, σ_t = 400 MPa | 4,1 × 10⁵ | r ≈ 0,0023 r_g | cruza el horizonte intacta y llega intacta al final del dominio (r₋ = 0,134 r_g, donde λ ≈ 2 s⁻²) |
| Reloj atómico | esbelto, Al 6061 | 3,3 × 10⁵ | r ≈ 0,0025 r_g | intacto |
| Sonda espacial | esbelta, 12 m, Al 6061 | 1,7 × 10² | r ≈ 0,03 r_g | intacta |
| Cápsula espacial | esbelta, 10 m, casco Al–Li | 1,9 × 10³ | r ≈ 0,014 r_g | intacta |
| Asteroide rocoso (monolito) | `R = 500 m`, σ_t = 10⁵ Pa + autogravedad | 3,1 × 10⁻⁴ | r ≈ 2,6 r_g | **se rompe fuera del horizonte**, muy cerca de él |
| Asteroide rocoso (agregado sin cohesión) | solo autogravedad | 7,3 × 10⁻⁷ | r ≈ 19 r_g | **se rompe lejos del horizonte** |
| Cometa helado | `R = 2,5 km`, ρ = 530 kg/m³, σ_t = 10 Pa | 1,5 × 10⁻⁷ | r ≈ 32 r_g | **disrupción por marea a ~30 r_g**: un evento de marea en miniatura (domina la autogravedad) |
| Contenedor de agua | esbelto, pared de acero de 4 mm | 7,3 × 10³ | r ≈ 0,009 r_g | intacto; el agua cambia de forma (ver ficha) |
| Cubo reticulado | esbelto, 300 barras de Al | 6,6 × 10² | r ≈ 0,02 r_g | intacto |
| Nube de partículas | partículas de prueba | — | — | se estira y se dispersa (geodésicas vecinas) |
| Haz de fotones | geodésicas nulas | — | — | captura si \|b\| < b_c, escape si \|b\| > b_c |

**Conclusión física:** el horizonte de un agujero negro supermasivo no tiene nada de especial
localmente. En el horizonte de Sgr A* la marea es `λ ≈ 8 × 10⁻⁴ s⁻²`: entre la cabeza y los pies de una
persona de 1,8 m, `1,4 × 10⁻³ m/s²` (una diezmilésima de g). Solo se rompen antes los cuerpos grandes
y débiles. La aplicación no fuerza ninguna explosión en el horizonte.

## Ficha de cada objeto

### 1. Esfera de acero
- 1 m de diámetro, 4,1 t; acero estructural (ρ = 7850 kg/m³, σ_t = 400 MPa, E = 200 GPa).
- **Demuestra:** una geodésica temporal casi ideal; su tamaño es despreciable frente a la curvatura.
- Baliza blanca (6500 K). Modelo 3D: esfera metálica pulida.

### 2. Reloj atómico
- Caja de 60 × 40 × 30 cm, 50 kg.
- **Demuestra:** tiempo propio frente a tiempo coordenado y frente a lo que ve un observador exterior.
- Su baliza **parpadea cada 2 M ≈ 39 s de tiempo propio**. En la vista exterior el parpadeo llega
  cada vez más espaciado y más rojo al acercarse al horizonte (retardo y desplazamiento al rojo
  calculados con la línea de universo real); en la vista B, el reloj marca su tiempo propio, que
  cruza el horizonte en un valor finito.

### 3. Sonda espacial
- 1,5 t; bus de 2 m, paneles solares de 12 m de envergadura, antena de alta ganancia.
- **Demuestra:** telemetría completa, orientación giroscópica (transporte paralelo del marco: los
  paneles no «apuntan» a ningún sitio salvo por la precesión geodésica y el arrastre de marcos).

### 4. Cápsula espacial
- 10 m × 4 m, 12 t; casco Al–Li de 5 mm.
- **Demuestra:** gradiente gravitacional entre proa y popa y comparación con la tolerancia humana
  (la telemetría muestra la diferencia de aceleración cabeza–pies de una persona de 1,8 m).

### 5. Asteroide rocoso
- ~1 km (1200 × 900 × 800 m), 1,1 × 10¹² kg; roca silicatada fracturada (ρ = 2600 kg/m³).
- Resistencia a gran escala σ_t ≈ 10⁵ Pa (incierta: muy inferior a la de un meteorito).
- Opción **agregado sin cohesión** (rubble pile): solo lo mantiene unido su propia gravedad.
- **Demuestra:** rotura por marea cerca del horizonte (monolito) o lejos de él (agregado) y
  dispersión de los fragmentos por desviación geodésica.

### 6. Cometa helado
- Núcleo de 5 km de hielo poroso y polvo (ρ = 530 kg/m³, σ_t ≈ 10 Pa, en el rango medido para el
  núcleo de 67P: tracción 3–15 Pa). A este tamaño lo que lo mantiene unido es sobre todo su propia
  gravedad, así que el resultado apenas depende de σ_t.
- **Demuestra:** disrupción por marea **fuera** del horizonte (≈ 30 r_g), como un evento de marea en
  miniatura.

### 7. Contenedor de agua
- Depósito cilíndrico de acero inoxidable (2 m × 1,2 m) lleno al 80 %: 1,8 m³ de agua (2,1 t en total).
- **Demuestra:** marea en un fluido. En caída libre la única fuerza sobre el agua es la marea,
  con potencial `Φ(ξ) = ½ ξᵀ E ξ`. En equilibrio cuasiestático la superficie libre es una
  equipotencial y el agua ocupa la región `Φ < Φ₀` (con `Φ₀` fijado por el volumen): **dos lóbulos
  hacia los extremos de la dirección de estiramiento**, como las dos mareas de un océano.
- Lejos del agujero domina la tensión superficial: el número de Bond `Bo = ρ λ L³ / σ` es menor que 1
  para `λ < 7 × 10⁻⁵ s⁻²` (r ≳ 4 r_g en Sgr A*). Entonces el agua moja las paredes y el gas queda en
  una burbuja central. La vista B interpola entre ambos regímenes según `Bo`.
- Representación: superficie extraída con *marching cubes* del campo de nivel; **modelo
  cuasiestático e ilustrativo** (sin hidrodinámica, oleaje ni ángulo de contacto). El agua no tiene
  resistencia a tracción: la estructura la aporta la pared.

### 8. Cubo reticulado
- Celosía de aluminio de 20 m de arista: 5 × 5 × 5 nudos y 300 barras tubulares.
- **Demuestra:** estiramiento y compresión por marea; la deformación elástica real es ínfima
  (~10⁻¹² cerca del horizonte), así que la vista B permite **ampliarla declarándolo** (control
  «Ampliación de la deformación»).

### 9. Nube de partículas
- Partículas trazadoras de prueba, sin masa ni interacción, en una bola de radio ajustable
  (por defecto 0,8 r_g ≈ 4,7 millones de km), con semilla determinista.
- **Demuestra:** evolución colectiva de geodésicas vecinas: estiramiento radial, compresión
  transversal, dispersión.

### 10. Haz de fotones
- Haz paralelo de fotones (1–41) con parámetros de impacto en torno al crítico `b_c`.
- **Demuestra:** geodésicas nulas: desviación, órbitas casi circulares cerca de la órbita fotónica,
  captura (|b| < b_c) frente a escape (|b| > b_c). Para a = 0: `b_c = 3√3 M ≈ 5,196 M`.

## Representación visual

- **Vista exterior (A):** cada objeto es una **baliza ampliada** (un objeto de metros sería invisible
  a la escala de r_g ≈ 5,9 millones de km). Su luz se calcula con el tiempo retardado: la cámara
  recibe la emisión de la línea de universo real, enrojecida por el efecto gravitacional y Doppler.
  La escala visual de las balizas es ajustable y está declarada como ilustrativa.
- **Vista propia (B):** modelo 3D a escala real en el marco localmente inercial del objeto (principio
  de equivalencia), iluminado por un mapa de entorno **trazado** desde su posición y velocidad. La
  forma de los fragmentos es ilustrativa; su posición es la calculada.
- **Diagrama (C):** la trayectoria calculada en coordenadas.
