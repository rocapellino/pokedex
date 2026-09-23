# Plan de Cambio Específico

## 1. Objetivo y Justificación Técnica

[Descripción clara del cambio, motivación y componentes involucrados]

## 2. Alcance Detallado

- **Código de Aplicación (`apps/`):**
- **Infraestructura & Orquestación (`infra/`, `gitops/`):**
- **Automatización & CI/CD (`.github/`, `scripts/`, `Taskfile.yml`):**
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

- [ ] Compilación limpia en monorepo (`npm run build`)
- [ ] Validación estricta de tipos y linters (`npm run typecheck` / `npm run lint`)
- [ ] Suite de pruebas completa (`npm test`)
- [ ] Verificación de seguridad y secretos (`npm run secrets:audit-rotation`)
- [ ] Paridad de imágenes GitOps (`npm run gitops:verify-parity`)
- [ ] CI / Workflows validados
- [ ] Documentación sincronizada
