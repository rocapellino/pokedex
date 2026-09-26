# Política de Ciclo de Vida Documental (Documentation Lifecycle Policy)

Este documento define la taxonomía, los estados, las transiciones y las reglas operativas que gobiernan el ciclo de vida completo de la documentación técnica en `rocapellino/pokedex`.

---

## 1. Principio Fundamental: Ciclo de Vida Activo

La documentación técnica del repositorio no es un registro estático o pasivo; posee un ciclo de vida propio que debe evaluarse de forma continua contra el código fuente, la infraestructura, los manifiestos declarativos y las herramientas en ejecución:

```text
┌─────────────────────────┐
│       INVENTARIAR       │  Descubrir la totalidad de archivos Markdown y fuentes
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│       CLASIFICAR        │  Asignar estado según vigencia, propósito y SSOT
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   VALIDAR CONTRA REPO   │  Contrastar fáctico: código, IaC, GitOps, CI y Taskfile
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ DETECTAR OBSOLETO /     │  Identificar drift, componentes retirados y duplicaciones
│ DUPLICADO / HUÉRFANO    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ ACCIONAR (UPDATE /      │  Remediar mediante actualización, archivo, poda o consolidación
│ CONSOLIDATE / ARCHIVE)  │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   VALIDAR REFERENCIAS   │  Garantizar integridad de enlaces relativos y Markdownlint
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│    GENERAR EVIDENCIA    │  Emitir reporte formal en docs/audits/<fecha>/
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ VERIFICAR EN SIGUIENTE  │  Comprobar en el próximo ciclo el cierre efectivo
│          CICLO          │
└─────────────────────────┘
```

---

## 2. Taxonomía de Estados Documentales

Cada documento, guía, runbook o sección técnica analizada se clasifica bajo uno de los siguientes estados canónicos:

| Estado | Significado Operativo | Acción Requerida | Criterio de Transición |
| :--- | :--- | :--- | :--- |
| **`CURRENT`** | Documentación plenamente vigente y alineada 1:1 con la implementación activa. | `KEEP` | Coincidencia verificada con código, configuración y GitOps. |
| **`OUTDATED`** | Describe un comportamiento, versión, arquitectura o parámetro previo ya superado. | `UPDATE` / `ARCHIVE` | Detectada discrepancia entre la afirmación documental y el estado real del repositorio. |
| **`HISTORICAL`** | Documento con valor histórico, diagnóstico fechado o registro de decisión previa. | `KEEP` (Marcar) | El documento es una auditoría previa (`docs/audits/YYYY-MM-DD/`) o ADR superado. |
| **`DUPLICATE`** | Replica explicaciones, configuraciones o guías contenidas en la Fuente Única de Verdad (SSOT). | `CONSOLIDATE` | Coexistencia de múltiples explicaciones para un mismo componente sin un único SSOT claro. |
| **`ORPHANED`** | Contiene referencias a archivos, scripts, targets, variables o componentes eliminados. | `CLEANUP` / `DELETE` | Los artefactos referenciados ya no existen en el árbol de trabajo de `main`. |
| **`INVALID`** | Contiene datos erróneos, comandos defectuosos, fragmentos rotos o enlaces inválidos. | `CORRECT` | Fallo de validación técnica, sintáctica o de ejecución de comandos documentados. |
| **`NEEDS_REVIEW`** | No puede determinarse de forma determinista si es vigente o requiere actualización. | `ESCALATE` | Requiere validación de arquitectura o decisión del mantenedor. |

---

## 3. Matriz de Acciones Operativas

| Acción | Ámbito de Aplicación | Procedimiento Canónico |
| :--- | :--- | :--- |
| **`KEEP`** | Documentos `CURRENT` o `HISTORICAL` debidamente demarcados. | Preservar intacto sin alteraciones. |
| **`UPDATE`** | Documentos `OUTDATED` que constituyen el SSOT de su componente. | Modificar el contenido para reflejar la realidad del código y la configuración vigente. |
| **`CONSOLIDATE`** | Documentos `DUPLICATE` o con dispersión temática. | Unificar el contenido en el documento SSOT canónico y sustituir los duplicados por enlaces al SSOT. |
| **`ARCHIVE`** | Documentos conceptuales o arquitectónicos superados con valor histórico. | Incorporar callout formal de estado histórico y enlazar hacia la especificación vigente. |
| **`DELETE`** | Documentos o fragmentos `ORPHANED` sin valor histórico ni operativo. | Eliminar el archivo o fragmento, retirando sus menciones en índices y matrices de responsabilidad. |

---

## 4. Clasificación Granular de Documentos Históricos (`HISTORICAL`)

La clasificación `HISTORICAL` no debe tratarse de forma pasiva o uniforme. Para evitar la sobreacumulación de snapshots obsoletos sin perder trazabilidad, se aplica la siguiente diferenciación:

```text
HISTORICAL
    ├── ADR / Decisión de Arquitectura        ──► KEEP (Permanente en docs/decisions/)
    ├── Evidencia Requerida por Tests o CI    ──► KEEP (Permanente hasta desacoplar el test)
    ├── Blueprint o Alternativa Futura        ──► ARCHIVE (Marcar formalmente con callout)
    └── Snapshot Cerrado y Consolidado        ──► DELETE (Historial completo preservado en Git)
```

### Tabla de Retención por Tipología Documental

| Tipo de Documento | Política de Retención | Acción en Árbol Activo |
| :--- | :--- | :--- |
| **Documento SSOT actual** (`docs/architecture/`, `docs/operations/`, `docs/runbooks/`) | Permanente | `KEEP` / `UPDATE` |
| **ADR** (`docs/decisions/ADR-*.md`) | Permanente | `KEEP` |
| **Runbook Operativo** | Permanente mientras esté vigente | `KEEP` / `UPDATE` |
| **Baseline Activo Vigente** (`docs/audits/<fecha-actual>/baseline_post-release.md`) | Conservar en árbol activo | `KEEP` |
| **Auditoría con hallazgos o tareas abiertas** | Conservar mientras no se cierren | `KEEP` |
| **Auditoría cerrada y consolidada en baseline** | Eliminar del árbol activo | `DELETE` (Git preserva historial) |
| **Auditorías intermedias, duplicadas o borradores** | Eliminar / Consolidar | `DELETE` |
| **Prompts de scaffold o scripts auxiliares de auditoría** | Eliminar | `DELETE` |
| **Reportes de lint temporal o snapshots de validación** | Eliminar | `DELETE` |
| **Evidencia requerida por un test o pipeline de CI** | No eliminar hasta desacoplar el test | `KEEP` |

---

## 5. Condiciones Obligatorias de Protección (Guardrails de Poda Segura)

> [!CAUTION]
> **Condición de Salvaguarda:**
> **NINGÚN DOCUMENTO HISTÓRICO PUEDE SER ELIMINADO DEL ÁRBOL ACTIVO SI:**
>
> 1. Un test automatizado lo requiere (ej. comprobaciones de presencia en suites de pruebas).
> 2. Un workflow de CI/CD lo referencia de forma explícita.
> 3. Otra documentación activa lo enlaza como fuente canónica de información.
> 4. Una skill de IA lo utiliza activamente como referencia o instrucción.
> 5. Contiene una decisión de diseño no consolidada formalmente en un ADR o documento canónico.
> 6. Contiene evidencia empírica que no existe en ningún otro lugar del repositorio.

Si ninguna de las 6 condiciones anteriores aplica, y el documento representa un snapshot de auditoría anterior completamente consolidado en el baseline vigente, **puede ser podado con seguridad**, garantizando que el historial permanezca íntegramente auditable mediante `git log`.

---

## 6. Demarcación de Fuente Única de Verdad (SSOT) vs. Referencias Derivadas

Para prevenir la dispersión y la contradicción documental:

1. **Un Solo SSOT por Dominio:** Cada componente arquitectónico debe poseer un único documento formal canónico en `docs/architecture/` o `docs/operations/`.
2. **Documentos Satélites como Punteros:** El archivo `README.md`, el template de Pull Request, runbooks y guías de desarrollo deben enlazar al SSOT en lugar de reescribir explicaciones detalladas.
3. **Cero Coexistencia de Arquitecturas Antagónicas:** No está permitida la documentación simultánea de tecnologías mutuamente excluyentes (ej. Vault + ESO frente a Bitnami Sealed Secrets) como si ambas fueran vigentes en producción.
