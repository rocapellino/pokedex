OBJETIVO

Realizar el primer diagnóstico técnico integral del repositorio Pokedex utilizando
como contexto principal el archivo:

docs/audits/<FECHA>/baseline/baseline_inventario.md

El objetivo es obtener una fotografía inicial del estado técnico del repositorio
y establecer una BASELINE que pueda utilizarse posteriormente para medir mejoras,
regresiones y nuevos findings.

IMPORTANTE:

El diagnóstico debe analizar el repositorio REAL además del inventario.

El archivo baseline_inventario.md es contexto, NO una fuente única de verdad.

Si existe una diferencia entre el inventario y el estado actual del repositorio,
verificarla directamente y registrarla.

MODO DE EJECUCIÓN

* Solo lectura.
* NO modificar código.
* NO modificar configuración.
* NO actualizar dependencias.
* NO eliminar archivos.
* NO realizar refactors.
* NO crear PRs.
* NO realizar commits.
* NO ejecutar migraciones.
* NO realizar cambios de infraestructura.
* No instalar herramientas nuevas salvo que sean estrictamente necesarias y ya
  estén disponibles.
* No inventar vulnerabilidades, CVEs, problemas ni arquitectura.
* Diferenciar claramente hechos, riesgos y recomendaciones.

==================================================
1. CONTEXTO
==================================================

Leer primero:

docs/audits/<FECHA>/baseline/baseline_inventario.md

Después verificar los elementos relevantes directamente en el repositorio.

==================================================
2. SKILLS A EJECUTAR
====================

Utilizar el conjunto de skills disponible en:

.agents/skills/

Ejecutar conceptualmente:

1. repo-audit
2. repo-security
3. repo-dependencies
4. repo-architecture
5. repo-quality
6. repo-testing
7. repo-ci
8. repo-cleanup
9. repo-modernize
10. repo-metrics
11. repo-maintenance

Utilizar repo-context como referencia del contexto del repositorio.

NO ejecutar acciones de modificación de:

* repo-refactor
* repo-pr
* repo-release

Estas skills pueden analizar impactos o riesgos únicamente si resulta necesario,
pero no deben modificar nada.

==================================================
3. CRITERIO DE EVIDENCIA
========================

Cada finding debe contener:

ID único

Categoría

Severidad:

P0 = crítico/bloqueante
P1 = alto
P2 = medio
P3 = bajo

Confianza:

HIGH
MEDIUM
LOW

Descripción

Evidencia

Archivos afectados

Impacto

Recomendación

Esfuerzo:

XS
S
M
L
XL

Estado:

CONFIRMED
POTENTIAL
RECOMMENDATION
NOT_VERIFIABLE

No convertir recomendaciones en findings confirmados.

==================================================
4. ARQUITECTURA
===============

Analizar:

* estructura del monorepo
* separación frontend/backend
* límites de módulos
* dependencias entre componentes
* PostgreSQL
* Redis
* AI/external services
* Docker
* Kubernetes
* Helm
* ArgoCD/GitOps
* OpenTofu
* Ansible
* networking
* ingress/egress
* observabilidad
* configuración

Detectar:

* acoplamiento innecesario
* responsabilidades duplicadas
* límites poco claros
* configuraciones contradictorias
* fuentes de verdad duplicadas

==================================================
5. SEGURIDAD
============

Analizar como mínimo:

* secretos
* autenticación
* autorización
* sesiones
* RBAC
* validación Zod
* SSRF
* egress
* CORS
* headers
* rate limiting
* manejo de errores
* exposición de información
* dependencias vulnerables
* supply chain
* GitHub Actions
* permisos
* secrets
* artefactos
* Docker
* Kubernetes
* Helm
* NetworkPolicies
* RBAC
* imágenes
* digest pinning
* SBOM
* signing
* provenance

Priorizar evidencia sobre recomendaciones genéricas.

==================================================
6. DEPENDENCIAS
===============

Analizar:

* dependencias desactualizadas
* vulnerabilidades conocidas verificables
* duplicados
* overrides
* dependencias potencialmente innecesarias
* dependencias transitivas problemáticas
* compatibilidad Node/npm/TypeScript
* lockfile
* reproducibilidad

No recomendar actualizar una dependencia únicamente porque existe una versión
más nueva.

Registrar impacto y riesgo de cada actualización importante.

==================================================
7. CALIDAD
==========

Analizar:

* TypeScript
* strictness
* complejidad
* duplicación
* tamaño de funciones
* acoplamiento
* manejo de errores
* logging
* contratos
* validación
* arquitectura backend
* arquitectura frontend
* naming
* imports
* módulos
* configuración

==================================================
8. TESTING
==========

Analizar:

* tests existentes
* cobertura
* unit
* integration
* API
* E2E
* Playwright
* accessibility
* fuzzing
* performance

Evaluar especialmente los flujos críticos:

* autenticación
* sesiones
* logout
* CRUD
* persistencia
* cache
* readiness
* servicios externos/AI
* SSRF/egress
* errores
* seguridad

No asumir que un script de test implica que existe una cobertura efectiva.

==================================================
9. CI/CD
========

Analizar todos los workflows existentes.

Buscar:

* duplicación
* gates ausentes
* permisos excesivos
* acciones no fijadas
* caching incorrecto
* secretos
* artifacts
* builds
* tests
* seguridad
* IaC
* Kubernetes
* DR
* releases
* concurrencia
* branch protection relacionada cuando sea verificable

Prestar especial atención a la relación entre:

ci.yml
api.yml
infra.yml
mega-linter.yml

y los workflows auxiliares.

==================================================
10. LIMPIEZA
============

Buscar evidencia de:

* archivos obsoletos
* scripts no utilizados
* configuraciones legacy
* documentación duplicada
* tooling abandonado
* dependencias no utilizadas
* overrides innecesarios
* artefactos generados
* configuraciones contradictorias

NO eliminar nada.

Para cada candidato indicar evidencia y confianza.

==================================================
11. MODERNIZACIÓN
=================

Analizar oportunidades relacionadas con:

* Node
* npm
* TypeScript
* Express
* Vanilla TypeScript / Vite
* testing
* tooling
* Docker
* Kubernetes
* Helm
* GitHub Actions
* GitOps
* OpenTofu
* Ansible
* observabilidad
* supply chain

Distinguir:

MAINTAIN
UPDATE
REPLACE
REMOVE

No recomendar migraciones por moda.

==================================================
12. DOCUMENTACIÓN
=================

Comparar documentación con:

* package.json
* scripts
* workflows
* Helm
* Kubernetes
* Docker
* infraestructura
* código

Detectar contradicciones verificables.

==================================================
13. MÉTRICAS
============

Generar métricas objetivas disponibles, por ejemplo:

* cantidad de archivos
* cantidad de aplicaciones
* cantidad de workflows
* cantidad de dependencias
* cantidad de tests
* cantidad de scripts
* cantidad de manifests
* cantidad de Dockerfiles
* cantidad de charts
* cantidad de findings

Cuando una métrica no pueda calcularse confiablemente, indicar:

NO_VERIFICABLE

No inventar métricas.

==================================================
14. PRIORIZACIÓN
================

Generar:

### P0 — Crítico

### P1 — Alto

### P2 — Medio

### P3 — Bajo

No generar rankings subjetivos.

Dentro de cada prioridad ordenar por:

1. impacto
2. evidencia
3. riesgo
4. esfuerzo estimado

==================================================
15. DUPLICACIÓN DE FINDINGS
===========================

Un mismo problema encontrado por varias skills debe consolidarse en un único
finding.

Registrar las skills que detectaron el problema como referencias secundarias.

Ejemplo:

SEC-001

Detectado por:

* repo-security
* repo-ci

No generar dos findings independientes.

==================================================
16. QUICK WINS
==============

Identificar cambios de bajo esfuerzo y bajo riesgo que puedan realizarse
posteriormente.

NO ejecutarlos.

==================================================
17. DEUDA TÉCNICA
=================

Separar:

* deuda confirmada
* deuda potencial
* deuda documental
* deuda de seguridad
* deuda de testing
* deuda de infraestructura
* deuda de CI/CD

==================================================
18. BASELINE
============

El documento debe terminar con una sección:

# Baseline para futuras comparaciones

Incluir:

* commit SHA
* branch
* fecha
* estado del working tree
* findings totales
* P0
* P1
* P2
* P3
* findings de seguridad
* findings de dependencias
* findings de arquitectura
* findings de calidad
* findings de testing
* findings de CI/CD
* candidatos de cleanup
* oportunidades de modernización
* deuda técnica
* limitaciones del análisis

==================================================
19. OUTPUT
==========

Generar exclusivamente:

docs/audits/<FECHA>/baseline/baseline_diagnostico.md

El archivo debe ser autocontenido y procesable posteriormente.

Debe incluir referencias concretas a:

* archivos
* directorios
* configuraciones
* scripts
* workflows
* dependencias
* manifests

Cuando sea posible indicar línea o sección.

No inventar líneas.

==================================================
1.  REGLA FINAL
===============

Esta ejecución establece la primera BASELINE del repositorio.

No modificar el repositorio.

No corregir findings.

No implementar recomendaciones.

No eliminar archivos.

No actualizar dependencias.

No hacer commits.

No generar PR.

Al finalizar informar únicamente:

* archivo generado
* commit analizado
* cantidad total de findings
* P0
* P1
* P2
* P3
* cantidad de findings de seguridad
* cantidad de findings de dependencias
* cantidad de problemas de CI/CD
* cantidad de problemas de testing
* cantidad de candidatos de cleanup
* cantidad de oportunidades de modernización
* limitaciones encontradas