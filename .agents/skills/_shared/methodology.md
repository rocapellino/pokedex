# Metodología y Gobernanza de Skills de Análisis (`rocapellino/pokedex`)

Este documento constituye la fuente central de verdad metodológica, operativa y de gobernanza para todas las skills alojadas en `.agents/skills/`.

---

## 1. El Principio Fundamental de Prevalencia Fáctica

El volumen y detalle de la documentación técnica en `docs/` no constituye prueba de implementación. Toda afirmación documental ("PVC backup activo", "HA multinodo", "rotación automática", "SSRF mitigado") es una hipótesis descriptiva que **carece de valor probatorio por sí misma**.

Queda formalmente establecida la **Cadena Inviolable de Prevalencia Fáctica**:

```text
Código / Configuración Fuente (TypeScript, YAML, Dockerfiles, OpenTofu, Helm)
       ↓
Render Declarativo (helm template, kustomize, compilación AST de manifests)
       ↓
Configuración Efectiva (lo que el componente del entorno realmente interpreta)
       ↓
Tests Automatizados (unitarios, integración, contratos de seguridad, CI gates)
       ↓
Runtime Operacional (pods en clúster K8s, health probes, logs en vivo)
       ↓
Documentación (Reflejo descriptivo verificable de los 5 niveles superiores)
```

### Regla de Oro: Prohibición de Deducción Documental Inversa

```text
PROHIBIDO:
Documentación ──► "Parece que está implementado" ──► Aprobado sin verificar
```

- **Si la documentación afirma que una capacidad existe o está activa:** La auditoría **NO** puede darlo por válido hasta descender por la cadena:
  1. **¿Existe el código/template?** (Ej. ¿existe `templates/backup-cronjob.yaml`?).
  2. **¿Se renderiza en el entorno evaluado?** (Ej. en `gitops/environments/proxmox-preprod/values.yaml` figura `backup.enabled: false`, por tanto en Pre-prod **NO** está renderizado).
  3. **¿Es efectivo en ese entorno?** Renderizar no basta: el componente que lo consume debe interpretarlo. Ej.: anotaciones `nginx.ingress.kubernetes.io/*` renderizadas en un entorno cuyo `ingress.className` es `traefik` se ignoran en silencio; una directiva `add_header` de nginx a nivel `server` no se hereda en un `location` que declara las suyas; una cookie `Secure` no se conserva sobre un entrypoint HTTP.
  4. **¿Lo certifican los tests?** (Ej. ¿hay un test en `tests/` que verifique que el Job ejecuta o que el contrato se cumple?).
  5. **¿Opera en runtime?** (Ej. ¿el pod realmente alcanza el almacenamiento y genera el volcado?).
- **Veredicto ante Divergencia:** Si la documentación declara como "activo" o "garantizado" algo que el **Render** tiene desactivado, que **no es efectivo** en el entorno o que los **Tests** no cubren, el hallazgo se clasifica de forma inmediata como **Divergencia Fáctica Severa (P1)**. La verdad técnica la dicta el código renderizado y testeado, nunca el texto narrativo.

### Gates en Verde no Certifican Ausencia de Defectos

Los quality gates del repositorio (`npm test`, `docs:validate`, `gitops:verify-parity`, `lint:*`) verifican **forma y contratos declarados**: sintaxis, pinning, enlaces, paridad. No verifican el **comportamiento entre capas** salvo que exista un test que lo ejercite.

- Un reporte de auditoría nunca concluye "sin hallazgos" a partir de gates en `PASS`. La sección de checks automáticos y la de hallazgos son independientes.
- Toda auditoría que declare cobertura de `architecture` o `security` debe incluir al menos un **trazado de rutas por entorno** (ver `repo-architecture`): seguir una petición real desde el cliente hasta el handler en cada entorno activo.
- Cuando un hallazgo P0/P1 escapó a gates en verde, su remediación debe incluir el test que lo habría detectado (ver `repo-fix`).

### Relación entre Prevalencia Fáctica y Decisiones de Arquitectura (ADRs)

Los **Architectural Decision Records** (`docs/decisions/ADR-*.md`) con estado *Aceptado* representan la intención y el contrato arquitectónico formal acordado:

- **Estado Observado vs. Intención Formal:** La cadena de prevalencia fáctica (código, render, tests) dictamina con exactitud el estado *fáctico y observable* del repositorio. El ADR aceptado dictamina el *contrato arquitectónico formal*.
- **Clasificación de Divergencia (ADR Drift):** Si el código o render diverge de un ADR aceptado, la verdad fáctica no valida automáticamente el cambio ni anula el ADR. Dicha discrepancia se clasifica estrictamente como **`ADR Drift` (P1/P2)**, requiriendo intervención explícita: alinear el código con la decisión formal, o tramitar una enmienda formal del ADR (*Superseded* / *Amended*).

### Demarcación de Evidencia Histórica vs. SSOT de Arquitectura

Para evitar confusiones en agentes autónomos y análisis automatizados:

- **`docs/architecture/` (Estado Actual):** Es la única fuente documental canónica de especificación arquitectónica activa (siempre validada contra código, render y tests).
- **`docs/audits/<fecha>/` (Evidencia Histórica):** Aloja diagnósticos, auditorías y snapshots fechados de hitos de revisión pasados.
- **Regla Estricta:** **Los documentos bajo `docs/audits/<fecha>/` son evidencia histórica y NO constituyen la Fuente Única de Verdad (SSOT)**.
- **Prohibición de Inferencia de Configuración Vigente:** Ningún agente ni auditoría debe extraer claves de configuración, taxonomías de secretos o contratos vigentes de documentos históricos de auditoría (por ejemplo, discrepancias superadas como `pokedex/production`). La configuración vigente se extrae exclusivamente del código fuente, Helm values y `docs/architecture/`.

---

## 2. Contexto Operativo y Tecnológico del Monorepo

Toda skill de análisis debe asumir como punto de partida el stack real y la topología operativa del repositorio:

- **Estructura:** Monorepo con workspaces npm (`apps/backend` y `apps/frontend`).
- **Runtime & Lenguajes:** Node.js 22 (LTS), npm 11+, TypeScript estricto.
- **Backend:** Express, Drizzle ORM, PostgreSQL (con pool nativo y soporte PgBouncer), Redis distribuido (rate limiting / caché).
- **Frontend:** Vanilla TypeScript puro empaquetado con Vite, saneamiento estricto con DOMPurify, servido mediante contenedor Nginx Alpine. *(No utiliza React ni JSX)*.
- **Entorno de Desarrollo:** Docker Compose (`docker-compose.dev.yaml`) con persistencia local y soporte de backup.
- **Orquestación & Cómputo:**
  - **Kind:** Clúster local para validación rápida y pruebas en CI.
  - **Proxmox VE (On-Prem):** K3s sobre Pre-producción (LXC 800) y Producción (VM 801 K3s dedicada). Traefik Ingress Controller nativo, Cilium CNI / L7 NetworkPolicies.
  - **AWS (Cloud-Ready):** EKS con AWS Secrets Manager y Reloader Stakater.
- **GitOps:** ArgoCD bajo patrón App-of-Apps (`root-application.yaml` reconciliando `pokedex-proxmox` y `pokedex-preprod`). `pokedex-cloud` (AWS/EKS) es una **referencia inactiva**, excluida del App-of-Apps (GITOPS-001) y activable solo de forma explícita.
- **Secretos:** HashiCorp Vault CE con External Secrets Operator (ESO) y roles segregados por entorno (`pokedex/prod` y `pokedex/preprod`).
- **Seguridad y Supply Chain:** OCI digest pinning inmutable (sha256), SBOM CycloneDX, firma Cosign, atestación SLSA y validación Kyverno admission controller.
- **IaC & Config Management:** OpenTofu para aprovisionamiento y Ansible para configuración de host/servicios base.
- **Convención de Extensión YAML:** la extensión canónica para todo archivo YAML es **`.yaml`** (manifiestos, values, workflows, configuraciones, playbooks e inventories). La extensión `.yml` está **prohibida para archivos nuevos** y solo se admite si una herramienta externa la impone, en cuyo caso debe documentarse como excepción. Enforcement: `npm run lint:yaml` (`npm run lint:yaml:strict` en CI) mediante `scripts/check-yaml-extension.ts`.
- **Observabilidad:** métricas Prometheus (`/metrics`), logs estructurados Pino y propagación W3C `traceparent` / `X-Request-Id` (`apps/backend/src/middleware/request-tracer.ts`). No existe SDK ni exportador OpenTelemetry en el código: `OTEL_EXPORTER_OTLP_ENDPOINT` se inyecta pero no se consume.

---

## 3. Flujo Canónico de Análisis (8 Pasos)

Toda auditoría, evaluación o análisis especializado debe seguir rigurosamente este ciclo de vida:

1. **Contexto:** Ejecutar o consultar `repo-context` si el contexto técnico operativo no está disponible en la sesión.
2. **Fuentes de Verdad:** Inspeccionar el código y configuración activa antes de consultar documentación derivada.
3. **Contraste:** Comparar el estado actual contra los estándares arquitectónicos, de seguridad y de calidad del stack real.
4. **Evidencia:** Registrar la evidencia exacta (`archivo:línea`, comando ejecutado o bloque de configuración).
5. **Clasificación:** Clasificar cada hallazgo según Severidad/Prioridad, Nivel de Confianza y Estimación de Esfuerzo.
6. **Propuesta Accionable:** Diseñar recomendaciones e intervenciones incrementales, priorizando reversibilidad y bajo acoplamiento.
7. **Plan de Cambio:** Si el usuario solicita implementar modificaciones, generar primero un plan estructurado (usando `repo-impact` y la plantilla `_shared/change-plan.md`).
8. **Cierre Documental y Quality Gate de Markdown:** Si el análisis genera o modifica archivos Markdown (reportes, planes, README, `docs/`), debe ejecutarse obligatoriamente el procedimiento centralizado [`_shared/markdown-quality.md`](markdown-quality.md). Ningún artefacto Markdown se considera terminado si contiene violaciones `MDxxx`.

---

## 4. Reglas Comunes de Gobernanza

- **Evidence-First:** Queda terminantemente prohibido formular afirmaciones, alertas o recomendaciones que no estén fundamentadas en archivos reales, comandos verificables o pruebas ejecutables.
- **Separación de Responsabilidades:** Separar con claridad meridiana:
  1. *Estado actual* (lo que existe hoy en código).
  2. *Recomendación técnica* (lo que se propone).
  3. *Decisión* (lo acordado o aprobado).
- **Cero Alucinaciones:** No inventar CVEs, números de versión, arquitecturas ficticias, métricas de cobertura ni estados de compliance.
- **Economía de Herramientas:** No introducir dependencias, librerías o herramientas nuevas si una herramienta ya presente en el repositorio cubre el requerimiento, salvo beneficio sustancial debidamente demostrado.
- **Modo Read-Only por Defecto:** Las skills de análisis son de sólo lectura; nunca deben alterar ni eliminar archivos salvo orden explícita del usuario.
- **Eliminación Segura:** Toda propuesta de eliminación requiere evidencia comprobable de desuso, ausencia de referencias cruzadas y procedimiento de reversibilidad.
- **Taxonomía de Prioridades:**
  - **P0 (Crítico):** Vulnerabilidad activa, caída de servicio, corrupción de datos o brecha de seguridad inmediata.
  - **P1 (Alto):** Deuda técnica severa, divergencia de contratos GitOps/secretos, falla en CI o riesgo operativo.
  - **P2 (Medio):** Inconsistencia menor, advertencia de linting, falta de documentación o ineficiencia técnica.
  - **P3 (Bajo):** Mejora cosmética, optimización menor o refactor de legibilidad.
- **Niveles de Confianza:** `HIGH` (evidencia directa e irrefutable), `MEDIUM` (fuerte inferencia técnica), `LOW` (sospecha que requiere validación en runtime).
- **Esfuerzo Estimado:** `XS` (< 1h), `S` (1-4h), `M` (1-2 días), `L` (3-5 días), `XL` (> 1 sprint).
- **Identificadores de Hallazgo con Namespace (AUD-):** Cada auditoría emite hallazgos bajo un namespace propio y **jamás reutiliza el de otra**. El formato es `AUD-<ÁMBITO>-<CLAVE>-<NNN>`:

  ```text
  AUD-GOV-DOC-001        hallazgo de gobernanza documental
  AUD-WF-TRIG-002        hallazgo de triggers en workflows
  AUD-TST-PERF-001       hallazgo de testing de performance
  AUD-SCR-LIFECYCLE-001  hallazgo de ciclo de vida de scripts
  ```

  - **Ámbito** (`GOV`, `WF`, `TST`, `SCR`, `SEC`, `INF`): la dimensión auditada.
  - **Clave**: sigla estable del subtipo (`DOC`, `TRIG`, `PERF`, `LIFECYCLE`, `SEC`, `INF`). Debe ser distinta del ámbito cuando la repetición resultara redundante (`AUD-WF-WF-002`).
  - **NNN**: correlativo **dentro del namespace**, sin reiniciar en auditorías nuevas.

  > [!IMPORTANT]
  > **Por qué el namespace es obligatorio.** Los identificadores planos (`DOC-001`, `WF-002`) colisionan entre auditorías sucesivas: en este repositorio `DOC-001` designó en una pasada "referencias históricas `.yml`" y en otra "ambigüedad Active vs Cloud-Ready". Un identificador reutilizado hace que una referencia posterior sea ambigua, y en un repositorio gobernado por evidencia eso es un defecto: la trazabilidad deja de ser verificable.
  >
  > Cuando un hallazgo se reemita bajo un namespace nuevo, **no se renumera ni se reutiliza** el identificador previo: se cita el ID original y se añade el nuevo con su propio ID.
- **Pipeline de Cambios:** Todo cambio de código sigue la secuencia `repo-impact` → (`repo-fix` si altera comportamiento observable | `repo-refactor` si lo preserva) → `repo-testing` → `repo-pr`/`repo-release`.
- **Integridad de Gates de Validación:** Queda terminantemente prohibido falsear o promover artificialmente el estado de un control técnico. En particular, **ninguna skill o agente puede convertir `CI_REQUIRED` o `NOT_EXECUTED` en `PASS`**. `CI_REQUIRED` documenta formalmente la ausencia de la herramienta en el entorno local y transfiere la certificación obligatoria a los workflows remotos de CI. Un PR puede alcanzar `READY_FOR_PR` con controles en `CI_REQUIRED`, pero el control individual preserva su estado estricto hasta que CI lo certifique.
- **Política Transversal de Idioma:** Toda interacción humana, reportes, planes, Pull Requests y documentación deben redactarse estrictamente en español, preservando identificadores técnicos, nombres de herramientas y comandos en inglés, conforme a [`_shared/language-policy.md`](language-policy.md).
- **Markdown Quality Gate Obligatorio:** Todo archivo `.md` creado, generado o actualizado por cualquier skill debe validarse contra markdownlint (`.markdownlint.json`) mediante `npm run lint:md -- <archivos>` siguiendo el procedimiento [`_shared/markdown-quality.md`](markdown-quality.md). Está estrictamente prohibido deshabilitar reglas para forzar un pase. Un archivo Markdown con errores `MDxxx` **no es un artefacto terminado**.
