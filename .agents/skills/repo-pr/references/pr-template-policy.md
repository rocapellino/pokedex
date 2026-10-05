# Política de Descubrimiento y Mapeo del Pull Request Template

Este documento establece el procedimiento canónico para descubrir, leer y completar el Pull Request Template en el repositorio `rocapellino/pokedex`.

---

## 1. Fuente Única de Verdad (SSOT)

> [!IMPORTANT]
> El archivo físico de plantilla alojado en el repositorio es la **única Fuente de Verdad** para la estructura de un Pull Request.
> Las skills y agentes **NUNCA** deben hardcodear ni memorizar el contenido del template dentro de sus instrucciones. Si el archivo cambia en el repositorio, la skill debe adaptarse automáticamente al nuevo contenido en tiempo de ejecución.

---

## 2. Algoritmo de Descubrimiento Dinámico

Antes de generar o validar un Pull Request, el agente debe localizar el template activo siguiendo este orden de precedencia:

1. [`.github/pull_request_template.md`](../../../../.github/pull_request_template.md) (Ruta canónica en este repositorio).
2. `.github/PULL_REQUEST_TEMPLATE.md` o `.github/pull_request_template.txt`.
3. `.github/PULL_REQUEST_TEMPLATE/*.md` (Templates múltiples por tipología, si existieran).
4. `pull_request_template.md` en la raíz del repositorio.
5. `docs/pull_request_template.md`.

Si no se encuentra ningún archivo de plantilla tras evaluar esta precedencia, el agente debe reportar el estado `BLOCKED` y solicitar asistencia antes de inventar un formato arbitrario.

---

## 3. Protocolo de Análisis y Mapeo en Tiempo de Ejecución

Una vez localizado el archivo, el agente debe ejecutar los siguientes pasos analíticos:

```text
1. Leer contenido completo del PR Template descubierto
                     │
                     ▼
2. Extraer árbol de secciones (Headings H2, H3, separadores)
                     │
                     ▼
3. Identificar listas de checkboxes (- [ ]) y campos de texto
                     │
                     ▼
4. Mapear cada sección con las evidencias recolectadas
   (repo-impact, repo-quality, repo-testing, repo-security, repo-docs)
                     │
                     ▼
5. Completar todas las secciones aplicables
   (Secciones no aplicables se documentan como "N/A: <motivo>")
                     │
                     ▼
6. Verificar integridad: ninguna sección fue suprimida silenciosamente
```

---

## 4. Modelo de Parseo Semántico y Mapeo Dinámico

Para no acoplar la skill a una versión estática del template, el agente debe interpretar la estructura mediante un modelo gramatical agnóstico basado en los siguientes elementos de Markdown:

### A. Elementos Gramaticales y Reglas de Interpretación

1. **Encabezados (`#`, `##`, `###`):**
   - Delimitan las secciones y jerarquías obligatorias del documento.
   - Cada encabezado presente en el template físico debe preservarse intacto en el cuerpo del PR final.

2. **Casillas de Verificación (`- [ ]`, `- [x]`):**
   - Representan requisitos de validación, tipologías o subsistemas impactados.
   - **Regla Estricta:** Solo se marca `[x]` si existe evidencia verificable en tiempo de ejecución de que la comprobación fue exitosa o el subsistema fue efectivamente modificado.
   - Si una verificación no se ejecutó, no aplica o falló, debe permanecer desmarcada (`- [ ]`) y complementarse con su estado formal (`N/A: <motivo>`, `NOT_AVAILABLE_LOCAL / CI_REQUIRED`, `NOT_EXECUTED` o `FAIL: <detalle>`).

3. **Comentarios HTML (`<!-- ... -->`):**
   - Funcionan como directivas e instrucciones de llenado destinadas al autor.
   - El agente debe leer la directiva para saber qué información se solicita en ese bloque, proveyendo el contenido correspondiente en el texto visible.

4. **Bloques de Texto Libre y Placeholders:**
   - Indican campos descriptivos a completar por el agente (resúmenes, motivación, planes de rollback, etc.).
   - La redacción de estos bloques debe ser siempre en **español** técnico ([language-policy.md](../../_shared/language-policy.md)).

### B. Heurística de Asociación de Evidencias

El agente correlaciona dinámicamente las secciones descubiertas con los artefactos de las skills de dominio:

- **Secciones de Resumen / Descripción / Contexto:** Se completan sintetizando: (1) problema resuelto, (2) solución técnica implementada y (3) alcance arquitectónico del cambio.
- **Secciones de Identificadores / Issues:** Se completan con las referencias cruzadas detectadas (Linear, GitHub Issues) o explícitamente `N/A (Tarea operativa / interna)`.
- **Secciones de Tipología / Categoría:** Se asocia la tipología correspondiente según Conventional Commits (`feat`, `fix`, `refactor`, `infra`, `ci`, `test`, `chore`, `docs`).
- **Secciones de Componentes Impactados:** Se determinan a partir de las rutas del diff analizadas por `repo-impact` (`apps/backend`, `apps/frontend`, `infra`, `scripts`, `docs`, `.github`).
- **Secciones de Pruebas y Verificaciones:** Se mapean contra los resultados reales ejecutados en el workspace:
  - Pruebas unitarias/integración: provistas por `repo-testing`.
  - Linters, tipos y pre-commit: provistos por `repo-quality`.
  - Análisis estático de seguridad y secretos: provistos por `repo-security`.
  - Coherencia documental y Markdown Quality Gate: provistos por `repo-docs`.
- **Secciones de Breaking Changes / Configuración:** Se evalúa si el diff introduce variables requeridas o incompatibilidades hacia atrás.

---

## 5. Reglas de Integridad del Documento

1. **Inclusión Estricta de Encabezados (`template headings ⊆ PR headings`):** Todos los encabezados H2 definidos en el template físico deben figurar en el PR Body. Ninguna sección de la plantilla puede ser omitida ni rebautizada arbitrariamente.
2. **Prohibición de Estructuras Alternativas:** Queda terminantemente prohibido sustituir los encabezados canónicos por estructuras ad-hoc (por ejemplo, reemplazar las secciones del template por `## Descripción del Cambio` o `## Suite de Verificación Local`).
3. **Declaración Explícita de N/A:** Cuando un bloque no aplique al cambio, la sección debe mantenerse y completarse con `N/A: <justificación concisa>`.
4. **Fidelidad Fáctica:** Toda afirmación debe corresponder al estado real del repositorio. No reportar "desplegado en clúster" si solo está en rama local.
5. **CI Impact Analysis Obligatorio:** La sección de impacto de CI debe contener la tabla markdown generada por `scripts/detect-change-impact.ts` sin placeholders `—` sin resolver.

---

## 6. Contrato de Validación Ejecutable (`validate-pr-body`)

Para transformar la gobernanza de una instrucción pasiva en un contrato determinista, el repositorio provee el motor canónico de validación [`scripts/validate-pr-body.ts`](../../../../scripts/validate-pr-body.ts), ejecutable mediante:

```bash
npm run pr:validate -- --body tmp/pr-body.md
```

Este motor valida programáticamente:

- Existencia y orden de todos los encabezados H2 del template físico activo.
- Inexistencia de estructuras sustitutas no autorizadas.
- Presencia de tabla completa y resuelta en CI Impact Analysis.
- Checklists y campos no vacíos (o formalmente justificados con `N/A`).
- Ausencia de caracteres corruptos de mojibake.

---

## 7. Protocolo de Ejecución: Puertas de Enlace Pre y Post Publicación

El ciclo de publicación en `repo-pr` se articula en dos compuertas de enlace (*gates*) estrictamente bloqueantes:

```text
               .github/pull_request_template.md
                              │
                              ▼
                       Parse Template
                              │
                              ▼
             Generar PR Body (tmp/pr-body.md)
                              │
                              ▼
            npm run pr:validate -- --body tmp/pr-body.md
                              │
                     ┌────────┴────────┐
                     │                 │
                   FAIL               PASS
                     │                 │
                     ▼                 ▼
             BLOCKED / NOT_READY   gh pr create --body-file tmp/pr-body.md
                                       │
                                       ▼
                       gh pr view --json body --jq .body
                                       │
                                       ▼
                 npm run pr:validate -- --remote <número>
                                       │
                              ┌────────┴────────┐
                              │                 │
                            FAIL               PASS
                              │                 │
                              ▼                 ▼
                      BLOCKED / NOT_READY  READY_FOR_PR
```

### A. Compuerta Pre-Publicación (Local Gate)

Antes de invocar `gh pr create` o `gh pr edit`:

1. Generar el cuerpo completo en un archivo temporal en `tmp/` (ej. `tmp/pr-body.md`) codificado en UTF-8 sin BOM.
2. Ejecutar la validación determinista:

   ```powershell
   npx tsx scripts/validate-pr-body.ts --body tmp/pr-body.md
   ```

3. **Veredicto Bloqueante:** Si la herramienta reporta infracciones (`FAIL`), la operación queda en estado **`BLOCKED`** o **`NOT_READY`**. Queda estrictamente prohibido crear o actualizar el PR en GitHub mientras persistan errores.

### B. Compuerta Post-Publicación (Remote Gate)

Incluso tras publicar exitosamente el PR en GitHub:

1. En Windows, asegurar codificación UTF-8 en la consola:

   ```powershell
   $utf8 = [System.Text.UTF8Encoding]::new($false)
   [Console]::InputEncoding = $utf8
   [Console]::OutputEncoding = $utf8
   $OutputEncoding = $utf8
   ```

2. Publicar utilizando exclusivamente archivo:

   ```powershell
   gh pr create --body-file tmp/pr-body.md
   ```

3. Leer inmediatamente el cuerpo remoto persistido en GitHub:

   ```powershell
   npx tsx scripts/validate-pr-body.ts --remote <número_del_pr>
   ```

4. **Veredicto Remoto:**
   - Si la validación contra el PR remoto aprueba con 0 infracciones y sin mojibake: el control pasa a **`PASS`** y el PR alcanza **`READY_FOR_PR`**.
   - Si la validación falla o se detecta mojibake: el PR permanece en **`NOT_READY`** o **`BLOCKED`**, requiriendo regenerar el archivo local corregido y actualizar con `gh pr edit <número> --body-file tmp/pr-body.md`.
