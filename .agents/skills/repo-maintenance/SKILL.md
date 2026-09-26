---
name: repo-maintenance
description: Ejecutar un health check periódico y convertir hallazgos en backlog accionable.
---

# repo-maintenance

## Objetivo

Ejecutar controles periódicos de salud técnica (*health checks*), evaluar regresiones respecto al baseline histórico y estructurar los hallazgos en un backlog accionable y priorizado para `rocapellino/pokedex`.

## Alcance y Verificaciones de Dominio

- **Monitoreo de Salud Periódico:** Coordinar subconjuntos de `repo-security`, `repo-dependencies`, `repo-quality`, `repo-ci` y `repo-docs`.
- **Detección de Regresiones:** Comparar el estado actual contra los informes base documentados en `docs/audits/` para identificar reaparición de problemas resueltos o degradación de métricas (utilizando `repo-metrics` como soporte de telemetría).
- **Higiene y Limpieza del Repositorio:**
  - **Archivos y Código Huérfano:** Localizar archivos, componentes y utilidades no referenciadas en el monorepo.
  - **Gobernanza Sistemática de Scripts y Tooling (ADR-020):**
    - **Demarcación de Runtime:** El monorepo prohíbe scripts `.sh` no autorizados (restringidos estrictamente a `scripts/dr_verify_restore.sh`). Toda automatización auxiliar debe escribirse en TypeScript fuertemente tipado (`scripts/*.ts`) o exponerse en la CLI canónica (`Taskfile.yml`).
    - **Protocolo de Gobernanza en 7 Fases:** Ningún script se elimina o modifica sin atravesar el ciclo:
      `1. DISCOVER` (inventario) → `2. CLASSIFY` (taxonomía) → `3. EVIDENCE` (matriz de consumidores cruzados) → `4. PROPOSE` (plan / ADR) → `5. APPROVE` (revisión humana) → `6. EXECUTE` (refactor / eliminación) → `7. VALIDATE` (Quality Gates 100% PASS).
    - **Taxonomía de Estados:**
      - `KEEP`: Activo, necesario y con consumidores vigentes.
      - `KEEP_SIMPLIFY`: Necesario pero con runtime o lógica simplificable.
      - `REPLACE`: Su función debe ser asumida por una herramienta estándar (`Taskfile`, `npm`, `git`).
      - `CONSOLIDATE`: Duplica lógica con otro script; requiere unificación en módulo común.
      - `DEPRECATE`: En retirada programada con aviso de obsolescencia.
      - `DELETE`: Sin consumidores directos ni indirectos, o asociado a tecnología retirada.
      - `MOVE`: Ubicación errónea fuera de su contexto de paquete o dominio.
      - `REVIEW`: Requiere arbitraje de arquitectura o validación operativa.
    - **Matriz de Consumidores Cruzados:** Todo análisis debe evaluar dependencias en `package.json`, `Taskfile.yml`, `.github/workflows/**`, `Dockerfile*`, `docker-compose*`, `infra/**`, `gitops/**`, `tests/**`, `docs/**` y `.agents/skills/**`.
  - **Higiene de Archivos de Ignorado (`.*ignore`):** Contrastar `.gitignore`, `.dockerignore`, `.helmignore`, etc., contra la estructura real para evitar fuga de artefactos o secretos.
  - **Configuraciones Heredadas / Sustituidas:** Archivos residuales de migraciones pasadas o configs duplicadas entre Compose y K8s/Helm.
  - *(Nota: Para dependencias npm huérfanas, delegar formalmente en `repo-dependencies unused`)*.
- **Gestión del Backlog Técnico:**
  - Clasificar ítems pendientes según impacto (P0-P3) y esfuerzo.
  - Marcar formalmente hallazgos como cerrados únicamente cuando exista prueba de resolución en código o CI.
  - Reabrir hallazgos históricos si una prueba de regresión falla o un contrato se rompe.
- **Higiene Operacional:** Validar rotación de credenciales, frescura de backups en Google Drive/NAS y estado de certificados TLS.
- **Modo No Intrusivo:** Operación estrictamente analítica y de reporte; toda supresión de archivos exige plan de reversibilidad previo.

## Comandos

- `/repo-maintenance`: Health check general y diagnóstico del estado de mantenimiento.
- `/repo-maintenance cleanup`: Diagnóstico y preparación de candidatos de limpieza segura (archivos huérfanos, configs residuales, `.*ignore`).
- `/repo-maintenance scripts`: Auditoría de cumplimiento de la política de scripts (ADR-020).
- `/repo-maintenance weekly`: Chequeo rápido semanal enfocado en dependencias, alertas de seguridad y estado de CI.
- `/repo-maintenance monthly`: Evaluación mensual exhaustiva de arquitectura, higiene de Docker/Kubernetes y deuda técnica.
- `/repo-maintenance delta`: Análisis enfocado exclusivamente en las desviaciones respecto al último baseline guardado.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Coordinar acciones correctivas con `repo-impact` utilizando [change-plan.md](../_shared/change-plan.md).
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes de mantenimiento, backlog) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
