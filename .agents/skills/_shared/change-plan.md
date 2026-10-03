# Plan de Cambio Específico

## 1. Objetivo y Justificación Técnica

[Descripción clara del cambio, motivación y componentes involucrados]

## 2. Alcance Detallado

- **Código de Aplicación (`apps/`):**
- **Infraestructura & Orquestación (`infra/`, `gitops/`):**
- **Automatización & CI/CD (`.github/`, `scripts/`, `Taskfile.yaml`):**
- **Suites de Pruebas (`tests/`):**
- **Documentación & ADRs (`docs/`):**

## 3. Matriz de Riesgos y Mitigación

- **Riesgo 1:** [Impacto potencial y estrategia de mitigación]
- **Riesgo 2:** [Impacto potencial y estrategia de mitigación]

## 4. Secuencia de Ejecución

1. [Paso 1: Preparación o refactor previo]
2. [Paso 2: Aplicación del cambio principal]
3. [Paso 3: Actualización de tests y contratos]
4. [Paso 4: Actualización documental]

## 5. Estrategia de Rollback

[Instrucciones exactas de reversión en caso de falla o degradación en runtime]

## 6. Criterios de Aceptación y Checklist de Validación

Los gates **no son fijos**: se derivan del dominio del cambio. No incluir gates de otros
dominios (por ejemplo, `secrets:audit-rotation` en un cambio de frontend) ni omitir los
exigidos.

1. Clasificar los archivos tocados con el motor determinista:

   ```bash
   npm run ci:detect-impact -- --files <archivo1>,<archivo2> --format markdown
   ```

2. Copiar aquí los gates de cada dominio afectado según la tabla §4 de
   [change-impact-matrix.md](change-impact-matrix.md).
3. Registrar cada gate con su estado real (`PASS`, `FAIL`, `CI_REQUIRED`, `NOT_EXECUTED`).

Siempre obligatorios, cualquiera sea el dominio:

- [ ] Test de regresión del hallazgo, si el cambio remedia uno (falla antes, pasa después)
- [ ] Regla de referencias inversas aplicada si se renombró, movió o eliminó algo ([change-impact-matrix.md](change-impact-matrix.md) §1.1)
- [ ] Artefactos derivados actualizados (fase *Actualizar* de `repo-lifecycle`)
- [ ] `npm run lint:md -- <archivos>` y `npm run docs:validate` si se tocó Markdown

Gates del dominio (derivados de la matriz):

- [ ] `<gate>`
