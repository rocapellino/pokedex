# 🛡️ Política de Seguridad y Divulgación Responsable (Security Policy)

La seguridad de la plataforma **Pokédex** y la protección de los datos de nuestros usuarios son prioritarias. Agradecemos el esfuerzo de la comunidad de seguridad y de los investigadores al identificar y reportar vulnerabilidades de manera responsable.

---

## 📑 Tabla de Contenidos

- [1. Versiones con Soporte](#1-versiones-con-soporte)
- [2. Reporte de Vulnerabilidades (Responsible Disclosure)](#2-reporte-de-vulnerabilidades-responsible-disclosure)
- [3. Acuerdo de Nivel de Servicio (SLA de Respuesta)](#3-acuerdo-de-nivel-de-servicio-sla-de-respuesta)
- [4. Alcance y Exclusiones](#4-alcance-y-exclusiones)
- [5. Resumen de Controles y Referencias Técnicas](#5-resumen-de-controles-y-referencias-técnicas)

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
