---
name: adr-manager
description: "Gobernanza y ciclo de vida de Architecture Decision Records (ADRs). Guía la redacción, numeración secuencial, inmutabilidad de identificadores históricos y actualización del catálogo canónico en docs/decisions/ y README.md."
---

# adr-manager

## Objetivo

Automatizar y guiar el ciclo de vida de los **Architectural Decision Records (ADRs)** de la plataforma Pokédex, garantizando coherencia formal, trazabilidad inmutable y paridad entre las decisiones documentadas y la implementación real.

## Alcance y Reglas Inquebrantables

1. **Ubicación Canónica:**
   - Todos los ADRs residen en `docs/decisions/ADR-XXX-<slug-kebab-case>.md`.
2. **Inmutabilidad de Identificadores Históricos:**
   - Los números de decisiones consolidadas o retiradas (`ADR-019`, `ADR-021`, `ADR-022`, `ADR-024`, `ADR-026`, `ADR-028`, `ADR-029`) **nunca se reutilizan**.
   - Para un nuevo ADR, el número asignado debe ser el siguiente secuencial estrictamente superior al último registrado (ej. posterior a `ADR-031`).
3. **Estructura Obligatoria de un ADR:**
   - **Título:** `# ADR-XXX: <Título Descriptivo en Español>`
   - **Estado:** `Aceptado el AAAA-MM-DD` (o `Propuesto`, `Enmienda contractualmente a...`).
   - **Contexto:** Motivación técnica, problema a resolver y limitaciones evaluadas.
   - **Decisión:** Selección fundamentada de la solución arquitectónica y stack.
   - **Consecuencias:** Impacto operacional, ventajas, compromisos y mitigaciones.
4. **Sincronización Obligatoria de Índices:**
   - Registrar la nueva decisión en la tabla activa de `docs/decisions/README.md`.
   - Si la decisión es de alta relevancia para el stack general, incorporar su enlace en la Sección 11 de `README.md`.
   - Si enmienda o consolida un ADR anterior, actualizar el estado y referencia cruzada en la tabla histórica de `docs/decisions/README.md`.

## Verificación y Cierre

Tras redactar o actualizar un ADR:

```bash
# 1. Validar calidad de Markdown (0 errores MDxxx)
npm run lint:md -- docs/decisions/ README.md

# 2. Validar compuerta de gobernanza documental
npm run docs:validate

# 3. Validar contratos de ADRs
npm run test:contracts
```
