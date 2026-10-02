# Campos — laboratorio de campos vectoriales 3D

Laboratorio virtual en el navegador para explorar campos
**F(x, y, z) = (P, Q, R)**: dirección, magnitud, líneas de corriente, cortes, divergencia y
rotacional, con una interfaz minimalista y estrictamente monocromática.

> **Fase actual: planificación.** Todavía no hay código de la aplicación. El plan está
> pendiente de aprobación.

## Documentos

| Documento | Contenido |
| --- | --- |
| [SPEC.md](SPEC.md) | Visión, alcance, fundamentos matemáticos, catálogo y métodos computacionales |
| [DESIGN.md](DESIGN.md) | Dirección visual, composición, componentes y reglas de representación monocromática |
| [PLAN.md](PLAN.md) | Arquitectura, ejecución local, flujos de uso, hitos y checklist de tareas |
| [VALIDATION.md](VALIDATION.md) | Tolerancias, pruebas matemáticas, funcionales, visuales, de accesibilidad y de rendimiento |
| [STATUS.md](STATUS.md) | Estado, decisiones, supuestos, riesgos, preguntas y siguiente paso |

## Ejecución (cuando exista la aplicación)

```bash
cd campos-vectoriales
npm ci && npm run dev      # Node ≥ 22.12
```

Detalles en [PLAN.md §2](PLAN.md#2-ejecución-local-y-conexión).
