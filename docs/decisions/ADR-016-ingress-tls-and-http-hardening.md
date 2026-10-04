# ADR-016: Ingress Controller, Terminación TLS y Hardening de Cabeceras HTTP L7

## Estado

Aceptado (enmendado el 2026-10-03 para los entornos Proxmox con Traefik y el 2026-10-04 por
el modelo de entornos de ADR-030; ver las secciones *Enmienda*)

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

## Enmienda 2026-10-03: Traefik en Proxmox (AUD-SEC-TLS-001)

Las directivas anteriores describen ingress-nginx con cert-manager. Los entornos activos
(Proxmox prod y pre-prod) usan el Traefik integrado en K3s, que ignora las anotaciones
`nginx.ingress.kubernetes.io/*`. Hasta esta enmienda esos entornos se servían por HTTP con
`tls: []`, mientras el backend emitía la cookie de sesión con `Secure`: el navegador la
descartaba y las credenciales viajaban en claro.

Para `ingress.className: traefik` la directiva 1 se implementa así:

- **Terminación TLS en Traefik:** el router se publica solo en el entrypoint `websecure`
  (`traefik.ingress.kubernetes.io/router.entrypoints: websecure` y `router.tls: "true"`), y
  `ingress.tls` cubre todos los hosts.
- **Redirección permanente (301):** es global de Traefik (`ports.web.http.redirections.entryPoint`, chart de Traefik >= 34; la clave `redirectTo` anterior se ignora en silencio). La
  aplica un `HelmChartConfig` que escribe
  [`setup_k3s.yaml`](../../infra/ansible/playbooks/setup_k3s.yaml).
- **Certificado:** sin cert-manager. Lo firma la CA interna que ya valida Vault, se guarda en
  Vault como `TLS_CRT` / `TLS_KEY` de `pokedex/prod` o `pokedex/preprod`, y ESO lo sincroniza
  como Secret `kubernetes.io/tls` (`ingress.tlsExternalSecret` del chart).
- **Render efectivo:** la plantilla del Ingress omite las anotaciones `nginx.*` cuando
  `className` no es `nginx`, y las de `cert-manager.io/*` cuando el certificado llega por ESO.
- **Contrato:**
  [`tests/gitops/environment_http_contract.test.ts`](../../tests/gitops/environment_http_contract.test.ts)
  exige TLS en todo host de un entorno con cookie `Secure`, orígenes CORS `https://` y un
  render sin anotaciones de otro controlador.

Las directivas 2, 3 y 4 no tienen equivalente en el Ingress de Traefik, y esta enmienda no lo
crea. Las cabeceras de seguridad las emiten Express (`apps/backend/server.ts`) y el nginx del
frontend; el rate limiting, Express (ADR-010). El bloqueo de `/metrics` depende de la allowlist
del nginx del frontend, que detrás de Traefik ve la IP del pod de Traefik y no la del cliente.

## Enmienda 2026-10-04: Alcance por Entorno (ADR-030)

Con el modelo de [ADR-030](./ADR-030-environment-model-local-dev-proxmox-preprod-cloud-prod.md):

- **Pre-prod (Proxmox):** aplica la enmienda 2026-10-03 (Traefik, CA interna y certificado
  `pokedex/preprod` sincronizado por ESO).
- **Prod (blueprint cloud):** aplican las directivas originales con cert-manager. El
  `ingress.className` y el emisor TLS se declaran como parámetros del entorno `cloud` en lugar
  de fijar el controlador de un proveedor. El contrato de `environment_http_contract.test.ts`
  sigue exigiendo TLS en todo host del blueprint.
- **Dev:** sin TLS (Docker Compose y Kind), como establece la directiva original.

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
