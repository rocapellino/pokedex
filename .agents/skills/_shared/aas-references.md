# Referencias Metodológicas Externas: Agentic Awesome Skills (AAS)

Este documento centraliza los marcos conceptuales y metodológicos de las **ocho referencias aprobadas** de Agentic Awesome Skills (AAS, versión `18.6.0`). Su objetivo es permitir que cualquier agente consulte estas directrices cuando necesite profundizar en un análisis, manteniendo en todo momento la autoridad suprema en [`AGENTS.md`](../../../AGENTS.md) y en las skills locales de `.agents/skills/`.

---

## 1. Principio de Gobernanza y Subordinación

1. **Autoridad local única:** Las decisiones, fuentes de verdad y reglas operativas residen exclusivamente en el repositorio (`gitops/`, `infra/`, `apps/`, `docs/architecture/` y `.agents/skills/`).
2. **Modo sólo lectura / conceptual:** Las referencias de AAS no ejecutan comandos, no modifican archivos por sí mismas ni reemplazan el juicio de las skills locales (`mode: "reference-only"`).
3. **Despacho condicional:** La consulta a estas referencias es opcional y complementaria; se invoca cuando se requiere una taxonomía o checklist exhaustivo ante situaciones complejas.

---

## 2. Catálogo de Referencias Aprobadas

| Referencia AAS | Riesgo | Skills Locales Gobernantes | Ámbito de Consulta Metodológica |
| --- | :---: | --- | --- |
| `systematic-debugging` | Crítico | `repo-quality`, `repo-refactor` | Aislamiento de causa raíz y reproducción mínima antes de editar. |
| `project-skill-audit` | Seguro | `repo-lifecycle` | Diagnóstico de cobertura funcional y salud del catálogo de skills. |
| `code-review-excellence` | Seguro | `repo-pr`, `repo-quality` | Heurísticas de revisión de código, prevención de regresiones y legibilidad. |
| `dependency-scanning` | Seguro | `repo-dependencies`, `repo-security` | Evaluación de riesgos en el árbol de dependencias y cadena de suministro. |
| `documentation-and-adrs` | Crítico | `repo-docs` | Estructuración de registros de decisión arquitectónica (ADRs). |
| `senior-architect` | Crítico | `repo-architecture` | Análisis de desacoplamiento, patrones de resiliencia y diseño fail-closed. |
| `gitops-workflow` | Crítico | `repo-architecture`, `repo-release` | Inmutabilidad de release, paridad de entornos y control de drift. |
| `kubernetes-hardening` | Crítico | `repo-security`, `repo-architecture` | Verificación de Least Privilege, aislamiento de red L7/L4 y Pod Security Standards. |

---

## 3. Directrices y Patrones por Referencia

### A. `systematic-debugging` (Gobernada por `repo-quality` y `repo-refactor`)

- **Aislamiento de Causa Raíz:** No asumir hipótesis sin evidencia directa. Reproducir el fallo mediante un test automatizado mínimo antes de intentar cualquier modificación.
- **Hipótesis Falsables:** Formular una hipótesis verificable (ej. "el timeout ocurre por bloqueo en el pool de conexiones") y descartarla o validarla con métricas o logs.
- **Micro-pasos Compilables:** En refactorizaciones o correcciones complejas, aplicar un solo cambio por paso manteniendo compilación y tests en verde en cada iteración.

### B. `project-skill-audit` (Gobernada por `repo-lifecycle`)

- **Evitar Sobre-Gobernanza:** Mantener las skills enfocadas en sus responsabilidades canónicas sin duplicar validaciones ni generar bucles de orquestación.
- **Consistencia de Entradas y Salidas:** Garantizar que cada fase del ciclo de vida (auditar, matriz, ejecutar, actualizar, documentar, depurar) tenga un criterio de salida medible y trazable.

### C. `code-review-excellence` (Gobernada por `repo-pr` y `repo-quality`)

- **Calidad Observable:** Evaluar si el código introduce complejidad innecesaria, acoplamiento oculto o efectos secundarios no tipados.
- **Prevención de Regresiones:** Todo cambio funcional debe contar con pruebas unitarias o de integración que certifiquen el comportamiento esperado.
- **Verificación de Contratos:** Comprobar que los DTOs, interfaces de dominio y respuestas HTTP respeten los contratos documentados en `docs/api/` y los esquemas Zod vigentes.

### D. `dependency-scanning` (Gobernada por `repo-dependencies` y `repo-security`)

- **Supply Chain Hardening:** Monitorear transitividad de paquetes, evitar dependencias huérfanas y evaluar alertas SCA (Dependabot, Trivy, npm audit).
- **Inmutabilidad y Versionado:** Fijar versiones exactas mediante `package-lock.json` y usar `overrides` de forma justificada y documentada.

### E. `documentation-and-adrs` (Gobernada por `repo-docs`)

- **Estructura Canónica de ADR:** Registrar título, contexto fáctico, decisión adoptada, alternativas descartadas y consecuencias (positivas y negativas).
- **Anti-Drift Documental:** Si un cambio de código altera la realidad de la plataforma, el ADR o documento asociado debe actualizarse en el mismo PR.

### F. `senior-architect` (Gobernada por `repo-architecture`)

- **Diseño Fail-Closed:** Ante incertidumbre o fallo en dependencias críticas (base de datos, secretos, auth), el sistema debe degradar o abortar de forma segura, nunca degradar silenciosamente a un modo inseguro.
- **Trade-offs Explícitos:** Documentar el equilibrio entre desacoplamiento y complejidad operativa.

### G. `gitops-workflow` (Gobernada por `repo-architecture` y `repo-release`)

- **Inmutabilidad de Artefactos:** Promover imágenes y charts mediante digest inmutable (`sha256`), garantizando paridad estricta entre entornos.
- **Separación de Responsabilidades:** El clúster se reconcilia hacia el estado deseado en Git; no se aplican cambios manuales (`kubectl apply`) en entornos productivos o pre-productivos.

### H. `kubernetes-hardening` (Gobernada por `repo-security` y `repo-architecture`)

- **Principio de Menor Privilegio:** Contenedores sin privilegios de root (`USER` numérico no privilegiado, verificado en `apps/*/Dockerfile`), `readOnlyRootFilesystem: true`, y capacidades Linux restringidas (`drop: ALL`).
- **Defensa en Profundidad:** Segmentación estricta de red con Cilium L7 NetworkPolicies (Anti-SSRF), SecretStores externos (Vault CE + ESO) y sin uso de tokens default en ServiceAccounts.
