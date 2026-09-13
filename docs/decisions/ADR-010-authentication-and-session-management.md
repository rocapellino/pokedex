# ADR-010: Arquitectura de Autenticación, Gestión de Sesiones Criptográficas y Revocación Distribuida Fail-Closed

## Estado

Aceptado

## Contexto

La plataforma Pokédex requiere proteger sus endpoints administrativos (mutaciones de catálogo en `/pokemons`, recarga de datos y generación de diagramas/maquetaciones de IA) garantizando altos estándares de seguridad en entornos distribuidos multi-pod (Kubernetes, AWS EKS y Proxmox VE):

1. **Ataques de Canal Lateral por Tiempo (Timing Attacks)**: Las comparaciones tradicionales de cadenas (`===`) en JavaScript son vulnerables a ataques estadísticos de tiempo donde un atacante puede inferir byte a byte claves secretas.
2. **Exposición de Credenciales Maestras en el Cliente**: Enviar o almacenar una clave administrativa permanente (`ADMIN_API_KEY`) en el almacenamiento del navegador (localStorage / cookies) amplifica catastróficamente el impacto de un robo de sesión o compromiso de frontend.
3. **Consistencia en Clústeres Distribuidos sin Sesiones Pegajosas**: En un despliegue multi-réplica, la validación de autenticación debe ser rápida y preferentemente *stateless*, pero con capacidad de revocación inmediata e invalidación global (logout) sin requerir *sticky sessions* ni afinidad de IP.
4. **Resiliencia y Modo Fail-Closed**: Si el clúster de caché o base de datos de sesiones no está disponible, el sistema debe fallar de forma segura (*fail-closed*), impidiendo que tokens revocados puedan utilizarse inadvertidamente.

## Decisión

Se adopta una arquitectura de autenticación y sesiones estructurada en cinco directivas técnicas:

1. **Autenticación de Doble Capa**:
   - **Capa Máquina / CI**: Uso de la clave maestra `ADMIN_API_KEY` para automatizaciones, pipelines de CI/CD y scripts de auditoría mediante cabeceras `X-API-Key` o `Authorization: Bearer <ADMIN_API_KEY>`.
   - **Capa Operador / UI**: Intercambio de la clave por un token de sesión temporal vía `POST /api/v1/auth/session`. El cliente web opera exclusivamente con este token de corta duración (TTL de 4 horas), evitando persistir la clave maestra en el navegador.

2. **Desacoplamiento Criptográfico de Secretos**:
   - `ADMIN_API_KEY`: Secreto administrativo utilizado únicamente para emitir sesiones y accesos programáticos directos.
   - `ADMIN_SESSION_SECRET`: Clave simétrica de 256 bits dedicada exclusivamente a la firma y verificación de tokens HMAC SHA-256 (`<base64url_payload>.<base64url_signature>`).
   - En producción, el servidor falla cerrado al iniciar si alguno de los dos secretos no está provisto.

3. **Prevención Estricta de Timing Attacks (`crypto.timingSafeEqual`)**:
   - Todas las comparaciones de claves administrativas y firmas HMAC se ejecutan mediante `crypto.timingSafeEqual` sobre hashes SHA-256 precomputados de longitud fija (32 bytes), neutralizando cualquier discrepancia de tiempo en la comparación de bytes.

4. **Revocación Distribuida en Redis con Principio Fail-Closed**:
   - Al invocar el cierre de sesión (`POST /api/v1/auth/logout`), se verifica la firma del token y se registra su identificador único criptográfico (`jti`) en Redis bajo `pokedex:revoked:<jti>` con un TTL exactamente igual al tiempo restante de vida del token.
   - En peticiones protegidas subsiguientes, el middleware `verifyAdmin` consulta Redis. Si el `jti` está revocado, se rechaza con `401 Unauthorized`.
   - Si Redis está desconectado, el sistema rechaza el acceso con `503 Service Unavailable` bajo la política *fail-closed*, impidiendo que tokens previamente revocados se acepten durante una interrupción de la infraestructura.

5. **Protección Perimetral y Rate Limiting Dedicado**:
   - Los endpoints `/api/v1/auth/*` están protegidos por limitadores de tasa específicos (`authRateLimiter` y `authRateLimiterStandard`) para mitigar ataques de fuerza bruta o saturación.
   - Registro de auditoría JSON estructurado mediante Pino para todos los accesos administrativos sin exponer credenciales ni tokens en los logs.

## Consecuencias

- **Positivas**:
  - Protección completa contra ataques de tiempo y fuga de credenciales maestras en clientes frontend.
  - Verificación eficiente de tokens sin I/O en la mayoría de peticiones, combinada con revocación en tiempo real.
  - Consistencia total entre réplicas en Kubernetes sin acoplamiento a sesiones locales de pod.
  - Garantía de que una caída del backend de caché no degrade la seguridad del sistema (*fail-closed*).

- **Compensaciones**:
  - Requiere Redis como dependencia para la revocación instantánea y logout en clúster.
  - Los operadores deben volver a autenticarse al expirar la sesión tras 4 horas.
