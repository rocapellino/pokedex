# ADR-028: Estrategia de Respaldo Off-Site en la Nube con Google Drive y Rclone

## Estado

Aceptado (Actualiza y amplía la Sección 5 de [ADR-006](./ADR-006-disaster-recovery-strategy.md))

## Contexto

En el [ADR-006](./ADR-006-disaster-recovery-strategy.md) se formalizó la estrategia de Disaster Recovery 3-2-1 para la Pokédex. Sin embargo, en su sección 5, la topología fuera de sitio (*off-site*) quedó restringida a esqueletos técnicos inactivos (`enabled: false`) basados en almacenamiento agnóstico S3 y Proxmox Backup Server (PBS) remoto, a la espera del aprovisionamiento de infraestructura externa.

Esta situación generaba una vulnerabilidad operativa crítica: en caso de destrucción física o avería catastrófica del único nodo hipervisor Proxmox VE (SPOF físico on-premise), tanto la base de datos primaria como los respaldos locales (`pokedex-backup-pvc`) se perderían simultáneamente.

Para una arquitectura de presupuesto austero ($0/mes en infraestructura adicional), la contratación de servicios de almacenamiento de objetos comerciales con costos recurrentes de almacenamiento y salida de datos (*egress*) resultaba desproporcionada frente al volumen real de copias de seguridad de la Pokédex (rotación de 7 días ocupando entre 50 MB y 300 MB).

## Decisión

Se adopta formalmente **Google Drive** como destino primario de respaldo fuera de sitio (*off-site*) para el entorno productivo de Proxmox VE, utilizando el motor **Rclone** en una arquitectura de conocimiento cero (*Zero-Knowledge*):

### 1. Despliegue Nativo en Kubernetes (`backup-gdrive-cronjob.yaml`)

- La replicación se ejecuta como un CronJob de Kubernetes (`pokedex-gdrive-sync`) programado diariamente a las 03:00 UTC (1 hora posterior a la generación del snapshot local).
- El volumen de respaldos `pokedex-backup-pvc` se monta en el pod exclusivamente con **`readOnly: true`**, garantizando la inmutabilidad física del almacenamiento local y previniendo alteraciones accidentales o maliciosas.
- El pod opera bajo perfil de seguridad restringido: `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `automountServiceAccountToken: false` y revocación total de capacidades Linux (`drop: [ALL]`).

### 2. Modelo Criptográfico Zero-Knowledge

- Google Drive se trata como un almacenamiento no confiable.
- Antes de salir del nodo Proxmox, los volcados son comprimidos (`gzip -9`), cifrados simétricamente con **AES-256-CBC PBKDF2** y firmados con una suma criptográfica **SHA-256**.
- Sin la clave simétrica `BACKUP_ENCRYPTION_KEY` (custodiada en HashiCorp Vault), los datos son matemáticamente ilegibles para Google o terceros en tránsito y en reposo.

### 3. Aislamiento de Red Zero-Trust en Capa 7 (Cilium eBPF)

- Se aplica una política de red `CiliumNetworkPolicy` (`pokedex-gdrive-sync-cilium-l7-policy`) basada en eBPF con Allowlist estricto de FQDNs:
  - `*.googleapis.com`
  - `accounts.google.com`
- Todo el tráfico hacia otros destinos HTTPS, redes privadas RFC1918 y servicios de metadata de nube (IMDS `169.254.169.254/32`) queda terminantemente bloqueado a nivel de kernel mediante filtrado Anti-SSRF.

### 4. Seguridad de la Cadena de Suministro (Supply Chain)

- Se prohíbe el uso de etiquetas mutables para el motor de sincronización.
- La imagen oficial se fija criptográficamente por digest SHA-256 inmutable en Docker Compose y Helm:
  `rclone/rclone@sha256:74c51b8817e5431bd6d7ed27cb2a50d8ee78d77f6807b72a41ef6f898845942b` (referencia Rclone 1.68.2).

### 5. Contrato Fail-Closed en Ausencia de Credenciales

- Si la variable `RCLONE_CONFIG_GDRIVE_TOKEN` no está inyectada en el Secret de Kubernetes o su contenido está vacío, el contenedor finaliza con error explícito (`exit 1`) en la fase de pre-vuelo, alertando de inmediato a la observabilidad sin generar volcados parciales o silenciosos.

### 6. Preservación de Blueprints Agnósticos S3 y PBS

- Los esqueletos técnicos documentados en [`docs/operations/OFFSITE_BACKUP_BLUEPRINTS.md`](../operations/OFFSITE_BACKUP_BLUEPRINTS.md) (Cloud S3-compatible agnóstico y Proxmox Backup Server Sync Job) se mantienen en estado inactivo como alternativas documentadas para futuras migraciones o requerimientos de snapshot de hipervisor completo.

## Consecuencias

### Positivas

- **Aislamiento de Failure Domain**: Desacoplamiento total del host físico Proxmox sin incurrir en costos de infraestructura ($0/mes), aprovechando la cuota de 15 GB de Google Drive.
- **Cumplimiento Real 3-2-1**: Tres copias (PostgreSQL activo, PVC local cifrado, Google Drive remoto), dos medios físicos distintos (almacenamiento del host y cloud Google), y una copia fuera de sitio.
- **Garantía RPO y RTO**: Cumplimiento del SLA contractual: RPO < 24h y RTO < 2h certificados experimentalmente mediante el simulacro automatizado `scripts/dr-drill.ts`.

### Compensaciones

- **Gestión y Rotación del Token OAuth2**: Requiere la generación inicial del token OAuth2 mediante `rclone authorize drive` y su almacenamiento seguro en HashiCorp Vault bajo la clave `pokedex/prod`.
- **Dependencia de la API de Google**: Sujeto a las políticas de cuota y disponibilidad del servicio de Google Drive, mitigado por el carácter complementario de la copia off-site respecto a los respaldos locales en disco.
