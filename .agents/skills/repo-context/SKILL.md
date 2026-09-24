---
name: repo-context
description: Construir el contexto operativo del repositorio antes de cualquier análisis o cambio.
---

# repo-context

## Objetivo

Construir, verificar y sintetizar el contexto técnico y operativo del repositorio `rocapellino/pokedex` a partir de fuentes de verdad comprobables, sirviendo de base previa obligatoria para cualquier análisis, auditoría o refactorización.

## Alcance y Verificaciones de Dominio

- **Topología del Monorepo:** Estructura de workspaces npm (`apps/backend`, `apps/frontend`), paquetes compartidos y límites entre capas.
- **Stack Tecnológico Real:** Contrastar el código contra las aserciones de documentación:
  - Node.js 22 LTS, npm 11+, TypeScript estricto.
  - Express + Drizzle ORM + PostgreSQL + Redis.
  - Frontend en Vanilla TypeScript + Vite + Nginx Alpine (certificar ausencia de React/JSX).
  - Docker Compose para dev, K3s (Pre-prod LXC 800 / Prod VM 801) y AWS EKS.
  - ArgoCD, External Secrets Operator (Vault CE) y OpenTofu/Ansible.
- **Catálogo de Comandos Canónicos:** Inventariar y distinguir comandos vigentes (`package.json`, `Taskfile.yml`) frente a invocaciones legadas o no recomendadas.
- **Gobernanza de Reglas de Agente (`AGENTS.md`):** Generar o actualizar directivas en `AGENTS.md` exclusivamente con base en evidencia fáctica comprobada en el código.
- **Auditoría de Archivos de Ignorado (`.*ignore`):** Mapear patrones en `.gitignore`, `.dockerignore`, `.helmignore`, etc., para orientar a `repo-security` y `repo-cleanup`.
- **Registro de Decisiones Arquitectónicas:** Resumir las restricciones operativas y de seguridad que todas las demás skills deben respetar.

## Comandos

- `/repo-context`: Construcción completa del contexto operativo del repositorio.
- `/repo-context refresh`: Actualización incremental del contexto tras modificaciones recientes de código o dependencias.
- `/repo-context agents`: Auditoría y actualización del documento de instrucciones operativas `AGENTS.md`.

## Formato de Salida y Gobernanza

- **Metodología y Reglas:** Consultar [methodology.md](../_shared/methodology.md) para el orden de fuentes de verdad, el ciclo de 8 pasos y las reglas comunes (Evidence-first, P0-P3, Read-only).
- **Estructura de Hallazgos:** Utilizar el formato atómico definido en [finding.md](../_shared/finding.md).
- **Reporte:** Estructurar el entregable siguiendo [report-template.md](../_shared/report-template.md).
- **Planes de Cambio:** Si se requiere alterar contratos de configuración base, modelar el cambio con [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-impact`.
- **Quality Gate de Markdown:** Todo archivo Markdown generado o modificado (contextos operativos, instrucciones) debe validarse obligatoriamente con [markdown-quality.md](../_shared/markdown-quality.md) (`npm run lint:md -- <archivos>`), garantizando 0 errores `MDxxx` antes de finalizar.
