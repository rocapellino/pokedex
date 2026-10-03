---
name: repo-dependencies
description: Gobernar el ciclo de vida de dependencias npm: overrides, CVEs, huérfanas y planes de actualización. Usar al tocar package.json o package-lock.json, ante alertas SCA o PRs de Renovate.
---

# repo-dependencies

## Objetivo

Gobernar el ciclo de vida de dependencias en el monorepo `rocapellino/pokedex`, asegurando reproducibilidad de lockfiles, minimización de riesgos de seguridad (SCA/CVEs), eliminación de librerías huérfanas y control estricto de overrides.

## Alcance y Verificaciones de Dominio

- **Fuentes de Verdad:** `package.json` raíz, `apps/backend/package.json`, `apps/frontend/package.json` y `package-lock.json`.
- **Compatibilidad de Stack:** Garantizar compatibilidad estricta con el runtime declarado en `.tool-versions`, el gestor de `packageManager` (`package.json`) y TypeScript estricto.
- **Auditoría de Overrides:** Revisar la sección `"overrides"` en `package.json` para verificar si las resoluciones forzadas siguen siendo necesarias o introducen inestabilidad.
- **Detección de Vulnerabilidades (SCA):** Integración con npm audit, Dependabot y herramientas SCA para clasificar CVEs reales frente a falsos positivos.
- **Dependencias Huérfanas y Duplicadas:**
  - Identificar paquetes instalados pero sin imports activos en código fuente.
  - Detectar versiones discrepantes o duplicadas entre los workspaces `backend` y `frontend`.
- **Estrategia de Actualizaciones:**
  - Proponer actualizaciones en lotes pequeños (semver incrementales) con validación automática de suites de tests.
  - Verificar que las dependencias actualizadas no rompan builds de Docker ni generen incompatibilidad en contenedores de producción.
- **Reproducibilidad:** Mantener un árbol de dependencias determinista y lockfile sincronizado.

## Comandos

- `/repo-dependencies`: Diagnóstico integral del estado de paquetes y librerías del monorepo.
- `/repo-dependencies security`: Auditoría especializada en vulnerabilidades SCA, parches y CVEs.
- `/repo-dependencies unused`: Detección de paquetes declarados sin uso en backend o frontend.
- `/repo-dependencies upgrade-plan`: Generación de un plan secuencial y seguro de actualización de librerías.

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Planes de Cambio:** Todo cambio en `package.json` o lockfile requiere modelado previo con [change-plan.md](../_shared/change-plan.md) y validación de impacto con `repo-impact`.
