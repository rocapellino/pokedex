---
name: repo-ci
description: Auditar y optimizar la topología de CI/CD (PR → Impact → Workflow → Job → Step → Tool). Usar al tocar .github/workflows/, .github/ci-impact.yaml o scripts invocados por CI, o ante jobs lentos o redundantes.
---

# repo-ci

## Objetivo

Auditar y gobernar la **topología integral de CI/CD** en GitHub Actions, asegurando que el Change Impact Analysis gobierne la ejecución no solo a nivel de workflows, sino hasta el nivel atómico de **Jobs**, **Steps** y **Tools**, garantizando máximo paralelismo, determinismo, mínimo consumo de compute y cero ejecuciones redundantes.

---

## Modelo de Topología de CI (6 Niveles de Abstracción)

`repo-ci` analiza la cadena de entrega como un Grafo Acíclico Dirigido (DAG) multinivel:

```text
1. PR Event          -> Archivos modificados y diff unificado
    ↓
2. Change Impact     -> Clasificación declarativa por dominio (.github/ci-impact.yaml)
    ↓
3. Workflow Trigger  -> Filtrado inicial de pipeline (paths, paths-ignore, eventos)
    ↓
4. Job Scheduling    -> Condicionales granulares (if: needs.detect-impact.outputs.<dominio> == 'true')
    ↓
5. Step Execution    -> Pasos contextuales por entorno, arquitectura o modo
    ↓
6. Tool Invocation   -> Herramientas atómicas (Helm, OpenTofu, Ansible, Checkov, Semgrep, Trivy, etc.)
```

---

## Alcance y Verificaciones de Dominio

### 1. Auditoría de Topología y Desacoplamiento de Jobs

- **Erradicación de "God Jobs":** Detectar y descomponer jobs monolíticos que ejecutan múltiples herramientas heterogéneas bajo un único paraguas (ej. evitar que `validate-iac` agrupe Helm, OpenTofu, Ansible y Checkov).
- **Alineación 1:1 Impacto ↔ Job:** Garantizar que cada dominio emitido por `scripts/detect-change-impact.ts` (ej. `helm`, `opentofu`, `ansible`, `security_iac`, `security_sast`) active únicamente los jobs correspondientes.
- **Prevención de Fugas de Impacto (Impact Leakage):** Verificar que un cambio en código de aplicación (`apps/**`) jamás dispare jobs de integración pesada de infraestructura (ej. clúster Kind efímero) a menos que se hayan modificado manifiestos de Kubernetes o Helm.
- **Paralelismo en el DAG:** Eliminar dependencias secuenciales artificiales (`needs:`), permitiendo que jobs independientes corran simultáneamente en runners paralelos.

### 2. Gobernanza de Workflows y Triggers

- **Mapeo de Flujos Activos:** Supervisar los workflows del repositorio:
  - `ci.yaml`: Quality Gates de código, SAST, SCA, build de contenedor y release OCI.
  - `infra.yaml`: Validación granular de Helm, OpenTofu, Ansible, Checkov y prueba de integración canónica en Kind.
  - `security-gitleaks.yaml`: Detección obligatoria de secretos en git diff. Por diseño no declara `paths` ni `paths-ignore`: es un Required Status Check que debe reportarse en todo PR, incluidos los documentales.
  - `security-trivy.yaml`: Escaneo periódico y condicional de vulnerabilidades de contenedor y dependencias.
  - `config-linters.yaml`: linters de configuración condicionales: Actionlint (con ShellCheck embebido) sobre `.github/workflows`, Zizmor (auditoría de seguridad de workflows, severidad mínima `medium`, excepciones justificadas en `.github/zizmor.yaml`) y ShellCheck sobre los `*.sh` versionados. Bloqueante a través del Quality Gate.
  - `security-dast-zap.yaml`, `performance-k6.yaml`, `dr-simulation.yaml`: Flujos programados y de eventos específicos.
- **Extensión Canónica de Workflows:** todo workflow nuevo debe crearse en `.github/workflows/` con extensión **`.yaml`**. Está prohibido crear workflows con extensión `.yml`. Hoy no hay excepciones vigentes de nombre de archivo de configuración.
- **Filtrado Eficiente de Triggers:** Mantener filtros de `paths:` y `paths-ignore:` sincronizados con el contrato declarativo de impacto para evitar arranque innecesario de máquinas virtuales.

### 3. Seguridad y Hardening de CI

- **Principio de Mínimo Privilegio:** `permissions:` explícitos y restrictivos definidos a nivel global y refinados por job (ej. `contents: read`, `packages: write` solo en publicación).
- **Pinning Criptográfico Inmutable:** Todas las GitHub Actions deben utilizar SHA completo de commit (con comentario del tag semver, ej. `actions/checkout@3d3c42e5... # v7.0.1`).
- **Aislamiento de Secretos:** Mitigación estricta de riesgos ante Pull Requests provenientes de forks o ramas no confiables.

### 4. Eficiencia y Concurrencia

- **Grupos de Concurrencia:** Configuración de `concurrency:` con `cancel-in-progress: true` a nivel de workflow para cancelar ejecuciones obsoletas ante pushes sucesivos en el mismo PR.
- **Estrategias de Caché:** Reutilización eficiente de capas Docker (`type=gha`), dependencias npm (`npm ci` con cache) y binarios de herramientas.

---

## Antipatrones Topológicos Auditados

| Antipatrón | Descripción | Impacto Negativo | Solución Topológica |
| :--- | :--- | :--- | :--- |
| **God Job** | Un único job ejecuta validaciones de múltiples tecnologías no relacionadas. | Si falla Ansible, no se sabe si Helm era válido; bloquea el paralelismo. | Particionar en jobs atómicos independientes (`validate-helm`, `validate-opentofu`, etc.). |
| **Coarse Gating** | Un trigger amplio (`security: true`) dispara todas las herramientas de seguridad. | Un cambio en GitOps ejecuta npm audit y escaneo de imagen Docker innecesariamente. | Usar triggers granulares (`security_iac`, `security_sast`, `security_secrets`, etc.). |
| **Impact Leakage** | Un cambio en aplicación arrastra herramientas de infraestructura pesada. | Un bugfix en backend levanta un clúster Kind y despliega Helm. | Restringir el job de Kind estrictamente a cambios en `helm` o `kubernetes`. |
| **Artificial Pipeline Chains** | Jobs independientes encadenados con `needs:` innecesarios. | Tiempos de CI inflados artificialmente al serializar tareas independientes. | Declarar solo dependencias requeridas para artefactos o gates estrictos. |

---

## Comandos

- `/repo-ci topology`: Auditoría topológica multinivel completa (PR -> Impact -> Workflow -> Job -> Step -> Tool).
- `/repo-ci`: Diagnóstico integral de la infraestructura y flujos de CI/CD.
- `/repo-ci pr`: Evaluación de la topología de jobs y gates activados para Pull Requests.
- `/repo-ci security`: Análisis de permisos de tokens, pinning criptográfico y exposición de secretos.
- `/repo-ci optimization`: Estrategias para reducir tiempo en cola, maximizar paralelismo y afinar caché.

---

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Planes de Cambio:** Si se solicitan cambios en `.github/workflows/`, modelar la propuesta con [change-plan.md](../_shared/change-plan.md) y validar con `repo-impact`.
