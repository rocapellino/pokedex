# ADR-006: Estrategia de Recuperación ante Desastres (DR), Cifrado 3-2-1 y Verificación Real

## Estado
Aceptado

## Contexto
Toda base de datos productiva está sujeta a riesgos de pérdida catastrófica por fallo de hardware, corrupción de datos o compromiso de seguridad. Un plan de copias de seguridad sin pruebas periódicas de restauración real representa una falsa sensación de seguridad.

## Decisión
Se formaliza una **estrategia de Disaster Recovery 3-2-1** con verificación automatizada continua:

1. **Generación de Backups**: Ejecución diaria vía CronJob en Kubernetes, con compresión gzip, cifrado simétrico AES-256-CBC con PBKDF2 y generación obligatoria de suma de comprobación SHA-256 (`.sha256`).
2. **Topología 3-2-1**: Tres copias de datos, dos medios de almacenamiento distintos (volumen local y réplica remota/offsite S3/MinIO), y una copia fuera del sitio (*offsite*).
3. **Simulacro y Verificación Automatizada**: El script `scripts/dr_verify_restore.sh` valida la integridad en motor PostgreSQL real (contenedor efímero o base aislada). Se prohíbe certificar recuperaciones basadas exclusivamente en validaciones textuales o sintácticas.
4. **SLAs Comprometidos**:
   - **Disponibilidad (SLA)**: 99.5% mensual (presupuesto de error de ~3.65h/mes, alineado con arquitectura lean mononodo).
   - **RPO (Recovery Point Objective)**: < 24 horas (respaldo diario a las 02:00 UTC).
   - **RTO (Recovery Time Objective)**: < 2 horas (tiempo medido experimentalmente inferior a 60 segundos en BD; restauración PBS de VM en ~15-20 min; reconstrucción bare-metal en ~30-45 min).
5. **Estado de Implementación de la Topología 3-2-1**:
   - **DR Local (Activo):** Generación diaria, cifrado simétrico AES-256-CBC, sumas SHA-256 y verificación periódica automatizada con `dr-restore-verify`.
   - **Esqueletos Off-Site (Cloud-Ready / Inactivos):** Se definen los esqueletos técnicos agnósticos para replicación en Cloud S3-compatible y Proxmox Backup Server (PBS) con Sync Job remoto, documentados en `docs/operations/OFFSITE_BACKUP_BLUEPRINTS.md` y mantenidos inactivos (`enabled: false`) hasta la designación de almacenamiento externo.

## Consecuencias
- **Positivas**: Resiliencia probada, garantía criptográfica de inmutabilidad del volcado, capacidad de respuesta inmediata ante desastres locales y camino claro y parametrizado para activar copias remotas fuera del sitio.
- **Compensaciones**: Requiere CPU y almacenamiento para ejecutar simulacros periódicos en CI y hosts de laboratorio. Asume el riesgo residual transitorio de pérdida de backups locales en caso de destrucción total del host físico Proxmox mientras las vías off-site permanezcan inactivas.
