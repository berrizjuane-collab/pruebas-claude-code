| Grupo | Caso | Referencia | Medida | Error |
|---|---|---|---|---|
| Integradores | Dormand–Prince 5(4), oscilador armónico, tol = 1e-6 (76 pasos) | cos t | y(20.24) | 5.5e-6 (absoluto) |
| Integradores | Dormand–Prince 5(4), oscilador armónico, tol = 1e-9 (296 pasos) | cos t | y(20.06) | 3.8e-9 (absoluto) |
| Integradores | Dormand–Prince 5(4), oscilador armónico, tol = 1e-12 (1174 pasos) | cos t | y(20.02) | 3.4e-12 (absoluto) |
| Integradores | RK4 (el de la GPU): orden de convergencia medido log₂(e(h)/e(h/2)), h = 0,1 | 4 | 3.893 | 2.7e-2 (relativo) |
| Caída radial | τ al cruzar r = 2M desde el reposo en r₀ = 10M | cicloide 33.7008698519 M | 33.7008698519 M | 3.3e-13 (relativo) |
| Caída radial | τ al final del dominio (r = 2.0e-3 M) | cicloide 35.1240314890 M | 35.1240314890 M | 2.6e-13 (relativo) |
| Caída radial | Ligadura hamiltoniana |H + ½| máxima (incluido el interior) | 0 | 2.49e-12 | 2.5e-12 (absoluto) |
| Caída radial | t de Kerr–Schild en el cruce del horizonte (finito) | finito | 38.5539 M | 0.0e+0 (absoluto) |
| Kerr a = 0,9 | Caída oblicua hasta r₋: deriva de E | 1.00000000000 | 1.00000000000 | 0.0e+0 (absoluto) |
| Kerr a = 0,9 | Caída oblicua hasta r₋: deriva de L_z | 1.50000000000 | 1.49999999998 | 1.4e-11 (relativo) |
| Kerr a = 0,9 | Caída oblicua hasta r₋: deriva de Q (Carter) | 1.08763658673 | 1.08763658685 | 1.0e-10 (relativo) |
| Kerr a = 0,9 | Caída oblicua hasta r₋: ligadura de masa |μ² − 1| | 1 | 0.999999990658 | 9.3e-9 (absoluto) |
| Kerr a = 0,9 | Órbita inclinada y excéntrica, 3000 M: máx. deriva relativa de L_z, Q y μ² | constantes | 7.59e-12 | 7.6e-12 (relativo) |
| Órbitas | Circular prógrada en r_ISCO + 1 (a = 0), 10 vueltas: máx. |Δr|/r | 7.000000 M | máx. |Δr| = 4.27e-10 M | 6.1e-11 (relativo) |
| Órbitas | Circular prógrada en r_ISCO + 1 (a = 0.5), 10 vueltas: máx. |Δr|/r | 5.233003 M | máx. |Δr| = 2.90e-10 M | 5.5e-11 (relativo) |
| Órbitas | Circular prógrada en r_ISCO + 1 (a = 0.9), 10 vueltas: máx. |Δr|/r | 3.320883 M | máx. |Δr| = 1.87e-10 M | 5.6e-11 (relativo) |
| Órbitas | Precesión del periastro (Schwarzschild, p = 40M, e = 0,4) | 30.51537007° (integral elíptica) | 30.51537007° | 5.9e-12 (relativo) |
| Fotones | Órbita fotónica r = 3M (inestable), 2 vueltas: máx. |Δr| | 3 M | 1.22e-8 M | 4.1e-9 (relativo) |
| Fotones | Órbita fotónica ecuatorial prógrada (a = 0,7), 30 M | 2.01333412 M (Bardeen et al. 1972) | máx. |Δr| = 4.46e-12 M | 2.2e-12 (relativo) |
| Fotones | Órbita fotónica ecuatorial retrógrada (a = 0,7), 30 M | 3.72534525 M (Bardeen et al. 1972) | máx. |Δr| = 1.70e-11 M | 4.6e-12 (relativo) |
| Fotones | Deflexión de la luz, b = 20 M (truncada en ±10⁶ M) | 2.36135995e-1 rad (integral exacta) | 2.36135995e-1 rad | 1.2e-11 (relativo) |
| Fotones | Deflexión de la luz, b = 100 M (truncada en ±10⁶ M) | 4.12225398e-2 rad (integral exacta) | 4.12225397e-2 rad | 1.9e-10 (relativo) |
| Fotones | Deflexión de la luz, b = 1000 M (truncada en ±10⁶ M) | 4.01182380e-3 rad (integral exacta) | 4.01182381e-3 rad | 2.1e-9 (relativo) |
| Fotones | Tiempo de vuelo radial 10M → 100M (retardo de Shapiro) | 100.0221037480 M | 100.0221037480 M | 2.4e-14 (relativo) |
| Fotones | Parámetro de impacto crítico b_c (a = 0) = 3√3 M | 5.196152422707 | 5.196152422707 | 0.0e+0 (relativo) |
| Curvatura | Kretschmann numérico (Riemann por diferencias de Richardson) frente al analítico, 36 puntos dentro y fuera del horizonte | fórmula cerrada | peor caso 2.46e-11 | 2.5e-11 (relativo) |
| Curvatura | Tensor de marea, observador estático en Schwarzschild: diag(−2, 1, 1)·M/r³ | exacto | peor caso 8.42e-12 | 8.4e-12 (relativo) |
| Curvatura | Marea del observador en caída (también dentro del horizonte, r = 1,2M) | diag(−2, 1, 1)·M/r³ | peor caso 4.43e-11 | 4.4e-11 (relativo) |
| Convergencia | Órbita inclinada y excéntrica (a = 0,9): posición en t = 1000 M con rtol = 1e-6 | rtol = 1e-13 | |Δx| = 1.29e-4 M | 1.3e-4 (absoluto) |
| Convergencia | Órbita inclinada y excéntrica (a = 0,9): posición en t = 1000 M con rtol = 1e-8 (mejora ×3 por cada ×100 de tolerancia) | rtol = 1e-13 | |Δx| = 4.93e-5 M | 4.9e-5 (absoluto) |
| Convergencia | Órbita inclinada y excéntrica (a = 0,9): posición en t = 1000 M con rtol = 1e-10 (mejora ×214 por cada ×100 de tolerancia) | rtol = 1e-13 | |Δx| = 2.31e-7 M | 2.3e-7 (absoluto) |
| Convergencia | Órbita inclinada y excéntrica (a = 0,9): posición en t = 1000 M con rtol = 1e-12 (mejora ×218 por cada ×100 de tolerancia) | rtol = 1e-13 | |Δx| = 1.06e-9 M | 1.1e-9 (absoluto) |
