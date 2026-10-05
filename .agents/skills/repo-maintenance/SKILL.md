---
name: repo-maintenance
description: "Fase 6 (Depurar) y health checks periódicos: limpieza segura, scripts (ADR-020) y auditorías delta contra hallazgos abiertos. Usar para limpieza de huérfanos, revisiones semanales o mensuales, o antes de cerrar una rama."
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
    - **Demarcación de Runtime:** El monorepo prohíbe scripts `.sh` no autorizados (restringidos estrictamente a `scripts/dr_verify_restore.sh`). Toda automatización auxiliar debe escribirse en TypeScript fuertemente tipado (`scripts/*.ts`) o exponerse en la CLI canónica (`Taskfile.yaml`).
    - **Protocolo de Depuración:** Ningún script se elimina o modifica sin atravesar las 7 fases del [protocolo único de depuración](../_shared/cleanup-protocol.md).
    - **Taxonomía de Estados:**
      - `KEEP`: Activo, necesario y con consumidores vigentes.
      - `KEEP_SIMPLIFY`: Necesario pero con runtime o lógica simplificable.
      - `REPLACE`: Su función debe ser asumida por una herramienta estándar (`Taskfile`, `npm`, `git`).
      - `CONSOLIDATE`: Duplica lógica con otro script; requiere unificación en módulo común.
      - `DEPRECATE`: En retirada programada con aviso de obsolescencia.
      - `DELETE`: Sin consumidores directos ni indirectos, o asociado a tecnología retirada.
      - `MOVE`: Ubicación errónea fuera de su contexto de paquete o dominio.
      - `REVIEW`: Requiere arbitraje de arquitectura o validación operativa.
    - **Matriz de Consumidores Cruzados:** La definida en [cleanup-protocol.md](../_shared/cleanup-protocol.md) §2, más la política de scripts de ADR-020.
  - **Higiene de Archivos de Ignorado (`.*ignore`):** Contrastar `.gitignore`, `.dockerignore`, `.helmignore`, etc., contra la estructura real para evitar fuga de artefactos o secretos.
  - **Detección de Archivos Temporales y Residuos:** Inspeccionar y verificar el cumplimiento de [repository-hygiene.md](../../rules/repository-hygiene.md): detectar artefactos temporales fuera de `tmp/`, residuos en el working tree (`git status --short`), archivos `.tmp`, `.bak` o copias de depuración huérfanas, y vigilar que `tmp/` no albergue activos permanentes.
  - **Convención de Extensión YAML:** ningún archivo YAML nuevo debe crearse con extensión `.yml`. La extensión canónica es `.yaml`. Verificar además que no reaparezcan archivos `.yml` fuera del allowlist del gate `npm run lint:yaml`, y que toda excepción vigente esté documentada con su motivo (hoy no hay casos vigentes). Los literales YAML de proyectos externos (por ejemplo `sigstore/gitsign/.../release.yaml`) no se renombran por tratarse de claims de supply chain.
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
- `/repo-maintenance cleanup`: Fase 6 (*Depurar*) del ciclo de vida. Diagnóstico y preparación de candidatos de limpieza segura (archivos huérfanos, configs residuales, `.*ignore`, código muerto) según [cleanup-protocol.md](../_shared/cleanup-protocol.md).
- `/repo-maintenance scripts`: Auditoría de cumplimiento de la política de scripts (ADR-020).
- `/repo-maintenance weekly`: Chequeo rápido semanal enfocado en dependencias, alertas de seguridad y estado de CI.
- `/repo-maintenance monthly`: Evaluación mensual exhaustiva de arquitectura, higiene de Docker/Kubernetes y deuda técnica.
- `/repo-maintenance delta`: Análisis enfocado exclusivamente en las desviaciones respecto al último baseline guardado.

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Planes de Cambio:** Coordinar acciones correctivas con `repo-impact` utilizando [change-plan.md](../_shared/change-plan.md).
