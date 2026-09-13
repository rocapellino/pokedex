# ADR-016: Ingress Controller, Terminación TLS y Hardening de Cabeceras HTTP L7

## Estado

Aceptado

## Contexto

La plataforma Pokédex expone dos superficies de ingreso al tráfico externo: el frontend Nginx
(`pokemon-web-svc`) y la API REST (`pokemon-api-svc`). Ambas residen en un namespace Kubernetes
aislado y se enrutan desde el exterior a través del controlador de Ingress NGINX.

Sin configuración explícita, el tráfico externo presenta los siguientes vectores de riesgo:

1. **Ausencia de TLS**: Las comunicaciones viajan en claro (HTTP), exponiendo credenciales de sesión
   y tokens de autenticación a ataques de intercepción (MITM).
2. **Cabeceras de seguridad HTTP omitidas**: Sin `Content-Security-Policy` (CSP), `X-Frame-Options`,
   `X-Content-Type-Options` ni `Strict-Transport-Security` (HSTS), los navegadores no pueden
   aplicar restricciones de carga de recursos ni mitigar ataques de *clickjacking* y sniffing.
3. **Exposición de métricas internas**: El endpoint `/metrics` (Prometheus) y las sondas `/healthz`
   y `/readyz` son accesibles desde el exterior sin restricción, revelando información operativa.
4. **Ausencia de límites de tasa a nivel L7**: Sin `rate limiting` en el Ingress, el backend queda
   expuesto a rafagas abusivas o ataques volumétricos de denegación de servicio.
5. **CORS sin restricción en el Ingress**: Las políticas CORS se delegan íntegramente a Express,
   sin una capa de validación temprana a nivel del proxy de entrada.

## Decisión

Se adopta una arquitectura de hardening del punto de entrada L7 articulada en cinco directivas:

1. **Terminación TLS y Redirección HTTPS Forzada**:
   - El Ingress se configura para gestionar el certificado TLS via la anotación
     `cert-manager.io/cluster-issuer`, compatible con Let's Encrypt en producción
     y con `ClusterIssuer` de tipo `selfsigned` en entornos Kind/staging.
   - La anotación `nginx.ingress.kubernetes.io/ssl-redirect: "true"` fuerza la redirección
     HTTP→HTTPS con código 308 (Permanent Redirect) para todos los hosts declarados.
   - El bloque `tls:` de la sección `spec` del Ingress referencia el `secretName`
     generado por cert-manager para almacenar el par de clave privada y certificado.

2. **Cabeceras de Seguridad HTTP Estrictas**:
   - Se inyectan las siguientes cabeceras en todas las respuestas mediante la anotación
     `nginx.ingress.kubernetes.io/configuration-snippet`:
     - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HSTS, 1 año).
     - `X-Frame-Options: DENY` (protección contra *clickjacking*).
     - `X-Content-Type-Options: nosniff` (desactiva el MIME-sniffing).
     - `Referrer-Policy: strict-origin-when-cross-origin`.
     - `Permissions-Policy: camera=(), microphone=(), geolocation=()` (desactiva APIs de hardware innecesarias).
     - `Content-Security-Policy: default-src 'self'; ...` (política restrictiva configurada por entorno).

3. **Bloqueo Declarativo de Endpoints Internos**:
   - El bloque `server-snippet` niega explícitamente el acceso externo a:
     `/metrics`, `/healthz` y `/readyz` (retorno `403 Forbidden`).
   - Estas rutas permanecen accesibles únicamente para el scraping interno de Prometheus
     y el kubelet, por red interna del clúster.

4. **Rate Limiting a Nivel de Ingress**:
   - `nginx.ingress.kubernetes.io/limit-rps: "20"` limita a 20 peticiones por segundo por IP.
   - `nginx.ingress.kubernetes.io/limit-connections: "10"` limita conexiones TCP simultáneas por IP.
   - El límite se aplica antes de que la solicitud alcance el Pod, protegiendo Express y PgBouncer.

5. **Parametrización Declarativa en Helm**:
   - Todos los parámetros de hardening se declaran en `values.yaml` bajo la sección `ingress:`
     para permitir personalización por entorno (`values.dev.yaml`, `values.prod.yaml`).
   - La sección `ingress.tls` se activa en producción y se desactiva en desarrollo local,
     manteniendo paridad de configuración en ambas modalidades.

## Consecuencias

- **Positivas**:
  - Eliminación completa de transmisión de credenciales en claro mediante cifrado TLS extremo a extremo.
  - Protección activa contra *clickjacking*, MIME-sniffing, robo de sesiones y XSS mediante CSP.
  - Reducción de superficie de ataque al bloquear métricas y sondas desde el exterior.
  - Cumplimiento de los controles OWASP Top 10 A05 (Security Misconfiguration) y A07 (Identification
    and Authentication Failures) mediante HSTS y restricción de endpoints.
  - Integración nativa con `cert-manager` para renovación automática de certificados, sin
    intervención manual.

- **Compensaciones**:
  - La directiva CSP estricta puede requerir ajustes iterativos para fuentes de scripts o estilos
    de terceros consumidos por el frontend (fonts, CDN).
  - En entornos de desarrollo local (Kind sin cert-manager), TLS se desactiva mediante
    `ingress.tls: []` y `ssl-redirect: "false"`, aceptando HTTP solo en el loopback.
  - El rate limiting a nivel de Ingress opera por IP de cliente; detrás de un NAT compartido
    puede afectar a múltiples usuarios. Se recomienda complementar con rate limiting en Express
    para mayor granularidad (ya implementado en `ADR-010`).
