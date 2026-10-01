# Auditoría del Dev Container (`.devcontainer/`)

> **Estado:** Evidencia histórica de auditoría. No constituye SSOT del estado actual.
> **Fecha de captura:** 2026-09-30
> **Commit:** `278651dac1e8d8c57b5a78e54135d11bc6a8bb5c`
> **Rama:** `main`
> **Alcance:** `.devcontainer/` completo (2 archivos). Modo read-only, sin escrituras.
>
> [!IMPORTANT]
> La verdad operativa de este repositorio se extrae exclusivamente de `gitops/`, `infra/`,
> `docs/architecture/`, `apps/`, `scripts/` y `tests/`. Este documento congela el estado
> del Dev Container en el commit indicado y **no** debe usarse para derivar versiones,
> rutas o configuración vigente.

---

## 1. Resumen Ejecutivo

- **Total de hallazgos:** 8
- **P0 (Crítico):** 0
- **P1 (Alto):** 1
- **P2 (Medio):** 3
- **P3 (Bajo):** 4

**Conclusión:** `.devcontainer/` está bien planteado y **no presenta archivos obsoletos ni
basura**. Los 2 archivos que lo componen son necesarios y suficientes para la arquitectura
actual. El trabajo pendiente no es depuración, sino hacer explícito el contrato de
reproducibilidad y alinear el entorno con el modelo real de desarrollo Kubernetes/Compose.

Superficie auditada: `devcontainer.json` (58 líneas) y `devcontainer-lock.json` (19 líneas),
con 3 Features, 7 extensiones de VS Code, 4 puertos reenviados y 1 comando de
posteriorización.

---

## 2. Matriz de Hallazgos

| ID | Área | Evidencia | Riesgo / Impacto | P | Conf. | Acción |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `AUD-DEV-TOOLS-001` | Tooling | `devcontainer.json:6-19` sin `kind`; `Taskfile.yaml:178,181,182,188` | `task dev:k8s:up` no es reproducible dentro del contenedor | P1 | HIGH | `IMPROVE` |
| `AUD-DEV-TOOLS-002` | Seguridad | `devcontainer.json:7` + ausencia total de docs | Acceso al daemon Docker sin documentar en ninguna parte | P2 | HIGH | `KEEP + DOCUMENT` |
| `AUD-DEV-TOOLS-003` | Reproducibilidad | `devcontainer.json:8,12,13,17` | 4 valores `latest` contrastan con el lockfile fijado | P2 | HIGH | `IMPROVE` |
| `AUD-DEV-TOOLS-004` | Supply Chain | `devcontainer.json:5` | Tag de imagen base mutable | P2 | HIGH | `IMPROVE` |
| `AUD-DEV-TOOLS-005` | DX | `devcontainer.json:38` vs `docker-compose.dev.yaml:20` | Contrato de puertos implícito entre dos archivos | P3 | HIGH | `KEEP + DOCUMENT` |
| `AUD-DEV-TOOLS-006` | Rendimiento | `devcontainer.json:57` | Instalación de Chromium con `--with-deps` retrasa la creación | P3 | MEDIUM | `KEEP` |
| `AUD-DEV-TOOLS-007` | Tooling | `devcontainer.json:16` | Feature de proveedor distinto (`devcontainers-extra`) | P3 | MEDIUM | `KEEP + DOCUMENT` |
| `AUD-DEV-TOOLS-008` | Corrección | `devcontainer.json:9` | `enableNonRootDocker` declarado como cadena | P3 | HIGH | `KEEP_IMPROVE` |

---

## 3. Detalle del Hallazgo P1

### `AUD-DEV-TOOLS-001` `kind` no está declarado pese a ser requerido por el `Taskfile`

- **Área:** `.devcontainer/devcontainer.json`
- **Prioridad:** P1 | **Confianza:** HIGH | **Esfuerzo:** XS
- **Evidencia:** `devcontainer.json:6-19` (features declaradas);
  `Taskfile.yaml:178,181,182,188` (uso de `kind`)
- **Estado actual:** El Dev Container declara `kubectl` y `helm` mediante la Feature
  `kubectl-helm-minikube`, pero **no declara `kind`**. La búsqueda de `kind` en
  `devcontainer.json` no arroja coincidencias. Sin embargo, el `Taskfile.yaml` lo invoca
  en cuatro tareas:
  - `kind create cluster --config infra/k8s/kind-cluster.yaml`
  - `kind load docker-image pokedex-api:local --name pokedex-local`
  - `kind load docker-image pokedex-web:local --name pokedex-local`
  - `kind delete cluster --name pokedex-local`
- **Riesgo/impacto:** El perfil Kubernetes local (`task dev:k8s:up`) **no es reproducible
  dentro del Dev Container**: el entorno promete una cadena completa de herramientas
  Kubernetes pero omite la que crea el clúster. El usuario que entre al contenedor y
  ejecute el flujo documentado obtendrá un fallo por binario ausente, no por
  configuración.
- **Recomendación:** Declarar `kind` explícitamente. Alternativamente, documentar
  formalmente que es una dependencia externa del host; para un contenedor que se
  describe como autosuficiente, la primera opción es la correcta.
- **Verificación:** Tras el cambio, `kind version` debe resolverse dentro del contenedor y
  `task dev:k8s:up` debe completarse sin errores.
- **Impacto en documentación:** `.devcontainer/devcontainer.json` (pendiente)

> [!NOTE]
> Este hallazgo sube de P2 a P1 respecto al análisis inicial. Es el **único con impacto
> funcional**: el resto de hallazgos afecta a reproducibilidad, documentación o

## 4. Hallazgos P2 (resumen operativo)

- **`AUD-DEV-TOOLS-002` — Acceso al daemon Docker sin documentar.** La Feature
  `docker-outside-of-docker` concede al contenedor capacidad de operar sobre el daemon del
  host. Es funcionalmente necesaria: el `Taskfile` usa `docker compose`, builds y `docker
  run` de forma extensiva, por lo que **no se recomienda eliminarla**. El problema es que
  esa frontera de privilegio no está registrada en ninguna parte: la búsqueda de
  `devcontainer` en `docs/` no devuelve ningún documento. El riesgo existe y es
  inherente al modelo, no una vulnerabilidad accidental, pero debe quedar como decisión
  consciente.

- **`AUD-DEV-TOOLS-003` — Versiones `latest` con lockfile fijado.** Cuatro valores
  `latest` conviven con un lockfile que sí fija versión y digest:

  | Elemento | `devcontainer.json` | `devcontainer-lock.json` |
  | :--- | :--- | :--- |
  | `docker-outside-of-docker` | `latest` | `1.10.0` + SHA-256 |
  | `kubectl-helm-minikube` | `latest` | `1.3.1` + SHA-256 |
  | `helm` (anidado) | `latest` | (cubierto por la Feature) |
  | `go-task` | `latest` | `1.0.6` + SHA-256 |

  El lockfile actúa como segunda capa de integridad, pero la configuración declara
  intención distinta. Fijar las versiones desde el lockfile elimina la ambigüedad sin
  perder nada.

- **`AUD-DEV-TOOLS-004` — Imagen base mutable.** El tag
  `mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm` puede apuntar a una
  imagen distinta entre reconstrucciones aunque el repositorio no haya cambiado. Contrasta
  con el nivel de inmutabilidad que el repositorio aplica en Actions y en imágenes OCI.
  **No se recomienda fijar un digest manual** sin definir antes cómo se gestionará su
  actualización: un digest sin política de refresco se convierte en deuda silenciosa.

## 5. Hallazgos P3 (resumen operativo)

- **`AUD-DEV-TOOLS-005` — Contrato de puertos entre dos archivos.** El `forwardPorts`
  declara `3000` mientras `docker-compose.dev.yaml:20` publica
  `"${API_DEV_PORT:-3001}:3000"`. Verificado: **no es una inconsistencia sino una
  decisión consciente y comentada** (`3001` por defecto para evitar colisión con
  Grafana en `3000`). El `3000` del Dev Container corresponde al puerto interno del
  contenedor; el `3001` es el mapping al host desde Compose. Rebajado de P2 `REVIEW` a P3
  `KEEP + DOCUMENT`: el trabajo pendiente es escribir el contrato, no corregirlo.

- **`AUD-DEV-TOOLS-006` — Instalación de Playwright pesada.** El `postCreateCommand`
  ejecuta `playwright install --with-deps chromium`, que instala dependencias del sistema
  y retrasa la creación del contenedor. Está justificado: el repositorio tiene `test:e2e`
  y `test:a11y`. Se mantiene; si el objetivo fuera solo desarrollo, la instalación podría
  moverse a una tarea explícita.

- **`AUD-DEV-TOOLS-007` — Proveedor distinto para `go-task`.** Dos Features provienen de
  `ghcr.io/devcontainers/features` (oficial) y una de `ghcr.io/devcontainers-extra`.
  Proveedor distinto implica confianza y ciclo de versión distintos; conviene registrarlo
  para futuras revisiones de supply chain.

- **`AUD-DEV-TOOLS-008` — Tipo de dato incorrecto.** `enableNonRootDocker` se declara como
  cadena (`"true"`). La Dev Container CLI lo acepta, pero el tipo correcto es booleano.
  Cosmético, sin impacto de comportamiento.

---

## 6. Elementos Verificados Conformes

- **Sin secretos ni credenciales.** No hay tokens, contraseñas ni material sensible.
- **Sin configuración privilegiada explícita.** No hay `privileged: true`, `runArgs`
  peligrosos ni montajes de la raíz del host.
- **`minikube` deshabilitado correctamente** (`"minikube": "none"`): el repositorio usa
  Kind, no Minikube.
- **`kubectl` y `helm` tienen consumidores reales:** más de una decena de tareas del
  `Taskfile` los invocan, y GitHub Actions los utiliza en validación de infraestructura.
- **`devcontainer-lock.json` está correctamente formado:** las 3 Features declaran
  `version`, `resolved` e `integrity` con SHA-256.
- **Las 7 extensiones de VS Code son pertinentes** al stack (SonarLint, ESLint, Docker,
  Playwright, YAML, TOML, GitLens). Ninguna es claramente obsoleta. GitLens es de
  productividad, no de proyecto: no justifica eliminarla.
- **`postCreateCommand` usa `npm ci --ignore-scripts`**, coherente con el modelo de
  seguridad del repositorio.
- **Dos archivos son suficientes.** No hay scripts auxiliares ni configuración adicional
  que retirar.

---

## 7. Dependencias Externas de esta Auditoría

> [!WARNING]
> Tres hallazgos **no pueden cerrarse** revisando solo `.devcontainer/`:
>
> - `AUD-DEV-TOOLS-001` requiere conocer el contrato de `Taskfile.yaml` y
>   `infra/k8s/kind-cluster.yaml`.
> - `AUD-DEV-TOOLS-005` requiere alinear `devcontainer.json` con `docker-compose.dev.yaml`
>   y `docker-compose.yaml`.
> - `AUD-DEV-TOOLS-002` requiere una decisión de política de entorno de desarrollo.
>
> Corregirlos antes de revisar esos directorios sería prematuro, con el mismo riesgo de
> introducir drift que se vio en la auditoría de `.agents/`.

---

## 8. Criterios de Aceptación de una Remediación Futura

- [ ] `kind version` resuelve dentro del Dev Container
- [ ] `task dev:k8s:up` completa el ciclo Kind + Helm sin dependencias del host
- [ ] Ningún valor `latest` en `devcontainer.json`, con versiones alineadas al lockfile
- [ ] Existe documentación del Dev Container que registre el acceso al daemon Docker
- [ ] El contrato de puertos `3000` ↔ `3001` queda escrito
- [ ] `enableNonRootDocker` declarado como booleano
- [ ] `npm run lint:json` (o el gate equivalente) sin errores sobre ambos JSON

> [!NOTE]
> La decisión de política de entorno (acceso al daemon Docker) es precisamente lo que habilita
> el uso de Compose y Kind, pero ninguno de los dos está completo sin `kind`.

---
