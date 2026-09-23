---
name: repo-refactor
description: Convertir hallazgos de calidad/arquitectura en refactors incrementales.
---

# repo-refactor

## Objetivo

Ejecutar refactorizaciones controladas e incrementales en el código fuente de `rocapellino/pokedex`, remediando hallazgos técnicos sin alterar el comportamiento funcional observable salvo que se especifique contractualmente.

## Alcance y Verificaciones de Dominio

- **Preservación Estricta de Contratos:** Mantener invariantes los contratos de API externa, esquemas de base de datos y eventos salvo acuerdo explícito.
- **Micro-Pasos Compilables:** Cada paso del refactor debe compilar de forma limpia (`npm run typecheck`) y pasar las suites de pruebas existentes.
- **Disciplina Test-First / Characterization Tests:** Agregar o reforzar pruebas de caracterización antes de modificar código sensible o no cubierto.
- **Desacoplamiento de Hotspots:** Particionar clases o funciones monolíticas en unidades cohesivas con responsabilidad única.
- **Transparencia y Reversibilidad:** Documentar la justificación técnica de cada abstracción introducida y asegurar facilidad de reversión (git commit atómico).
- **Sincronización Documental y ADRs:** Si el refactor introduce un patrón arquitectónico nuevo o modifica una decisión previa, registrar la enmienda o ADR correspondiente en `docs/decisions/`.

## Comandos

- `/repo-refactor <hallazgo>`: Planificación y diseño de refactorización para un hallazgo específico.
- `/repo-refactor plan`: Generación de la secuencia detallada de pasos y mitigación de riesgos.
- `/repo-refactor execute`: Ejecución asistida y validada paso a paso del plan aprobado.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Obligatorio formalizar el plan con [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-impact` antes de tocar código.
