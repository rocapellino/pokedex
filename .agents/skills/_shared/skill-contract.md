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
| `tests/contracts.test.ts` como ejemplo canónico | "la suite que corresponda según `npm run test:surface`" |
| "Observabilidad con OpenTelemetry" | La capacidad verificable y el archivo que la implementa |

Motivo: el análisis del 2026-10-03 encontró en las skills un UID, una ruta (`infra/tofu/`) y una afirmación de OpenTelemetry que ya no correspondían al código. Un dato copiado se desactualiza sin que ningún gate lo detecte; un enlace roto sí lo detecta `docs:validate`.

## Dependencias Ausentes: Ejecutar en Contenedor

Si una skill necesita una herramienta que no existe en el entorno local (por ejemplo `actionlint`, `zizmor`, `shellcheck`, `hadolint` o una CLI de infraestructura), **no omite la verificación ni la delega a CI sin intentarlo antes**: la ejecuta en un contenedor Docker efímero.

1. **Misma herramienta que CI:** usar la imagen y las opciones con las que el workflow correspondiente de `.github/workflows/` ejecuta esa herramienta, con la imagen fijada por digest. Si CI no la ejecuta, usar la imagen oficial del proyecto upstream y fijar su versión.
2. **Sin instalar en el host:** no instalar paquetes globales ni modificar el entorno local; el contenedor se ejecuta con `--rm` y monta el repositorio (`-v "$PWD":/repo`), en solo lectura cuando la herramienta no escribe.
3. **Git Bash en Windows:** anteponer `MSYS_NO_PATHCONV=1` para que las rutas de los volúmenes no se reescriban.
4. **Artefactos temporales:** cualquier archivo que la herramienta genere va bajo `tmp/` ([repository-hygiene.md](../../rules/repository-hygiene.md)); no se instalan dependencias en el repositorio para una verificación puntual.
5. **Evidencia:** el resultado cuenta como `EXECUTED_SUCCESS` o `EXECUTED_FAILED` y se reporta con el comando y la imagen usados.
6. **Cuándo declarar la herramienta no disponible:** solo si Docker no está disponible o no existe una imagen utilizable, y debe constar el intento. En ese caso se aplican los estados `NOT_AVAILABLE_LOCAL` o `CI_REQUIRED` de la skill, que nunca equivalen a `PASS`.
