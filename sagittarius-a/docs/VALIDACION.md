# Validación

La validación tiene cuatro niveles, todos automatizados y reproducibles:

| Nivel | Comando | Qué comprueba | Resultado |
|---|---|---|---|
| 1. Pruebas unitarias | `npm test` | 67 pruebas de Vitest: integradores, métrica, geodésicas, observadores, marea, sincrotrón, trazador de referencia, experimentos, señal recibida | 67/67 superadas |
| 2. Informe cuantitativo | `npm run validar` | Mide el error de 32 casos frente a soluciones exactas (`docs/validacion/fisica.json`) | Tabla 1 |
| 3. GPU frente a CPU | `npm run validar:gpu` | El trazador del navegador (float32, RK4) contra la referencia (float64, Dormand–Prince 10⁻¹⁰), píxel a píxel (`docs/validacion/gpu.json`) | Tabla 2 |
| 4. Aplicación real | `node scripts/recorrido.mjs` | Abre la aplicación compilada en Chromium, lanza objetos, recorre las tres perspectivas y los paneles y falla ante cualquier error de página o de consola | sin errores (ver §5) |

## 1. Física: errores medidos frente a soluciones exactas

Generado por `scripts/informe-validacion.ts` (Node 22, doble precisión). El «umbral» es el que exige
la prueba unitaria correspondiente.

| Grupo | Caso | Referencia exacta | Error medido |
|---|---|---|---|
| Integradores | Dormand–Prince 5(4), oscilador armónico, tolerancias 10⁻⁶ / 10⁻⁹ / 10⁻¹² | cos t | 5,5·10⁻⁶ / 3,8·10⁻⁹ / 3,4·10⁻¹² (el error sigue a la tolerancia) |
| Integradores | RK4 (el de la GPU): orden de convergencia | 4 | 3,89 (h = 0,1) |
| Caída radial (a = 0) | Tiempo propio al cruzar r = 2M desde el reposo en r₀ = 10M | cicloide: 33,7008698519 M | 3,3·10⁻¹³ relativo |
| Caída radial | Tiempo propio al final del dominio (r = 2·10⁻³ M) | cicloide: 35,1240314890 M | 2,6·10⁻¹³ relativo |
| Caída radial | Ligadura hamiltoniana \|H + ½\| (también dentro del horizonte) | 0 | 2,5·10⁻¹² |
| Caída radial | t de Kerr–Schild del cruce del horizonte | finito | 38,554 M (finito) |
| Kerr a = 0,9 | Caída oblicua hasta r₋: E, L_z, Q, μ² | constantes | 0 · 1,4·10⁻¹¹ · 1,0·10⁻¹⁰ · 9,3·10⁻⁹ |
| Kerr a = 0,9 | Órbita inclinada y excéntrica durante 3000 M: peor deriva de L_z, Q, μ² | constantes | 7,6·10⁻¹² |
| Órbitas | Circular prógrada en r_ISCO + 1, 10 vueltas (a = 0; 0,5; 0,9) | r constante | \|Δr\|/r ≤ 6,1·10⁻¹¹ |
| Órbitas | Precesión del periastro (Schwarzschild, p = 40M, e = 0,4) | 30,51537007° (integral elíptica) | 5,9·10⁻¹² relativo |
| Fotones | Órbita fotónica inestable r = 3M, 2 vueltas | 3 M | \|Δr\| = 1,2·10⁻⁸ M |
| Fotones | Órbitas fotónicas ecuatoriales de Kerr (a = 0,7), prógrada / retrógrada | 2,01333412 / 3,72534525 M | 2,2·10⁻¹² / 4,6·10⁻¹² relativo |
| Fotones | Deflexión de la luz, b = 20 / 100 / 1000 M | integral exacta | 1,2·10⁻¹¹ / 1,9·10⁻¹⁰ / 2,1·10⁻⁹ relativo (domina el truncado en ±10⁶ M) |
| Fotones | Tiempo de vuelo radial 10M → 100M (retardo de Shapiro) | 100,0221037480 M | 2,4·10⁻¹⁴ relativo |
| Curvatura | Kretschmann numérico frente al analítico, 36 puntos (a = 0; 0,5; 0,9), dentro y fuera del horizonte | fórmula cerrada | ≤ 2,5·10⁻¹¹ relativo |
| Curvatura | Marea del observador estático en Schwarzschild | diag(−2, 1, 1)·M/r³ | 8,4·10⁻¹² |
| Curvatura | Marea del observador en caída, también en r = 1,2M (dentro) | diag(−2, 1, 1)·M/r³ | 4,4·10⁻¹¹ |
| Convergencia | Órbita de Kerr (a = 0,9) tras 1000 M con rtol 10⁻⁶ / 10⁻⁸ / 10⁻¹⁰ / 10⁻¹² frente a 10⁻¹³ | — | 1,3·10⁻⁴ / 4,9·10⁻⁵ / 2,3·10⁻⁷ / 1,1·10⁻⁹ M |

La convergencia es la esperada: a partir de 10⁻⁸ cada factor 100 en la tolerancia reduce el error de
posición unas 215 veces. La aplicación usa 10⁻¹⁰ (error de posición ~10⁻⁷ M ≈ 1 km tras 1000 M ≈ 5,5 h).

## 2. Trazador de la GPU frente a la referencia en CPU

`src/validation/gpuValidation.ts`: para cada caso se trazan N × N píxeles en la GPU (modo de
salida de validación: dirección final y estado) y en la CPU (Dormand–Prince, 10⁻¹⁰), y se comparan la
clasificación (escape, captura…), la dirección final en el cielo y, con plasma, la intensidad a 230 GHz.

| Caso | Calidad | Clasificación | Error angular mediano | p95 | Máximo | Pasos GPU (media) |
|---|---|---|---|---|---|---|
| Schwarzschild, cámara estática r = 30, ecuatorial | interactiva | 100 % | 3,4·10⁻⁷ rad | 4,0·10⁻⁶ | 2,6·10⁻⁵ | 107 |
| Kerr a = 0,9, ZAMO r = 12, θ = 80° | interactiva | 100 % | 1,8·10⁻⁶ rad | 1,3·10⁻⁵ | 2,5·10⁻⁴ | 118 |
| Kerr a = 0,9, ZAMO r = 12, θ = 80° | alta fidelidad | 100 % | 4,3·10⁻⁷ rad | 3,5·10⁻⁶ | 8,7·10⁻⁵ | 296 |
| Kerr a = 0,6, observador lejano r = 1000, θ = 60° (sombra) | interactiva | 100 % | 2,2·10⁻⁶ rad | 3,7·10⁻⁵ | 1,0·10⁻³ | 168 |
| Kerr a = 0,5, cámara en caída libre **dentro** del horizonte (r = 1,3) | interactiva | 100 % | 1,1·10⁻⁷ rad | 3,7·10⁻⁷ | 6,2·10⁻⁷ | 121 |

| Caso con plasma | Píxeles con el mismo estado | Error relativo de I₂₃₀ mediano | p95 | Flujo total GPU/CPU |
|---|---|---|---|---|
| RIAF, a = 0,5, r = 40, θ = 60°, 230 GHz | 97,9 % | 0,11 % | 1,9 % | 1,002 |

Los errores máximos aparecen en píxeles que rozan la órbita fotónica (borde de la sombra), donde
la sensibilidad a las condiciones iniciales es exponencial. Ninguno cambia la clasificación.
Entorno de la medida: Chromium sin GPU (SwiftShader, float32 IEEE). En una GPU real la aritmética
float32 puede diferir en el último bit; el orden de magnitud es el mismo.

## 3. Experimentos completos (pruebas de `src/simulation`)

| Prueba | Resultado |
|---|---|
| Cometa en caída radial desde 45 M | se rompe por marea **fuera** del horizonte (entre 20 y 40 r_g) y termina en el fin del dominio |
| Esfera de acero | cruza el horizonte **intacta**: sin explosión en r₊ |
| Asteroide monolítico / agregado | el monolito se rompe cerca del horizonte (2–3,2 r_g); el agregado, a más de 15 r_g |
| Órbita circular estable | todas las muestras a r constante (10⁻⁶) y estado «ligado» |
| Órbita circular bajo la órbita fotónica | error explícito: no existe |
| Sobrevuelo frente a captura (misma velocidad local) | el sobrevuelo escapa; la captura cae |
| Haz de fotones en torno a b_c | se separa exactamente en \|b\| = √27 M: unos capturados, otros escapan |
| Nube de partículas | idéntica con la misma semilla |
| Ergosfera (a = 0,9) | el evento se localiza en r = r_E(θ) con error < 10⁻⁹ y antes del cruce del horizonte |
| Señal recibida (caída radial vista desde el mismo radio) | g y retardo coinciden con la solución radial exacta (10⁻⁵ y 10⁻⁴ M) |
| Desviación geodésica | la separación de dos geodésicas vecinas sigue la ecuación de Jacobi con error < 2·10⁻⁴ |

## 4. Calibración del plasma frente a observaciones

`scripts/calibrar-riaf.ts` traza la imagen a 230 GHz con el trazador de referencia (a = 0,5, i = 30°):
con T₀ = 3·10¹¹ K y n₀ = 1,56·10⁷ cm⁻³ el flujo total es ≈ 2,35 Jy (observado: ≈ 2,35 Jy, Wielgus et
al. 2022) y la profundidad óptica máxima ≈ 1,5. En la aplicación, el perfil EHT mide sobre la imagen el
flujo total y el diámetro del anillo y los muestra junto a los valores del EHT (51,8 ± 2,3 μas). La
coincidencia del flujo es por construcción (calibración); la del tamaño del anillo es una
**comprobación** independiente, aproximada (modelo, no GRMHD).

## 5. Recorrido automático de la aplicación

`scripts/recorrido.mjs` compila la aplicación, la sirve con `vite preview`, la abre en Chromium y
ejecuta una lista de pasos (clics, teclas, código, capturas). Recorridos ejecutados durante el
desarrollo (1280 × 720):

- Arranque, lanzamiento de la sonda espacial a 3000×: eventos `lanzamiento → isco → ergosfera →
  horizonte → fin` en orden cronológico; telemetría con distancia, velocidad local, τ y marea.
- Perspectiva B (marco del objeto) y C (diagrama); paneles Física y Research Mode (estado, gráficos).
- Contenedor de agua: vista B fuera del horizonte (r = 6 M, régimen capilar) y cerca de él
  (r ≈ 2,4 M, régimen de marea).
- **Sin errores de página ni de consola** en las ejecuciones finales.

Los recorridos detectaron y permitieron corregir: el orden de los eventos (la ergosfera se
detectaba en la malla de muestreo; ahora se localiza con la salida densa), solapes de la interfaz a
1280 px, y la escala del diagrama (t, r), que ahora es isótropa.
