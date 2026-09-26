# Política de Validación y Reporte Documental (Documentation Validation Policy)

Este documento define los requisitos de calidad estructural, validación de enlaces y formato canónico del reporte de ciclo de vida documental generado por `repo-docs` en `rocapellino/pokedex`.

---

## 1. Reglas Técnicas de Portabilidad y Calidad de Enlaces

Para garantizar la navegabilidad y la portabilidad del repositorio entre diferentes estaciones de trabajo, runners de CI y la interfaz web de GitHub:

1. **Prohibición Terminante de URLs con Esquema Local (`file://`):**
   - Queda estrictamente prohibido commitear archivos Markdown con esquemas de archivo local (ej. rutas absolutas de estación de trabajo o de usuario).
   - Todos los enlaces internos entre documentos o archivos de código deben emplear **rutas relativas** (ej. `../architecture/SECRETS_MANAGEMENT.md` o `../../package.json`).
   - Los tests de validación (`deploy_scripts_security.test.ts`) auditan activamente la ausencia de esquemas de archivo local en todos los archivos `.md`.
2. **Validación de Fragmentos de Ancla (MD051):**
   - Todo enlace interno a una sección `#encabezado` debe corresponder de manera exacta con un heading existente en el archivo destino.
   - Al modificar encabezados de secciones, deben actualizarse concurrentemente todas las Tablas de Contenidos (TOC) y referencias externas.
3. **Ausencia de HTML en Línea no Estándar (MD033):**
   - Evitar tags HTML innecesarios (`<br>`, `<motivo>`) que puedan ser interpretados como etiquetas rotas o generar advertencias en renderizadores markdown.

---

## 2. Markdown Quality Gate Contractual

Conforme a la regla transversal estipulada en `AGENTS.md`:

```bash
npm run lint:md -- <archivos-modificados>
```

- **Cero Tolerancia a Errores `MDxxx`:** Ninguna tarea o pull request se considerará aprobada si contiene advertencias o errores reportados por `markdownlint`.
- **Reglas Críticas:**
  - `MD004`: Estilo de listas no ordenadas consistente (guión `-`).
  - `MD022` / `MD032`: Líneas en blanco obligatorias antes y después de encabezados y listas.
  - `MD031`: Líneas en blanco obligatorias alrededor de bloques de código (`fenced code blocks`).
  - `MD040`: Bloques de código con lenguaje explícito especificado (ej. `bash`, `yaml`, `typescript`, `text`, `mermaid`).
  - `MD041`: La primera línea del archivo debe ser un encabezado de nivel superior `h1` (`#`).

---

## 3. Estructura Canónica del Reporte: `documentation-lifecycle.md`

Cuando `repo-docs` ejecute una auditoría completa del ciclo de vida documental, el entregable formal debe guardarse en:

```text
docs/audits/<fecha>/documentation-lifecycle.md
```

### Plantilla Estándar del Reporte

```markdown
# 📚 Reporte de Ciclo de Vida Documental (Documentation Lifecycle Audit)

> **Fecha:** AAAA-MM-DD
> **Estado Evaluado:** HEAD de main (Commit <sha>)
> **Entregable:** docs/audits/<fecha>/documentation-lifecycle.md
> **Quality Gate:** Markdown Quality Gate verificado (0 errores MDxxx)

---

## 1. Resumen Cuantitativo del Inventario

| Estado Documental | Cantidad de Documentos | Porcentaje | Acción Asociada |
| :--- | :---: | :---: | :--- |
| **`CURRENT`** | N | X% | `KEEP` |
| **`OUTDATED`** | N | X% | `UPDATE` / `ARCHIVE` |
| **`HISTORICAL`** | N | X% | `KEEP` (Marcar con callout) |
| **`DUPLICATE`** | N | X% | `CONSOLIDATE` |
| **`ORPHANED`** | N | X% | `CLEANUP` / `DELETE` |
| **`INVALID`** | N | X% | `CORRECT` |
| **`NEEDS_REVIEW`** | N | X% | `ESCALATE` |
| **TOTAL ANALIZADOS**| **Total** | **100%** | — |

---

## 2. Matriz de Hallazgos y Backlog de Acciones

| ID | Archivo Impactado | Estado | Severidad | Descripción del Hallazgo | Acción Propuesta |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `DOC-001` | `ruta/al/archivo.md` | `OUTDATED` | P1 | Describe arquitectura anterior... | `UPDATE` |
| `DOC-002` | `ruta/al/otro.md` | `ORPHANED` | P2 | Referencia a script inexistente... | `CLEANUP` |

---

## 3. Detalle de Ejecución por Categoría de Acción

### 3.1. Acciones `UPDATE` (Actualizaciones Prioritarias)
...

### 3.2. Acciones `CONSOLIDATE` (Unificación hacia el SSOT)
...

### 3.3. Acciones `ARCHIVE` (Preservación Histórica)
...

### 3.4. Acciones `DELETE` (Poda de Referencias Huérfanas)
...

---

## 4. Verificación de Referencias Cruzadas e Integridad
- [ ] 0 referencias a archivos o scripts inexistentes.
- [ ] 0 referencias a herramientas retiradas sin marcado histórico.
- [ ] 0 URLs locales con esquema de archivo local (file://)
- [ ] Markdown Quality Gate verificado (0 errores MDxxx).
```
