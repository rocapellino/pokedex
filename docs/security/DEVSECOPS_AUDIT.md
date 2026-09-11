# 🛡️ Auditoría DevSecOps y Evaluación de Madurez Operativa

Este documento condensa los resultados de la auditoría de seguridad integral, análisis estático y dinámico, evaluación de la cadena de suministro y análisis de superficie de ataque para la plataforma **Pokédex**.

---

## 📑 Tabla de Contenidos

- [🛡️ Auditoría DevSecOps y Evaluación de Madurez Operativa](#️-auditoría-devsecops-y-evaluación-de-madurez-operativa)
  - [📑 Tabla de Contenidos](#-tabla-de-contenidos)
  - [1. Perfil del Sistema y Componentes Auditados](#1-perfil-del-sistema-y-componentes-auditados)
  - [2. Análisis de Vulnerabilidades y Gestión del Riesgo](#2-análisis-de-vulnerabilidades-y-gestión-del-riesgo)
  - [3. Evaluación de Buenas Prácticas y Madurez DevSecOps](#3-evaluación-de-buenas-prácticas-y-madurez-devsecops)
  - [4. Hoja de Ruta de Modernización](#4-hoja-de-ruta-de-modernización)

---

## 1. Perfil del Sistema y Componentes Auditados

| Capa / Subsistema | Ruta en Repositorio | Stack Tecnológico | Rol Operativo & Superficie Expuesta |
| :--- | :--- | :--- | :--- |
| **Núcleo de API REST** | [`apps/backend`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/backend) | Node.js 22 LTS, TypeScript, PostgreSQL, Redis | Ingesta, validación, lógica de negocio y persistencia relacional. |
| **Capa de Presentación** | [`apps/frontend`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/frontend) | Vanilla JS, HTML5/CSS3, Nginx Proxy | Interfaz gráfica pública y backoffice administrativo ligero. |
| **Automatización de Nodos** | [`infra/ansible`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/ansible) | Ansible Core, SSH, Cloud-Init | Hardening de SO, cortafuegos UFW y configuración base. |
| **Orquestación Kubernetes** | [`infra/helm/pokedex`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/helm/pokedex) | Helm Charts v3, K8s Manifests | Despliegue, HPA, PDB, Ingress y Network Policies Zero-Trust. |
| **Infraestructura Declarativa** | [`infra/opentofu`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/opentofu) | OpenTofu (Terraform DSL) | Aprovisionamiento declarativo de VMs/LXC en Proxmox y Cloud. |
| **Gobernanza y Admisión** | [`infra/k8s`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/k8s) | Kyverno, Cosign, Pod Security | Verificación criptográfica de firmas OCI y admisión. |

---

## 2. Análisis de Vulnerabilidades y Gestión del Riesgo

| Vector de Riesgo | Archivo Afectado | Severidad | Mecanismo del Fallo | Impacto Técnico & Mitigación |
| :--- | :--- | :---: | :--- | :--- |
| **Inyección de Código SQL** | [`apps/backend/src/services/db.ts`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/backend/src/services/db.ts) | **Crítica** | Interpolación no segura en consultas dinámicas. | **Mitigado:** Parámetros vinculados obligatorios (`$1`, `$2`) en todo el ciclo CRUD. |
| **Inyección de Código (XSS)** | [`apps/backend/src/validation/pokemon.ts`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/backend/src/validation/pokemon.ts) | **Media** | Inyección de etiquetas HTML maliciosas o pseudo-protocolos (`javascript:`, `onerror=`) en atributos del catálogo. | **Mitigado (Defensa en profundidad):** Filtro preventivo de tokens y delimitadores (`SCRIPT_PATTERN`) en backend, complementado por función `escapeHTML` estricta en frontend. *Limitación conocida:* Es un filtrado por lista negra; el roadmap contempla migración a Zod con parser/sanitizador HTML dedicado. |
| **Manipulación DOM (XSS)** | [`apps/frontend/public/js/*.js`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/frontend/public/js/pokedex.js) | **Alta** | Renderizado de respuestas de API en el DOM vía `innerHTML`. | **Mitigado:** Función `escapeHTML` estricta sanitizando `<`, `>`, `&`, `"`, `'` y backticks. |
| **Prompt Injection / DoS** | [`apps/backend/src/services/ai.ts`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/backend/src/services/ai.ts) | **Media** | Entrada no delimitada y carencia de disyuntor ante latencias. | **Mitigado:** Delimitadores semánticos XML `<user_prompt>`, sanitización y Circuit Breaker. |
| **Fuga de Secretos en Procesos** | [`infra/ansible/`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/ansible/) | **Alta** | Parámetros confidenciales por CLI o scripts bash legacy. | **Mitigado:** Script bash legacy retirado en favor de Ansible con [`infra/ansible/deploy_excludes.txt`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/ansible/deploy_excludes.txt) y variables seguras. |
| **Omisión de Cabeceras HTTP** | [`apps/backend/server.ts`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/backend/server.ts), [`apps/frontend/nginx.conf`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/apps/frontend/nginx.conf) | **Media** | Pérdida de cabeceras en bypass de Ingress, port-forward directo o bloques `location` con `add_header` propio. | **Mitigado:** Inyección redundante de CSP, HSTS, X-Content-Type-Options y Permissions-Policy tanto en Express como en Nginx. |
| **Exposición de Estado IaC** | [`infra/opentofu/environments/`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/infra/opentofu/environments) | **Alta** | Riesgo de persistencia de `.tfstate` con valores en claro. | **Mitigado:** Recomendación de backend remoto S3/PostgreSQL con cifrado en reposo. |

---

## 3. Evaluación de Buenas Prácticas y Madurez DevSecOps

El repositorio supera los estándares habituales de la industria incorporando defensas en profundidad:

1. **Firmado Criptográfico:** `infra/k8s/kyverno-cosign-policy.yaml` verifica firmas Cosign antes de admitir cualquier contenedor.
2. **Segmentación de Red:** `infra/helm/pokedex/templates/network-policies.yaml` aplica Zero-Trust con default-deny en bases de datos.
3. **Multiplexación de Conexiones:** Despliegue de `pgbouncer-deployment.yaml` para mitigar la saturación de pools en PostgreSQL.
4. **Secretos Seguros:** External Secrets y Sealed Secrets para evitar credenciales en texto claro en Git.
5. **Suite de Pentest Automatizada:** Pruebas continuas de inyección, escalación de privilegios HMAC, prototype pollution, SSRF, DoS y fuzzing en `tests/`.

---

## 4. Hoja de Ruta de Modernización

| Ámbito de Mejora | Solución Propuesta | Horizonte Temporal | Impacto en la Plataforma |
| :--- | :--- | :---: | :--- |
| **Hardening de Cabeceras** | Cobertura total de CSP, HSTS y Permissions-Policy en Nginx y Express | Implementado | Protección contra Clickjacking, MIME sniffing y omisión de Ingress en port-forward. |
| **Gestión de Estados IaC** | Backend remoto cifrado (S3 / OpenTofu HTTP / PG) | Inmediato | Protección absoluta de secretos y sincronización de infraestructura. |
| **Resiliencia en IA** | Circuit Breaker con degradación y delimitadores de prompt | Implementado | Prevención de saturación de hilos y blindaje anti-inyecciones. |
| **Telemetría** | Instrumentación de logs JSON estructurados correlacionados con Pino | Implementado | Diagnóstico distribuido y observabilidad con X-Request-Id. |
| **Validación de Datos (XSS)** | Validación tipada declarativa con esquemas Zod + DOMPurify en frontend | Implementado | Tipado estricto en runtime y neutralización de vectores XSS/Prototype Pollution. |
| **Capa Frontend** | Modernización a arquitectura Vite MPA con TypeScript y DOMPurify | Implementado | Tipado unificado de modelos y eliminación estructural de XSS en DOM. |
| **Gestión de Datos** | Persistencia y migraciones declarativas con Drizzle ORM | Implementado | Esquemas tipados, migraciones SQL versionadas y fallback resiliente. |
| **Aislamiento Egress L7** | Egress Gateway (Envoy) & Cilium FQDN NetworkPolicy (`toFQDNs`) | Implementado | Eliminación de salida `0.0.0.0/0` en HTTPS previniendo exfiltración externa y C2. |
| **Rotación de Credenciales** | Rotación programada automatizada de `ADMIN_API_KEY` (90 días) vía ExternalSecret | Corto Plazo | Reducción de la ventana de exposición ante fugas de la clave maestra. |
