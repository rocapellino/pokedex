# Plantilla de Hallazgo

> **Identificador con namespace:** el campo `[ID]` usa el formato
> `AUD-<ÁMBITO>-<CLAVE>-<NNN>` definido en
> [`methodology.md`](methodology.md) §4. Nunca se reutiliza un identificador
> emitido por otra auditoría: la colisión de IDs hace ambigua cualquier
> referencia posterior y rompe la trazabilidad exigida por *Evidence-First*.
>
> Ejemplos válidos: `AUD-GOV-DOC-001`, `AUD-WF-TRIG-002`, `AUD-TST-PERF-001`.
> Inválidos: `DOC-001`, `WF-002` (identificadores planos sin namespace).

## [ID] Título del Hallazgo

- **Área:** [Dominio / Componente]
- **Prioridad:** P0 / P1 / P2 / P3
- **Confianza:** HIGH / MEDIUM / LOW
- **Esfuerzo:** XS / S / M / L / XL
- **Evidencia:** `ruta:línea` / comando de prueba / fragmento de configuración
- **Estado actual:** [Descripción precisa de lo que existe actualmente en el código]
- **Riesgo/impacto:** [Consecuencias técnicas, de seguridad o de estabilidad si no se corrige]
- **Recomendación:** [Acción correctiva propuesta, concreta e incremental]
- **Verificación:** [Comando, test o procedimiento de validación para certificar la corrección]
- **Impacto en documentación:** Ninguno / `ruta/al/doc.md` (pendiente | actualizado)
- **Supersedes / Reemitido como:** [ID de auditoría previa que este hallazgo reemite, si corresponde]
