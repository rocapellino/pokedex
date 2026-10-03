---
name: repo-refactor
description: "Fase 3 (Ejecutar) para cambios que preservan el comportamiento: refactors incrementales en micro-pasos compilables. Usar para reorganizar código sin alterar contratos; si cambia el comportamiento, usar repo-fix."
---

# repo-refactor

## Objetivo

Ejecutar refactorizaciones controladas e incrementales en el código fuente de `rocapellino/pokedex`, remediando hallazgos técnicos sin alterar el comportamiento funcional observable salvo que se especifique contractualmente.

> [!NOTE]
> Si el cambio altera comportamiento observable (fix de bug o remediación de un hallazgo), usar [`repo-fix`](../repo-fix/SKILL.md). `repo-refactor` exige preservar el comportamiento.

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

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Planes de Cambio:** Obligatorio formalizar el plan con [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-impact` antes de tocar código.
