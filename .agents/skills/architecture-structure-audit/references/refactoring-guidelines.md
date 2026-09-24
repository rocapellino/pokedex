# Guía Práctica de Refactorización Arquitectónica

Este documento define la metodología para transformar módulos degradados o monolitos incipientes en arquitecturas modulares, simples y mantenibles dentro de `rocapellino/pokedex`.

---

## 1. El Principio Rector de Simplicidad

> [!IMPORTANT]
> **"Preferir la estructura más simple que mantenga separación clara de responsabilidades, bajo acoplamiento y alta cohesión."**

Antes de sugerir o implementar una refactorización, aplique el filtro de justificación pragmática:

- **¿Requiere Clean Architecture o Hexagonal?** NO, a menos que existan múltiples adapters intercambiables (ej. 3 bases de datos SQL distintas o múltiples protocolos de transporte simultáneos). Para una API REST con PostgreSQL y fallback en memoria, una separación estándar de tres capas (Rutas → Servicios → Repositorios) es suficiente y reduce drásticamente el boilerplate.
- **¿Requiere DDD (Domain-Driven Design) completo?** NO, si el modelo no tiene lógica de negocio altamente compleja con entidades ricas y agregados transaccionales complejos. Usar entidades anémicas con esquemas Zod y servicios de dominio claros es preferible.
- **¿Requiere CQRS o Event-Driven?** NO, si la carga de lectura y escritura no presenta una asimetría extrema que justifique modelos de lectura y escritura separados.
- **¿Requiere Microservicios?** NO, el monorepo modular actual provee excelente aislamiento de despliegue y desarrollo sin la sobrecarga operativa de redes distribuidas.

---

## 2. Técnicas de Descomposición Recomendadas

### A. Extracción de Enrutadores (*Extract Router*)

- **Cuándo aplicar:** Cuando el archivo principal de la app o un enrutador gigante supera las 300 LOC o acumula endpoints de dominios distintos.
- **Procedimiento:**
  1. Identificar prefijos de ruta comunes (`/pokemons`, `/auth`, `/ai`, `/health`).
  2. Crear un nuevo archivo en `src/routes/<dominio>.ts`.
  3. Exportar un `express.Router()` configurado.
  4. Montar el enrutador en `server.ts` con `app.use('/<ruta>', <dominio>Router)`.

### B. Extracción de Lógica de Negocio (*Extract Service*)

- **Cuándo aplicar:** Cuando los handlers de Express contienen más de 20 líneas de transformaciones, validaciones de reglas o llamadas a servicios de red/IA.
- **Procedimiento:**
  1. Extraer la lógica pura a una función en `src/services/<dominio>.ts`.
  2. Hacer que la función de servicio reciba parámetros primitivos o DTOs tipados (sin recibir `req` o `res`).
  3. Retornar los datos procesados o un tipo `Result<T, E>`.
  4. En el handler HTTP, limitarse a:
     - Validar entrada con Zod.
     - Invocar el servicio.
     - Mapear el resultado al código HTTP correspondiente (`200`, `201`, `400`, `404`).

### C. Extracción de Repositorio (*Extract Repository*)

- **Cuándo aplicar:** Cuando un servicio de dominio contiene sentencias directas de SQL, llamadas complejas a Drizzle o manipulación de conexiones de base de datos.
- **Procedimiento:**
  1. Mover las consultas Drizzle a un módulo en `src/db/` o `src/services/db/`.
  2. Exponer operaciones atómicas (`findById`, `save`, `listWithPagination`).
  3. El servicio de negocio invoca el repositorio y aplica las reglas de negocio sobre los datos devueltos.

### D. Extracción de Middlewares Especializados

- **Cuándo aplicar:** Cuando un handler o servidor ejecuta verificaciones repetidas de seguridad, cabeceras, límites de tasa o auditoría.
- **Procedimiento:**
  1. Crear un middleware estándar `(req, res, next) => void`.
  2. Registrarlo globalmente o aplicarlo a rutas específicas antes del handler final.

---

## 3. Protocolo de Ejecución con Change Plan

Cualquier refactorización derivada de un hallazgo **HIGH** o **CRITICAL** debe seguir el siguiente flujo obligatorio:

1. **Diseño previo:** Elaborar un plan de cambio usando [change-plan.md](../../_shared/change-plan.md).
2. **Evaluación de impacto:** Ejecutar `repo-impact` para prever archivos afectados, dependencias y riesgos de rotura.
3. **Batería de pruebas previa (Baseline):** Ejecutar `npm test` y certificar que la suite completa esté en verde antes de modificar el código.
4. **Modificación incremental en pasos pequeños:**
   - Crear los nuevos módulos/servicios.
   - Redirigir el código existente hacia los nuevos módulos.
   - Ejecutar `npm test` en cada paso.
   - Eliminar el código legado una vez verificado el reemplazo.
5. **Verificación post-refactor (Control de Regresión):**
   - Ejecutar nuevamente `architecture-structure-audit` para certificar:
     - Que el archivo original se redujo sanamente.
     - Que no se introdujo el antipatrón **Monolith Relocated** en los nuevos archivos creados.
     - Que no se crearon dependencias circulares.
6. **Plan de Reversión (Rollback):**
   - Cada commit de refactorización debe ser atómico y reversible mediante `git revert` sin dejar el repositorio en un estado intermedio roto.
