# ADR-012: Estrategia de Gestión de Estados IaC, Bloqueo de Concurrencia y Cifrado en Cliente con OpenTofu

## Estado

Aceptado

## Contexto

La infraestructura como código (IaC) de la plataforma Pokédex se aprovisiona de forma declarativa mediante OpenTofu sobre entornos híbridos (Proxmox VE on-premise, laboratorios locales y AWS EKS). La gestión de los archivos de estado (`.tfstate`) y planes ejecutables (`.tfplan`) presenta riesgos operativos y de seguridad significativos:

1. **Exposición Crítica de Secretos en Texto Claro**: El estado de OpenTofu contiene metadatos sensibles de infraestructura, contraseñas maestras de bases de datos, claves privadas SSH generadas por cloud-init y tokens de acceso a APIs de nube.
2. **Riesgo de Fuga en el Control de Versiones**: Cualquier persistencia inadvertida de archivos `.tfstate` en repositorios Git públicos o privados expone la superficie de ataque completa del sistema.
3. **Condiciones de Carrera y Corrupción de Estado en CI/CD**: Cuando múltiples ejecuciones de pipelines o ingenieros intentan aprovisionar o modificar recursos concurrentemente, la ausencia de un mecanismo atómico de bloqueo distribuido provoca corrupción del estado y desincronización con la infraestructura real.
4. **Insuficiencia del Cifrado en Reposo Tradicional**: Aunque los buckets de almacenamiento como AWS S3 o MinIO proveen cifrado en el servidor (SSE), el archivo de estado viaja sin cifrar a nivel de aplicación, dejando los secretos expuestos ante compromisos de credenciales del bucket o brechas intermedias.
5. **Capacidades de OpenTofu 1.7+ (Client-Side Encryption)**: OpenTofu introdujo soporte nativo para cifrado en el lado del cliente, permitiendo que tanto el `.tfstate` como el `.tfplan` se cifren criptográficamente antes de salir del host local o del runner de CI.

## Decisión

Se adopta una arquitectura integral de gestión de estados IaC estructurada en cinco directivas técnicas:

1. **Prohibición Absoluta de Estados Locales en Git (.gitignore Estricto)**:
   - Todo archivo de estado (`*.tfstate`, `*.tfstate.*`, `*.tfplan`) y directorio temporal (`.terraform/`, `.terraform.lock.hcl` local temporal) queda excluido del control de versiones mediante reglas estrictas en `.gitignore`.
   - Se aplican hooks de pre-commit y escaneo de secretos (Gitleaks) en los pipelines de CI para interceptar cualquier intento de inclusión de estados.

2. **Backends Remotos Centralizados y Cifrados**:
   - Para entornos cloud (AWS) y virtualizados (Proxmox VE), se formaliza el uso de backends remotos desacoplados basados en la plantilla canónica `infra/opentofu/environments/backend.tf.example`.
   - En despliegues AWS, se utiliza el backend `s3` con `encrypt = true` (Server-Side Encryption mediante KMS o claves gestionadas) y almacenamiento versionado para habilitar rollback de estados.
   - En entornos on-premise Proxmox, se soporta la mediación con MinIO o el backend relacional `pg` canalizado a través del pooler de base de datos.

3. **Bloqueo Distribuido Obligatorio de Concurrencia (State Locking)**:
   - Toda configuración de backend remoto debe implementar bloqueo de concurrencia. En AWS S3 se requiere una tabla DynamoDB (`dynamodb_table = "pokedex-opentofu-locks"`), y en backends HTTP/PG se emplean bloqueos transaccionales a nivel de fila.
   - Si una ejecución concurrente intenta adquirir el bloqueo, OpenTofu aborta inmediatamente (*fail-fast*), previniendo escrituras solapadas.

4. **Cifrado Nativo en el Cliente (OpenTofu 1.7+ Native Client-Side Encryption)**:
   - Se adopta la especificación de cifrado en cliente de OpenTofu mediante el bloque `encryption`:
     - Proveedores de claves: `key_provider "pbkdf2"` con passphrase inyectada mediante variable de entorno efímera (`TF_ENCRYPTION_KEY`) o `key_provider "aws_kms"` para entornos de nube.
     - Algoritmo criptográfico: `method "aes_gcm"` con cifrado autenticado de 256 bits (`AES-GCM`).
     - Cumplimiento obligatorio (`enforced = true`) tanto para el estado (`state`) como para los planes de ejecución (`plan`).
   - Con este esquema, incluso si el almacenamiento remoto en S3 o MinIO se ve comprometido, los datos de estado son matemáticamente inaccesibles sin la clave simétrica o la clave KMS.

5. **Aislamiento por Entornos**:
   - Cada entorno (`environments/proxmox`, `environments/aws`, `environments/lab`, `environments/cloud-template`) mantiene claves de estado independientes y segregadas (`environments/<env>/terraform.tfstate`), impidiendo la interferencia cruzada entre infraestructuras.

## Consecuencias

- **Positivas**:
  - Protección criptográfica integral de contraseñas, tokens y claves de infraestructura en reposo y en tránsito.
  - Eliminación total del riesgo de corrupción por modificaciones concurrentes en pipelines de GitHub Actions.
  - Trazabilidad y auditoría completa de cambios de infraestructura por entorno sin fugas en Git.
  - Alineación con el nivel máximo de madurez DevSecOps documentado en `docs/security/DEVSECOPS_AUDIT.md`.

- **Compensaciones**:
  - Requiere infraestructura de soporte para el backend remoto (bucket S3/MinIO y tabla DynamoDB para locks).
  - En caso de utilizar cifrado client-side con PBKDF2, la pérdida de la passphrase impide irreversiblemente la recuperación del estado.
