---
name: repo-audit
description: Auditoría integral, read-only, del estado técnico del repositorio.
---

# repo-audit

## Objetivo

Ejecutar auditorías técnicas integrales, estrictamente de sólo lectura, para evaluar el estado de salud, seguridad, consistencia arquitectónica y mantenibilidad general de `rocapellino/pokedex`.

## Alcance y Verificaciones de Dominio

- **Arquitectura y Stack:** Detección de desviaciones entre la arquitectura documentada y la ejecutada en el monorepo.
- **Calidad de Código y Aplicación:** Buenas prácticas en API Express, Vanilla TS/Vite, migraciones Drizzle y esquemas de persistencia.
- **Superficie de Seguridad:** Secretos en código o historial, políticas RBAC, NetworkPolicies, permisos en CI/CD y contratos de External Secrets.
- **Supply Chain e Integridad:** Pinning de imágenes por digest SHA256 inmutable, firmas Cosign, atestaciones SLSA y escaneos de dependencias.
- **Higiene del Repositorio:** Detección de dependencias no utilizadas, overrides dudosos en `package.json`, scripts no autorizados (ADR-020) y documentación desactualizada.
- **Resiliencia y Confiabilidad:** Verificación de planes de backup (local / Google Drive / NAS), SLAs, RPO/RTO y pruebas de Disaster Recovery.
- **Taxonomía de Hallazgos:** Calificar cada discrepancia objetivamente según su impacto real (P0 a P3), nivel de confianza y esfuerzo de mitigación.

## Comandos

- `/repo-audit`: Auditoría integral completa de todas las dimensiones técnicas.
- `/repo-audit security`: Enfoque exclusivo en vulnerabilidades, secretos, supply chain y permisos.
- `/repo-audit architecture`: Enfoque en límites del monorepo, acoplamiento y coherencia GitOps.
- `/repo-audit dependencies`: Auditoría de ciclo de vida de paquetes, CVEs y overrides.
- `/repo-audit cleanup`: Auditoría de deuda técnica, código huérfano y artefactos retirados.
- `/repo-audit modernization`: Evaluación de costos y beneficios de potenciales actualizaciones.
- `/repo-audit delta`: Auditoría incremental enfocada en los cambios recientes respecto a la rama principal.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si el usuario solicita remediar un hallazgo, modelar el cambio con [change-plan.md](../_shared/change-plan.md) y transferir la ejecución a `repo-impact` y `repo-refactor`.
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes, baselines, deltas) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
