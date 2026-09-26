# 📦 Política de Retiro y Ciclo de Vida Documental (`documentation-retirement-policy.md`)

Esta política regula la transición, consolidación, archivo y eliminación segura de documentos en el repositorio para evitar la acumulación de deuda técnica documental.

---

## 1. Estados del Ciclo de Vida Documental

Cada documento del repositorio atraviesa los siguientes estados:

```text
  ┌──────────┐
  │  ACTIVE  │ ◄── Documento canónico vigente (SSOT)
  └────┬─────┘
       │ Arquitectura o configuración evoluciona
       ▼
  ┌──────────┐
  │  STALE   │ ◄── Contiene discrepancias o versiones superadas
  └────┬─────┘
       │ Se actualiza la documentación viva
       ▼
  ┌────────────┐
  │ HISTORICAL │ ◄── Evidencia fechada o decisiones pasadas
  └────┬───────┘
       │ Hallazgos y conclusiones integrados en el SSOT
       ▼
  ┌──────────────┐
  │ CONSOLIDATED │ ◄── Documento cerrado sin tareas pendientes
  └────┬─────────┘
       │ Evaluación de retención
       ├─────────────────────────────────┐
       ▼                                 ▼
 ┌───────────┐                     ┌───────────┐
 │  ARCHIVE  │                     │  DELETE   │
 │(Blueprints│                     │(Snapshots │
 │  Futuros) │                     │Cerrados en│
 └───────────┘                     │ Git Log)  │
                                   └───────────┘
```

---

## 2. Regla de Promoción de Información

La información técnica no debe quedar atrapada en informes de auditoría transitorios. Debe promoverse a su ubicación canónica según su naturaleza:

| Tipo de Información | Destino Canónico de Promoción | Ejemplo |
| :--- | :--- | :--- |
| **Hallazgo permanente de arquitectura** | `docs/architecture/` | Especificación de persistencia híbrida y caching |
| **Decisión arquitectónica de diseño** | `docs/decisions/ADR-xxx.md` | Elección de Vault + ESO sobre Sealed Secrets |
| **Procedimiento o contingencia operativa** | `docs/runbooks/` | Protocolo de recuperación de base de datos |
| **Política o compromiso público del proyecto** | `README.md` o `SECURITY.md` | Política de divulgación de vulnerabilidades |
| **Evidencia temporal o diagnóstico de ciclo** | `docs/audits/<FECHA>/` | Snapshot del estado post-release |

---

## 3. Guardrails de Poda Segura: 6 Salvaguardas Obligatorias

Antes de eliminar cualquier archivo Markdown del árbol de trabajo, se debe verificar que **ninguna** de las siguientes condiciones se cumpla:

1. **¿Un test lo requiere?** Ninguna suite de pruebas en `tests/` debe hacer aserciones sobre su existencia en disco.
2. **¿CI lo referencia?** Ningún workflow de GitHub Actions en `.github/workflows/` debe ejecutar pasos sobre su ruta.
3. **¿Otra documentación activa lo enlaza?** Ningún archivo en `docs/` o la raíz debe tener enlaces rotos que apunten a él.
4. **¿Una skill lo utiliza?** Ninguna skill en `.agents/skills/` debe tener dependencias operativas sobre su contenido.
5. **¿Contiene una decisión o hallazgo no consolidado?** Todo conocimiento crítico debe haber sido volcado previamente al SSOT.
6. **¿Es un ADR?** Los ADRs representan la evolución histórica del sistema y son de **retención permanente**, incluso si han sido reemplazados (*Superseded*).

---

## 4. Preservación Inmutable en Git

- Eliminar un snapshot cerrado del árbol de trabajo activo **no borra la historia**.
- El historial de Git conserva todos los commits, diffs y metadatos asociados.
- Esto permite mantener un árbol de trabajo limpio y de bajo consumo de contexto para los modelos de lenguaje sin perder trazabilidad técnica.
