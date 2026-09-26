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

## 4. Regla de Oro: Preservación Histórica (`HISTORICAL ≠ OBSOLETE`)

> [!IMPORTANT]
> **Prohibición Estricta de Reescribir la Historia:**
> Los documentos históricos **NUNCA deben sobreescribirse silenciosamente** para reflejar el estado actual.
>
> Una auditoría fechada (`docs/audits/2026-09-23/`, `docs/audits/2026-09-25/`) representa una fotografía inmutable de un momento específico en el tiempo y constituye evidencia histórica auditable.
> Si un documento de diseño o ADR ha quedado desfasado pero posee valor histórico:
>
> 1. Se marca formalmente con el callout canónico de `HISTORICAL`.
> 2. Se referencia el documento SSOT vigente.
> 3. Se preserva el cuerpo del texto histórico intacto.
> 4. Se actualiza o crea el documento vigente en `docs/architecture/` o `docs/operations/`.

### Formato Canónico de Marcado Histórico

```markdown
> [!NOTE]
> **Documento Histórico / Snapshot de Auditoría:**
> Este documento describe una arquitectura previa o el estado del repositorio en una fecha pasada.
> Para la especificación vigente y operativa, consultar [SECRETS_MANAGEMENT.md](../../architecture/SECRETS_MANAGEMENT.md).
```

---

## 5. Demarcación de Fuente Única de Verdad (SSOT) vs. Referencias Derivadas

Para prevenir la dispersión y la contradicción documental:

1. **Un Solo SSOT por Dominio:** Cada componente arquitectónico debe poseer un único documento formal canónico en `docs/architecture/` o `docs/operations/`.
2. **Documentos Satélites como Punteros:** El archivo `README.md`, el template de Pull Request, runbooks y guías de desarrollo deben enlazar al SSOT en lugar de reescribir explicaciones detalladas.
3. **Cero Coexistencia de Arquitecturas Antagónicas:** No está permitida la documentación simultánea de tecnologías mutuamente excluyentes (ej. Vault + ESO frente a Bitnami Sealed Secrets) como si ambas fueran vigentes en producción.
