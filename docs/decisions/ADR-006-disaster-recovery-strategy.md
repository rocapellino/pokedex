# ADR-006: Estrategia de Recuperación ante Desastres (DR), Cifrado 3-2-1 y Respaldo Off-Site en Google Drive

## Estado

Aceptado (Activo — Consolida y absorbe ADR-028)

## Contexto

Toda base de datos productiva está sujeta a riesgos de pérdida catastrófica por fallo de hardware, corrupción de datos o compromiso de seguridad. Un plan de copias de seguridad sin pruebas periódicas de restauración real representa una falsa sensación de seguridad.

En la arquitectura lean de Pokédex sobre hipervisor Proxmox VE (host físico único on-premise), mantener las copias de seguridad únicamente en almacenamiento local (`pokedex-backup-pvc`) generaba una vulnerabilidad operativa crítica ante destrucción física o avería del hardware. Asimismo, para un presupuesto de $0/mes en infraestructura adicional, la contratación de servicios comerciales de almacenamiento de objetos con costos recurrentes de almacenamiento y egress resultaba desproporcionada para el volumen del catálogo (50 MB a 300 MB con retención de 7 días).

## Decisión

Se formaliza una **estrategia de Disaster Recovery 3-2-1 con respaldo off-site K8s-Native y verificación automatizada continua**:

### 1. Generación de Backups y Modelo Criptográfico Zero-Knowledge

- **Generación Local Diaria**: Ejecución vía CronJob en Kubernetes (`pokedex-backup-cronjob`), con compresión gzip (`gzip -9`), cifrado simétrico **AES-256-CBC con PBKDF2** y generación obligatoria de suma de comprobación **SHA-256** (`.sha256`).
- **Zero-Knowledge en Destinos Externos**: Los destinos de respaldo externos se tratan como infraestructura no confiable. Sin la clave simétrica `BACKUP_ENCRYPTION_KEY` (custodiada exclusivamente en HashiCorp Vault), los volcados son matemáticamente ilegibles tanto en tránsito como en reposo.

### 2. Topología 3-2-1 y Destino Off-Site Canónico (Google Drive + Rclone)

Se cumple estrictamente la regla 3-2-1: tres copias de datos, dos medios físicos distintos y una copia fuera del sitio (*offsite*):

- **Copia 1 (Primaria)**: Base de datos PostgreSQL activa en volumen persistente de cómputo.
- **Copia 2 (Local)**: Snapshots diarios comprimidos y cifrados en volumen persistente local (`pokedex-backup-pvc`).
- **Copia 3 (Off-Site)**: Réplica en la nube de Google Drive mediante CronJob nativo de Kubernetes (`backup-gdrive-cronjob.yaml`) ejecutado a las 03:00 UTC (1 hora posterior a la generación local).
- **Montaje de Solo Lectura**: El pod montador de Rclone monta el PVC local con **`readOnly: true`**, garantizando la inmutabilidad física del almacenamiento local y previniendo alteraciones accidentales o destructivas.
- **Hardening de Pod Rclone**: Opera bajo `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, `automountServiceAccountToken: false` y revocación total de capacidades Linux (`drop: [ALL]`).
- **Aislamiento de Red Zero-Trust en Capa 7 (Cilium eBPF)**: Política de red `CiliumNetworkPolicy` (`pokedex-gdrive-sync-cilium-l7-policy`) con filtrado estricto L7 a nivel de kernel mediante allowlist de FQDNs (`*.googleapis.com`, `accounts.google.com`), bloqueando terminantemente tráfico HTTPS arbitrario, redes privadas RFC1918 y servicios de metadata de nube (`169.254.169.254/32`).
- **Fijación Criptográfica de Imagen**: Rclone se fija por digest inmutable SHA-256 (`rclone/rclone@sha256:74c51b8817e5431bd6d7ed27cb2a50d8ee78d77f6807b72a41ef6f898845942b`).
- **Contrato Fail-Closed**: Si `RCLONE_CONFIG_GDRIVE_TOKEN` no está inyectado o está vacío, el contenedor finaliza con error explícito (`exit 1`) en la fase de pre-vuelo.

### 3. Preservación de Blueprints Agnósticos S3 y PBS

Los esqueletos técnicos agnósticos documentados en [`docs/operations/OFFSITE_BACKUP_BLUEPRINTS.md`](../operations/OFFSITE_BACKUP_BLUEPRINTS.md) (Cloud S3-compatible y Proxmox Backup Server Sync Job) se mantienen en estado inactivo (`enabled: false`) como alternativas documentadas para futuras migraciones o snapshots de hipervisor completo.

### 4. Simulacro y Verificación Automatizada

- El script `scripts/dr_verify_restore.sh` y el simulacro `scripts/dr-drill.ts` validan periódicamente la integridad y descifrado en un motor PostgreSQL real (contenedor efímero o base aislada).
- Se prohíbe certificar recuperaciones basadas exclusivamente en validaciones textuales o sintácticas.

### 5. SLAs Comprometidos

- **Disponibilidad (SLA)**: 99.5% mensual (presupuesto de error de ~3.65h/mes, alineado con arquitectura lean mononodo).
- **RPO (Recovery Point Objective)**: < 24 horas (respaldo local a las 02:00 UTC, off-site a las 03:00 UTC).
- **RTO (Recovery Time Objective)**: < 2 horas (tiempo medido experimentalmente inferior a 60 segundos en base de datos; restauración PBS de VM en ~15-20 min; reconstrucción bare-metal en ~30-45 min).

## Consecuencias

### Positivas

- Resiliencia probada y aislamiento total del dominio de fallo (*failure domain*) del host físico Proxmox sin costos adicionales ($0/mes).
- Garantía criptográfica de inmutabilidad del volcado local y confidencialidad estricta (*Zero-Knowledge*) en almacenamiento externo.
- Cumplimiento estricto de la topología 3-2-1 y SLAs de RPO < 24h y RTO < 2h certificados experimentalmente.

### Compensaciones

- Requiere CPU y almacenamiento para ejecutar simulacros periódicos en CI y hosts de laboratorio.
- Exige la gestión y custodia del token OAuth2 de Google Drive en HashiCorp Vault bajo `pokedex/prod`.
- Sujeto a la cuota gratuita de 15 GB y disponibilidad de la API de Google, mitigado por la retención rotativa de 7 días.

---

## Trazabilidad y Decisiones Consolidadas

- **ADR-028 (Google Drive Off-Site Backup Strategy)**: Absorbido íntegramente en esta decisión. ADR-028 formalizó la adenda operacional para el uso de Google Drive K8s-Native y Rclone con filtrado Cilium L7, consolidando la arquitectura 3-2-1 en un único registro arquitectónico canónico.
