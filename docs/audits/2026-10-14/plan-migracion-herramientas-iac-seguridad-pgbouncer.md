# Plan de Implementación: Actualización de Herramientas IaC, Seguridad y PgBouncer

> **Estado:** Histórico (documento auxiliar de planificación; su ejecución se llevará a cabo en una sesión posterior)
>
> **Fecha de captura:** 2026-10-14
>
> **Rama de trabajo:** `docs/plan-migracion-herramientas-iac-seguridad`
>
> [!IMPORTANT]
> Este documento es evidencia histórica y de planificación técnica generada tras el análisis del Dependency Dashboard ([Issue #586](https://github.com/rocapellino/pokedex/issues/586)) y los PRs cerrados de Renovate. No es SSOT: el estado vigente reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.

---

## 1. Resumen Ejecutivo y Alcance

### A. Diagnóstico y Contexto

Tras completar y certificar con éxito las dos migraciones estructurales de la plataforma (adopción de `js-yaml v5` en [PR #880](https://github.com/rocapellino/pokedex/pull/880) y la actualización a `PostgreSQL 17 / Valkey 8` en [PR #882](https://github.com/rocapellino/pokedex/pull/882) y [PR #884](https://github.com/rocapellino/pokedex/pull/884)), el análisis del Dependency Dashboard ([Issue #586](https://github.com/rocapellino/pokedex/issues/586)) identifica un conjunto de dependencias auxiliares pendientes de actualización.

### B. Delimitación de Alcance: Exclusión Explícita de Helm v4

Se decide de forma deliberada y vinculante **excluir la actualización de Helm (`helm: v3.22.0` → `v4.3.0`)**:

1. **Incompatibilidad de Runtime en GitOps:** El controlador de ArgoCD en el clúster pre-prod de Proxmox VE opera de forma nativa con el motor Helm 3 (`apiVersion: v2`). Actualizar el CLI en CI provocaría una divergencia de renderizado con el clúster real.
2. **Riesgo Operativo:** Helm 4 constituye un *major release* con cambios de sintaxis en el CLI y en el manejo de releases OCI, no justificado en este ciclo.

### C. Los Tres Ejes de Actualización (Tracks)

```mermaid
flowchart TD
    subgraph Track 1: Contenedores de Soporte
        T1["pgbouncer/pgbouncer: 1.22.0 -> 1.25.2"] --> V1["infra/helm/pokedex/values.yaml (tag & digest)"]
        V1 --> S1[".github/workflows/security-trivy.yaml"]
    end

    subgraph Track 2: Tooling Node.js
        T2["katex: ^0.18.11 -> ^0.19.0"] --> V2["package.json & package-lock.json (root)"]
        V2 --> S2["Pruebas de lint y renderizado"]
    end

    subgraph Track 3: Herramientas CLI con Checksum SEC-001
        T3A["yannh/kubeconform: v0.6.7 -> v0.8.0"]
        T3B["stackrox/kube-linter: v0.7.2 -> v0.8.3"]
        T3C["kyverno/kyverno: v1.12.5 -> v1.19.1"]
        T3D["gitleaks/gitleaks: 8.24.2 -> 8.30.1"]
        T3A & T3B & T3C --> V3A[".github/workflows/infra.yaml"]
        T3D --> V3B[".github/workflows/security-gitleaks.yaml"]
    end

    Track 1 --> G["Validación Integral (Quality Gate)"]
    Track 2 --> G
    Track 3 --> G
```

---

## 2. Breaking Changes y Consideraciones Técnicas por Track

### Track 1: PgBouncer (`1.22.0` → `1.25.2`)

| Componente | Estado Actual | Estado Objetivo | Impacto y Mitigación |
| :--- | :--- | :--- | :--- |
| **Imagen OCI** | `pgbouncer/pgbouncer:1.22.0` | `pgbouncer/pgbouncer:1.25.2` | **Bajo.** En `values.yaml` PgBouncer está en `enabled: false` (el pool activo es gestionado por Drizzle / `node-postgres` según [ADR-011](../../decisions/ADR-011-persistence-drizzle-orm-and-pgbouncer.md)). |
| **Digest Pinning** | `sha256:b736de2483bf...` | `sha256:c0c55b277858...` (o el digest multi-arch oficial más reciente) | Debe actualizarse simultáneamente en `infra/helm/pokedex/values.yaml` y en `.github/workflows/security-trivy.yaml` para satisfacer `WF-001`. |
| **Gobernanza Renovate** | `RENOVATE-003` / `RENOVATE-004` | Regla `custom.regex` en `renovate.json` | El regex existente ya incluye `pgbouncer/pgbouncer` y detecta la transición de tag y digest. |

### Track 2: KaTeX (`^0.18.11` → `^0.19.0`)

| Aspecto | Versión Actual (`^0.18.11`) | Versión Objetivo (`^0.19.0`) | Consideración Técnica |
| :--- | :--- | :--- | :--- |
| **Strict Mode & Fonts** | Advertencias laxas en caracteres faltantes. | Reporta `symbolNotInFont` como error estricto (`strict: "error"`). | Verificar que scripts de generación de reportes o tests de markdown no pasen callbacks que retornen `null` o `undefined`. |
| **Ubicación en Repo** | Raíz (`package.json`) | Raíz (`package.json`) | No forma parte del bundle cliente (`apps/frontend`) ni del backend (`apps/backend`). Solo impacta utilidades de renderizado y documentación. |

### Track 3: Herramientas CLI con Checksum Criptográfico (`SEC-001`)

Por diseño del contrato de seguridad de la cadena de suministro (**regla `SEC-001`**), estas herramientas no pueden ser actualizadas automáticamente por Renovate, ya que se descargan vía `curl` y se validan con `sha256sum --check --strict`:

| Herramienta | Versión Actual | Versión Objetivo | Archivo Afectado | Cambios Relevantes / Comprobaciones |
| :--- | :--- | :--- | :--- | :--- |
| **`kubeconform`** | `v0.6.7` | `v0.8.0` | `.github/workflows/infra.yaml` | Soporte actualizado para esquemas OpenAPI de Kubernetes 1.30 y 1.31. Se mantienen los flags `-strict -summary -ignore-missing-schemas`. |
| **`kube-linter`** | `v0.7.2` | `v0.8.3` | `.github/workflows/infra.yaml` | Reglas de linting actualizadas para seguridad en pods. Debe verificarse compatibilidad contra el archivo de configuración `.kube-linter.yaml`. |
| **`kyverno CLI`** | `v1.12.5` | `v1.19.1` | `.github/workflows/infra.yaml` | Sintaxis de subcomando `kyverno test infra/k8s/kyverno-test/`. Verificar si se requieren flags adicionales para schemas de admission policy. |
| **`gitleaks`** | `8.24.2` | `8.30.1` | `.github/workflows/security-gitleaks.yaml` | Detección extendida de firmas de tokens (GitHub PATs, GCP API Keys, etc.). Verificar que no genere falsos positivos sobre fixtures de prueba. |

---

## 3. Procedimiento de Ejecución Paso a Paso

### Paso 1: Aprovisionamiento de Worktree Canónico

Siguiendo la gobernanza estricta (`.agents/rules/worktree-governance.md`):

```bash
npm run worktree:create -- --type chore --slug upgrade-iac-security-tools
```

### Paso 2: Actualización de Track 1 (PgBouncer)

1. En `infra/helm/pokedex/values.yaml`:

   ```yaml
   pgbouncer:
     enabled: false
     replicaCount: 1
     image:
       repository: pgbouncer/pgbouncer
       tag: "1.25.2"
       digest: "sha256:<digest_sha256_pgbouncer_1.25.2>"
       pullPolicy: IfNotPresent
   ```

2. En `.github/workflows/security-trivy.yaml`:
   - Actualizar la referencia en la matriz de escaneo de imágenes para que coincida exactamente con el digest declarado.

### Paso 3: Actualización de Track 2 (KaTeX)

1. Actualizar la dependencia en la raíz:

   ```bash
   npm install katex@^0.19.0 --save-exact=false
   ```

2. Ejecutar validación de formato y pruebas de markdown:

   ```bash
   npm run lint
   npm test -- tests/unit/
   ```

### Paso 4: Actualización de Track 3 (CLI Binaries + SHA-256)

Para cada una de las 4 herramientas, obtener el archivo oficial de release, calcular su checksum SHA-256 y reemplazar las variables en los workflows:

```bash
# Ejemplo: Kubeconform v0.8.0
curl -sL https://github.com/yannh/kubeconform/releases/download/v0.8.0/kubeconform-linux-amd64.tar.gz -o /tmp/kubeconform.tar.gz
sha256sum /tmp/kubeconform.tar.gz

# Ejemplo: Kube-Linter v0.8.3
curl -sL https://github.com/stackrox/kube-linter/releases/download/v0.8.3/kube-linter-linux.tar.gz -o /tmp/kube-linter.tar.gz
sha256sum /tmp/kube-linter.tar.gz

# Ejemplo: Kyverno CLI v1.19.1
curl -sL https://github.com/kyverno/kyverno/releases/download/v1.19.1/kyverno-cli_v1.19.1_linux_x86_64.tar.gz -o /tmp/kyverno.tar.gz
sha256sum /tmp/kyverno.tar.gz

# Ejemplo: Gitleaks 8.30.1
curl -sL https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz -o /tmp/gitleaks.tar.gz
sha256sum /tmp/gitleaks.tar.gz
```

Actualizar los bloques en `.github/workflows/infra.yaml` y `.github/workflows/security-gitleaks.yaml` preservando los comentarios `# renovate: datasource=...`.

---

## 4. Matriz de Verificación y Criterios de Aceptación

| Compuerta de Calidad | Comando de Verificación | Resultado Requerido |
| :--- | :--- | :--- |
| **Trivy Image Scan Supply Chain** | `npx tsx --test tests/security/supply_chain_trivy_scan.test.ts` | `PASS`: las 4 imágenes desplegadas coinciden con la matriz de Trivy. |
| **Contrato Renovate de Versiones Anotadas** | `npx tsx --test tests/contracts/delivery/renovate_config_contract.test.ts` | `PASS`: `RENOVATE-004` y `RENOVATE-005` detectan todas las versiones. |
| **Paridad GitOps Estricta** | `npm run gitops:verify-parity:strict` | `PASS`: paridad criptográfica 1:1 entre manifiestos. |
| **Linting General de Código y Config** | `npm run lint` | `PASS`: 0 errores en backend, frontend y raíz. |
| **Linting de Markdown** | `npm run lint:md` | `PASS`: 0 violaciones MDxxx en documentación. |
| **Gobernanza Documental** | `npm run docs:validate` | `PASS`: 100% sin drift. |
| **Superficie de Pruebas** | `npm run test:surface:check` | `PASS`: sincronización perfecta sin drift en inventarios. |

---

## 5. Estrategia de Rollback

En caso de fallo en CI o rechazo en la compuerta de calidad:

1. Las herramientas son independientes entre sí: se puede aislar la actualización en commits separados por track (`chore(helm): pgbouncer`, `chore(deps): katex`, `chore(ci): update security cli tools`).
2. Si una herramienta CLI genera un falso positivo (ej. Gitleaks en un fixture legítimo o Kyverno en una regla de admisión), se puede revertir puntualmente esa versión restituyendo el tag y el hash SHA-256 anterior documentado en este plan.
