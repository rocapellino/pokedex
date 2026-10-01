# Plan de Cambio — Fase 3: Higiene, Cobertura de CI y Deriva Documental

> **Estado:** Propuesta. Pendiente de revisión y aprobación antes de ejecutar.
> **Fecha:** 2026-10-01
> **Base:** `main` @ `a434393` (Fase 2 completa: #418, #419 mergeados; #420, #421 abiertos)
> **Alcance:** 6 hallazgos. Higiene, cobertura de CI y exactitud documental.
> **Predecesores:** [Fase 1](infra-gitops-phase1-plan.md) · [Fase 2](infra-gitops-phase2-plan.md)

---

## 1. Objetivo y Justificación Técnica

Las fases anteriores corrigieron **incumplimientos de seguridad y reproducibilidad**. La Fase 3
atiende lo que queda: artefactos que no sirven para nada, rutas que el CI no ejercita, y
documentación que afirma cosas distintas de lo que el código hace.

Es la fase de menor riesgo y mayor retorno: casi nada aquí puede romper runtime, pero dos
de sus hallazgos hacen que **la plataforma se valide menos de lo que se cree**.

| Dominio | Hallazgo | Impacto |
| --- | :--- | :--- |
| Cobertura de CI | `GITOPS-005` | Un target **activo** no se renderiza en CI |
| Motor de CI | `CI-001` | `Taskfile.yaml` activa fail-closed en cada PR |
| Higiene | `INFRA-006`, `INFRA-008` | Dos artefactos sin consumidores |
| Exactitud documental | `INFRA-011`, `GITOPS-003` | Gates que validan un perfil que no se despliega |

> [!IMPORTANT]
> **La verificación volvió a corregir el alcance de este plan**, por tercera vez desde la Fase 1.
> `GITOPS-004` (ADR-021 documentando un health check de `SealedSecret` inexistente) **ya
> está cerrado**: se corrigió en el paso 1.4 de la Fase 1 y el texto actual del ADR lo
> declara explícitamente como retirado. No hay trabajo pendiente en ese punto.

---

## 2. Alcance Detallado

### 2.1 Hallazgos verificados

| # | Hallazgo | Sev. | Evidencia verificada |
| --- | :--- | :--- | :--- |
| 3.1 | `GITOPS-005` | **P2** | `infra.yaml:74-75` renderiza `proxmox` y `aws`; **no** `proxmox-preprod` |
| 3.2 | `CI-001` | **P3** | `ci-impact.yaml` no clasifica `Taskfile.yaml` en ninguna regla |
| 3.3 | `INFRA-006` | **P3** | `alloy-proxmox-values.yaml` sin consumidores |
| 3.4 | `INFRA-008` | **P3** | `var.image_file_id` declarado y nunca consumido |
| 3.5 | `INFRA-011` | **P2** | `values.prod.yaml` no lo consume ninguna Application |
| 3.6 | `GITOPS-003` | **P3** | `gitops/` sin README pese a ser SSOT de promoción |

### 2.2 Fuera de alcance

| Deuda | Motivo |
| :--- | :--- |
| Migrar LXC a usuario sin `root` | **Imposible** con el provider actual (`user_account` en LXC solo admite `root`). Requiere un enfoque alternativo no disponible. |
| `INFRA-010` (PowerShell) | **Refutado.** Eliminado en `6b7b154`, protegido por `grafana_portability.test.ts` (PORT-001). No actuar. |
| `INFRA-007` pendiente de despliegue | Cerrado en código (#415). La acción operativa es `tofu apply`, fuera del alcance de un PR. |
| Corrección documental del plan de Fase 2 | El plan queda como registro histórico; se corrige en Fase 3 sólo si afecta al estado actual. |

---

## 3. Matriz de Riesgos y Mitigación

- **Riesgo 1 — `CI-001` amplifica el coste de CI en todo el repo (MEDIO):**
  clasificar `Taskfile.yaml` en la regla de documentación reduce el fail-closed, pero
  `Taskfile.yaml` gobierna **toda** la operativa. Una clasificación errónea podría
  saltarse un gate real.
  *Mitigación:* se clasifica en la regla `documentation` **más restrictiva que cubra sus
  efectos reales** (`documentation` + `linting`), nunca en una permisiva. Un test verifica
  que el archivo queda clasificado y que su dominio dispara los gates esperados.

- **Riesgo 2 — eliminar `alloy-proxmox-values.yaml` borra configuración operativa (MEDIO):**
  aunque hoy no tenga consumidores automatizados, podría estar siendo aplicado **a mano**
  por el operador.
  *Mitigación:* se **conserva el contenido** trasladándolo a un README que documente que
  su functionality fue absorbida por `grafana-cloud-values.yaml` (que **sí** lo consume
  `scripts/deploy-grafana-cloud.mjs`). Se elimina el archivo, no la información.

- **Riesgo 3 — `INFRA-011` malinterpreta la intención de `values.prod.yaml` (MEDIO):**
  el archivo podría existir deliberadamente como perfil de referencia, no por descuido.
  *Mitigación:* se **documenta su rol** en el propio archivo y en el README de Helm, sin
  eliminarlo ni conectarlo a un entorno. La decisión de conectarlo es del operador, no
  del refactor.

- **Riesgo 4 — `GITOPS-005` expone fallos latentes de preprod (BAJO, pero revelador):**
  al renderizar `proxmox-preprod` en CI podrían aparecer errores hoy invisibles.
  *Mitigación:* es precisamente el objetivo. Si falla, se documenta como hallazgo y se
  decide con el operador antes de continuar. **No** se maquilla el render.

- **Riesgo 5 — la fase se descarte por su baja severidad (BAJO):** el riesgo es que se
  descarte por parecer cosmética.
  *Mitigación:* `GITOPS-005` es **P2** y afecta a un entorno de despliegue real. No es

---

## 4. Secuencia de Ejecución

Cada ítem es un **PR independiente**. El orden pone primero lo que aumenta la confianza
en el resto de la plataforma.

### Paso 3.1 — `GITOPS-005`: renderizar `proxmox-preprod` en CI

**Defecto:** `proxmox-preprod` es un target **activo** — `root-application.yaml:38-40` lo
gobierna mediante App-of-Apps, y sus values existen y están completos. Sin embargo,
`infra.yaml:74-75` renderiza únicamente `proxmox` y `aws`:

```bash
helm template ... -f gitops/environments/proxmox/values.yaml   # sí
helm template ... -f gitops/environments/aws/values.yaml        # sí
# proxmox-preprod: AUSENTE
```

Un error de template, de valores o de paridad **sólo se detectaría al sincronizar**, es
decir, contra un entorno real. Preprod es exactamente el entorno donde ese error debe
costar cero.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 3.1.1 | Añadir el render de `gitops/environments/proxmox-preprod/values.yaml` al job de Helm | `.github/workflows/infra.yaml` |
| 3.1.2 | Incluir el render en la validación con kubeconform y kube-linter | `.github/workflows/infra.yaml` |
| 3.1.3 | Gate que exija que **todo** entorno GitOps activo se renderice en CI | `tests/security/k8s_workload_hardening.test.ts` |

> [!CAUTION]
> Si el render de preprod falla, el PR **no maquilla** el resultado: se documenta el fallo
> como hallazgo y se decide con el operador. Un gate que se relaja para pasar no es un gate.

### Paso 3.2 — `CI-001`: clasificar `Taskfile.yaml` en el motor de impacto

**Defecto:** `ci-impact.yaml` no incluye `Taskfile.yaml` en `global.paths` ni en ninguna
regla. El motor aplica su **política fail-closed**: inhibe la optimización y despacha
**Full CI** en cada PR que lo toque. Se observó empíricamente en el PR #413, donde un
cambio de tres líneas activó 17 dominios.

Además, `change-impact-matrix.md:80` afirma que `values.prod.yaml` es "el perfil de AWS",
cuando el perfil AWS real es `gitops/environments/aws/values.yaml`.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 3.2.1 | Clasificar `Taskfile.yaml` en las reglas `documentation` y `linting` (nunca en una permisiva) | `.github/ci-impact.yaml` |
| 3.2.2 | Corregir la afirmación errónea sobre `values.prod.yaml` | `.agents/skills/_shared/change-impact-matrix.md` |
| 3.2.3 | Gate que verifique la clasificación y su dominio efectivo | `tests/security/` |

### Paso 3.3 — `INFRA-006`: retirar el values huérfano de Alloy

**Defecto:** `infra/monitoring/alloy-proxmox-values.yaml` no tiene consumidores: ni
`Taskfile`, ni `.vscode/tasks.json`, ni workflows, ni tests, ni documentación. La
configuración equivalente y **vigente** vive en `infra/monitoring/grafana-cloud-values.yaml`,
que sí consume `scripts/deploy-grafana-cloud.mjs`.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 3.3.1 | Eliminar el archivo huérfano | `infra/monitoring/alloy-proxmox-values.yaml` |
| 3.3.2 | Documentar que su contenido fue absorbido por `grafana-cloud-values.yaml` | nuevo `infra/monitoring/README.md` |
| 3.3.3 | Gate que prohíba reaparecer un values de Grafana sin consumidor | `tests/security/` |

### Paso 3.4 — `INFRA-008`: eliminar la variable `image_file_id` huérfana

**Defecto:** `variables.tf:129-133` declara `image_file_id` con default
`local:vztmpl/debian-12-standard_12.12-1_amd64.tar.zst`, pero ningún recurso la consume:
`main.tf` usa `proxmox_download_file.debian_lxc_template[0].id`. Es configuración falsa que
sugiere un punto de control que no existe.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 3.4.1 | Eliminar la variable | `infra/opentofu/environments/proxmox/variables.tf` |
| 3.4.2 | Gate que prohíba variables OpenTofu declaradas y nunca referenciadas | `tests/security/iac_baseline_security.test.ts` |

### Paso 3.5 — `INFRA-011`: documentar el rol real de `values.prod.yaml`

**Defecto:** `values.prod.yaml` no lo consume **ninguna** Application de ArgoCD — las tres
usan `values.yaml` + su override de `gitops/environments/`. El archivo se renderiza en CI y
**varias suites de test le atribuyen garantías de seguridad**:

- `network_policies_security.test.ts:162` — *"values.prod.yaml exige Zero-Trust L7"*
- `k8s_workload_hardening.test.ts:652` — *"debe acotar refreshInterval a 1h"*
- `supply_chain_security.test.ts:372,445` — paridad de digest

---

## 5. Estrategia de Rollback

Todos los pasos son reversibles con `git revert`. Ninguno toca estado de runtime.

| Paso | Reversión | Verificación post-reversión |
| :--- | :--- | :--- |
| 3.1 | `git revert` | `helm template` de preprod vuelve a omitirse |
| 3.2 | `git revert` | El motor vuelve a fail-closed en `Taskfile.yaml` |
| 3.3 | `git revert` | El archivo huérfano se restaura |
| 3.4 | `git revert` | La variable OpenTofu se restaura |
| 3.5 | `git revert` | Los títulos de los tests vuelven a su redacción previa |
| 3.6 | `git revert` | El README se elimina |

> [!WARNING]
> El paso 3.4 toca un archivo OpenTofu. Tras eliminar la variable, `tofu validate` debe
> seguir en verde; si no lo estuviera, significa que existía un consumidor no detectado
> y el PR **no** debe mergearse.

---

## 6. Criterios de Aceptación y Checklist de Validación

Aplicados a **cada PR**:

- [ ] **Conmutación probada** en los pasos que añaden gates (3.1.3, 3.2.3, 3.3.3, 3.4.2)
- [ ] `npm test` → suite completa verde
- [ ] `npm run lint:md -- <.md modificados>` → 0 errores `MDxxx`
- [ ] Workflows afectados en verde

Gates específicos:

| PR | Gates adicionales |
| :--- | :--- |
| 3.1 | `helm template` de preprod + kubeconform + kube-linter |
| 3.2 | Test de clasificación del motor de impacto |
| 3.4 | `tofu validate` + `tofu fmt -check -recursive` |
| 3.5 | `helm lint` + render de los perfiles que sí se despliegan |

> [!NOTE]
> **No se requieren** builds de aplicación, Playwright E2E ni `test:fuzz`. Las filas de
> documentación, motor de CI e higiene de la matriz de impacto exoneran esos gates.

---

## 7. Deuda No Resoluble con el Estado Actual

| Deuda | Motivo |
| :--- | :--- |
| Migrar LXC a usuario sin `root` | **Imposible**: el provider `proxmox_virtual_environment_container` no admite `username` en `user_account`. Requiere un enfoque alternativo (p. ej. `user_post_scripts` u otro provider) que no está en el repo. |
| Conectar `values.prod.yaml` a un entorno | Decisión de arquitectura del operador, no de higiene (ver 3.5). |
| `tofu apply` de la imagen VM con checksum | Acción operativa, no de código. Requiere ventana de mantenimiento. |

---

## Anexo A — Trazabilidad de Evidencia

Verificación por lectura directa sobre `main` @ `a434393`.

| Hallazgo | Evidencia primaria | Confianza |
| :--- | :--- | :--- |
| `GITOPS-005` | `.github/workflows/infra.yaml:74-75` renderiza `proxmox` y `aws`; sin `proxmox-preprod`. `root-application.yaml:38-40` lo gobierna. | HIGH |
| `CI-001` | `.github/ci-impact.yaml` — `global.paths` (líneas 25-27) sin `Taskfile.yaml`; ninguna regla lo incluye. Fallo empírico observado en #413 (17 dominios). | HIGH |
| `INFRA-006` | `infra/monitoring/alloy-proxmox-values.yaml` sin referencias en Taskfile, `.vscode/tasks.json`, workflows, tests ni docs. | HIGH |
| `INFRA-008` | `variables.tf:129-133` declara `image_file_id`; `main.tf` consume `proxmox_download_file.debian_lxc_template[0].id`. | HIGH |
| `INFRA-011` | `gitops/apps/*.yaml` usan `valueFiles: [values.yaml, ../../../gitops/environments/*/values.yaml]`; ninguna referencia `values.prod.yaml`. | HIGH |
| `GITOPS-003` | `Test-Path gitops/README.md` → `False`; los directorios hermanos sí lo tienen. | HIGH |
| `GITOPS-004` | **Ya cerrado** en Fase 1 (paso 1.4). `ADR-021:41` declara el retiro de `SealedSecret`. | HIGH |

Esas aserciones dan confianza sobre un perfil que no despliega nada.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 3.5.1 | Declarar en el propio archivo que es un **perfil de referencia**, no desplegado | `infra/helm/pokedex/values.prod.yaml` |
| 3.5.2 | Documentarlo en el README del Chart | `infra/helm/README.md` |
| 3.5.3 | Renombrar los títulos de los tests que lo presentan como garantía operativa | 3 suites de `tests/security/` |

> [!NOTE]
> **No se conecta a ningún entorno.** Decidir si producción debe usarlo es una decisión de
> arquitectura del operador, no una tarea de higiene. Lo que sí se corrige es que el código
> deje de **afirmar** que garantiza algo que no garantiza.

### Paso 3.6 — `GITOPS-003`: README del árbol GitOps

**Defecto:** `gitops/` gobierna promoción, pinning y estado activo/inactivo de la
plataforma, y es el **único** directorio de primer nivel sin README: ni `infra/`, ni
`infra/ansible/`, ni `infra/k8s/eso/`, ni `infra/opentofu/` lo tienen.

| # | Acción | Archivo |
| --- | :--- | :--- |
| 3.6.1 | Crear el README con el modelo App-of-Apps, qué entorno está activo y cuál es referencia | nuevo `gitops/README.md` |
| 3.6.2 | Enlazar desde `docs/architecture/APPLICATION_LIFECYCLE.md` | `docs/architecture/` |

  cosmético.
