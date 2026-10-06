# ADR-030: Modelo de Entornos: Dev Local, Pre-Prod en Proxmox LXC y Prod Cloud Agnóstico

## Estado

Aceptado el 2026-10-04. Implementación incremental; ver *Plan de Implementación*.

Consolida a [ADR-024](./README.md#️-registro-histórico-de-decisiones-consolidadas-o-retiradas)
(cómputo bimodal en Proxmox) y enmienda ADR-003, ADR-005, ADR-016 y ADR-025.

## Contexto

Hasta esta decisión la plataforma declaraba tres targets de Kubernetes:

| Application | Clúster | Rol |
| :--- | :--- | :--- |
| `pokedex-proxmox` | `k8s-proxmox` (VM KVM) | Producción |
| `pokedex-preprod` | `k8s-preprod` (LXC privilegiado) | Pre-producción |
| `pokedex-cloud` | AWS EKS | Referencia inactiva |

Ese modelo tenía tres problemas:

1. **Producción en el mismo hipervisor que pre-producción.** ADR-025 ya asumía el host Proxmox
   como SPOF compartido, y una "producción" sin redundancia física no ofrece garantías mayores
   que un entorno de pruebas.
2. **El target cloud estaba atado a un proveedor.** `gitops/environments/aws/` y
   `infra/opentofu/environments/aws/` fijaban EKS, ALB, IRSA y AWS Secrets Manager. El objetivo
   era la portabilidad, pero el artefacto describía una sola nube.
3. **Pre-producción no ejercitaba datos realistas.** El seed job estaba deshabilitado
   (`seedJob.enabled: false`) y, con `NODE_ENV=production`, la API no autosiembra. La muestra
   disponible (`apps/backend/src/data/initialPokemons.ts`) tiene 35 Pokémon, insuficiente para
   validar paginación, búsqueda, caché y rendimiento con el volumen real.

## Decisión

### 1. Tres Entornos con Responsabilidades Disjuntas

| Entorno | Runtime | Despliegue | Catálogo | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **Dev** | Docker Compose ([ADR-002](./ADR-002-compose-for-local-development.md)) y Kind (`infra/k8s/kind-cluster.yaml`) | Local, fuera de ArgoCD | Muestra (35) | Activo |
| **Pre-Prod** | K3s en LXC sobre Proxmox VE (`k8s-preprod`) | ArgoCD (`pokedex-preprod`) | Completo (~1025) | Activo, único target desplegado |
| **Prod** | Kubernetes gestionado en una nube a elegir | ArgoCD (`pokedex-cloud`), excluido del App-of-Apps | Completo | Blueprint declarado, **inactivo** |

Proxmox VE deja de alojar producción. La Application `pokedex-proxmox`, su override
`gitops/environments/proxmox/` y la rama `compute_type = "vm"` del módulo OpenTofu se retiran.

### 2. Dev: Local y Desechable

- Docker Compose es el entorno de desarrollo diario; Kind es el entorno de integración de
  Kubernetes canónico, el mismo que ejecuta CI (`Kind Canonical K8s Integration`).
- Usa la muestra de 35 Pokémon: la API autosiembra cuando `NODE_ENV` no es `production`, lo que
  mantiene los tests rápidos y deterministas.

### 3. Pre-Prod: Proxmox LXC con Catálogo Completo

**Cómputo.** K3s corre en un contenedor LXC privilegiado con `nesting`. Se mantiene el
trade-off de aislamiento aceptado para cargas sin datos reales de usuarios: el LXC comparte el
kernel del host, a diferencia de una VM KVM. Medidas de endurecimiento vigentes:

- Red segmentada en el puente de gestión (`10.10.13.0/24`, [ADR-025](./ADR-025-management-plane-runtime-plane-and-cloud-ready-separation.md)).
- Acceso SSH exclusivamente por llave pública (`ssh_public_key`), sin contraseña por defecto.
- Sin exposición de puertos administrativos de Proxmox hacia el contenedor.
- `/dev/kmsg` sincronizado vía servicio de sistema, sin exponer dispositivos de bloques.
- Límites explícitos de memoria y swap en el recurso OpenTofu.

**Perfil liviano.** Pre-prod conserva el perfil *Lean* que ADR-024 justificaba con la medición
de ~867 MB de RAM para el stack completo en LXC: sin Stakater Reloader (reemplazado por la
anotación `checksum/config`), sin PgBouncer (pool nativo `pg.Pool`) y con réplicas fijas en
lugar de HPA.

**Datos.** Pre-prod siembra el catálogo nacional completo desde un dataset versionado en el
repositorio. El dataset se genera con un script desde PokeAPI (nombres, tipos, habilidades,
categoría y descripción en español) y se verifica contra el mismo validador de payloads del
backend. El seed job:

- Usa la imagen de la API con el mismo digest (`dist/seed.cjs` ya forma parte del build), sin
  una imagen de seed aparte.
- Selecciona el dataset con `SEED_DATASET=full`; el valor por defecto sigue siendo la muestra.
- Corre como hook `PostSync`, después de que PostgreSQL y las migraciones estén disponibles.
- Es idempotente: reejecutarlo no duplica registros.
- Enriquece con megaevoluciones las filas ya existentes: aplica únicamente el campo `megaevoluciones`
  (en PostgreSQL con `jsonb_set`, sin ciclo leer-modificar-escribir), de modo que las ediciones del
  backoffice se conservan y una segunda ejecución no cambia nada. Las megaevoluciones no tienen
  número de Pokédex propio: cuelgan de la especie base y la API las trata como solo lectura.

El dataset no se descarga en runtime: el despliegue no depende de la disponibilidad ni de los
límites de tasa de PokeAPI, y dos sincronizaciones del mismo tag producen la misma base.

**Secretos.** Vault CE en Proxmox (LXC 810) sigue siendo el backend de pre-prod, con la ruta
`secret/data/pokedex/preprod/*` y el rol `pokedex-preprod-role`.

**Credenciales de infraestructura.** Se mantienen sin cambios las reglas que ADR-024 fijaba
para el módulo `infra/opentofu/environments/proxmox`: autenticación exclusiva por API Token,
ninguna credencial con valor por defecto, `proxmox_insecure = false` por defecto, plantillas
descargadas por HTTPS con checksum `sha256` verificado, y la política SSH `accept-new` de
Ansible (INFRA-002).

### 4. Prod: Blueprint Cloud Agnóstico e Inactivo

Prod se declara como un **blueprint**: un conjunto de artefactos renderizables y validados en CI
que no se sincroniza contra ningún clúster.

- **Perfil de endurecimiento.** `infra/helm/pokedex/values.prod.yaml` (HA, HPA, PDB,
  Zero-Trust L7, ResourceQuota) pasa a ser la base del entorno `cloud`. Hasta ahora ninguna
  Application lo consumía (INFRA-011).
- **Override agnóstico.** `gitops/environments/cloud/values.yaml` reemplaza a
  `gitops/environments/aws/values.yaml`. Solo declara los puntos de variación de un proveedor,
  como parámetros sin valores de un proveedor concreto: `ingress.className` y su emisor TLS
  (cert-manager), `StorageClass`, nombre del `ClusterSecretStore` y hosts públicos.
- **Infraestructura.** `infra/opentofu/environments/cloud-template/` es la base del
  aprovisionamiento; `infra/opentofu/environments/aws/` se retira del árbol activo.
- **Secretos.** La ruta lógica `pokedex/prod` queda **reservada** para prod cloud. El backend
  concreto (Vault externo o el gestor de secretos de la nube) se resuelve con un
  `ClusterSecretStore` declarado al activar el entorno.
- **Inactivo por diseño.** `app-cloud.yaml` sigue excluido de `pokedex-root` y sin
  `syncPolicy.automated`. La promoción de releases actualiza su `targetRevision` y sus digests
  para que el blueprint no derive respecto de pre-prod.

**Activación (fuera del alcance de este ADR).** Elegir proveedor, completar el override
`cloud`, aprovisionar con OpenTofu, declarar el `ClusterSecretStore`, quitar `app-cloud.yaml`
del `exclude` del App-of-Apps y habilitar `automated`. Requiere un ADR propio que fije el
proveedor.

### 5. Flujo de Promoción

```text
Dev (Compose / Kind) ──PR + CI──▶ main ──release vX.Y.Z──▶ Pre-Prod (Proxmox, ArgoCD)
                                                  └───────▶ Prod blueprint (pin sin sincronizar)
```

## Plan de Implementación

| Paso | Cambio | Efecto en runtime |
| :--- | :--- | :--- |
| 1 | Este ADR y las enmiendas de ADR-003, ADR-005, ADR-016 y ADR-025 | Ninguno |
| 2 | Generador del dataset, dataset completo y `SEED_DATASET` en `seed.ts` | Ninguno |
| 3 | Blueprint `cloud` agnóstico; retiro de `environments/aws` y `opentofu/environments/aws` | Ninguno (Application inactiva) |
| 4 | Seed job `PostSync` con `SEED_DATASET=full` en pre-prod | Pre-prod siembra el catálogo completo |
| 5 | Retiro de `pokedex-proxmox` y de la rama `vm` de OpenTofu | Se desmantela el clúster `k8s-proxmox` |

**Estado (2026-10-04).** Los pasos 1 a 4 están integrados (v1.91.0). El relevamiento de
runtime mostró que la VM 801 de producción nunca se aprovisionó y que el LXC 800
(`10.10.13.100`) corría un `helm install` manual, sin ArgoCD ni ESO. El paso 5 se ejecuta
como un cambio solo de repositorio, sin riesgo de pérdida de datos: no existe clúster que
desmantelar. Pre-prod pasa a sincronizarse in-cluster y la puesta en marcha de GitOps en el
LXC 800 se documenta en el runbook de Proxmox.

## Consecuencias

### Positivas

- Un solo entorno on-premise activo: menos superficie operativa, un solo conjunto de secretos
  vivos y un SPOF que ya no afecta a producción.
- Pre-prod valida la aplicación con el volumen real del catálogo.
- El blueprint cloud deja de depender de un proveedor y reutiliza el perfil endurecido existente
  en lugar de mantener un archivo de referencia sin consumidores.

### Negativas y Mitigaciones

| Riesgo | Severidad | Mitigación |
| :--- | :--- | :--- |
| No hay producción operativa hasta activar el blueprint | Media | Decisión explícita: la plataforma opera como pre-prod. La activación requiere un ADR de proveedor. |
| LXC privilegiado como único entorno activo | Media | Pre-prod no aloja datos reales de usuarios; aplica el endurecimiento del apartado 3. |
| El blueprint deriva por falta de uso | Media | CI renderiza `values.yaml` + `values.prod.yaml` + `environments/cloud` y la promoción fija sus digests. |
| Datos incompletos de PokeAPI en español (hábitat solo hasta la generación 3, descripciones faltantes) | Baja | Fallbacks explícitos en el generador y reporte de entradas degradadas. |
| Pérdida de datos al retirar `pokedex-proxmox` | Alta | Backup verificado y borrado no cascada (paso 5). |

## Trazabilidad y Decisiones Consolidadas

- **ADR-024 (Cómputo Bimodal en Proxmox: LXC Pre-Prod y VM KVM Prod):** consolidado en este
  registro. Se conservan la justificación y el endurecimiento del LXC, el perfil *Lean*
  medido en LXC y las reglas de credenciales del módulo OpenTofu (apartado 3). Se retira la
  rama de producción en VM KVM, porque Proxmox deja de alojar producción.
