---
name: architecture-structure-audit
description: Detectar y prevenir degradación estructural, God Files, alto acoplamiento y regresiones en el monorepo.
---

# architecture-structure-audit

## Objetivo

Detectar, auditar y prevenir activamente la degradación estructural en `rocapellino/pokedex`. Esta skill identifica archivos monolíticos (*God Files*), clases sobredimensionadas (*God Classes*), módulos inflados (*God Modules*), carpetas cajón de sastre sin cohesión, dependencias circulares, violaciones de capas y regresiones estructurales introducidas en cambios recientes.

## Caso de Referencia Histórica

El caso canónico del repositorio es `apps/backend/server.ts`:

- **Estado anterior:** ~1.178 líneas de código (LOC), concentrando rutas HTTP, persistencia PostgreSQL, caché Redis, lógica de autenticación, prompts de IA, rate limiting y telemetría en un único archivo monolítico.
- **Estado refactorizado actual:** ~280 LOC, estructurado limpiamente mediante separación por capas y dominios:
  - `src/routes/`: `pokemons`, `auth`, `ai`, `health`.
  - `src/middleware/`: `auth`, `rate-limiter`, `metrics`, `request-tracer`.
  - `src/services/`: `db`, `auth`, `ai`.
  - `src/utils/`: `logger`, `lifecycle`, `async-handler`, `pagination`, `result`.

Esta skill existe para garantizar que archivos con una arquitectura saludable no vuelvan a acumular responsabilidades de forma silenciosa e incremental (`280 → 350 → 470 → 620 → 850 LOC`).

> [!IMPORTANT]
> **No utilizar LOC como único criterio.** La evaluación estructural debe ser siempre multidimensional. Un archivo de 650 LOC con una única responsabilidad y alta cohesión (por ejemplo, una gramática o un driver de dispositivo) no es un problema crítico, mientras que un archivo de 420 LOC con 6 responsabilidades dispares, 20 dependencias externas y crecimiento acelerado representa una degradación estructural severa.

## Dimensiones de Evaluación Multicriterio

1. **LOC / SLOC:** Volumen físico y lógico de código.
2. **Cantidad de responsabilidades:** Principio de Responsabilidad Única (SRP).
3. **Cohesión interna:** Grado de afinidad entre métodos, funciones y datos manipulados (LCOM).
4. **Acoplamiento aferente y eferente:** Entradas ($C_a$) y salidas ($C_e$), índice de inestabilidad ($I$).
5. **Cantidad de dependencias externas:** Librerías de terceros y acoplamiento a frameworks.
6. **Imports internos y dirección de capas:** Verificación de flujo unidireccional (Transporte → Dominio → Persistencia).
7. **Cantidad y tamaño de funciones/métodos:** Distribución de tamaño y funciones desproporcionadas.
8. **Complejidad ciclomática y anidamiento:** Ramificaciones `if/else`, `switch`, callbacks y loops profundos.
9. **Dependencias circulares:** Grafos de importación con ciclos de primer orden o transitivos.
10. **Duplicación de lógica:** Bloques de código redundantes o lógica de negocio clonada.
11. **Separación de capas:** Prevención de acceso directo a persistencia o APIs externas desde handlers HTTP.
12. **Crecimiento histórico:** Velocidad y tendencia de crecimiento en commits y releases recientes.
13. **Cambios recientes (Churn):** Frecuencia de modificación como indicador de acumulación de tareas.
14. **Relación entre módulos:** Acoplamiento temporal o funcional entre dominios.
15. **Impacto arquitectónico y riesgo de regresión:** Facilidad de prueba y mantenibilidad a largo plazo.

## Flujo Operativo del Análisis

```text
INVENTARIO
    │
    ▼
DETECCIÓN DE ESTRUCTURA
    │
    ▼
MÉTRICAS
    │
    ▼
ANÁLISIS DE RESPONSABILIDADES
    │
    ▼
ANÁLISIS DE COHESIÓN
    │
    ▼
ANÁLISIS DE ACOPLAMIENTO
    │
    ▼
ANÁLISIS DE COMPLEJIDAD
    │
    ▼
ANÁLISIS DE DUPLICACIÓN
    │
    ▼
ANÁLISIS DE DEPENDENCIAS CIRCULARES
    │
    ▼
ANÁLISIS HISTÓRICO
    │
    ▼
DETECCIÓN DE REGRESIONES
    │
    ▼
CLASIFICACIÓN
    │
    ▼
RECOMENDACIONES
```

### Alcance de Auditoría

La skill audita prioritariamente las siguientes áreas del repositorio:

- `apps/backend/`: Servidor Express, servicios de persistencia, middlewares y utilidades.
- `apps/frontend/`: Aplicación SPA, componentes de backoffice, catálogo y sanitizadores.
- `infra/`: Helm charts, playbooks de Ansible y configuraciones OpenTofu.
- `gitops/`: Árbol de aplicaciones y values por entorno de ArgoCD.
- `scripts/`: Herramientas de automatización operativa, validación y sincronización.
- `.github/`: Workflows de CI/CD y automatizaciones de seguridad.
- `.agents/`: Skills, metodologías, reglas y catálogo de automatización de agentes.

## Patrones Detectados

### 1. God File / God Class / God Module

Señales compuestas de alerta:

- LOC elevado junto con más de dos responsabilidades primarias.
- Múltiples dependencias cruzadas entre capas (mezcla de HTTP, base de datos, cifrado y llamadas a APIs de terceros).
- Más de 15 imports de diferentes dominios no cohesivos.
- Frecuencia constante de edición para resolver tickets de diferentes naturalezas.

### 2. Carpetas Cajón de Sastre

Detección en directorios genéricos como `utils/`, `helpers/`, `common/` o `misc/`:

- **No se consideran automáticamente un error:** Si alojan funciones puras, deterministas y de bajo acoplamiento (como cálculo de paginación o formateo de fechas), son válidas.
- **Se reportan como degradación** si alojan estado mutable global, inicialización de clientes externos, dependencias pesadas o lógica central de negocio que fue escondida para reducir artificialmente el tamaño de otro archivo.

### 3. Monolito Trasladado (*Monolith Relocated*)

Detección de refactorizaciones cosméticas que trasladan la complejidad en lugar de resolverla:

- Ejemplo: Reducir `server.ts` de 1.100 a 250 LOC creando un `application-runner.ts` de 900 LOC con la misma concentración de responsabilidades.
- Este patrón debe señalarse explícitamente como regresión no resuelta.

## Criterios de Clasificación y Severidad

| Nivel | Condiciones Típicas | Acción Requerida |
| :--- | :--- | :--- |
| **CRITICAL** | Archivo o módulo central con múltiples responsabilidades cruzadas, dependencias circulares, crecimiento acelerado y alto acoplamiento que bloquea pruebas unitarias independientes o genera regresiones constantes. | Plan de refactorización prioritario inmediato con change-plan formal. |
| **HIGH** | Módulo con mezcla evidente de capas (ej. handler HTTP con queries SQL directas), tendencia de crecimiento peligrosa (`+30%` en últimos hitos) o concentración de lógica de negocio en utilitarios. | Incluir en el backlog técnico con límites de modularización definidos. |
| **WARNING** | Archivo en crecimiento sostenido que supera los umbrales esperados de su capa, o carpeta utilitaria que comienza a recibir lógica heterogénea. | Monitoreo activo y sugerencia de extracción en siguientes PRs. |
| **INFO** | Archivo extenso pero altamente cohesivo (ej. especificación OpenAPI, data de seeding, diccionario tipado) sin riesgo de regresión funcional. | Registrar como diseño justificado; sin acción requerida. |

## Regla de Simplicidad Arquitectónica

> [!TIP]
> **"Preferir la estructura más simple que mantenga separación clara de responsabilidades, bajo acoplamiento y alta cohesión."**
>
> No sugerir Clean Architecture, Hexagonal, DDD, CQRS, microservicios o patrones basados en eventos por mera preferencia estética. Evaluar rigurosamente si el tamaño del proyecto y el equipo justifican el costo cognitivo de esa abstracción.

## Comandos

- `/architecture-structure-audit`: Auditoría estructural integral de todo el repositorio.
- `/architecture-structure-audit backend`: Enfoque profundo en `apps/backend/` (servidor, rutas, servicios, persistencia).
- `/architecture-structure-audit frontend`: Enfoque en `apps/frontend/` (catálogo, backoffice, estado).
- `/architecture-structure-audit regression`: Verificación histórica comparativa contra commits o tags anteriores.
- `/architecture-structure-audit pr`: Evaluación de impacto estructural para Pull Requests activos.

## Integración en el Flujo de Trabajo

La skill opera en dos modalidades complementarias:

1. **Auditoría periódica bajo demanda:** Evaluación del estado de salud estructural y generación de inventarios.
2. **Quality Gate de PR y Post-Refactor:** Validación obligatoria tras refactorizaciones o PRs que afecten el backend o frontend:
   - PR abierto → Tests → Seguridad → Lint → **`architecture-structure-audit`** → Markdown Quality Gate → Aprobación.

```text
                    ┌─────────────────────────────────┐
                    │  architecture-structure-audit   │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                          ¿Estructura saludable?
                               │           │
                              NO          YES
                               │           │
                               ▼           ▼
                          change-plan   Aprobación / Continuar
                               │
                               ▼
                         Implementación
                               │
                               ▼
                   architecture-structure-audit (Post-Check)
                               │
                               ▼
                    ¿Regresión / Monolith Relocated?
                               │         │
                              YES       NO
                               │         │
                               ▼         ▼
                            Corregir   Merge Certificado
```

## Formato de Salida y Gobernanza

- **Metodología Base:** Seguir estrictamente [methodology.md](../_shared/methodology.md).
- **Estructura de Hallazgos:** Usar el formato de [finding.md](../_shared/finding.md).
- **Plantilla de Reporte:** Generar el reporte canónico en `docs/audits/<fecha>/architecture/structure-audit.md` siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Ante hallazgos HIGH o CRITICAL, generar un plan de migración con [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado debe pasar obligatoriamente por [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx`.

## Referencias Especializadas

- [structural-metrics.md](references/structural-metrics.md): Catálogo detallado de fórmulas, umbrales y cálculo de acoplamiento.
- [monolith-detection.md](references/monolith-detection.md): Criterios de identificación de God Files, God Classes y carpetas cajón de sastre.
- [coupling-and-cohesion.md](references/coupling-and-cohesion.md): Principios de separación de capas y dirección de dependencias.
- [refactoring-guidelines.md](references/refactoring-guidelines.md): Guía de modularización incremental, patrones simples y prevención de traslados monolíticos.
