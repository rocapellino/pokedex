---
name: repo-docs
description: Mantener documentación útil, coherente y verificable gobernando su ciclo de vida integral.
---

# repo-docs

## Objetivo

Gobernar de extremo a extremo el **ciclo de vida documental** del repositorio `rocapellino/pokedex`, garantizando que la totalidad de la documentación técnica (`README.md`, `SECURITY.md`, `docs/architecture/`, `docs/operations/`, `docs/runbooks/`, `docs/decisions/`, etc.) sea fidedigna, verificable, libre de contradicciones y fiel reflejo del código fuente, la infraestructura y los manifiestos declarativos en producción.

---

## Capacidades Funcionales del Ciclo de Vida Documental

Para asegurar un mantenimiento integral sin dispersar responsabilidades en micro-skills aisladas, `repo-docs` articula 6 capacidades operativas:

1. **`documentation-inventory` (Inventario Exhaustivo):**
   - Descubrimiento sistemático y catalogación de todos los archivos Markdown en el monorepo.
   - Mapeo de Fuentes Únicas de Verdad (SSOT) frente a documentos satélites y derivados.
2. **`documentation-analysis` (Clasificación y Extracción de Claims):**
   - Descomposición del contenido en afirmaciones verificables (*Document Claims*).
   - Clasificación en los 7 estados canónicos: `CURRENT`, `OUTDATED`, `HISTORICAL`, `DUPLICATE`, `ORPHANED`, `INVALID`, `NEEDS_REVIEW`.
3. **`documentation-update` (Remediación y Actualización Activa):**
   - Sincronización del texto técnico cuando el código, la configuración o la infraestructura evolucionan.
   - Aplicación de las acciones operativas estandarizadas: `UPDATE`, `CONSOLIDATE`, `ARCHIVE`, `DELETE`, `KEEP`.
4. **`documentation-cleanup` (Depuración de Referencias Huérfanas):**
   - Búsqueda y erradicación proactiva de referencias a scripts retirados, targets eliminados de Taskfile, archivos inexistentes o herramientas superadas.
5. **`documentation-consistency` (Validación Cruzada Multicapa):**
   - Contraste fáctico entre documentación y: Código (`apps/`), Configuración (`.env.*`), CI/CD (`.github/`), IaC (`infra/`), Helm, GitOps y Skills.
   - Detección de discrepancias de versión (`VERSION_MISMATCH`) frente a `package.json`, `Chart.yaml` y pines de ArgoCD.
6. **`documentation-validation` (Quality Gate y Portabilidad):**
   - Ejecución obligatoria de `npm run lint:md` (0 violaciones `MDxxx`).
   - Verificación de enlaces relativos navegables en GitHub y erradicación total de URLs locales con esquema de archivo local (`file://`).

---

## Flujo del Ciclo de Vida Documental

Toda evaluación documental debe seguir estrictamente la secuencia de 8 pasos:

```text
1. INVENTARIAR           ──► Descubrir documentos Markdown y árboles de información.
2. CLASIFICAR            ──► Asignar estado preliminar según propósito y ámbito.
3. VALIDAR CONTRA REPO   ──► Contrastar claims contra código, IaC, CI, Helm y GitOps.
4. DETECTAR OBSOLETO     ──► Aislar drift, referencias huérfanas y componentes retirados.
5. ACCIONAR REMEDIACIÓN  ──► UPDATE, CONSOLIDATE, ARCHIVE o DELETE según política.
6. VALIDAR REFERENCIAS   ──► Comprobar links relativos, anclas # y Markdownlint (0 MDxxx).
7. GENERAR EVIDENCIA     ──► Emitir docs/audits/<fecha>/documentation-lifecycle.md.
8. VERIFICAR CIERRE      ──► En el siguiente ciclo, certificar que el hallazgo quedó cerrado.
```

---

## Reglas Obligatorias de Gobernanza Documental

### 1. Cruce Obligatorio contra Código y Configuración

Queda terminantemente prohibido auditar la documentación analizando únicamente archivos `.md` de forma aislada. Todo análisis debe cruzar:

- Menciones de endpoints o lógica ↔ Código backend en `apps/backend/src/`.
- Menciones de UI o proxies ↔ Código frontend en `apps/frontend/src/`.
- Menciones de scripts de automatización ↔ Archivos ejecutables reales en `scripts/`.
- Menciones de comandos operacionales ↔ Tareas válidas en `Taskfile.yml` y `package.json`.
- Menciones de variables y configuración ↔ Esquemas de validación y `.env.example`.
- Menciones de infraestructura y despliegue ↔ `infra/opentofu/`, `infra/ansible/` y `infra/helm/`.
- Menciones de versiones y pines ↔ `package.json`, `Chart.yaml` y `gitops/apps/*.yaml`.

### 2. Detección Rigurosa de Referencias Huérfanas (`ORPHANED_REFERENCE`)

La skill debe auditar y reportar como hallazgo P1/P2 cualquier mención a:

- Archivos o carpetas inexistentes en disco.
- Scripts que hayan sido eliminados en hitos anteriores (ej. utilidades legadas de sellado de secretos).
- Targets o comandos retirados de `Taskfile.yml` (ej. aliases de la Fase 4 de ADR-026).
- Componentes arquitectónicos retirados presentados como arquitectura vigente (ej. Bitnami Sealed Secrets frente a HashiCorp Vault CE + ESO).

### 3. Preservación Histórica (`HISTORICAL ≠ OBSOLETE`)

- Los documentos históricos (como auditorías fechadas previas en `docs/audits/` o ADRs superados) **NUNCA deben reescribirse silenciosamente**.
- Cuando un documento describa una arquitectura anterior pero posea valor histórico:
  1. Se marca con el callout canónico `HISTORICAL`.
  2. Se añade un enlace hacia la especificación vigente en `docs/architecture/` o `docs/operations/`.
  3. Se preserva el contenido histórico como evidencia de trazabilidad.

### 4. Gobernanza de ADRs (ADR Drift)

- Las decisiones arquitectónicas formalizadas (`docs/decisions/ADR-*.md`) no pueden ser modificadas directamente por una automatización.
- Toda divergencia detectada entre un ADR y el código en `main` se clasifica como `ADR REVIEW REQUIRED` para enmienda formal por parte de los mantenedores.

---

## Comandos Disponibles

- `/repo-docs`: Auditoría integral del ciclo de vida documental y verificación de consistencia.
- `/repo-docs lifecycle`: Ejecución del flujo completo de 8 pasos y generación de reporte de ciclo de vida.
- `/repo-docs drift`: Detección fáctica de discrepancias semánticas entre código y documentación.
- `/repo-docs cleanup`: Inspección y propuesta de poda para referencias huérfanas y componentes retirados.
- `/repo-docs orphaned`: Detección específica de rutas de archivos, scripts y comandos inexistentes en disco.
- `/repo-docs versions`: Validación de consistencia de números de versión entre monorepo, Helm, GitOps y docs.
- `/repo-docs claims`: Extracción y verificación fáctica de afirmaciones individuales frente al SSOT.
- `/repo-docs adr`: Auditoría de vigencia y consistencia de ADRs frente a la implementación.
- `/repo-docs architecture`: Validación de diagramas, topología y diseño de seguridad.

---

## Formato de Salida y Entregables

- **Reporte de Ciclo de Vida Documental:** Estructurado en `docs/audits/<fecha>/documentation-lifecycle.md` siguiendo [documentation-validation-policy.md](references/documentation-validation-policy.md).
- **Reporte de Consistencia:** Guardado en `docs/audits/<fecha>/documentation/documentation-consistency.md` conforme a [report-template.md](../_shared/report-template.md).
- **Estructura Atómica de Hallazgos:** Usar el formato canónico de [finding.md](../_shared/finding.md).
- **Quality Gate de Markdown:** Todo archivo Markdown modificado o generado debe superar `npm run lint:md -- <archivos>` con 0 errores `MDxxx`.

---

## Referencias Especializadas de la Skill

- **Ciclo de Vida Documental:** [documentation-lifecycle-policy.md](references/documentation-lifecycle-policy.md)
- **Consistencia y Validación Cruzada:** [documentation-consistency-policy.md](references/documentation-consistency-policy.md)
- **Validación, Calidad y Reportes:** [documentation-validation-policy.md](references/documentation-validation-policy.md)
- **Drift y Verificación de Claims:** [documentation-drift.md](references/documentation-drift.md)
- **Registro de Fuentes de Verdad:** [source-of-truth.md](../_shared/source-of-truth.md)
- **Matriz de Impacto en Documentación:** [documentation-impact-matrix.md](../_shared/documentation-impact-matrix.md)
