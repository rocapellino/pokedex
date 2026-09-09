# 🛡️ Política de Seguridad y Divulgación Responsable (Security Policy)

La seguridad de la plataforma **Pokédex** y la protección de los datos de nuestros usuarios son prioritarias. Agradecemos el esfuerzo de la comunidad de seguridad y de los investigadores al identificar y reportar vulnerabilidades de manera responsable.

---

## 📑 Tabla de Contenidos
1. [Versiones con Soporte](#1-versiones-con-soporte)
2. [Reporte de Vulnerabilidades (Responsible Disclosure)](#2-reporte-de-vulnerabilidades-responsible-disclosure)
3. [Acuerdo de Nivel de Servicio (SLA de Respuesta)](#3-acuerdo-de-nivel-de-servicio-sla-de-respuesta)
4. [Alcance y Exclusiones](#4-alcance-y-exclusiones)
5. [Controles y Arquitectura de Seguridad Implementados](#5-controles-y-arquitectura-de-seguridad-implementados)

---

## 1. Versiones con Soporte

Únicamente la versión más reciente en la rama principal (`main`) y los releases oficiales etiquetados reciben parches de seguridad activos:

| Versión / Rama | Estado de Soporte | Runtime Base |
| :--- | :--- :--- | :--- |
| **`main` (Latest)** | ✅ Con soporte activo | Node.js 22 LTS / Docker Alpine |
| **`v2.x` Releases** | ✅ Con soporte activo | Node.js 22 LTS / Kubernetes 1.30+ |
| **`< v2.0.0`** | ❌ Fin de ciclo de vida (EOL) | Versiones anteriores |

---

## 2. Reporte de Vulnerabilidades (Responsible Disclosure)

> [!IMPORTANT]
> **Por favor, NO abras un issue público de GitHub para reportar vulnerabilidades de seguridad.**
> La divulgación pública prematura expone a los usuarios antes de que podamos publicar un parche de remediación.

### Canales Seguros de Comunicación:
1. **GitHub Private Vulnerability Reporting (Recomendado):**
   * Dirígete a la pestaña **Security** del repositorio en GitHub: [Report a Vulnerability](https://github.com/rocapellino/pokedex/security/advisories/new).
   * Proporciona un informe detallado con pasos de reproducción, impacto estimado y prueba de concepto (PoC).
2. **Correo Electrónico de Seguridad:**
   * Si no dispones de cuenta en GitHub, puedes remitir tu reporte a:  
     📧 **`ro.capellino@gmail.com`** con el asunto `[SECURITY VULNERABILITY] Pokédex API`.

### Información a Incluir en el Reporte:
* Descripción clara de la vulnerabilidad y vector de ataque.
* Componentes afectados (backend `server.ts`, endpoints REST, manifiestos de Helm/K8s, etc.).
* Pasos ordenados y reproducibles para verificar el hallazgo (comandos `curl`, payloads JSON, etc.).
* Impacto potencial en confidencialidad, integridad o disponibilidad.
* Sugerencias de mitigación (si se conocen).

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

### En Alcance (In Scope):
* Vulnerabilidades en la API REST (`server.ts`, middlewares, rutas de autenticación y mutación).
* Fallas de autenticación, escalación de privilegios, bypass de HMAC o fallas en el mecanismo *fail-closed*.
* Inyecciones de código, SQL, XSS reflejado/persistente, manipulación de prototipos o SSRF.
* Evasión de controles de admisión en Kubernetes o políticas Kyverno.
* Fugas de secretos reales no revocados en el código.

### Fuera de Alcance (Out of Scope):
* Ataques de denegación de servicio volumétricos (DDoS) contra infraestructura pública o CDN de terceros.
* Ingeniería social, phishing o ataques físicos contra los administradores.
* Reportes automatizados de escáneres estáticos sin una prueba de concepto (PoC) que demuestre explotabilidad real.
* Vulnerabilidades en servicios externos integrados (Google AI Studio, GitHub, Docker Hub).

---

## 5. Controles y Arquitectura de Seguridad Implementados

El repositorio cuenta con defensas en profundidad integradas en el pipeline y en runtime:

1. **Supply Chain Security & CI/CD Gates:**
   * Firma criptográfica **Keyless** con **Cosign** y atestación de **SBOM CycloneDX** mediante **Syft**.
   * Control de admisión en Kubernetes con **Kyverno** (`ClusterPolicy: Enforce`) exigiendo imágenes firmadas por GitHub Actions verificadas en Rekor.
   * **SAST Bloqueante con Semgrep:** Detección de fallas OWASP Top 10 en cada Pull Request.
   * **Dependency Review Gate:** Bloqueo automático de dependencias con vulnerabilidades HIGH+.
   * **SHA Pinning Estricto:** Anclaje por digest inmutable en GitHub Actions y contenedores Docker (Nginx, PgBouncer).
   * **Gobernanza Automatizada:** Renovate Bot con auto-merge limitado a parches npm y Dependabot con 7 días de cooldown.

2. **Defensas en Aplicación (Fail-Closed):**
   * Verificación de credenciales segura contra ataques de canal lateral basados en tiempo (`crypto.timingSafeEqual`).
   * Tokens de sesión firmados con HMAC SHA-256 independientes (`ADMIN_SESSION_SECRET`).
   * Revocación distribuida en Redis con política *fail-closed* ante caídas de infraestructura.
   * Sanitización contra XSS en payloads y respuestas (`422 Unprocessable Entity`).
   * Restricción estricta de descarga del código fuente (`/download/repo`) deshabilitada por defecto en producción.

3. **Zero-Trust Network Isolation & Anti-SSRF:**
   * **Egress Anti-SSRF:** Filtrado estricto `ipBlock` que bloquea peticiones salientes a endpoints de metadatos Cloud IMDS (`169.254.169.254/32`), subredes privadas RFC 1918 y loopback.
   * **Mediación Forzosa con PgBouncer:** En producción, PostgreSQL rechaza conexiones directas de los pods de la API; toda consulta se canaliza a través de PgBouncer.
   * **Egress DNS Restringido:** Resolución DNS acotada exclusivamente a pods con selector `k8s-app: kube-dns`.
   * **Redes Internas Docker:** Aislamiento con `internal: true` en Docker Compose.

4. **Gestión de Secretos Desacoplada:**
   * Soporte para **External Secrets Operator** y modo `existingSecret: "pokedex-prod-secrets"` en Helm para prevenir contraseñas en Git o flags CLI.
   * Manifiestos cifrados con **Bitnami Sealed Secrets** para entornos on-premise.
   * Escaneo preventivo continuo con **Gitleaks**.
