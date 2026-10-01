# Plan de Cambio — Fase 2: Reproducibilidad, Integridad y Coherencia de Contratos

> **Estado:** Propuesta. Pendiente de revisión y aprobación antes de ejecutar.
> **Fecha:** 2026-10-01
> **Base:** `main` @ `4f2bb23` (Fase 1 completa: #413, #414, #415 mergeados)
> **Alcance:** 4 hallazgos. Dos en `infra/ansible/`, dos en `infra/helm/pokedex/`.
> **Predecesor:** [`infra-gitops-phase1-plan.md`](infra-gitops-phase1-plan.md)

---

## 1. Objetivo y Justificación Técnica

La Fase 1 corrigió **controles que no ejercían efecto**: health checks inertes, checksum
ausente, wildcard de Ingress. La Fase 2 ataca la capa inmediatamente inferior: aquello que
hace que la infraestructura sea **irreproducible e internamente incoherente**.

| # | Hallazgo | Propiedad rota | Síntoma |
| --- | :--- | :--- | :--- |
| 2.1 | `INFRA-001` | **Reproducibilidad** | Dos `apply` en fechas distintas producen hosts distintos |
| 2.2 | `INFRA-002` | **Coherencia declarada** | La política SSH efectiva es más débil que la declarada |
| 2.3 | `INFRA-005` | **Integridad de suministro** | Plantillas sin soporte para fijar digest |
| 2.4 | `INFRA-009` | **Coherencia semántica** | Una variable significa dos cosas según el inventario |

> [!IMPORTANT]
> **Todos los hallazgos fueron verificados por lectura directa contra `main` @ `4f2bb23`.**
> Ninguno se arrastra de análisis previos. La verificación **corrigió el alcance** en dos casos
> (§2.1), que es precisamente el riesgo metodológico detectado en Fase 1: el índice de búsqueda
> no cubre `.tf` ni `.cfg`.

---

## 2. Alcance Detallado

### 2.1 Correcciones de alcance aplicadas tras la verificación

> [!WARNING]
> El borrador inicial asumía que `INFRA-005` afectaba a "Postgres, Redis y Seed".
> **La evidencia lo refuta parcialmente:**

| Imagen | Estado real | Verificación |
| :--- | :--- | :--- |
| Postgres | 🟢 **Ya pinneada** | `values.yaml:129` — `tag: "16-alpine@sha256:cf78e766…"` |
| PgBouncer | 🟢 **Ya pinneada** | `values.yaml:158` — `tag: "1.22.0@sha256:aa8a38b7…"` |
| Redis | 🟢 **Ya pinneada** | `values.yaml:182` — `tag: "7-alpine@sha256:ff02b58f…"` |
| Rclone (gdrive) | 🟢 **Ya pinneada** | `values.yaml:421` — usa el patrón `if .digest` correcto |
| **Seed Job** | 🔴 **Mutable** | `values.yaml:350` — `tag: "1.0.0"`, sin digest |
| **API / Web** | 🟡 **Digest vacío por defecto** | `values.yaml:18,77` — `digest: ""`; GitOps sí lo fija |

**Corrección 1:** `INFRA-005` se reduce a **una plantilla** (`seed-job.yaml`), no tres. Postgres,
Redis y PgBouncer ya incorporan el digest dentro del campo `tag`.

**Corrección 2:** el hallazgo real no es "faltan digests" sino que **cuatro plantillas carecen
del soporte condicional** `{{ if .digest }}@{{ .digest }}{{ else }}…`. Ninguna puede migrar a un
campo `digest` dedicado sin reescribir el `tag` completo.

### 2.2 Alcance final

- **Código de Aplicación (`apps/`):** sin cambios.
- **Infraestructura (`infra/ansible/`, `infra/helm/pokedex/`):** objetivo. 6 archivos.
- **Automatización & CI/CD (`.github/`, `scripts/`, `Taskfile.yaml`):** sin cambios.
  `.github/workflows/infra.yaml` se usa como gate.
- **Suites de Pruebas (`tests/`):** 2 archivos. Cada PR añade gates que validan **efecto**.
- **Documentación (`docs/`):** este plan + enmienda mínima en `infra/ansible/README.md`.

### 2.3 Hallazgos incluidos

| # | Hallazgo | Sev. | Archivo principal |
| --- | :--- | :--- | :--- |
| 2.1 | `INFRA-001` — pinning de collections | **P2** | `infra/ansible/requirements.yaml` |
| 2.2 | `INFRA-002` — política SSH | **P2** | `infra/ansible/ansible.cfg` |
| 2.3 | `INFRA-005` — soporte de digest | **P3** | `infra/helm/pokedex/templates/seed-job.yaml` |
| 2.4 | `INFRA-009` — semántica de CIDR | **P2** | `infra/ansible/roles/firewall/vars/main.yaml` |

> [!NOTE]
> **Reasignado a Fase 3 (higiene):** `INFRA-006`, `INFRA-008`, `INFRA-011`–`014`,
> `GITOPS-003`–`005`. No alteran postura de seguridad; mezclarlos daría a cada PR dos motivos
> de revisión.

---

## 3. Matriz de Riesgos y Mitigación

- **Riesgo 1 — Reintroducir `INFRA-003` (ALTO, paso 2.2):** `ansible.cfg` es también el archivo
  que corregimos. Un descuido al reordenar sus directivas podría devolver `remote_user` a un valor
  que no coincide con el que crean los LXC, revirtiendo el hallazgo ya mergeado en #414.
  *Mitigación:* el test `INFRA-003` (mergeado) queda como **red de seguridad en CI**. El paso 2.2
  **no toca `remote_user`**; sólo resuelve la contradicción SSH.

- **Riesgo 2 — Pinar una versión incompatible (MEDIO, paso 2.1):** fijar `community.general` a una
  versión que no resuelva con `ansible-core==2.17.7` rompe el `syntax-check` de los 9 playbooks.
  *Mitigación:* se determina la versión **más reciente compatible** ejecutando
  `ansible-galaxy collection install` + `syntax-check` antes de fijar. El fallo es ruidoso y
  temprano, no silencioso.

- **Riesgo 3 — Romper el firewall al renombrar la variable (ALTO, paso 2.4):** renombrar
  `k8s_cluster_cidr` sin actualizar el rol `firewall` en el mismo commit deja las reglas
  `6443/10250/2379-2380` sin `src`, con lo que UFW **deniega** el tráfico y el clúster queda
  inalcanzable.
  *Mitigación:* renombrado **atómico** en un único PR: variable nueva, rol, ambos inventarios
  y test. Nunca en commits separados.

---

## 4. Secuencia de Ejecución

Cada ítem es un **PR independiente y atómico**. El orden es ascendente por riesgo.

### Paso 2.1 — `INFRA-001`: pinning de collections Ansible

**Defecto:** `requirements.yaml` declara `>=1.5.4` y `>=8.5.0`. Un rango abierto permite que cada
ejecución resuelva a la última versión publicada. El CI (`infra.yaml:188`) instala sin fijar, por
lo que **el pipeline mismo es no determinista**.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 2.1.1 | Determinar la versión más reciente de `ansible.posix` y `community.general` compatible con `ansible-core==2.17.7` | — (investigación) |
| 2.1.2 | Sustituir `>=` por `==` con la versión verificada | `infra/ansible/requirements.yaml` |
| 2.1.3 | Ejecutar `ansible-galaxy collection install -r` + `syntax-check` de los 9 playbooks | — (verificación) |
| 2.1.4 | Gate que prohíba rangos abiertos (`>=`, `>`, `~=`, `*`) en `requirements.yaml` | `tests/security/iac_baseline_security.test.ts` |

### Paso 2.2 — `INFRA-002`: política SSH única

**Defecto:** `ansible.cfg` declara `host_key_checking = True` (línea 10) y a la vez
`ssh_args = … StrictHostKeyChecking=accept-new` (línea 24). Ambas compiten por la misma propiedad
y la efectiva es la **más débil**: la configuración aparenta verificación estricta mientras acepta
claves de hosts nuevos sin confirmación.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 2.2.1 | **Decidir y documentar** la política. Recomendación: `accept-new` es defendible para un clúster efímero, siempre que la excepción quede explícita y argumentada | `docs/decisions/ADR-024` |
| 2.2.2 | Eliminar la directiva contradictoria y dejar una sola fuente de verdad, con comentario que explique el porqué | `infra/ansible/ansible.cfg` |
| 2.2.3 | Gate que prohíba declarar `host_key_checking` y `StrictHostKeyChecking` con políticas incompatibles | `tests/security/iac_baseline_security.test.ts` |

> [!NOTE]
> `remote_user` **no se modifica** en este paso. Es el contrato que `INFRA-003` acaba de fijar.

### Paso 2.3 — `INFRA-005`: soporte de digest en las plantillas restantes

**Defecto:** sólo `api-deployment.yaml:86`, `web-deployment.yaml:52` y
`backup-gdrive-cronjob.yaml:31` soportan el patrón condicional de digest. Las otras cuatro
(`postgres`, `pgbouncer`, `redis`, `seed`) concatenan `repository:tag` sin override.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 2.3.1 | Extender el patrón `{{ if .digest }}@{{ .digest }}{{ else }}:{{ .tag }}{{ end }}` a las 4 plantillas | `postgres-statefulset.yaml`, `pgbouncer-deployment.yaml`, `redis-deployment.yaml`, `seed-job.yaml` |
| 2.3.2 | Declarar `digest: ""` en los values correspondientes, alineando el esquema con API/Web/Rclone | `infra/helm/pokedex/values.yaml` |
| 2.3.3 | Migrar el valor por defecto de Postgres/Redis/PgBouncer del `tag` con digest incrustado al campo `digest` dedicado (mismo digest, misma imagen) | `values.yaml` |
| 2.3.4 | Gate: toda imagen renderizada debe contener digest **o** pertenecer a la lista explícita de excepciones de desarrollo | `tests/security/supply_chain_security.test.ts` |

> [!CAUTION]
> 2.3.3 es un cambio de **representación, no de contenido**: el digest no cambia, sólo el campo
> que lo transporta. El render resultante debe ser idéntico; el gate de paridad
> (`gitops:verify-parity:strict`) lo verifica.

### Paso 2.4 — `INFRA-009`: una sola semántica para el CIDR del clúster

**Defecto:** `k8s_cluster_cidr` significa cosas distintas según el inventario:

| Inventario | `mgmt_cidr` | `k8s_cluster_cidr` | Semántica implícita | Efecto |
| :--- | :--- | :--- | :--- | :--- |
| `proxmox` | `10.10.13.0/24` | `10.10.13.0/24` | Red de **nodos** | Regla sin efecto: ya permitida por `mgmt_cidr` |
| `lab` | `10.0.0.0/16` | `10.244.0.0/16` | **CIDR de pods** k3s | Restringe la API a IPs de pod, que nunca la consumen |

Su único consumidor es `roles/firewall/tasks/main.yaml:43`, que lo aplica como `src` de los puertos
`6443`, `10250` y `2379-2380`.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 2.4.1 | Introducir `k8s_nodes_cidr` como variable canónica, conservando `k8s_cluster_cidr` como alias deprecado | `roles/firewall/vars/main.yaml` |
| 2.4.2 | Leer la variable nueva con fallback a la antigua, para no romper inventarios externos | `roles/firewall/vars/main.yaml` |
| 2.4.3 | Declarar `k8s_nodes_cidr` en ambos inventarios **sin cambiar el valor efectivo actual** | `inventories/proxmox/hosts.yaml`, `lab/hosts.yaml` |
| 2.4.4 | Gate: la variable de red del clúster debe documentarse y distinguirse de `mgmt_cidr` | `tests/security/iac_baseline_security.test.ts` |
| 2.4.5 | Documentar el valor correcto para lab como **tarea pendiente** | `infra/ansible/README.md` |

---

## 5. Estrategia de Rollback

Todos los pasos son de configuración declarativa y **aditivos** (test primero, luego el fix).
Ninguno requiere migración de datos ni de estado.

| Paso | Reversión | Tiempo | Verificación post-reversión |
| :--- | :--- | :--- | :--- |
| 2.1 | `git revert` | Inmediato | `ansible-galaxy collection install -r` + `syntax-check` |
| 2.2 | `git revert` | Inmediato | `ansible -i <inventario> all -m ping` |
| 2.3 | `git revert` | Inmediato | `helm template` idéntico al previo (mismo digest renderizado) |
| 2.4 | `git revert` (atómico: variable + rol + inventarios) | Inmediato | `ansible-playbook security_hardening.yaml --check` |

> [!WARNING]
> El paso 2.2 afecta a la **próxima conexión SSH**. No requiere ventana de mantenimiento, pero
> conviene aplicarlo fuera de una ejecución de playbook en curso.

---

## 6. Criterios de Aceptación y Checklist de Validación

Aplicados a **cada uno de los 4 PR**:

- [ ] **Conmutación probada:** el test nuevo falla al revertir su fix y pasa al reaplicarlo
- [ ] `npm test` → suite completa verde
- [ ] `npm run lint:md -- <archivos .md modificados>` → 0 errores `MDxxx`
- [ ] Workflows afectados en verde (`infra.yaml`, `security-*`)

Gates específicos por PR:

| PR | Gates adicionales |
| :--- | :--- |
| 2.1 | `ansible-playbook --syntax-check` de los 9 playbooks |
| 2.2 | `INFRA-003` (mergeado) sigue verde |
| 2.3 | `gitops:verify-parity:strict` + render idéntico pre/post |
| 2.4 | `ansible --syntax-check` verde |

> [!NOTE]
> **No se requieren** builds de aplicación, Playwright E2E ni `test:fuzz`. Las filas
> **Plataforma / Ansible / OpenTofu** y **Infraestructura Helm** de la matriz de impacto exoneran
> explícitamente esos gates.

---

## 7. Deuda Conocida No Resuelta por Esta Fase

| Id | Hallazgo | Motivo de exclusión |
| :--- | :--- | :--- |
| `INFRA-010` | PowerShell en monitoring | **Refutado.** Eliminado en `6b7b154`, protegido por PORT-001. No actuar. |
| `INFRA-006`, `INFRA-008` | Huérfanos | Fase 3 (higiene, no seguridad) |
| `INFRA-011`–`014` | `values.prod.yaml` no desplegado, deriva documental | Fase 3 |
| `GITOPS-003`–`005` | README GitOps, ADR SealedSecret, gap de CI | Fase 3 |
| — | Migrar LXC a usuario sin `root` | Imposible con el provider actual |
| — | Corregir el **valor** de `k8s_nodes_cidr` en lab | Requiere el rango real de nodos, no está en el repo |
| — | `Taskfile.yaml` sin clasificar en `ci-impact.yaml` | Activa fail-closed; afecta al motor de forma transversal |

---

## Anexo A — Trazabilidad de Evidencia

Verificación por **lectura directa** sobre `main` @ `4f2bb23`. El índice de búsqueda no cubre
`.cfg` ni `.tf`, por lo que todo hallazgo de estas rutas se leyó archivo por archivo.

| Hallazgo | Evidencia primaria | Confianza |
| :--- | :--- | :--- |
| `INFRA-001` | `infra/ansible/requirements.yaml:5,7` (`>=1.5.4`, `>=8.5.0`) | HIGH |
| `INFRA-002` | `ansible.cfg:10` vs `ansible.cfg:24` | HIGH |
| `INFRA-005` | `values.yaml:129,158,182` (ya pinneadas) vs `:350` (mutable); sin override en `postgres-statefulset.yaml:34`, `pgbouncer-deployment.yaml:45`, `redis-deployment.yaml:46`, `seed-job.yaml:40` | HIGH |
| `INFRA-009` | `inventories/proxmox/hosts.yaml` vs `lab/hosts.yaml`; consumidor único en `roles/firewall/tasks/main.yaml:43` | HIGH |

> [!WARNING]
> 2.4.3 es deliberadamente **conservador**: no corrige el valor de lab, lo renombra. Cambiarlo
> exigiría conocer el rango real de nodos del laboratorio, dato que no está en el repositorio.
> Endurecer el valor sin ese dato sería suposición, no corrección.

- **Riesgo 4 — Estrechar el CIDR en lab (MEDIO, paso 2.4):** corregir `10.244.0.0/16` (CIDR de
  pods) a la red de nodos **estrecha** la regla.
  *Mitigación:* se introduce la variable canónica **sin cambiar el valor efectivo**; en lab se
  mantiene el valor actual hasta confirmar el rango real de nodos.

- **Riesgo 5 — Falso positivo de "arreglado" (MEDIO, todos):** el patrón de Fase 1 se repite:
  gates que validan existencia y no efecto.
  *Mitigación:* **criterio no negociable heredado** — cada test debe fallar al revertir su fix.
