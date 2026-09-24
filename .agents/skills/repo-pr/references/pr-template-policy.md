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

1. **No Eliminar Secciones:** Ninguna sección de la plantilla debe ser borrada, aun cuando no aplique.
2. **Declaración Explícita de N/A:** Cuando un bloque no aplique al cambio, se debe colocar `N/A: <justificación concisa>`.
3. **Fidelidad Fáctica:** Toda afirmación debe corresponder al estado real del repositorio. No reportar "desplegado en clúster" si solo está en rama local.
