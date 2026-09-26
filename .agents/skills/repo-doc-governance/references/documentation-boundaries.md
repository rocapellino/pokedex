# 🧭 Límites y Alcance Documental (`documentation-boundaries.md`)

Este documento establece la delimitación formal de qué información pertenece y qué información está expresamente prohibida en cada nivel del árbol documental del proyecto **Pokédex**.

---

## 1. Principio Fundamental de Delimitación

Cada documento en el repositorio responde a una audiencia, horizonte temporal y propósito específico:

```text
               PÚBLICO Y ESTABLE (ALTO NIVEL)
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
          README.md                 SECURITY.md
               │                         │
               └────────────┬────────────┘
                            │
               ESPECIFICACIÓN TÉCNICA (SSOT)
                            ▼
                    docs/architecture/
                    docs/devops/
                    docs/operations/
                    docs/security/
                    docs/decisions/ (ADR)
                            │
               EVIDENCIA HISTÓRICA / REPORTES
                            ▼
                    docs/audits/ (Baseline Vigente)
```

---

## 2. Límites Específicos para `README.md`

El archivo `README.md` es la **carta de presentación y guía de entrada** del proyecto. Está dirigido a desarrolladores, usuarios y evaluadores de arquitectura.

### Información Permitida y Requerida

- **Visión General del Proyecto:** Propósito del sistema, problema que resuelve y valor técnico.
- **Características Principales:** Funcionalidades destacadas de la aplicación, catálogo y capacidades de IA.
- **Resumen Arquitectónico:** Diagrama de alto nivel y explicación sucinta de componentes principales.
- **Stack Tecnológico Resumido:** Runtimes, lenguajes base, base de datos y orquestación.
- **Requisitos Previos:** Herramientas mínimas para ejecución (Node.js, Docker, Task/Make).
- **Inicio Rápido Local:** Instrucciones breves y reproducibles para levantar el entorno en desarrollo.
- **Ejecución de Pruebas:** Comandos estándar para validar unit tests, lint y typecheck.
- **Resumen de Despliegue:** Visión agnóstica de despliegue (Docker, Kind, Kubernetes portable).
- **Resumen de Seguridad:** Mención de enfoque DevSecOps y enlace canónico hacia `SECURITY.md`.
- **Índice Canónico:** Enlaces organizados hacia las secciones técnicas en `docs/`.

### Información Prohibida en `README.md`

- ❌ **Detalles Internos de Implementación:** Código fuente extenso, firmas de funciones o detalles de controladores.
- ❌ **Historial de Cambios / Bitácoras:** Registros cronológicos de commits, intervenciones de herramientas o notas de release.
- ❌ **Resultados y Hallazgos de Auditorías:** Reportes pasados de vulnerabilidades o auditorías de código.
- ❌ **Decisiones Arquitectónicas Completas:** Textos íntegros de ADRs (deben residir en `docs/decisions/`).
- ❌ **Troubleshooting Exhaustivo:** Guías paso a paso de resolución de incidentes (pertenecen a `docs/runbooks/`).
- ❌ **Instrucciones Operativas Extensas:** Procedimientos de aprovisionamiento de nodos o backups profundos.
- ❌ **Información Temporal o Volátil:** Fechas estimadas, tareas en progreso o estados efímeros de sprint.
- ❌ **Versiones Pinneadas Altamente Mutables:** SHA256 de imágenes OCI o versiones de patch en texto libre.
- ❌ **Lock-in de Proveedor Cloud:** Presentar AWS EKS, GCP o Proxmox como la única forma obligatoria de ejecución.
- ❌ **Afirmaciones de Rendimiento No Respaldadas:** Métricas sin evidencia empírica verificada.

---

## 3. Límites Específicos para `SECURITY.md`

El archivo `SECURITY.md` es la **política pública de divulgación y reporte responsable** de vulnerabilidades.

### Información Permitida y Requerida

- **Procedimiento de Reporte:** Canales privados de contacto, claves PGP (si aplica) y expectativas de comunicación.
- **Matriz de Versiones Soportadas:** Tabla concisa de versiones activas y su estado de parches.
- **Alcance de Seguridad (*Scope*):** Qué componentes entran en el programa de reporte y cuáles no.
- **Proceso de Respuesta:** Tiempos de acuse de recibo y fases de triage, parcheo y release.
- **Política de Divulgación Coordinada:** Compromiso de divulgación responsable y no retaliación.
- **Enlaces a Documentación Técnica de Seguridad:** Vínculos hacia `docs/security/` y `docs/architecture/`.

### Información Prohibida en `SECURITY.md`

- ❌ **Detalle Exhaustivo de Herramientas Internas:** Explicaciones largas de configuración de Trivy, Semgrep, CodeQL o Gitleaks (pertenecen a `docs/security/`).
- ❌ **Hallazgos de Auditorías Pasadas:** Listas de CVEs resueltos en releases previos.
- ❌ **Inventarios de Dependencias:** Tablas de paquetes npm o bibliotecas de terceros.
- ❌ **Rutas Hardcodeadas de Secretos:** Nombres de claves en Vault o tokens de entorno.
- ❌ **Controles Temporales o Parciales:** Workarounds transitorios no consolidados.

---

## 4. Límites para Documentación Técnica (`docs/`)

La carpeta `docs/` contiene la **especificación formal permanente y activa (SSOT)**:

- `docs/architecture/`: Especificaciones de arquitectura de software, datos, escalabilidad y patrones.
- `docs/devops/`: Tooling, integración continua, supply chain security e infraestructura como código.
- `docs/operations/`: Procedimientos operativos estándar, guías de host físico y configuración.
- `docs/runbooks/`: Protocolos paso a paso para incidentes, contingencias y recuperación ante desastres.
- `docs/security/`: Hardening profundo, políticas Zero-Trust, aislamiento de red Cilium y gestión de secretos.
- `docs/decisions/`: Registro inmutable de Architectural Decision Records (ADR).

---

## 5. Límites para Auditorías (`docs/audits/`)

- Solo se mantiene en el árbol de trabajo el **último baseline consolidado** (ej. `2026-09-26/baseline_post-release.md`).
- Todas las auditorías históricas y reportes intermedios cerrados residen exclusivamente en el **historial de commits de Git**, consultables vía `git log`.
- **Regla de Oro:** Ningún documento activo infiere configuración ni estado actual desde `docs/audits/`.
