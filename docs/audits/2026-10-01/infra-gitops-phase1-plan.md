# Plan de Cambio — Fase 1: Corrección Funcional y Seguridad (`infra/` + `gitops/`)

> **Estado:** Pasos 1 (`GITOPS-001`), 2 (`INFRA-003`, `INFRA-012`) y 3 (`INFRA-007`) **EJECUTADOS Y VALIDADOS** el 2026-10-01. Paso 4 pendiente de ejecución.
> **Fecha:** 2026-10-01
> **Alcance:** 4 hallazgos P2. Dos en `gitops/`, dos en `infra/`.
> **Ids de origen:** `GITOPS-001`, `INFRA-003`, `INFRA-007`, `GITOPS-002` (ver *Anexo A*).
> **Heredado de:** auditoría de `infra/` y `gitops/` sobre el estado actual de `main`
> (`b3964bd`). Las conclusiones de auditorías previas **no** se arrastran como evidencia.

---

## 1. Objetivo y Justificación Técnica

Corregir cuatro defectos que producen **incumplimiento efectivo de controles de seguridad ya
declarados**. Ninguno es un fallo de arquitectura: `infra/` y `gitops/` declaran una postura
Zero-Trust y de ArgoCD determinista que la configuración real no cumple.

La tesis que ordena la fase es una sola: **en este repositorio hay controles documentados y
testeados que no ejercen efecto en runtime.** Los cuatro hallazgos son instancias de ese mismo
patrón, y por eso comparten fase:

| # | Hallazgo | Control declarado | Reality check |
| --- | :--- | :--- | :--- |
| 1 | `GITOPS-001` | Health checks Lua para CRDs (ADR-021) | ConfigMap con nombre equivocado → ArgoCD los **ignora en silencio** |
| 2 | `INFRA-003` | Acceso a nodos por SSH key (ADR-024) | Tres capas, **tres usuarios distintos**; ninguno coincide |
| 3 | `INFRA-007` | Supply chain verificada por checksum (ADR-024) | URL `latest` mutable **sin** checksum en la imagen de producción |
| 4 | `GITOPS-002` | Egress Zero-Trust L7 FQDN (Cilium) | Ingress **catch-all sin `Host`** en los dos entornos activos |

El orden es estrictamente **descendente por blast radius**: primero lo que hoy es un *no-op
silencioso* (1), luego lo que rompe la ejecución (2), después la integridad de suministro (3),
y por último la exposición de red (4), que es el único que altera tráfico en producción.

> [!IMPORTANT]
> **Los cuatro cambios son de configuración declarativa. Ninguno toca `apps/`.**
> El riesgo dominante no es la corrección sino la **regresión en la conectividad de los nodos
> ya aprovisionados** (pasos 2 y 3) y en el **enrutamiento de Ingress en producción** (paso 4).
> Ambos están cubiertos por ventanas de rollout y rollback explícitos (§5).

---

## 2. Alcance Detallado

- **Código de Aplicación (`apps/`):** sin cambios. Ningún hallazgo lo alcanza.
- **Infraestructura & Orquestación (`infra/`, `gitops/`):** objetivo principal.
  - `gitops/health-checks/argocd-cm-healthchecks.yaml` (paso 1)
  - `infra/ansible/ansible.cfg`, `infra/ansible/inventories/*/hosts.yaml`,
    `infra/opentofu/environments/proxmox/main.tf` (paso 2)
  - `infra/opentofu/environments/proxmox/variables.tf`, `terraform.tfvars.example`,
    `main.tf` (paso 3)
  - `gitops/environments/proxmox/values.yaml`,
    `gitops/environments/proxmox-preprod/values.yaml` (paso 4)
- **Automatización & CI/CD (`.github/`, `scripts/`, `Taskfile.yaml`):**
  - `Taskfile.yaml`: la tarea `gitops:health-checks` (líneas 262-265) debe pasar de `apply` de
    un ConfigMap homónimo a `patch` del ConfigMap canónico.
  - `.github/workflows/infra.yaml`: **sin cambios**. Se usa como gate de verificación.
- **Suites de Pruebas (`tests/`):** 2 archivos pasan de *verificación de existencia* a
  *verificación de efecto*. Es el núcleo de la fase: los gates actuales pasan sobre
  configuración inerte.
  - `tests/security/k8s_workload_hardening.test.ts:474-476` (health checks)
  - `tests/security/iac_baseline_security.test.ts` (contrato de usuario e imagen)
- **Documentación & ADRs (`docs/`):** este plan. Enmienda mínima en
  `docs/decisions/ADR-021` para eliminar la referencia a `SealedSecret`
  (`GITOPS-004`, detectado pero **fuera de alcance**: se documenta como deuda heredada en §7).

> [!NOTE]
> **Fuera de alcance deliberado:** `INFRA-006` (`alloy-proxmox-values.yaml`) y `INFRA-008`
> (`image_file_id`) son huérfanos confirmados, pero su eliminación **no altera postura de
> seguridad**. Corresponden a la Fase 2 (higiene). No se mezclan aquí para que cada PR sea
> revisable por un único motivo.

---

## 3. Matriz de Riesgos y Mitigación

- **Riesgo 1 — Bloqueo de acceso a los nodos (ALTO, pasos 2 y 3):**
  `main.tf` gobierna hosts **ya aprovisionados**. Un cambio en `user_account.username` o en
  `remote_user` no afecta a un LXC/VM existente hasta su recreación, pero sí al `state` de
  Terraform y al resultado de `ansible-playbook`. Si el usuario objetivo no existe en el host,
  **el playbook falla y el hardening nunca se aplica**.
  *Mitigación:* (a) el paso 2 es **aditivo**: declara explícitamente lo que ya ocurre por
  defecto, sin cambiar el valor efectivo; (b) se añade un *test de caracterización* que fija
  la igualdad de las tres capas **antes** de tocar nada; (c) `validate_hosts.yaml` se ejecuta
  como smoke test contra un host real antes de continuar al paso 3.

- **Riesgo 2 — Health checks que rompen la sync (ALTO, paso 1):**
  si el `patch` de `argocd-cm` escribe un script Lua sintácticamente inválido, ArgoCD puede
  fallar al evaluar *toda* la salud de *todas* las Applications, deteniendo el despliegue
  continuo de forma masiva.
  *Mitigación:* validar el Lua antes de aplicar; el paso incluye un dry-run con
  `argocd app list` antes del sync real; y aplicar **fuera** de la ventana de freeze de
  `app-proxmox` (viernes 18:00 UTC → lunes 08:00 UTC).

- **Riesgo 3 — Corte de tráfico en producción (ALTO, paso 4):**
  eliminar la regla catch-all del Ingress cambia el enrutamiento en el único entorno con
  tráfico real. Si algún consumidor accede por IP en lugar de por nombre DNS, se rompe.
  *Mitigación:* el paso 4.1 es un **bloqueo observacional** que impide ejecutar 4.2 sin evidencia
  previa; y el despliegue se realiza fuera de la `syncWindow` de producción.

- **Riesgo 4 — Falso positivo de "arreglado" (MEDIO, todos):**
  los gates actuales pasan sobre configuración inerte. Sin endurecer los tests, esta fase
  podría "completarse" sin cambiar el comportamiento real.
  *Mitigación:* **criterio de aceptación no negociable** — cada test debe fallar si se

---

## 4. Secuencia de Ejecución

Cada ítem es un **PR independiente y atómico**. No se mezclan dominios.

### Paso 1 — `GITOPS-001`: hacer efectiva la evaluación de salud de ArgoCD

**Defecto:** ArgoCD lee los scripts `resource.customizations.health.*` **únicamente** del
ConfigMap `argocd-cm` en el namespace `argocd`. El manifiesto crea `argocd-cm-healthchecks`,
un ConfigMap distinto que se aplica sin error y **se ignora**. `deployment.md:88-91` afirma
correctamente que "extienden `argocd-cm`" — la documentación describe la intención; el código
no la implementa.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 1.1 | Reescribir el manifiesto como **patch declarativo** de `argocd-cm` (claves `resource.customizations.health.*`), no como ConfigMap adicional | `gitops/health-checks/argocd-cm-healthchecks.yaml` |
| 1.2 | Migrar la tarea de `kubectl apply` a `kubectl patch --type merge` sobre el ConfigMap existente | `Taskfile.yaml:262-265` |
| 1.3 | **Endurecer el test:** exigir que el manifiesto sea un patch de `argocd-cm` y **no** defina un ConfigMap homónimo | `tests/security/k8s_workload_hardening.test.ts:474-476` |
| 1.4 | Enmienda mínima: eliminar la referencia a `SealedSecret` de la documentación de health checks | `docs/decisions/ADR-021` |

> [!WARNING]
> El paso 1.3 es el que convierte este ítem en una corrección real. Sin él, el plan declara
> un arreglo que el gate no puede distinguir de una regresión.

### Paso 2 — `INFRA-003`: unificar el contrato de usuario SSH

**Defecto:** tres capas, tres usuarios distintos. Verificado por lectura directa:

| Capa | Usuario | Evidencia |
| :--- | :--- | :--- |
| Ansible espera | `ubuntu` | `ansible.cfg:3` |
| OpenTofu LXC (4 de 5 recursos) | *default Proxmox* (`root`) | `main.tf:66, 220, 294` — `user_account` **sin `username`** |
| OpenTofu VM | `devops` | `main.tf:154` — `username = "devops"` |

`roles/container_runtime/tasks/main.yaml:43` ya usa `{{ ansible_user | default('ubuntu') }}`,
lo que confirma que la intención era desacoplar el usuario del hardcodeo.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 2.1 | **Test de caracterización primero:** afirmar que `remote_user` de Ansible y los `username` declarados en OpenTofu coinciden | `tests/security/iac_baseline_security.test.ts` |
| 2.2 | Declarar `username` **explícito** en los 4 `user_account` que hoy lo omiten, fijando el valor efectivo actual (sin cambiar comportamiento) y añadir el bloque faltante en `lifecycle.ignore_changes` | `infra/opentofu/environments/proxmox/main.tf` |
| 2.3 | Declarar el usuario por **host** en el inventario, sin depender del `remote_user` global | `infra/ansible/inventories/proxmox/hosts.yaml`, `lab/hosts.yaml` |
| 2.4 | Eliminar el host fantasma y la colisión de IP detectados (`pokedex-prod-01` duplica `10.10.13.100`; `pokedex-staging-01` no existe en OpenTofu) | `infra/ansible/inventories/proxmox/hosts.yaml` |

> [!IMPORTANT]
> 2.2 es **declarativo, no conductual**: explicita el valor que Proxmox ya aplica. El cambio de
> usuario efectivo (crear `devops` en los LXC) es una **fase posterior** con su propia
> migración de accesos, y queda explícitamente fuera de este plan.

### Paso 3 — `INFRA-007`: integridad de la imagen de VM de producción

**Defecto:** asimetría en la cadena de suministro. La plantilla LXC verifica SHA-256; la
imagen de VM de producción se descarga de una URL `latest` **sin checksum**, con
`proxmox_insecure = false` y API token, pero sin verificación del artefacto.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 3.1 | **Anclar la URL a una versión inmutable** (dejar de seguir `latest`) | `infra/opentofu/environments/proxmox/variables.tf` |
| 3.2 | Añadir `vm_image_checksum` + `vm_image_checksum_algorithm` siguiendo el patrón ya probado de LXC (`lxc_template_checksum`) | `variables.tf`, `main.tf:87-94` |
| 3.3 | Documentar ambas variables en el ejemplo, alineado con el bloque LXC ya existente | `terraform.tfvars.example` |
| 3.4 | Test que afirme **simetría**: si LXC tiene checksum, la VM debe tenerlo con el mismo algoritmo | `tests/security/iac_baseline_security.test.ts` |

### Paso 4 — `GITOPS-002`: cerrar el Ingress catch-all de los entornos activos

**Defecto:** `gitops/environments/proxmox/values.yaml:86` y `proxmox-preprod/values.yaml:87`
definen un segundo bloque `- host: ""`. `ingress.yaml:29-34` lo renderiza **sin `host:`** →

---

## 5. Estrategia de Rollback

Cada paso se revierte de forma independiente. Los pasos 2-4 tocan estado declarativo y **no
requieren migración de datos**.

| Paso | Reversión | Tiempo | Verificación post-reversión |
| :--- | :--- | :--- | :--- |
| 1 | `git revert` del commit | Inmediato | `kubectl get cm argocd-cm -n argocd -o yaml` y `argocd app list` |
| 2 | `git revert` (cambio declarativo, sin efecto en hosts vivos) | Inmediato | `ansible -i infra/ansible/inventories/proxmox/hosts.yaml all -m ping` |
| 3 | `git revert`; **no** revertir un `tofu apply` ya ejecutado sobre hosts de producción | Inmediato | `tofu plan` idempotente |
| 4 | `git revert` + `argocd app sync pokedex-proxmox` (fuera de `syncWindow`) | < 5 min | `curl -H "Host: pokedex.proxmox.internal.lan" https://<ingress>/readyz` |

> [!WARNING]
> **Restricción de ventana:** los pasos 1 y 4 **no** deben ejecutarse dentro de la
> `syncWindow` de `app-proxmox` (bloqueo de viernes 18:00 UTC a lunes 08:00 UTC, 62 h). El paso
> 4 además es el único que altera tráfico en producción: exige `manualSync: true` y una
> ventana de bajo tráfico.

---

## 6. Criterios de Aceptación y Checklist de Validación

- [ ] **Conmutación probada:** cada test nuevo falla al revertir su fix y pasa al reaplicarlo
      *(requisito no negociable, ver Riesgo 4)*
- [ ] `npm run lint:md -- docs/audits/2026-10-01/infra-gitops-phase1-plan.md` → **0 errores `MDxxx`**
- [ ] `npm run gitops:pin:check` → paridad 1:1 de `targetRevision` intacta
- [ ] `npm run gitops:verify-parity:strict` → paridad de digests intacta
- [ ] `task helm:lint` y render de los perfiles afectados sin error
- [ ] `tofu -chdir=infra/opentofu/environments/proxmox validate` → limpio
- [ ] `tofu fmt -check -recursive infra/opentofu` → limpio
- [ ] `ansible-playbook -i infra/ansible/inventories/proxmox/hosts.yaml infra/ansible/playbooks/*.yaml --syntax-check` → limpio
- [ ] `npm test` → suite completa verde
- [ ] Workflows `infra.yaml` y `security-*` en verde sobre el PR

> [!NOTE]
> **No se requieren** builds de aplicación, Playwright E2E ni `test:fuzz`. Según la matriz de
> impacto (§4 de `change-impact-matrix.md`), las filas **Infraestructura Helm**, **GitOps
> Declarativo** y **Plataforma / Ansible / OpenTofu** exentan explícitamente esos gates. La
> ejecución formal corresponde a `repo-impact` y `repo-refactor`.

---

## 7. Deuda Conocida No Resuelta por Esta Fase

Se documenta explícitamente para que no se pierda de vista:

| Id | Hallazgo | Motivo de exclusión |
| :--- | :--- | :--- |
| `INFRA-010` | PowerShell en monitoring | **Refutado.** Eliminado en `6b7b154` y protegido por `grafana_portability.test.ts` (PORT-001). No actuar. |
| `GITOPS-004` | ADR-021 documenta health check de `SealedSecret` inexistente | Puro; se corrige de paso en 1.4 |
| `INFRA-006`, `INFRA-008` | Huérfanos (`alloy-proxmox-values.yaml`, `image_file_id`) | Fase 2 (higiene) |
| `INFRA-001`, `INFRA-002` | Pinning de Ansible, política SSH | Fase 2 |
| `INFRA-009` | Semántica de `k8s_cluster_cidr` divergente entre inventarios | Fase 2 |
| `INFRA-011`–`014` | `values.prod.yaml` no desplegado, deriva documental | Fase 3 |
| — | Migrar LXC de `root` a usuario privilegiado | Fase 2, con ventana de migración propia |

---

## Anexo A — Trazabilidad de Evidencia

Verificación directa sobre `main` @ `b3964bd`. **Todo hallazgo sobre `infra/opentofu/` o
`infra/ansible/` se leyó archivo por archivo**: el índice de búsqueda del entorno **no cubre
extensiones `.tf` ni `.cfg`**, lo que ya produjo un falso negativo en el análisis previo
(`image_file_id` y `lxc_template_checksum` devolvieron "sin resultados" pese a existir).

| Hallazgo | Evidencia primaria | Confianza |
| :--- | :--- | :--- |
| `GITOPS-001` | `gitops/health-checks/argocd-cm-healthchecks.yaml:12` (nombre) vs. `docs/operations/deployment.md:90` (contrato) | HIGH |
| `INFRA-003` | `ansible.cfg:3`; `main.tf:66,154,220,294`; `container_runtime/tasks/main.yaml:43` | HIGH |
| `INFRA-007` | `variables.tf:48-52` (URL `latest`); `main.tf:87-94` (sin checksum) vs. `main.tf:15-16` (LXC con checksum) | HIGH |
| `GITOPS-002` | `gitops/environments/proxmox/values.yaml:86`; `proxmox-preprod/values.yaml:87`; `ingress.yaml:29-34` | HIGH |
| `INFRA-012` (en paso 2.4) | `inventories/proxmox/hosts.yaml:15,32,35` | HIGH |

regla catch-all: cualquier `Host` entrante se enruta a la aplicación. Ambos entornos tienen
además `tls: []`. `values.prod.yaml` y `aws/values.yaml` **sí** restringen por dominio.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 4.1 | Verificar en runtime que ningún consumidor accede por IP; documentar la evidencia | — (observación previa obligatoria) |
| 4.2 | Retirar el bloque `host: ""` de ambos entornos | `gitops/environments/proxmox/values.yaml`, `proxmox-preprod/values.yaml` |
| 4.3 | Test que prohíba reglas de Ingress sin `host` en cualquier entorno desplegable | `tests/security/network_policies_security.test.ts` |

> [!CAUTION]
> 4.1 es un **bloqueo**: sin confirmar que todo el tráfico entra por FQDN, 4.2 es un corte de
> servicio. Si hay consumidores por IP, la alternativa es un host explícito de backup en lugar
> de la eliminación.

  revierte el fix. Se verifica conmutando el valor antes de cerrar el PR.

- **Riesgo 5 — Checksum de Debian que no corresponde al artefacto (MEDIO, paso 3):**
  fijar `sha256` sobre la URL `latest` **no** sirve: el artefacto cambia en cada publicación.
  Un checksum incorrecto provocaría un fallo de `apply` en el peor momento.
  *Mitigación:* anclar **primero** la URL a una versión inmutable, obtener el checksum de esa
  URL exacta y recién entonces fijar ambos. El orden está grabado en §4.
