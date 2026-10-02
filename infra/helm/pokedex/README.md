# ⎈ Pokédex Helm Chart (`infra/helm/pokedex/`)

Helm 3 Chart canónico y oficial para el empaquetado, templating y orquestación de la plataforma **Pokédex** en Kubernetes.

---

## 🏛️ Taxonomía de Archivos de Configuración (`values`)

| Archivo | Rol y Taxonomía | Propósito y Ámbito |
| :--- | :--- | :--- |
| **`values.yaml`** | 🟢 **ACTIVE** | Base de configuración canónica por defecto (*Secure by Default*). Define recursos mínimos, probes, seguridad estricta y configuraciones compartidas. |
| **`values.dev.yaml`** | 🔵 **SUPPORTED** | Overrides para desarrollo local y clústeres efímeros de prueba (KinD), con persistencia liviana y réplicas reducidas. |
| **`values.prod.yaml`** | 🟡 **REFERENCE** | Perfil estático de referencia endurecido para validación offline, linting sintáctico y auditoría de seguridad IaC en CI (`INFRA-011`). |

> [!IMPORTANT]
> **SSOT de Runtime Operativo (GitOps):**
> La configuración de despliegue viva y los valores específicos aplicados por entorno en clústeres productivos residen en el directorio raíz [`gitops/environments/`](../../../gitops/environments/). ArgoCD consume este chart parametrizándolo mediante los values dedicados de cada entorno (`gitops/environments/proxmox/values.yaml` y `gitops/environments/proxmox-preprod/values.yaml`).

---

## 📁 Estructura del Chart

```text
infra/helm/pokedex/
├── Chart.yaml               # Metadatos del chart (versión semántica y dependencias)
├── .helmignore              # Patrones de exclusión para empaquetado y lint
├── README.md                # Esta guía de arquitectura del Chart
├── values.yaml              # [ACTIVE] Configuración base canónica
├── values.dev.yaml          # [SUPPORTED] Overrides para desarrollo local y CI (KinD)
├── values.prod.yaml         # [REFERENCE] Perfil estático de validación endurecido (INFRA-011)
└── templates/               # Manifiestos parametrizados de Kubernetes
    ├── _helpers.tpl         # Helpers canónicos (nomenclatura, etiquetas y resolución de secretos)
    ├── api-deployment.yaml  # Deployment de la API backend (Node.js/Express TypeScript)
    ├── api-hpa.yaml         # HorizontalPodAutoscaler v2 para escalado dinámico de la API
    ├── web-deployment.yaml  # Deployment del frontend web (Nginx)
    ├── web-hpa.yaml         # HorizontalPodAutoscaler v2 para frontend
    ├── postgres-statefulset.yaml # Base de datos PostgreSQL con volumen persistente (PVC)
    ├── redis-deployment.yaml    # Capa de caché y rate-limiting en memoria
    ├── pgbouncer-deployment.yaml # Pooler de conexiones para PostgreSQL
    ├── externalsecret.yaml  # Recurso ExternalSecret para inyección vía ESO
    ├── network-policies.yaml # Reglas de aislamiento de red Kubernetes Zero-Trust
    ├── cilium-network-policies.yaml # Políticas eBPF L7 de inspección y control de egreso
    ├── backup-cronjob.yaml  # Tareas programadas de respaldo de datos
    ├── backup-gdrive-cronjob.yaml # Sincronización programada off-site a Google Drive
    ├── backup-restore-verify-cronjob.yaml # Prueba automatizada de restauración y paridad
    ├── pdb.yaml             # PodDisruptionBudget para garantizar alta disponibilidad
    └── ingress.yaml         # Enrutamiento perimetral Ingress HTTP/HTTPS
```

---

## 🔒 Controles de Resiliencia y Seguridad en Plantillas

1. **Seguridad en Contenedores:** Contextos de seguridad estrictos (`readOnlyRootFilesystem`, `runAsNonRoot: true`, `drop: ["ALL"]`, `allowPrivilegeEscalation: false`).
2. **Alta Disponibilidad:** PodDisruptionBudget configurado para evitar indisponibilidad durante drenado o actualización de nodos.
3. **Desacoplamiento de Secretos:** Uso del helper `pokedex.secretName` en `_helpers.tpl` para resolver transparentemente secretos nativos o generados dinámicamente por External Secrets Operator.

---

## 🚀 Comandos Canónicos de Validación (vía Taskfile)

```bash
# Validar sintaxis y buenas prácticas con Helm Lint
task helm:lint

# Renderizar manifiestos base con values.yaml
task helm:template

# Renderizar y validar perfil estático de producción (INFRA-011)
task helm:template:prod
```
