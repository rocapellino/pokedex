# Plan de Cambio — Migración a Node.js 24 LTS (`AUD-DEP-NODE-001`)

> **Estado:** Propuesto (snapshot fechado; el avance se sigue en el issue `AUD-DEP-NODE-001`)
>
> **Fecha de captura:** 2026-10-07
>
> **Commit base:** `3b4271b` (`main` tras #642)
>
> [!IMPORTANT]
> Este documento es evidencia histórica. No es SSOT: las versiones vigentes residen en
> `.tool-versions`, `.nvmrc`, `package.json` y las imágenes base de `apps/*/Dockerfile`.

**Hallazgo origen:** `AUD-DEP-NODE-001` del [baseline 2026-10-07](baseline.md).
**Skill responsable de la ejecución:** `repo-refactor` (el cambio preserva el comportamiento observable).
**Modelo de estados:** el cambio solo afecta al estado candidato (`MAIN`) hasta que se publique la imagen y se promueva en GitOps ([state-model.md](../../../.agents/skills/_shared/state-model.md)).

---

## 1. Objetivo y Justificación Técnica

Actualizar el runtime de Node.js 22 a Node.js 24 (LTS activa) en el backend, el stage de build del
frontend, el entorno local y los workflows de CI.

Evaluación cuádruple (`repo-modernize`):

| Alternativa | Veredicto |
| :--- | :--- |
| Mantener Node 22 | Válido hasta el fin de soporte, pero acumula un pin de imagen desfasado y no resuelve el desajuste de npm. |
| **Actualizar in-place a Node 24** | **Recomendada.** Sin dependencias nativas en producción y con la suite completa en verde sobre Node 24. |
| Reemplazar por Bun u otro runtime | Descartada: sin ventaja medible y contradice los controles de seguridad, CI y supply chain existentes. |
| Eliminar | No aplica. |

Evidencia verificada en esta sesión:

| Hecho | Fuente |
| :--- | :--- |
| `node:24-alpine` resuelve a Node `24.21.0`, npm `11.19.0` y Alpine `3.24.2`, con el usuario `node` (UID 1000). | `docker run` sobre la imagen |
| `node:22-alpine` resuelve a Node `22.23.3`, npm `10.9.9` y el mismo Alpine. | `docker run` sobre la imagen |
| El repositorio declara `packageManager: npm@11.x`, pero el stage de build sobre Node 22 ejecuta `npm ci` con npm 10. Node 24 elimina ese desajuste. | `package.json`, versiones anteriores |
| El digest fijado hoy en ambos Dockerfile ya no es el vigente de `node:22-alpine`. | `docker buildx imagetools inspect` |
| La suite completa (924 casos) pasó sobre Node `24.19.0` local: 923 pasan, 0 fallan, 1 omitido. | [baseline §2](baseline.md) |
| Las dependencias de producción declaran `engines` compatibles (`>=16` a `>=20`); solo `@google/genai` y `protobufjs` tienen script de instalación, y el build usa `--ignore-scripts`. | `package-lock.json` |

Digest candidato de la imagen multi-arquitectura: `node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`.
Debe revalidarse al ejecutar, porque el tag se mueve.

---

## 2. Alcance Detallado

El test `tests/unit/node_version_consistency.test.ts` exige la misma versión mayor en `.nvmrc`,
`engines`, los Dockerfile y todos los workflows. Por eso la migración es **atómica**: no puede
hacerse por partes.

- **Código de Aplicación (`apps/`):**
  - `apps/backend/Dockerfile` y `apps/frontend/Dockerfile`: `FROM node:22-alpine@sha256:…` pasa a `node:24-alpine@sha256:…` (3 ocurrencias) y se actualiza el comentario de cabecera.
  - `apps/backend/package.json`, `apps/frontend/package.json` y `package.json`: `@types/node` pasa de `^22.13.0` a `^24` (última 24.x: `24.19.1`).
  - Sin cambios en `apps/*/src`.
- **Infraestructura & Orquestación (`infra/`, `gitops/`):**
  - Sin referencias a la versión de Node. No se modifican valores de Helm ni de GitOps en el PR.
  - La promoción posterior de la imagen reconstruida sigue el flujo de release (ver §4).
- **Automatización & CI/CD (`.github/`, `scripts/`, `Taskfile.yaml`):**
  - 13 workflows-paso con `node-version: '22'` (o `"22"`) y nombre de paso "Configurar Node.js 22 LTS": `change-impact` (2), `ci` (5), `ghcr-retention`, `github-security-linear-sync`, `performance-k6`, `security-dast-zap`, `sonar-linear-sync` y `web`.
  - `.nvmrc` pasa de `22` a `24`, `.tool-versions` de `nodejs 22.13.0` a la versión de la imagen, y `engines.node` de `>=22` a `>=24`. El `>=22` actual no contiene la cadena "24" y el test de consistencia fallaría.
  - Renovate (`renovate.json`) no fija la versión mayor de Node: no requiere cambios.
- **Suites de Pruebas (`tests/`):**
  - `tests/security/k8s_workload_hardening.test.ts` (regex `FROM node:22-alpine` y mensaje): actualizar a la versión nueva.
  - `tests/unit/node_version_consistency.test.ts`: se mantiene; es el test de regresión.
  - `tests/ci/lighthouse.test.ts` y comentarios de `tests/frontend/`: solo texto o fixtures, sin cambio de comportamiento.
  - `docs/testing/test-surface.*`: regenerar con `npm run test:surface:update` si cambia el inventario.
- **Documentación & ADRs (`docs/`):** referencias a "Node.js 22" en `README.md`, `SECURITY.md`, `.github/pull_request_template.md`, `.agents/skills/_shared/methodology.md` y las referencias de `repo-docs`, además de `docs/README.md`, `docs/api/API_SPECIFICATION.md`, `docs/architecture/` (4 archivos), `docs/best-practices/MEJORES_PRACTICAS_DOCKERFILE.md` (incluye los snippets con digest), `docs/devops/TOOLS_AND_TECH_STACK.md`, `docs/runbooks/HELM_DEPLOYMENT_GUIDE.md` y `docs/security/DEVSECOPS_AUDIT.md`. `ADR-023` requiere una enmienda fechada (declara `@types/node` alineado con el runtime Node 22) y `ADR-013` solo necesita actualizar su mención al runtime.

Obtener el inventario exacto antes de editar, excluyendo la evidencia histórica:

```bash
git grep -nIE "node:22|Node\.?js 22|Node 22|nodejs 22|node-version" -- . ':!docs/audits' ':!package-lock.json'
```

**Fuera de alcance:** durante el análisis aparecieron datos desactualizados que no dependen de Node
(`UID 1001` en `docs/api/API_SPECIFICATION.md` y `MONOREPO_STRUCTURE.md`, y `Express 4.21` en
`HELM_DEPLOYMENT_GUIDE.md`). Se tratan en un cambio documental aparte para no mezclar motivos.

**Radio de impacto del motor determinista:** el cambio toca `package.json` y `.github/workflows/`, que
son rutas globales de [`.github/ci-impact.yaml`](../../../.github/ci-impact.yaml). Se ejecuta el CI
completo (Full CI), incluido el escaneo de imagen con Trivy y la firma con Cosign.

---

## 3. Matriz de Riesgos y Mitigación

- **Riesgo 1 — Diferencias de comportamiento entre Node 22 y 24** (V8, undici, APIs deprecadas, `node:test`). El repositorio ya registra una diferencia real entre ambos en `tests/frontend/backoffice_controller.test.ts`, donde `mock.module` se cancelaba en CI con Node 22 y pasaba en local con Node 24. *Mitigación:* suite completa en CI sobre Node 24, Playwright E2E y `performance-k6`; la suite local ya pasó 924/924 sobre 24.19.0.
- **Riesgo 2 — Nueva superficie de CVE en la imagen base.** Un digest nuevo cambia los paquetes del sistema. *Mitigación:* Trivy y Dependency Review en CI (`CI_REQUIRED`); fijar el digest recién resuelto, no reutilizar el anterior.
- **Riesgo 3 — Tipos de `@types/node` 24 con TypeScript 7** pueden exponer errores nuevos. *Mitigación:* `npm run typecheck` y `npm run build`; si aparecen, corregir en el mismo PR o fijar `@types/node` a la versión que compile.
- **Riesgo 4 — npm 10 a npm 11 en el stage de build.** Cambia el cliente que ejecuta `npm ci`. *Mitigación:* `packageManager` declara npm 11; verificar que `npm ci` sea reproducible y que el stage `runner` (que elimina npm) siga arrancando.
- **Riesgo 5 — Entornos locales en Node 22.** `engines >=24` solo advierte salvo `engine-strict`. *Mitigación:* actualizar `.nvmrc` y `.tool-versions`; avisar en el PR.
- **Riesgo 6 — Verificación de imagen incompleta.** El build local del backend sobre Node 24 se lanzó pero se detuvo: `npm ci` dentro de Docker no terminó tras más de 15 minutos (probable lentitud de red del contenedor). *Mitigación:* es un gate `NOT_EXECUTED`; lo cubre el job de build de imagen en CI antes de mergear.
- **Riesgo 7 — Fechas de soporte no verificadas en línea.** El fin de soporte de Node 22 proviene del conocimiento del auditor. *Mitigación:* confirmarlo en la política oficial de Node antes de priorizar la fecha.

---

## 4. Secuencia de Ejecución

1. **Confirmar insumos:** revalidar el digest de `node:24-alpine`, la versión exacta de Node para `.tool-versions` y las fechas de soporte de la política oficial.
2. **Test primero (rojo):** cambiar solo `.nvmrc` a `24` y comprobar que `tests/unit/node_version_consistency.test.ts` falla. Es la regresión del cambio.
3. **Aplicar la migración (verde):** Dockerfiles, `engines`, `@types/node` (más lockfile), `.tool-versions` y los 13 pasos de workflow, con su nombre de paso. Ajustar el regex de `k8s_workload_hardening.test.ts`.
4. **Reglas de referencias inversas:** correr el `git grep` de §2 y justificar cada coincidencia restante.
5. **Artefactos derivados:** `npm run test:surface:update` solo si cambia el inventario.
6. **Documentación:** actualizar las referencias, enmendar ADR-023 con fecha y actualizar la mención de ADR-013, y pasar `lint:md` y `docs:validate`.
7. **PR único** con título `chore(runtime): migrar a Node.js 24 LTS`. Esperar Full CI en verde.
8. **Release y promoción (fuera del PR):** la imagen nueva se publica con digest, firma Cosign y SBOM; se promueve primero a pre-prod con el flujo de release (`gitops:pin` solo en ese flujo) y se valida `/readyz` y la métrica de errores antes de dar el hallazgo por `CLOSED`.

---

## 5. Estrategia de Rollback

El cambio no altera esquemas, datos ni contratos de API, así que el rollback no tiene estado que restaurar.

- **Antes de la promoción** (solo `MAIN`): `git revert` del merge del PR; no hay efecto en runtime.
- **Después de la promoción a pre-prod:** restaurar en `gitops/environments/proxmox-preprod/` el digest de imagen del release anterior y dejar que ArgoCD sincronice. La imagen anterior permanece firmada y retenida en GHCR.
- **Detonantes de reversión:** `/readyz` en rojo tras el rollout, aumento sostenido de errores 5xx o fallo del health check del pod.
- **Verificación de la reversión:** `npm run gitops:verify-parity` y comprobación de `/version` en el entorno.

---

## 6. Criterios de Aceptación y Checklist de Validación

Estado de cada gate al momento de redactar el plan:

- [ ] Test de regresión del hallazgo: `tests/unit/node_version_consistency.test.ts` falla con `.nvmrc` en 24 antes de migrar y pasa después — `NOT_EXECUTED`
- [ ] Regla de referencias inversas aplicada (`git grep` de §2) — `NOT_EXECUTED`
- [ ] `npm run typecheck` y `npm run lint` — `NOT_EXECUTED` tras el cambio
- [ ] `npm run build` — `NOT_EXECUTED` tras el cambio
- [ ] `npm test` y `npm run test:fuzz` — la suite pasó sobre Node 24.19.0 en el árbol auditado; repetir tras el cambio
- [ ] `npm audit` — sin vulnerabilidades en el árbol auditado; repetir tras actualizar `@types/node`
- [ ] Build de la imagen del backend sobre Node 24 — `NOT_EXECUTED` (prueba local detenida; ver riesgo 6) — `CI_REQUIRED`
- [ ] Trivy, Dependency Review, Semgrep y Gitleaks — `CI_REQUIRED`
- [ ] Playwright E2E y `performance-k6` — `CI_REQUIRED`
- [ ] `npm run gitops:verify-parity` — sin cambios en el PR; ejecutar en la promoción
- [ ] `npm run test:surface:check` — `NOT_EXECUTED` tras el cambio
- [ ] `npm run lint:md -- <archivos>` y `npm run docs:validate` — `NOT_EXECUTED` tras el cambio

Gates derivados de [change-impact-matrix.md](../../../.agents/skills/_shared/change-impact-matrix.md) §4:
Backend Core, Frontend SPA, Workflows de CI/CD, Dependencias Monorepo y Documentación, más el Full Gate propio de
un cambio transversal.
