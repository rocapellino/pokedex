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

## Comandos y Delegación por Dominio

`repo-audit` actúa como un agregador y orquestador de sólo lectura que delega el análisis exhaustivo en las skills especializadas de cada dominio para evitar duplicación de verificaciones:

- `/repo-audit`: Auditoría integral completa coordinando todas las dimensiones técnicas.
- `/repo-audit security`: Enfoque exclusivo en vulnerabilidades, secretos, supply chain y permisos (delega en `repo-security`).
- `/repo-audit architecture`: Enfoque en límites del monorepo, acoplamiento y coherencia GitOps (delega en `repo-architecture`).
- `/repo-audit quality`: Calidad estática de código, tipado y prevención de God Files (delega en `repo-quality`).
- `/repo-audit dependencies`: Auditoría de ciclo de vida de paquetes, CVEs y overrides (delega en `repo-dependencies`).
- `/repo-audit maintenance`: Auditoría de deuda técnica, archivos huérfanos y artefactos retirados (delega en `repo-maintenance`).
- `/repo-audit delta`: Auditoría incremental enfocada en los cambios recientes clasificados según `repo-impact`.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Regla Cardinal de Auditoría:** Una auditoría histórica nunca puede utilizarse como evidencia del estado actual del repositorio. Todo diagnóstico emitido por `repo-audit` representa un snapshot fechado y debe apoyarse estrictamente en el estado de las Fuentes Únicas de Verdad vigentes.
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si el usuario solicita remediar un hallazgo, modelar el cambio con [change-plan.md](../_shared/change-plan.md) y transferir la ejecución a `repo-impact` y `repo-refactor`.
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (reportes, baselines, deltas) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
