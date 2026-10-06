# 🧰 Guía del DevContainer

Entorno de desarrollo reproducible definido en [`.devcontainer/devcontainer.json`](../../.devcontainer/devcontainer.json), con las features fijadas en [`.devcontainer/devcontainer-lock.json`](../../.devcontainer/devcontainer-lock.json).

## 📑 Índice

- [1. Requisito: abrir el repositorio desde una ruta Linux](#1-requisito-abrir-el-repositorio-desde-una-ruta-linux)
- [2. Qué incluye](#2-qué-incluye)
- [3. Puertos](#3-puertos)
- [4. Gobernanza de supply chain](#4-gobernanza-de-supply-chain)
- [5. Diagnóstico de problemas frecuentes](#5-diagnóstico-de-problemas-frecuentes)

---

## 1. Requisito: abrir el repositorio desde una ruta Linux

El devcontainer **debe abrirse desde una ruta Linux** (WSL2, macOS o Linux). En Windows, usar la extensión WSL de VS Code y abrir la carpeta con `code .` desde la terminal de WSL.

**No debe abrirse desde una ruta de disco de Windows** (`C:\...`): el contenedor no arrancaría, porque `${localWorkspaceFolder}` valdría una ruta de Windows que no es un destino de montaje Linux válido.

### Por qué el workspace se monta en la misma ruta que el host

El devcontainer usa `docker-outside-of-docker`: el contenedor comparte el daemon de Docker del host. Los bind mounts de `docker-compose.dev.yaml` (por ejemplo `./apps/frontend/dist` y la configuración de Alloy) los resuelve **ese daemon, contra rutas del host**.

Por eso `workspaceMount` y `workspaceFolder` usan `${localWorkspaceFolder}` como destino. Con cualquier otra ruta (por ejemplo `/workspace/<nombre>`), el daemon no encuentra el directorio en el host y los volúmenes llegan **vacíos, sin error visible**. El contrato lo fija `DEVCONTAINER-005` en [`tests/security/devcontainer_supply_chain.test.ts`](../../tests/security/devcontainer_supply_chain.test.ts).

## 2. Qué incluye

| Componente | Origen | Uso |
| :--- | :--- | :--- |
| Node.js 22 LTS | Imagen base `typescript-node` fijada por digest | Backend, frontend y scripts |
| Cliente Docker | Feature `docker-outside-of-docker` | `docker build` y `docker compose` contra el daemon del host |
| `kubectl` y `helm` | Feature `kubectl-helm-minikube` | Versiones alineadas con [`.tool-versions`](../../.tool-versions) |
| Kind | Feature `devcontainers-extra/kind` | Clúster local (`task dev:k8s:up`, [`infra/k8s/kind-cluster.yaml`](../../infra/k8s/kind-cluster.yaml)) |
| Task | Feature `devcontainers-extra/go-task` | Ejecución de tareas de [`Taskfile.yaml`](../../Taskfile.yaml) |
| Playwright (Chromium) | `postCreateCommand` | Pruebas E2E y de accesibilidad |

## 3. Puertos

| Puerto | Servicio | Nota |
| :--- | :--- | :--- |
| `3000` | API Backend | Puerto interno del contenedor; en el host, `docker-compose.dev.yaml` publica `${API_DEV_PORT:-3001}:3000` |
| `8080` | Frontend Web | Se abre en el navegador al reenviarse |
| `5432` | PostgreSQL | Reenvío silencioso |
| `6379` | Redis | Reenvío silencioso |

## 4. Gobernanza de supply chain

- **Imagen base:** tag LTS fijado por digest SHA-256, igual que los Dockerfiles de `apps/`.
- **Features:** `kind` y `go-task` con versión explícita. `docker-outside-of-docker` queda en `latest` porque solo instala el cliente.
- **Renovate:** el manager `devcontainer` propone los bumps de imagen y features con revisión manual. Renovate **no** detecta las versiones de binarios de las features (`kubectl`, `helm`, `kind`, `go-task`): se actualizan a mano y el test exige la paridad de `kubectl` y `helm` con `.tool-versions`.
- **Lock:** si un PR de Renovate no actualiza `devcontainer-lock.json`, regenerarlo con `devcontainer upgrade` (CLI de devcontainers).
- **Contrato:** `DEVCONTAINER-001` a `005` en el test mencionado.

## 5. Diagnóstico de problemas frecuentes

| Síntoma | Causa probable | Acción |
| :--- | :--- | :--- |
| El contenedor no arranca al abrir el repo | El repositorio se abrió desde `C:\...` | Abrirlo desde WSL2 (sección 1) |
| El frontend o Alloy arrancan sin contenido ni configuración | Bind mounts resueltos contra una ruta inexistente en el host | Verificar que `workspaceMount` conserve `${localWorkspaceFolder}` como destino |
