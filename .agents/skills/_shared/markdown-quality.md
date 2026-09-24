# Procedimiento Estándar de Calidad Markdown (`markdown-quality.md`)

Este procedimiento define el **Markdown Quality Gate obligatorio** para todo agente,
skill o proceso automatizado que cree, genere, modifique o actualice archivos `.md`
en el repositorio `rocapellino/pokedex`.

---

## 1. Principio Fundamental de Terminación

> [!IMPORTANT]
> **Ningún archivo Markdown con errores `MDxxx` es un artefacto terminado.**
> La tarea o skill **NO** puede darse por finalizada mientras exista una sola
> violación de markdownlint reportada sobre los archivos generados o modificados.

Queda terminantemente prohibido solucionar errores deshabilitando reglas de
markdownlint (por ejemplo mediante comentarios inline `<!-- markdownlint-disable -->`)
simplemente para forzar una salida limpia. Cualquier excepción legítima debe ser
justificada, documentada y centralizada en `.markdownlint.json`.

---

## 2. Flujo Obligatorio de Generación y Validación

Todo skill que genere o modifique archivos Markdown debe ejecutar obligatoriamente
el siguiente ciclo de validación antes de entregar el resultado al usuario:

```text
GENERATE / UPDATE
       ↓
VALIDATE MARKDOWN (npm run lint:md -- <archivos>)
       ↓
MDxxx FOUND?
       ├── YES → FIX (npm run lint:md:fix o corrección semántica)
       │          ↓
       │       VALIDATE AGAIN
       │          ↓
       │       (repetir en bucle)
       │
       └── NO → COMPLETE
```

---

## 3. Ciclo Operativo en 6 Fases

### Fase 1: Detección de Archivos Impactados

Identificar de forma explícita todos los archivos `.md` creados o alterados
durante la ejecución del skill:

```bash
git status -s | grep -E '\.md$'
```

Los artefactos sujetos a este gate incluyen, entre otros:

- `baseline_inventario.md` y `baseline_diagnostico.md`
- Reportes técnicos (`report-template.md`)
- Planes de cambio (`change-plan.md`)
- Decisiones arquitectónicas (ADRs bajo `docs/decisions/`)
- Runbooks y manuales operativos (`docs/operations/`, `docs/runbooks/`)
- Documentación raíz (`README.md`, `SECURITY.md`)

### Fase 2: Ejecución de Markdownlint

Ejecutar la validación centralizada sobre los archivos detectados:

```bash
npm run lint:md -- <ruta_al_archivo_1.md> <ruta_al_archivo_2.md>
```

O utilizando el runner nativo de Node.js:

```bash
node --experimental-strip-types scripts/lint-markdown.ts <archivos>
```

### Fase 3: Identificación y Clasificación de Errores `MDxxx`

El verificador detecta y reporta cualquier violación contra `.markdownlint.json`,
incluyendo pero no limitándose a:

- **Estructura y Jerarquía:** `MD001` (niveles de encabezado), `MD003` (estilo atx),
  `MD025` (único H1 por documento).
- **Espaciado y Saltos de Línea:** `MD012` (múltiples líneas vacías consecutivas),
  `MD022` (líneas vacías alrededor de encabezados), `MD031` (líneas vacías
  alrededor de bloques de código), `MD032` (líneas vacías alrededor de listas),
  `MD047` (archivo debe terminar con newline).
- **Listas:** `MD004` (estilo consistente de listas no ordenadas), `MD005`
  (indentación consistente de listas), `MD007` (indentación de sublistas), `MD029`
  (numeración ordenada).
- **Espacios en Blanco:** `MD009` (espacios en blanco al final de línea), `MD010`
  (prohibición de tabs por espacios).
- **Longitud de Línea:** `MD013` (máximo 120 caracteres para prosa, exceptuando
  bloques de código, tablas y encabezados).
- **Bloques y Código:** `MD014` (sin símbolos `$` precediendo comandos sin output),
  `MD040` (especificar lenguaje en bloques de código cercados), `MD046` (bloques
  cercados con backticks), `MD048` (backtick para cercas de código).
- **Énfasis y HTML:** `MD033` (prohibición de HTML inline sin justificar), `MD034`
  (URLs no enlazadas), `MD036` (énfasis indebido usado como encabezado), `MD049`
  / `MD050` (estilo de asterisco para cursiva/negrita).
- **Enlaces:** `MD051` (fragmentos de enlace válidos que coincidan con anclajes).

### Fase 4: Auto-Corrección Segura

Para errores de formato mecánicos (espacios finales, líneas vacías redundantes,
estilo de cercas, pipes de tablas), ejecutar la auto-remediación:

```bash
npm run lint:md:fix -- <archivos>
```

### Fase 5: Corrección Semántica Manual

Aquellos errores que involucren intención o estructura de contenido (`MD001`,
`MD022`, `MD032`, `MD033`, `MD051`) deben corregirse manualmente en el archivo
fuente.

### Fase 6: Re-validación y Verificación de Cero Errores

Ejecutar nuevamente `npm run lint:md -- <archivos>` hasta verificar que el
conteo de errores finales sea exactamente **0**.

---

## 4. Formato Obligatorio del Reporte de Validación

Al concluir la ejecución de cualquier skill que genere o modifique archivos Markdown,
el agente debe incluir en su informe final el siguiente bloque contractual:

```text
Markdown validation: PASS
Files checked: N
Initial MDxxx errors: N
Fixed MDxxx errors: N
Final MDxxx errors: 0
```

Si `Final MDxxx errors` es mayor a 0, la tarea se considera **FALLIDA** y el agente
debe reiniciar el ciclo de corrección antes de emitir su entrega.
