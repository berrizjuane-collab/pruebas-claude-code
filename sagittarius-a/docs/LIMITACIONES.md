# Limitaciones y clasificación de cada elemento

Cada cosa que muestra el observatorio pertenece a una de cinco clases. La interfaz usa las mismas
etiquetas (panel **Información → Clasificación de cada elemento**).

| Clase | Significado |
|---|---|
| **Exacto** | Solución de las ecuaciones de la relatividad general en la métrica de Kerr, integrada numéricamente con error medido y muy inferior a lo visible (docs/VALIDACION.md). |
| **Aproximado** | Mismas ecuaciones, resueltas con una aproximación controlada y cuantificada (precisión simple en la GPU, linealización, interpolación). |
| **Modelo** | Física parametrizada: plausible y calibrada con observaciones, pero no deducida de primeros principios ni única. |
| **Ilustrativo** | Representación visual de algo calculado, cuya forma o tamaño no es literal (ampliado, esquemático o procedimental). |
| **Estético** | Decisión de presentación sin contenido físico. |

## Tabla completa

| Elemento | Clase | Detalle y limitaciones |
|---|---|---|
| Métrica de Kerr (Kerr–Schild entrante) | Exacto | Solución de vacío; sin carga ni constante cosmológica. Sgr A* se modela como un agujero de Kerr aislado (la masa del flujo y de las estrellas cercanas es despreciable frente a 4 × 10⁶ M☉). |
| Masa y distancia de Sgr A* | Medida | Conjuntos «Nominal» (4,0 × 10⁶ M☉, 8,2 kpc) y «GRAVITY 2022» (4,297 × 10⁶ M☉, 8,277 kpc), con fuentes. |
| Espín a* = 0,5 | **Hipótesis** | No está medido. Ajustable de 0 a 0,998. EHT 2022 favorece modelos con espín prógrado moderado o alto, pero depende de simulaciones GRMHD. |
| Inclinación inicial 30° | **Hipótesis** | Favorecida por EHT 2022 y GRAVITY 2018; la cámara es libre. |
| Geodésicas de cuerpos y fotones (física) | Exacto | Hamiltoniano + Dormand–Prince 5(4), tolerancia 10⁻¹⁰; E, L_z, Q conservadas a ~10⁻¹¹–10⁻⁹. |
| Cruce del horizonte | Exacto | Kerr–Schild es regular en r₊: la integración continúa sin singularidad de coordenadas; el tiempo propio del cruce es finito. |
| Final del dominio integrado | Decisión física | Kerr: se detiene en el horizonte interior r₋ (horizonte de Cauchy, inestable: más allá la predicción clásica no es fiable). a = 0: se detiene en r = 2 × 10⁻³ M; la singularidad se alcanza en tiempo propio finito pero no se integra. Nunca se dibuja una «salida» de la singularidad. |
| Horizontes, ergosfera, ISCO, órbitas fotónicas | Exacto | Fórmulas cerradas (Bardeen, Press y Teukolsky 1972). |
| Constantes del movimiento y estado orbital | Exacto | «Ligado» si E < 1; no se usa la velocidad de escape newtoniana. |
| Tensor de Riemann, Kretschmann, marea | Exacto | Riemann numérico (Richardson) contrastado con el Kretschmann analítico a 10⁻¹¹. |
| Desplazamiento al rojo y retardo de la señal recibida (Research) | Exacto | Problema emisor–observador resuelto por disparo con Dormand–Prince (1e-11). Solo imagen primaria. |
| Trazado de rayos en la GPU | Aproximado | RK4 en precisión simple con paso adaptativo heurístico. Frente a la referencia en CPU: clasificación (captura/escape) 100 % (en una ejecución, 1 de 1600 rayos rasantes clasificado al revés), error angular mediano 10⁻⁷–2 × 10⁻⁶ rad, p95 ≤ 4 × 10⁻⁵ rad. Rayos que rozan la órbita fotónica pueden acumular más error (máximo medido 10⁻³ rad, en píxeles del borde de la sombra). |
| Sombra y anillo de fotones | Exacto (en la imagen: aproximado) | Emergen de las geodésicas, no se dibujan. Su tamaño en el perfil EHT se mide sobre la imagen. |
| Lente del cielo de fondo | Aproximado | Posición, magnificación (jacobiano en espacio de pantalla) y desplazamiento al rojo g⁴ correctos; estrellas con PSF gaussiana. |
| Campo estelar y banda galáctica | Ilustrativo | Procedimentales (semilla fija), no un catálogo real del centro galáctico (que está muy oscurecido por polvo en óptico). |
| Plasma: perfiles de n_e, T_e, B, cinemática | Modelo | RIAF semianalítico (Yuan, Quataert y Narayan 2003; Broderick y Loeb 2006). **No es GRMHD.** Calibrado a F₂₃₀ ≈ 2,35 Jy. |
| Emisividad y absorción | Modelo | Sincrotrón térmico (ajuste de Leung, Gammie y Noble 2011) con absorción de Kirchhoff. Sin polarización, sin electrones no térmicos, sin Compton. |
| Transferencia radiativa | Aproximado | Integrador exponencial por paso; error frente a la CPU: 0,1–0,14 % mediano en I₂₃₀, flujo total a 0,2–0,4 %. |
| Variabilidad (turbulencia, punto caliente) | Modelo | Estocástica (log-normal arrastrada por la rotación diferencial) y punto caliente kepleriano; no es dinámica de fluidos. |
| Perfil EHT: imagen sintética 230 GHz, haz gaussiano | Modelo + aproximado | Comparación cualitativa con el anillo de 51,8 ± 2,3 μas. No es una reconstrucción interferométrica: no hay muestreo (u, v), ni dispersión interestelar, ni ruido. |
| Color del perfil cinematográfico | **Estético** | Índice espectral 86–690 GHz convertido en una paleta cálida; brillo con compresión logarítmica. |
| Exposición automática, bloom, ACES | Estético | Presentación. |
| Balizas de los objetos (vista A) | Ilustrativo | Esferas emisoras **ampliadas** (escala visual ajustable, ~10⁶ km de radio) con brillo de referencia igual al punto blanco de la imagen para que se distingan del plasma; su luz sí sigue geodésicas con tiempo retardado y el factor g⁴ físico (enrojecimiento y apagado). En la vista B no se traza la baliza del propio objeto (la cámara estaría dentro de ella); las de los demás objetos sí. |
| Trayectorias, marcas de posición, conos de luz, rejilla, horizonte dibujado (SPACE-TIME GEOMETRY) | Ilustrativo | Dibujos en coordenadas cartesianas de Kerr–Schild con proyección euclídea: diagramas, no luz. |
| Diagrama de incrustación | Ilustrativo | Corte ecuatorial t_BL = cte, de r₊ hacia fuera, como superficie de revolución (paraboloide de Flamm para a = 0). Donde la curvatura de Gauss impide la incrustación isométrica en ℝ³ se muestra solo la parte incrustable y la interfaz lo indica. La tercera dimensión no es física. |
| Cuerpos extensos: marco y marea | Exacto | Marco giroscópico transportado en paralelo; E_ij en ese marco. |
| Fragmentos (posición) | Aproximado | Desviación geodésica linealizada; se avisa si la separación supera el 5 % del radio de curvatura. |
| Criterio de rotura | Modelo | Cuasiestático con resistencias típicas de ingeniería (docs/OBJETOS.md). No hay mecánica de fractura, ni dinámica elástica, ni autogravedad de los fragmentos tras romperse. |
| Forma de los fragmentos | Ilustrativo | Rocas genéricas. |
| Agua del contenedor | Modelo + ilustrativo | Equilibrio cuasiestático en el potencial de marea (Φ = ½ ξᵀEξ) o burbuja central si domina la capilaridad (Bo < 1). Sin hidrodinámica ni oleaje. |
| Deformación elástica ampliada (vista B) | Ilustrativo | ε ≈ ρL²E/(8Y); el factor de ampliación se indica en pantalla. |
| Modelos 3D (vista B) | Ilustrativo | Escala real; iluminación con un mapa de entorno trazado desde el objeto (6 × 64², cada 0,5 s, con la misma exposición que el fondo) más una **luz de relleno ilustrativa** junto a la cámara: en óptico el cielo apenas ilumina. |
| Banda de la vista B | Exacto (elección de banda) | Óptico por defecto: el sincrotrón del flujo cae como exp(−(ν/ν_s)^⅓) y es despreciable en el visible, y el plasma es transparente (τ_es ~ 10⁻⁵), así que se ven la sombra y el cielo con lente. En milimétrico la cámara está dentro del plasma emisor y ve brillo en casi todas direcciones (el perfil de densidad dentro de ~2 r_g es una extrapolación del modelo). |
| Cámara exterior: observadores estático, ZAMO, órbita, lluvia | Exacto | Tétradas ortonormales; el estático no existe dentro de la ergosfera y la interfaz lo impide. |
| Navegación de la cámara | Operación de software | Cambiar de punto de vista no es un movimiento físico. La única trayectoria física de la cámara es la caída libre. «Reiniciar» tras una caída es una operación de software, declarada en pantalla. |
| Tiempo | Exacto | t de Kerr–Schild (coincide con el de un observador estático lejano salvo una constante); τ propio de cada objeto. El multiplicador no altera la física. |
| Audio | Estético | Opcional, desactivado por defecto. Ningún sonido representa un fenómeno del agujero negro. |

## Limitaciones conocidas

1. **No es GRMHD.** El flujo de acreción es un modelo parametrizado. Una simulación magnetohidrodinámica
   produciría estructuras (filamentos, chorros, viento) que aquí no existen.
2. **Sin imágenes de orden alto en la señal de Research.** El rastreador emisor–observador calcula la
   imagen primaria; la imagen secundaria (fotones que rodean el agujero) sí aparece en la vista A,
   porque allí cada píxel es una geodésica.
3. **Interpolación lineal** entre muestras cada 0,25 M (≈ 4,9 s de tiempo coordenado) para mostrar los
   objetos; los eventos (horizonte, ISCO, ergosfera, periastro) se localizan exactamente.
4. **Precisión simple en la GPU.** Lejos de la órbita fotónica es irrelevante; en el borde de la
   sombra se mide un error máximo de ~10⁻³ rad en algún píxel.
5. **La vista B es local.** Los modelos 3D se dibujan con geometría euclídea en el marco localmente
   inercial (válido para tamaños ≪ radio de curvatura, ~10⁶ km en el horizonte); el cielo sí se traza.
6. **Rendimiento medido en software.** El entorno de desarrollo no tenía GPU; las cifras de
   docs/RENDIMIENTO.md proceden de SwiftShader (CPU) y del banco de pruebas de la aplicación, que
   cada usuario puede ejecutar en su equipo.
7. **Sin efectos cuánticos.** La temperatura de Hawking (~10⁻¹⁴ K) se muestra solo como escala.
