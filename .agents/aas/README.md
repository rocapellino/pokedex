# AAS Core en Pokedex

Esta integración incorpora **Agentic Awesome Skills (AAS)** como catálogo externo de
referencias. No instala skills upstream ni modifica el catálogo canónico de Pokedex.

## Autoridad y límite de confianza

- `AGENTS.md`, `.agents/skills/` y las políticas del repositorio son la autoridad.
- Las ocho skills de AAS están aprobadas solo como `APPROVED_REFERENCE`.
- No se ejecutan scripts, comandos ni automatizaciones descritas por una skill upstream.
- No se usan `stack apply`, `stack recover` ni instalaciones o materializaciones.
- `gitops/`, `infra/` y `docs/architecture/` conservan su condición de SSOT actual.

El archivo `reviewed-selection.json` es evidencia de revisión propia de Pokedex. No se
presenta como el formato oficial `aas-selection-evidence.json`, porque no fue generado
por el proceso MCP completo de AAS.

## Artefactos gobernados

| Archivo | Propósito |
| --- | --- |
| `aas-stack.json` | Manifest AAS v2 fijado a versión y digest del catálogo. |
| `reviewed-selection.json` | Decisión local, riesgo y skill responsable por referencia. |
| `plans/` | Destino reservado para previews del runtime AAS. Solo `.gitkeep` se versiona; permanece vacío mientras el MCP no se habilite (ver *Estado del MCP*). |

La selección está limitada a ocho referencias: diagnóstico sistemático, auditoría de
skills, code review, dependencias, documentación y ADR, arquitectura, GitOps y hardening
de Kubernetes.

## Verificación

```bash
npm run aas:governance
npm run aas:validate
npm run aas:verify
```

`aas:governance` es local, determinista y no requiere red. `aas:validate` ejecuta la CLI
fijada `agentic-awesome-skills@18.6.0` con scripts npm deshabilitados; puede requerir el
paquete en caché o acceso al registro. Ningún comando de proyecto aplica cambios AAS.

## Estado del MCP

Estado actual: `BLOCKED` no bloqueante (`NOT_CONFIGURED`).

La previsualización inicial de configuración fue válida, pero la inicialización del
runtime en Windows no se completó. Los cachés probados, incluido un directorio dedicado
fuera del repositorio, fueron rechazados con `AAS_CACHE_MODE_UNSAFE`; intentos anteriores
también agotaron el tiempo de espera. La última ejecución se detuvo antes de aprobar o
escribir configuración. No se debilitaron ACL y no se crearon ni modificaron
`.codex/config.toml`, `~/.codex/config.toml` o `.vscode/mcp.json`.

La activación futura requiere resolver primero el contrato de permisos del caché,
validarlo mediante `catalog update/status` y repetir la previsualización con la misma
versión fijada. Solo entonces podrá aprobarse una configuración MCP con scope `project`.
La configuración global del usuario queda fuera del alcance de esta integración.

> [!NOTE]
> `plans/` es el destino donde se materializarían esas previsualizaciones. Al permanecer
> el MCP en `BLOCKED`/`NOT_CONFIGURED`, el directorio contiene únicamente `.gitkeep` y su
> vaciado es el estado esperado, no una omisión. `scripts/aas-governance.ts` no valida
> `plans/` porque no forma parte de la allowlist de referencias.

## Actualización y reversión

Para actualizar AAS se debe revisar una versión concreta, comprobar el digest del
catálogo, reevaluar cada riesgo y actualizar juntos el manifest, la selección revisada y
los tests. Nunca se usa `latest` como estado persistido.

La reversión consiste en restaurar la versión y el digest anteriores en ambos JSON. Como
no hay materialización, no existen archivos upstream que recuperar o desinstalar.
