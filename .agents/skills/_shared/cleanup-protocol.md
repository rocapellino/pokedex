# Protocolo Único de Depuración

Este protocolo gobierna la fase 6 (*Depurar*) del ciclo de vida de [`repo-lifecycle`](../repo-lifecycle/SKILL.md) y toda propuesta de eliminar, mover o consolidar un artefacto: scripts, tests, documentos, reglas `*.ignore`, exports de código o configuraciones residuales.

Antes existían tres copias del mismo protocolo (en `repo-maintenance`, `repo-testing` y `repo-lifecycle`). Ahora las skills de dominio lo referencian y solo aportan su **vocabulario de estados** y sus **consumidores específicos**.

## 1. Fases

```text
1. DISCOVER  ──► inventario del dominio
2. CLASSIFY  ──► estado según el vocabulario del dominio (§3)
3. EVIDENCE  ──► matriz de consumidores cruzados (§2) con resultado por candidato
4. PROPOSE   ──► plan de cambio (change-plan.md) o hallazgo AUD-*
5. APPROVE   ──► revisión humana explícita
6. EXECUTE   ──► eliminación, movimiento o consolidación en commits atómicos
7. VALIDATE  ──► gates del dominio en PASS + regla de referencias inversas
```

Guardarraíles:

- **Ninguna eliminación automática durante una auditoría.** Las fases 1 a 4 son de solo lectura; la fase 6 requiere la aprobación de la fase 5.
- **No ejecutarse no es evidencia de desuso.** Un script o test que nadie invoca puede deberse a un pipeline mal configurado; se investiga antes de clasificarlo como eliminable.
- **Reversibilidad.** Cada eliminación es un commit independiente que puede revertirse con `git revert`.

## 2. Matriz de Consumidores Cruzados

Un candidato es eliminable solo si **ninguna** de estas búsquedas devuelve un consumidor vigente:

```bash
git grep -n "<nombre-o-ruta>" -- . ':!docs/audits/'
```

| Superficie | Ejemplos de consumidor |
| :--- | :--- |
| Manifiestos y CLI | `package.json` (scripts), `Taskfile.yaml`, `taskfiles/*.yaml` |
| CI/CD | `.github/workflows/**`, `.github/ci-impact.yaml` |
| Contenedores | `Dockerfile*`, `docker-compose*.yaml`, `.dockerignore` |
| Plataforma | `infra/**`, `gitops/**` |
| Código y pruebas | `apps/**` (imports y re-exports), `tests/**`, `scripts/**` |
| Gobernanza | `docs/**`, `.agents/**`, `AGENTS.md` |

`docs/audits/` se excluye: sus menciones son históricas y no constituyen consumo.

## 3. Vocabularios por Dominio

El protocolo es común; los estados no. Cada dominio conserva su vocabulario según el registro de [state-model.md](state-model.md) §3.

| Dominio | Skill | Vocabulario | Consumidores adicionales a verificar |
| :--- | :--- | :--- | :--- |
| Scripts y tooling | `repo-maintenance` | 8 estados (`KEEP` … `REVIEW`) | Política de scripts de ADR-020 |
| Tests | `repo-testing` | 12 estados (`KEEP` … `REVIEW`) | `npm test`, `test:all`, workflows y `docs/testing/test-surface.json` |
| Documentación | `repo-docs` | 7 estados documentales | `docs/README.md` (portal) y [documentation-retirement-policy.md](../repo-docs/references/documentation-retirement-policy.md) |
| Archivos `*.ignore` | `repo-lifecycle` | 5 estados de higiene | [configuration-hygiene.md](../repo-lifecycle/references/configuration-hygiene.md) |
| Exports de código | `repo-quality` | `KEEP`, `DELETE`, `REVIEW` | Imports en `apps/**`, `tests/**` y `scripts/**`; re-exports "de compatibilidad" sin importador |

## 4. Criterio de Cierre de la Fase

- Gates del dominio en `PASS` y `npm run docs:validate` sin enlaces rotos.
- Ninguna referencia huérfana nueva (regla de referencias inversas, [change-impact-matrix.md](change-impact-matrix.md) §1.1).
- `git status --short` sin archivos inesperados fuera de `tmp/` ([repository-hygiene.md](../../rules/repository-hygiene.md)).
