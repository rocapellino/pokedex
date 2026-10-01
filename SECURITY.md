# 🛡️ Política de Seguridad y Divulgación Responsable (Security Policy)

La seguridad de la plataforma **Pokédex** y la protección de los datos de nuestros usuarios son prioritarias. Agradecemos el esfuerzo de la comunidad de seguridad y de los investigadores al identificar y reportar vulnerabilidades de manera responsable.

---

## 📑 Tabla de Contenidos

- [1. Versiones con Soporte](#1-versiones-con-soporte)
- [2. Reporte de Vulnerabilidades (Responsible Disclosure)](#2-reporte-de-vulnerabilidades-responsible-disclosure)
- [3. Acuerdo de Nivel de Servicio (SLA de Respuesta)](#3-acuerdo-de-nivel-de-servicio-sla-de-respuesta)
- [4. Alcance y Exclusiones](#4-alcance-y-exclusiones)
- [5. Resumen de Controles y Referencias Técnicas](#5-resumen-de-controles-y-referencias-técnicas)
- [6. Postura de Exposición de la Información (Repositorio Público)](#6-postura-de-exposición-de-la-información-repositorio-público)

---

## 1. Versiones con Soporte

Únicamente la versión más reciente en la rama principal (`main`) y los releases oficiales etiquetados reciben parches de seguridad activos:

| Versión / Rama | Estado de Soporte | Runtime Base |
| :--- | :--- | :--- |
| **`main` (Latest)** | ✅ Con soporte activo | Node.js 22 LTS / Docker Alpine |
| **`v1.x` Releases Activos** | ✅ Con soporte activo | Node.js 22 LTS / Kubernetes 1.30+ |
| **`< v1.75.0`** | ❌ Fin de ciclo de vida (EOL) | Versiones anteriores no soportadas |

---

## 2. Reporte de Vulnerabilidades (Responsible Disclosure)

> [!IMPORTANT]
> **Por favor, NO abras un issue público de GitHub para reportar vulnerabilidades de seguridad.**
> La divulgación pública prematura expone a los usuarios antes de que podamos publicar un parche de remediación.

### Canales Seguros de Comunicación

**GitHub Private Vulnerability Reporting (Canal Preferente):**

- Dirígete a la pestaña **Security** del repositorio en GitHub: [Report a Vulnerability](https://github.com/rocapellino/pokedex/security/advisories/new).
- Proporciona un informe detallado con pasos de reproducción, impacto estimado y prueba de concepto (PoC).

### Información a Incluir en el Reporte

- Descripción clara de la vulnerabilidad y vector de ataque.
- Componentes afectados (backend `server.ts`, endpoints REST, middlewares, manifiestos Helm/K8s).
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
| **Desarrollo y Test del Parche** | **< 5 días hábiles** | Corrección en rama privada y validación con suites de seguridad. |
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

- Ataques de denegación de servicio volumétricos (DDoS) contra infraestructura de red o proveedores DNS.
- Ingeniería social, phishing o ataques físicos contra colaboradores o infraestructura.
- Reportes automatizados de escáneres estáticos sin una prueba de concepto (PoC) que demuestre explotabilidad real.
- Vulnerabilidades en servicios externos integrados (Google AI Studio, GitHub, Docker Hub).

---

## 5. Resumen de Controles y Referencias Técnicas

La plataforma implementa controles integrales de seguridad en profundidad (*Defense-in-Depth*):

- **Supply Chain Security:** Firma criptográfica de contenedores con Cosign, atestación de SBOM CycloneDX y control de admisión estricto con Kyverno en Kubernetes.
- **Aislamiento de Red Zero-Trust:** Políticas Cilium L7 y NetworkPolicies para mitigar SSRF y restringir el tráfico a bases de datos y servicios internos.
- **Gestión Declarativa de Secretos:** Integración desacoplada con HashiCorp Vault CE y External Secrets Operator (ESO), impidiendo credenciales en Git.
- **Escaneos Continuos en CI:** SAST con Semgrep y CodeQL, análisis SCA con Dependency Review y Trivy, y detección de secretos con Gitleaks.

Para especificaciones técnicas detalladas, guías de configuración y arquitectura de seguridad interna, consulta:

- [docs/security/](docs/security/): Manuales de hardening, auditorías y políticas operativas de seguridad.
- [docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md](docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md): Especificación de aislamiento de red y defensas anti-SSRF.
- [docs/decisions/](docs/decisions/): Architectural Decision Records sobre seguridad, autenticación y secretos.

---

## 6. Postura de Exposición de la Información (Repositorio Público)

Este repositorio es **público** por diseño: su propósito es demostrar la arquitectura de una plataforma DevSecOps completa, no operar infraestructura productiva real. Esta sección declara de forma explícita **qué información es pública y por qué**, para que la postura no dependa de que un lector la infiera.

### 6.1. Información deliberadamente pública (topología de referencia)

El repositorio documenta una **topología de red de referencia** con fines didácticos. Es funcional y está fijada por pruebas de contrato, pero **no corresponde a la red de ningún despliegue real**:

| Elemento | Valor de referencia | Dónde aparece |
| :--- | :--- | :--- |
| Secret Manager (Vault CE) | `10.10.13.110` | `docs/`, `infra/k8s/eso/`, `scripts/`, `tests/` |
| Bastion (Management Plane) | `10.10.13.120` | `docs/architecture/RESPONSIBILITY_MATRIX.md` |
| Nodo de control K8s | `10.10.13.100` | `infra/ansible/`, `tests/` |
| Segmento de gestión | `10.10.13.0/24` | `infra/ansible/inventories/`, `tests/` |

> [!IMPORTANT]
> **Estos valores no son parametrizables por diseño y están sujetos a contrato.**
> `scripts/k8s-rollout-restart.ts` y `tests/security/iac_baseline_security.test.ts` verifican literalmente estas direcciones: cambiarlas rompe los gates. Sanear la documentación **sin** parametrizar la infraestructura no reduciría la exposición, solo ocultaría parte de ella.

### 6.2. Lo que nunca se publica

La postura es estricta en la distinción entre **topología** (pública por diseño) y **credenciales** (nunca versionadas):

- Claves privadas, tokens, contraseñas o certificados.
- Material criptográfico del TPM/KMS o claves de firma de contenedores.
- Datos de negocio, catálogos de producción o volumetría real.
- Claves de API de terceros (`SONAR_TOKEN`, `LINEAR_API_KEY`, `GEMINI_API_KEY`).

Esto se sostiene mediante controles automatizados, no por convención: **Gitleaks** es *required status check* en `main` (`🛡️ Gitleaks Secret Detection`), y los secretos de producción se inyectan en tiempo de ejecución desde HashiCorp Vault mediante External Secrets Operator, nunca desde el repositorio.

### 6.3. Reportar exposición no intencionada

Si detectas que se ha publicado información que **no** corresponde a esta postura (por ejemplo, una credencial real), trátalo como una vulnerabilidad y repórtala por el [canal seguro de la sección 2](#2-reporte-de-vulnerabilidades-responsible-disclosure), **no** mediante un issue público.
