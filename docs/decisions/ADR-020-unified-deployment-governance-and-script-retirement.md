# ADR-020: Gobernanza Unificada de Despliegue, CLI Canónico con Taskfile y Retiro de Scripts Legados

## Estado

Aceptado

## Contexto

En fases tempranas de evolución del proyecto, la gestión del ciclo de vida de la aplicación y la infraestructura dependía de secuencias de comandos imperativas y dispersas: scripts bash (`scripts/proxmox_deploy.sh`, empaquetados ad-hoc de código fuente con `tar`/`rsync`) y playbooks de Docker Compose para entornos productivos.

Esta dispersión generaba tres problemas críticos de arquitectura y seguridad:

1. **Desvío de Configuración (*Configuration Drift*)**: La ejecución manual o semi-automatizada de scripts bash no garantizaba idempotencia ni control de versiones del estado real del clúster.
2. **Riesgo de Exfiltración de Secretos**: Los scripts de empaquetado o copia manual carecían de exclusiones forzadas de archivos `.env` y `.env.*`, abriendo vectores de fuga de credenciales.
3. **Fricción Cognitiva y Falta de Interfaz Canónica**: Los ingenieros debían memorizar comandos heterogéneos entre `npm`, `kubectl`, `helm`, `opentofu` y scripts locales.

Aunque los scripts legados de Compose y Proxmox fueron retirados en fases anteriores en favor de Kubernetes (ADR-001) y OpenTofu (ADR-004), la plataforma requería formalizar la gobernanza inmutable de herramientas y la prohibición estricta de scripts de despliegue no versionados o imperativos.

## Decisión

Se adopta una **Gobernanza Unificada de Despliegue y Operaciones** sustentada en tres pilares arquitectónicos:

### 1. Interfaz Canónica de Operaciones (`Taskfile.yml`)

`Taskfile.yml` se consolida como la única interfaz de línea de comandos (CLI) oficial para desarrolladores y operadores:

- Tareas de aplicación: `task build`, `task lint`, `task typecheck`, `task test`, `task validate` (integradas con Turborepo según ADR-019).
- Tareas de infraestructura: `task k8s:up`, `task k8s:down`, `task k8s:status` (mediadas por Helm 3).
- Tareas de entrega continua GitOps: `task gitops:sync:cloud`, `task gitops:sync:proxmox`, `task gitops:status` (mediadas por ArgoCD según ADR-003).
- Tareas de gobernanza: `task governance:audit-scripts`.

### 2. Prohibición Terminante de Scripts Imperativos de Despliegue

- Queda estrictamente prohibido crear o incorporar scripts bash de despliegue imperativo (`deploy*.sh`, `*deploy.sh`, `deploy_aws.sh`, `deploy_proxmox.sh`, etc.) en la raíz o en cualquier subdirectorio.
- Todos los despliegues deben ser declarativos a través de Helm Charts parametrizados (`infra/helm/pokedex`) y aplicaciones de ArgoCD (`gitops/apps/`).
- La infraestructura base se gestiona exclusivamente como código (IaC) mediante OpenTofu (`infra/opentofu/`) y Ansible (`infra/ansible/`).

### 3. Delimitación Estricta del Directorio `scripts/` e Inventario en Lista Blanca

El directorio `scripts/` queda reservado exclusivamente para:

- Scripts auxiliares fuertemente tipados en TypeScript (ej. `scripts/k8s-rollout-restart.ts`, `scripts/dr-drill.ts`, `scripts/github-security-linear-sync.ts`, `scripts/sonar-linear-sync.ts`).
- La única secuencia shell autorizada en todo el repositorio: `scripts/dr_verify_restore.sh`, sujeta a validaciones estrictas de checksum SHA-256 y pruebas periódicas automatizadas (ADR-006).

Cualquier nuevo script `.sh` no contemplado en la lista blanca de gobernanza disparará un fallo *fail-closed* en los gates automatizados de CI (`tests/security/deploy_scripts_security.test.ts`).

## Consecuencias

### Positivas

- **Operabilidad Homogénea**: Una única interfaz CLI canónica (`task <comando>`) para todo el ciclo de vida del software.
- **Prevención Activa de Deuda Técnica**: La lista blanca y el gate en CI impiden la proliferación de scripts efímeros o mal mantenidos.
- **Seguridad Garantizada**: Cero riesgo de despliegues imperativos que omitan escaneos SAST, firmas Cosign o verificaciones de admisión Kyverno.

### Negativas / Mitigaciones

- **Rigidez para Pruebas Rápidas**: Desarrolladores no pueden crear scripts `.sh` ad-hoc en el repo. *Mitigación*: Se incentiva el uso de tareas temporales en Taskfile o scripts TypeScript modulares.
