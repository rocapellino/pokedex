---
name: repo-context
description: Construir el contexto operativo del repositorio desde las fuentes de verdad. Usar al inicio de una sesión sin contexto previo, antes de cualquier otra skill, o para actualizar AGENTS.md (/repo-context agents).
---

# repo-context

## Objetivo

Construir, verificar y sintetizar el contexto técnico y operativo del repositorio `rocapellino/pokedex` a partir de fuentes de verdad comprobables, sirviendo de base previa obligatoria para cualquier análisis, auditoría o refactorización.

## Alcance y Verificaciones de Dominio

- **Topología del Monorepo:** Estructura de workspaces npm (`apps/backend`, `apps/frontend`), paquetes compartidos y límites entre capas.
- **Stack Tecnológico Real:** Contrastar el código contra las aserciones de documentación:
  - Runtime y gestor de paquetes según `.tool-versions` y `packageManager` en `package.json`; TypeScript estricto.
  - Express + Drizzle ORM + PostgreSQL + Redis.
  - Frontend en Vanilla TypeScript + Vite + Nginx Alpine (certificar ausencia de React/JSX).
  - Docker Compose y Kind para dev, K3s en Proxmox (Pre-prod LXC 800; Prod VM 801 en retiro) y prod cloud agnóstico como blueprint inactivo (ADR-030).
  - ArgoCD, External Secrets Operator (Vault CE) y OpenTofu/Ansible.
- **Catálogo de Comandos Canónicos:** Inventariar y distinguir comandos vigentes (`package.json`, `Taskfile.yaml`) frente a invocaciones legadas o no recomendadas.
- **Gobernanza de Reglas de Agente (`AGENTS.md`):** Generar o actualizar directivas en `AGENTS.md` exclusivamente con base en evidencia fáctica comprobada en el código.
- **Auditoría de Archivos de Ignorado (`.*ignore`):** Mapear patrones en `.gitignore`, `.dockerignore`, `.helmignore`, etc., para orientar a `repo-security` y `repo-maintenance`.
- **Registro de Decisiones Arquitectónicas:** Resumir las restricciones operativas y de seguridad que todas las demás skills deben respetar.

## Comandos

| Comando | Modo | Descripción |
| :--- | :---: | :--- |
| `/repo-context` | `READ` | Construcción completa del contexto operativo del repositorio. |
| `/repo-context refresh` | `READ` | Actualización incremental del contexto tras modificaciones recientes de código o dependencias. |
| `/repo-context agents` | **`UPDATE`** | Auditoría y actualización del documento de instrucciones operativas `AGENTS.md`. |

> [!CAUTION]
> **Único comando mutante.** `/repo-context` y `/repo-context refresh` son estrictamente
> de sólo lectura: no escriben ningún archivo del repositorio. `/repo-context agents`
> es la **excepción declarada** y modifica `AGENTS.md`.
>
> Su ejecución exige orden explícita del usuario y debe quedar registrada como
> cambio documental sujeto al Markdown Quality Gate (`npm run lint:md`). El contenido
> de `AGENTS.md` solo puede derivarse de evidencia fáctica comprobada en el código,
> nunca de auditorías históricas.

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Regla Cardinal de Auditoría:** Una auditoría histórica nunca puede utilizarse como evidencia del estado actual del repositorio (las fuentes vigentes son `gitops/`, `infra/`, `apps/`, `scripts/`, `tests/` y `docs/architecture/`).
- **Planes de Cambio:** Si se requiere alterar contratos de configuración base, modelar el cambio con [change-plan.md](../_shared/change-plan.md) y coordinar con `repo-impact`.
