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
Tests Automatizados (unitarios, integración, contratos de seguridad, CI gates)
       ↓
Runtime Operacional (pods en clúster K8s, health probes, logs en vivo)
       ↓
Documentación (Reflejo descriptivo verificable de los 4 niveles superiores)
```

### Regla de Oro: Prohibición de Deducción Documental Inversa

```text
PROHIBIDO:
Documentación ──► "Parece que está implementado" ──► Aprobado sin verificar
```

- **Si la documentación afirma que una capacidad existe o está activa:** La auditoría **NO** puede darlo por válido hasta descender por la cadena:
  1. **¿Existe el código/template?** (Ej. ¿existe `templates/backup-cronjob.yaml`?).
  2. **¿Se renderiza en el entorno evaluado?** (Ej. en `gitops/environments/proxmox-preprod/values.yaml` figura `backup.enabled: false`, por tanto en Pre-prod **NO** está renderizado).
  3. **¿Lo certifican los tests?** (Ej. ¿hay un test en `tests/` que verifique que el Job ejecuta o que el contrato se cumple?).
  4. **¿Opera en runtime?** (Ej. ¿el pod realmente alcanza el almacenamiento y genera el volcado?).
- **Veredicto ante Divergencia:** Si la documentación declara como "activo" o "garantizado" algo que el **Render** tiene desactivado o los **Tests** no cubren, el hallazgo se clasifica de forma inmediata como **Divergencia Fáctica Severa (P1)**. La verdad técnica la dicta el código renderizado y testeado, nunca el texto narrativo.

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
- **Entorno de Desarrollo:** Docker Compose (`docker-compose.dev.yml`) con persistencia local y soporte de backup.
- **Orquestación & Cómputo:**
  - **Kind:** Clúster local para validación rápida y pruebas en CI.
  - **Proxmox VE (On-Prem):** K3s sobre Pre-producción (LXC 800) y Producción (VM 801 K3s dedicada). Traefik Ingress Controller nativo, Cilium CNI / L7 NetworkPolicies.
  - **AWS (Cloud-Ready):** EKS con AWS Secrets Manager y Reloader Stakater.
- **GitOps:** ArgoCD bajo patrón App-of-Apps (`root-application.yaml` reconciliando `pokedex-preprod`, `pokedex-proxmox` y `pokedex-cloud`).
- **Secretos:** HashiCorp Vault CE con External Secrets Operator (ESO) y roles segregados por entorno (`pokedex/prod` y `pokedex/preprod`).
- **Seguridad y Supply Chain:** OCI digest pinning inmutable (sha256), SBOM CycloneDX, firma Cosign, atestación SLSA y validación Kyverno admission controller.
- **IaC & Config Management:** OpenTofu para aprovisionamiento y Ansible para configuración de host/servicios base.
- **Observabilidad:** OpenTelemetry, Prometheus metrics y correlación distribuida vía `X-Request-Id`.

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
8. **Cierre Documental:** Si el cambio altera comportamientos documentados (README, `docs/`, ADRs o runbooks), identificar los archivos impactados y delegar en `repo-docs` antes de concluir.

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
- **Pipeline de Cambios:** Todo cambio de código debe seguir la secuencia `repo-impact` → `repo-refactor` → `repo-testing` → `repo-pr`/`repo-release`.
