---
name: repo-fix
description: Ejecutar la corrección de un hallazgo o bug con test de regresión previo y trazabilidad AUD-*. Usar cuando el cambio altera comportamiento observable (fix de bug, remediación de vulnerabilidad, ajuste de configuración de entorno); para cambios que preservan comportamiento usar repo-refactor.
---

# repo-fix

## Objetivo

Ejecutar la fase **Ejecutar** del ciclo de vida ([`repo-lifecycle`](../repo-lifecycle/SKILL.md)) para cambios que **modifican comportamiento observable**: corrección de bugs, remediación de hallazgos de auditoría y ajustes de configuración por entorno.

`repo-refactor` exige preservar el comportamiento; un fix lo cambia a propósito. Por eso son skills distintas.

| Situación | Skill |
| :--- | :--- |
| Cambia una respuesta HTTP, una ruta, una cabecera, un valor de entorno o un contrato | `repo-fix` |
| Reorganiza código sin alterar entradas ni salidas observables | `repo-refactor` |

## Precondiciones

1. Existe un hallazgo con ID `AUD-<ÁMBITO>-<CLAVE>-<NNN>` ([finding.md](../_shared/finding.md)) o un bug reproducible descrito con evidencia `ruta:línea`.
2. Existe un plan de cambio de [`repo-impact`](../repo-impact/SKILL.md) con gates derivados de la matriz ([change-plan.md](../_shared/change-plan.md) §6).

## Protocolo de Ejecución

1. **Reproducir.** Escribir el test que demuestra el defecto y verificar que **falla** con el código actual. El test ejercita el comportamiento, no el texto del archivo: para un `rewrite` de nginx se verifica la ruta resultante, no la presencia de la directiva.
2. **Corregir.** Aplicar el cambio mínimo que hace pasar el test. Si la corrección requiere reorganizar código, separar ese paso como refactor previo con `repo-refactor`.
3. **Verificar.** Ejecutar el test nuevo y los gates del dominio del plan. Registrar cada gate con su estado real; nunca convertir `NOT_EXECUTED` o `CI_REQUIRED` en `PASS`.
4. **Confirmar la regresión.** Revertir temporalmente solo el código de producción y comprobar que el test vuelve a fallar. Un test que pasa en ambos casos no protege el hallazgo.
5. **Commit atómico.** Un commit por hallazgo, con el ID en el cuerpo:

   ```text
   fix(<scope>): <descripción en minúsculas>

   Remedia AUD-SEC-APP-003.
   ```

6. **Traspasar.** Entregar a la fase *Actualizar* de `repo-lifecycle` la lista de artefactos derivados afectados y el nuevo estado del hallazgo (`VERIFIED`).

## Excepciones al Test Previo

Cuando el defecto solo es observable en runtime (por ejemplo, TLS ausente en un entorno con controlador externo), el test previo puede sustituirse por un **test de contrato sobre la configuración renderizada** (`helm template` + aserción), declarando la limitación en el PR. Si ni eso es posible, el hallazgo se cierra como `VERIFIED` solo tras evidencia de runtime; mientras tanto permanece `IN_PROGRESS`.

## Comandos

- `/repo-fix <ID>`: Ejecuta el protocolo completo para un hallazgo.
- `/repo-fix reproduce <ID>`: Solo escribe y valida el test que falla (pasos 1 y 4).

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md).
