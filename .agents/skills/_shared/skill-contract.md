# Contrato Común de Salida y Gobernanza de Skills

Este contrato aplica a **todas** las skills de `.agents/skills/`. Cada `SKILL.md` lo referencia en una línea en lugar de repetirlo, y solo declara lo que le es propio.

## Reglas

- **Metodología:** [methodology.md](methodology.md) define la cadena de prevalencia fáctica, el ciclo de 8 pasos y las reglas comunes (*Evidence-First*, P0-P3, *Read-only* por defecto).
- **Hallazgos:** formato atómico de [finding.md](finding.md), con ID `AUD-<ÁMBITO>-<CLAVE>-<NNN>`.
- **Reporte:** estructura de [report-template.md](report-template.md).
- **Planes de cambio:** toda modificación se modela con [change-plan.md](change-plan.md) y se evalúa con `repo-impact` antes de tocar archivos.
- **Vocabulario de estados:** declarar el vocabulario usado según el registro de [state-model.md](state-model.md) §3.
- **Markdown Quality Gate:** todo `.md` creado o modificado pasa `npm run lint:md -- <archivos>` con 0 errores `MDxxx` y `npm run docs:validate` sin enlaces rotos ([markdown-quality.md](markdown-quality.md)).
- **Idioma:** español para toda comunicación humana; identificadores técnicos en inglés ([language-policy.md](language-policy.md)).
- **Dependencias ausentes:** si una herramienta necesaria no está instalada localmente, se ejecuta en un contenedor antes de declararla no disponible (sección siguiente).
- **Referencias Metodológicas Externas (AAS):** para profundizar en análisis o revisiones complejas, se pueden consultar los marcos de [aas-references.md](aas-references.md), bajo la autoridad y gobernanza exclusiva de la skill local responsable.

## Hechos Volátiles: Enlazar, no Copiar

Una skill **no copia** datos que cambian con el código: versiones, UIDs, nombres de archivos de test, puertos, nombres de anotaciones o listas de endpoints. Los enlaza a su fuente de verdad ([source-of-truth.md](source-of-truth.md)) o indica el comando que los obtiene.

| En lugar de escribir | Escribir |
| :--- | :--- |
| `USER 10001:10001` | "`USER` numérico no privilegiado verificado en `apps/*/Dockerfile`" |
| `tests/repo_contracts.test.ts` como ejemplo canónico | "la suite que corresponda según `npm run test:surface`" |
| "Observabilidad con OpenTelemetry" | La capacidad verificable y el archivo que la implementa |

Motivo: el análisis del 2026-10-03 encontró en las skills un UID, una ruta (`infra/tofu/`) y una afirmación de OpenTelemetry que ya no correspondían al código. Un dato copiado se desactualiza sin que ningún gate lo detecte; un enlace roto sí lo detecta `docs:validate`.

## Dependencias Ausentes: Ejecución Reproducible con `repo-tool-exec`

Si una skill necesita una herramienta que no existe en el entorno local o cuya versión instalada no satisface los requisitos mínimos (por ejemplo `actionlint`, `zizmor`, `shellcheck`, `gitleaks`, `trivy`, `checkov` o CLIs de infraestructura), **no omite la verificación ni la delega a CI sin intentarlo antes**: delega su resolución en la skill canónica [`repo-tool-exec`](../repo-tool-exec/SKILL.md).

1. **Catálogo Declarativo:** Consultar la definición autorizada en [`tool-catalog.yaml`](../repo-tool-exec/references/tool-catalog.yaml). Prohibido usar etiquetas mutables como `latest`; se emplean tags inmutables y digests SHA256.
2. **Cero Instalaciones Globales:** No instalar paquetes globales (`apt`, `brew`, `npm -g`, `pip`, `go install`) ni modificar el host; la ejecución recurre a un contenedor efímero con `--rm`.
3. **Detección Dinámica de Runtimes:** Soporte agnóstico para `docker`, `podman` o `nerdctl` verificado dinámicamente.
4. **Seguridad y Menor Privilegio:** Montaje del repositorio en solo lectura (`:ro`) por defecto, sin `--privileged`, sin socket de Docker y con aislamiento en Windows (`MSYS_NO_PATHCONV=1`).
5. **Artefactos Temporales:** Todo log o salida transitoria debe dirigirse exclusivamente a `tmp/` ([repository-hygiene.md](../../rules/repository-hygiene.md)).
6. **Evidencia Estructurada:** El resultado reporta `PASS`, `FAIL`, `UNAVAILABLE`, `NOT_CONFIGURED` o `NOT_APPLICABLE` junto al modo (`local` o `container`), comando e imagen utilizada. `UNAVAILABLE` nunca equivale a `PASS`.
