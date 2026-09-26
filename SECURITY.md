# 🛡️ Política de Seguridad y Divulgación Responsable (Security Policy)

La seguridad de la plataforma **Pokédex** y la protección de los datos de nuestros usuarios son prioritarias. Agradecemos el esfuerzo de la comunidad de seguridad y de los investigadores al identificar y reportar vulnerabilidades de manera responsable.

---

## 📑 Tabla de Contenidos

- [🛡️ Política de Seguridad y Divulgación Responsable (Security Policy)](#️-política-de-seguridad-y-divulgación-responsable-security-policy)
  - [📑 Tabla de Contenidos](#-tabla-de-contenidos)
  - [1. Versiones con Soporte](#1-versiones-con-soporte)
  - [2. Reporte de Vulnerabilidades (Responsible Disclosure)](#2-reporte-de-vulnerabilidades-responsible-disclosure)
    - [Canales Seguros de Comunicación](#canales-seguros-de-comunicación)
    - [Información a Incluir en el Reporte](#información-a-incluir-en-el-reporte)
  - [3. Acuerdo de Nivel de Servicio (SLA de Respuesta)](#3-acuerdo-de-nivel-de-servicio-sla-de-respuesta)
  - [4. Alcance y Exclusiones](#4-alcance-y-exclusiones)
    - [En Alcance (In Scope)](#en-alcance-in-scope)
    - [Fuera de Alcance (Out of Scope)](#fuera-de-alcance-out-of-scope)
  - [5. Controles y Arquitectura de Seguridad Implementados](#5-controles-y-arquitectura-de-seguridad-implementados)

---

## 1. Versiones con Soporte

Únicamente la versión más reciente en la rama principal (`main`) y los releases oficiales etiquetados reciben parches de seguridad activos:

| Versión / Rama | Estado de Soporte | Runtime Base |
| :--- | :--- | :--- |
| **`main` (Latest)** | ✅ Con soporte activo | Node.js 22 LTS / Docker Alpine |
| **`v1.x` Releases (`v1.78.x`)** | ✅ Con soporte activo | Node.js 22 LTS / Kubernetes 1.30+ |
| **`< v1.75.0`** | ❌ Fin de ciclo de vida (EOL) | Versiones anteriores |

---

## 2. Reporte de Vulnerabilidades (Responsible Disclosure)

> [!IMPORTANT]
> **Por favor, NO abras un issue público de GitHub para reportar vulnerabilidades de seguridad.**
> La divulgación pública prematura expone a los usuarios antes de que podamos publicar un parche de remediación.

### Canales Seguros de Comunicación

**GitHub Private Vulnerability Reporting (Recomendado):**

- Dirígete a la pestaña **Security** del repositorio en GitHub: [Report a Vulnerability](https://github.com/rocapellino/pokedex/security/advisories/new).
- Proporciona un informe detallado con pasos de reproducción, impacto estimado y prueba de concepto (PoC).

### Información a Incluir en el Reporte

- Descripción clara de la vulnerabilidad y vector de ataque.
- Componentes afectados (backend `server.ts`, endpoints REST, manifiestos de Helm/K8s, etc.).
- Pasos ordenados y reproducibles para verificar el hallazgo (comandos `curl`, payloads JSON, etc.).
- Impacto potencial en confidencialidad, integridad o disponibilidad.
- Sugerencias de mitigación (si se conocen).

---

## 3. Acuerdo de Nivel de Servicio (SLA de Respuesta)

Nos comprometemos con los siguientes plazos de atención ante reportes válidos:

| Hito | Plazo Máximo | Compromiso |
| :--- | :---: | :--- |
| **Acuse de Recibo Inicial** | **< 24 horas** | Confirmación de recepción y asignación de revisor. |
| **Triaje y Evaluación de Severidad** | **< 48 horas** | Reproducción del fallo y asignación de puntaje CVSS v3.1. |
| **Desarrollo y Test del Parche** | **< 5 días hábiles** | Corrección en rama privada y validación en CI con pentest suite. |
| **Publicación y CVE Disclosure** | **Coordinado** | Despliegue del parche y publicación de Security Advisory coordinado. |

---

## 4. Alcance y Exclusiones

### En Alcance (In Scope)

- Vulnerabilidades en la API REST (`server.ts`, middlewares, rutas de autenticación y mutación).
- Fallas de autenticación, escalación de privilegios, bypass de HMAC o fallas en el mecanismo *fail-closed*.
- Inyecciones de código, SQL, XSS reflejado/persistente, manipulación de prototipos o SSRF.
- Evasión de controles de admisión en Kubernetes o políticas Kyverno.
- Fugas de secretos reales no revocados en el código.

### Fuera de Alcance (Out of Scope)

- Ataques de denegación de servicio volumétricos (DDoS) contra infraestructura pública o CDN de terceros.
- Ingeniería social, phishing o ataques físicos contra los administradores.
- Reportes automatizados de escáneres estáticos sin una prueba de concepto (PoC) que demuestre explotabilidad real.
- Vulnerabilidades en servicios externos integrados (Google AI Studio, GitHub, Docker Hub).

---

## 5. Controles y Arquitectura de Seguridad Implementados

El repositorio cuenta con defensas en profundidad integradas en el pipeline y en runtime:

1. **Supply Chain Security & CI/CD Gates:**
   - Firma criptográfica **Keyless** con **Cosign** y atestación de **SBOM CycloneDX** mediante **Syft**.
   - Control de admisión en Kubernetes con **Kyverno** (`ClusterPolicy: Enforce`) exigiendo imágenes firmadas por GitHub Actions verificadas en Rekor.
   - **SAST Bloqueante con Semgrep:** Detección de fallas OWASP Top 10 en cada Pull Request.
   - **Dependency Review Gate:** Bloqueo automático de dependencias con vulnerabilidades HIGH+.
   - **SHA Pinning Estricto:** Anclaje por digest inmutable en GitHub Actions y contenedores Docker (Nginx, PgBouncer).
   - **Gobernanza Automatizada:** Renovate Bot con cooldown de 7 días (`minimumReleaseAge`), schedule semanal y auto-merge restringido a parches npm.

2. **Defensas en Aplicación (Fail-Closed):**
   - Verificación de credenciales segura contra ataques de canal lateral basados en tiempo (`crypto.timingSafeEqual`).
   - Tokens de sesión firmados con HMAC SHA-256 independientes (`ADMIN_SESSION_SECRET`).
   - Revocación distribuida en Redis con política *fail-closed* ante caídas de infraestructura.
   - Sanitización contra XSS en payloads y respuestas (`422 Unprocessable Entity`).
   - Restricción estricta de descarga del código fuente (`/download/repo`) deshabilitada por defecto en producción.

3. **Zero-Trust Network Isolation & Anti-SSRF:**
   - **Egress Anti-SSRF:** Filtrado estricto `ipBlock` que bloquea peticiones salientes a endpoints de metadatos Cloud IMDS (`169.254.169.254/32`), subredes privadas RFC 1918 y loopback.
   - **Gestión de Conexiones a PostgreSQL:** Perfil Lean On-Premise con pool nativo `pg.Pool` optimizado (20 conexiones concurrentes por pod) y opción de mediación con PgBouncer para despliegues Enterprise de alta concurrencia.
   - **Egress DNS Restringido:** Resolución DNS acotada exclusivamente a pods con selector `k8s-app: kube-dns`.
   - **Redes Internas Docker:** Aislamiento con `internal: true` en Docker Compose.

4. **Gestión de Secretos Desacoplada:**
   - Sincronización declarativa mediante **External Secrets Operator (ESO)** conectado a **HashiCorp Vault CE** (on-premise Proxmox VE) y **AWS Secrets Manager** (cloud EKS).
   - Roles y políticas RBAC segregadas (`pokedex/prod` y `pokedex/preprod`) con modo `existingSecret: "pokemon-secrets"` en Helm para prevenir contraseñas en Git.
   - Escaneo preventivo continuo con **Gitleaks** en hooks de pre-commit y pipelines de CI/CD.

5. **Política de Escaneo de Contenedores y Vulnerabilidades Upstream (Trivy):**
   - **Compilación en CI (`ci.yml`):** Utiliza `ignore-unfixed: true` exclusivamente como compuerta bloqueante de PRs para evitar roturas causadas por vulnerabilidades base de la distribución (`alpine:3.21`) sin parche oficial disponible (*unfixed*).
   - **Monitoreo Continuo (`security-trivy.yml`):** Ejecuta escaneos programados diarios sobre el repositorio e imágenes sin suprimir CVEs sin parche, publicando los hallazgos en GitHub Security tab para auditoría y evaluación de riesgos.
   - **Criterio de Evaluación:** Si un CVE sin parche alcanza severidad CRITICAL con exploit público conocido (CISA KEV), se evalúa inmediatamente la sustitución o remediación manual de la imagen base.

6. **Política de Overrides de Dependencias (`package.json`):**
   - Cada entrada en la directiva `overrides` responde a la mitigación directa de un advisory de seguridad reportado en dependencias transitivas:
     - `qs` (^6.14.0): Mitigación de Prototype Pollution en parsers HTTP de Express.
     - `tmp` (^0.2.6): Prevención de condiciones de carrera y creación insegura de archivos temporales.
     - `cookie` (^2.0.1): Prevención de ReDoS y parsing fuera de límites.
     - `esbuild` (^0.28.2): Paridad del compilador y mitigación de vulnerabilidades de empaquetado.
     - `@puppeteer/browsers` y `proxy-agent`: Mitigaciones aplicadas a la suite de testing E2E.
   - **Condición de Retiro:** Los overrides son revaluados bimestralmente mediante `npm outdated` y retirados en cuanto los paquetes principales actualicen sus árboles de dependencias.
