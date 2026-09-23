OBJETIVO

Construir un inventario técnico y factual del repositorio Pokedex que sirva como
fuente de contexto para las siguientes etapas de análisis.

Esta etapa NO debe realizar un diagnóstico profundo ni proponer modificaciones.
Debe identificar qué existe actualmente en el repositorio.

MODO DE EJECUCIÓN

* Solo lectura.
* NO modificar código.
* NO modificar configuraciones.
* NO actualizar dependencias.
* NO eliminar archivos.
* NO crear PRs.
* NO realizar commits.
* NO ejecutar migraciones.
* NO realizar cambios en infraestructura.
* NO instalar nuevas herramientas salvo que sean estrictamente necesarias para
  inspección y ya estén disponibles en el entorno.
* No inventar información.
* Toda afirmación debe estar respaldada por archivos, configuración,
  scripts o evidencia observable.

UTILIZAR LAS SKILLS DISPONIBLES EN:

.agents/skills/

Priorizar:

1. repo-context
2. repo-audit

Las demás skills pueden utilizarse únicamente como apoyo para identificar
elementos existentes, pero esta etapa debe mantenerse como INVENTARIO y no como
DIAGNÓSTICO.

REPOSITORIO A INVENTARIAR

Repositorio: rocapellino/pokedex

==================================================

1. IDENTIDAD DEL REPOSITORIO
   ==================================================

Registrar:

* nombre
* versión
* package manager
* versión declarada de Node si existe
* versión de npm si existe
* lenguaje principal
* framework principal
* tipo de repositorio
* monorepo/workspaces
* branch actual
* commit actual
* estado del working tree

==================================================
2. ESTRUCTURA
=============

Mapear:

* directorios principales
* apps
* packages
* scripts
* docs
* infra
* tests
* configuración
* tooling
* archivos raíz relevantes

No incluir automáticamente archivos irrelevantes o generados.

==================================================
3. APLICACIONES Y COMPONENTES
=============================

Identificar cada aplicación/componente y registrar:

* ubicación
* propósito aparente
* tecnología
* entrypoints
* scripts asociados
* dependencias principales
* dependencias entre componentes

Para el Pokedex prestar especial atención a:

* apps/backend
* apps/frontend
* PostgreSQL
* Redis
* servicios externos/AI
* Docker
* Kubernetes
* Helm
* ArgoCD/GitOps
* OpenTofu
* Ansible

No asumir que una tecnología está activa únicamente porque aparece mencionada
en documentación. Verificar su presencia real.

==================================================
4. DEPENDENCIAS
===============

Inventariar:

* dependencies
* devDependencies
* overrides
* workspaces
* package-lock
* versiones relevantes
* dependencias compartidas
* herramientas de desarrollo

No determinar todavía si están desactualizadas o vulnerables.

==================================================
5. SCRIPTS
==========

Inventariar los scripts disponibles en package.json y, cuando corresponda,
scripts secundarios.

Clasificarlos:

* desarrollo
* build
* test
* lint
* typecheck
* seguridad
* database
* infraestructura
* Kubernetes
* GitOps
* CI/CD
* mantenimiento
* observabilidad

==================================================
6. TESTING
==========

Identificar:

* framework de tests
* tests unitarios
* integración
* API
* E2E
* Playwright
* accessibility
* fuzzing
* performance
* coverage
* fixtures
* mocks
* configuración de testing

No evaluar todavía la calidad de cobertura.

==================================================
7. CI/CD
========

Inventariar todos los workflows de:

.github/workflows/

Para cada uno registrar:

* nombre
* propósito
* triggers
* jobs
* dependencias entre jobs
* herramientas utilizadas
* artefactos
* gates
* despliegues
* seguridad
* infraestructura

==================================================
8. SEGURIDAD
============

Registrar únicamente controles y herramientas existentes:

* secret scanning
* SAST
* SCA
* dependency scanning
* container scanning
* IaC scanning
* CodeQL
* Gitleaks
* Trivy
* Semgrep
* Checkov
* Dependabot/Renovate
* SBOM
* signing
* provenance
* GitHub security
* NetworkPolicies
* egress controls
* autenticación/autorización
* rate limiting
* CORS
* validación
* gestión de secretos

NO determinar todavía si son suficientes.

==================================================
9. INFRAESTRUCTURA
==================

Inventariar:

* Dockerfiles
* docker-compose
* Helm charts
* Kubernetes manifests
* namespaces
* ingress
* services
* deployments
* statefulsets
* configmaps
* secrets references
* NetworkPolicies
* RBAC
* HPA
* PVC
* probes
* ArgoCD
* OpenTofu
* Ansible
* Kind
* monitoring

==================================================
10. DOCUMENTACIÓN
=================

Inventariar:

* README
* docs/
* architecture
* ADR
* security
* operations
* runbooks
* DevOps
* best practices
* API documentation

Registrar potenciales fuentes de verdad, pero NO evaluar contradicciones
todavía.

==================================================
11. OBSERVABILIDAD
==================

Identificar:

* logging
* Pino
* métricas
* health checks
* readiness/liveness
* tracing
* OpenTelemetry
* monitoring
* alertas

==================================================
12. BASE DE DATOS Y PERSISTENCIA
================================

Identificar:

* PostgreSQL
* Redis
* ORM/query layer
* migrations
* seeds
* backups
* cache
* persistencia
* scripts relacionados

==================================================
13. CONFIGURACIÓN Y VARIABLES
=============================

Inventariar:

* .env.example
* variables de entorno
* configuración runtime
* configuración build-time
* secretos referenciados
* configuración por ambiente

NO mostrar valores secretos.

==================================================
14. COMANDOS OPERATIVOS
=======================

Registrar los comandos realmente disponibles para:

* instalar
* desarrollar
* construir
* testear
* validar
* lint
* typecheck
* seguridad
* database
* infraestructura
* Kubernetes
* deployment

==================================================
15. EVIDENCIA
=============

Para cada sección indicar las principales fuentes utilizadas.

Formato:

Archivo:
Línea/sección:
Evidencia:

No inventar números de línea.

==================================================
16. OUTPUT
==========

Generar exclusivamente:

docs/audits/<FECHA>/baseline/baseline_inventario.md

La fecha debe corresponder a la fecha real de ejecución.

El documento debe ser autocontenido y procesable posteriormente por otra
corrida.

Debe comenzar con:

# Baseline Inventario

Y contener:

* fecha
* commit SHA
* branch
* estado del working tree
* metodología
* inventario
* evidencia
* limitaciones

Al finalizar NO realizar modificaciones adicionales.

Mostrar en la respuesta final únicamente:

* ubicación del archivo generado
* commit analizado
* cantidad aproximada de componentes identificados
* cantidad de workflows
* cantidad de aplicaciones
* cantidad de herramientas de testing
* cantidad de herramientas de seguridad
* cantidad de elementos de infraestructura
* cualquier limitación relevante