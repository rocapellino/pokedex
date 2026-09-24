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

## 4. Secciones Canónicas Actuales y Criterio de Mapeo

Basado en la inspección de [`.github/pull_request_template.md`](../../../../.github/pull_request_template.md), el mapeo de evidencias debe ceñirse a los siguientes criterios:

### A. Issues Vinculados (`## 📌 Issues Vinculados`)

- **Linear:** Identificador de ticket (ej. `PEX-12`). Si no existe ticket de Linear, marcar explícitamente `N/A (Tarea operativa / interna)`.
- **GitHub:** Número de issue asociado (ej. `Closes #123`). Si no existe issue de GitHub, omitir o indicar `N/A`.

### B. Tipo de Cambio (`## 🏷️ Tipo de Cambio`)

Marcar con `[x]` estrictamente **una** tipología principal según Conventional Commits:

- `feat`: Nueva funcionalidad (impacta minor release).
- `fix`: Corrección de bug (impacta patch release).
- `refactor`: Refactorización interna sin cambio funcional.
- `infra`: Helm, OpenTofu, Kubernetes, Proxmox, AWS.
- `ci`/`cd`: Modificación en GitHub Actions, MegaLinter, Workflows.
- `test`: Pruebas unitarias, E2E o integración.
- `chore`: Mantenimiento, dependencias o tooling.
- `docs`: Documentación técnica.

### C. Resumen de Cambios (`## 📝 Resumen de Cambios`)

- Redacción obligatoria en **español** ([language-policy.md](../../_shared/language-policy.md)).
- Debe sintetizar:
  1. **Contexto:** Qué motivó el cambio.
  2. **Solución Técnica:** Qué componentes y lógica se modificaron.
  3. **Impacto:** Consecuencias en arquitectura, dependencias o runtime.

### D. Componentes Afectados (`## 📦 Componentes Afectados`)

Marcar con `[x]` únicamente los subsistemas tocados en el diff según la clasificación de `repo-impact`:

- `apps/backend`
- `apps/frontend`
- `infra`
- `scripts`
- `docs` / `.github`

### E. Pruebas y Verificaciones Realizadas (`## 🧪 Pruebas y Verificaciones Realizadas`)

> [!CAUTION]
> **Prohibición de Marcar sin Evidencia:**
> Solo se marcará `[x]` si la prueba o herramienta fue ejecutada localmente o en un runner con resultado exitoso comprovable.
> Si una validación no fue ejecutada, debe permanecer como `[ ]` y anotarse su estado (`NOT_EXECUTED`, `NOT_AVAILABLE` o `NOT_APPLICABLE`).

Mapeo de validaciones:

1. **Tests Unitarios y Cobertura:** Requiere evidencia de `npm test` o `npm run test:coverage`.
2. **Verificación de Tipos (TypeScript):** Requiere evidencia de `npm run lint` o `tsc --noEmit`.
3. **Pruebas E2E (Playwright):** Requiere ejecución de `npm run test:e2e`. Si el cambio no afecta frontend, documentar como `N/A: Cambio exclusivo de backend/infra`.
4. **Accesibilidad WCAG 2.1:** Requiere `npm run test:a11y`. Si no aplica, documentar `N/A`.
5. **Auditoría Core Web Vitals (Lighthouse):** Si no aplica, documentar `N/A`.
6. **MegaLinter Local / CI:** Indicar si se validó localmente o si se delega a la ejecución del workflow en GitHub Actions.
7. **SonarCloud Quality Gate:** Indicar estado reportado o delegación a CI.
8. **Seguridad & SAST:** Requiere escaneos de Semgrep, Gitleaks o Trivy provistos por `repo-security`.
9. **Validación Docker / Helm:** Requiere compilación local exitosa si se modificó Dockerfile o Helm charts.

### F. Variables de Entorno & Breaking Changes (`## ⚠️ Variables de Entorno & Breaking Changes`)

- Responder explícitamente a ambas preguntas con `[x]` o `[ ]` más justificación en español.

---

## 5. Reglas de Integridad del Documento

1. **No Eliminar Secciones:** Ninguna sección de la plantilla debe ser borrada, aun cuando no aplique.
2. **Declaración Explícita de N/A:** Cuando un bloque no aplique al cambio, se debe colocar `N/A: <justificación concisa>`.
3. **Fidelidad Fáctica:** Toda afirmación debe corresponder al estado real del repositorio. No reportar "desplegado en clúster" si solo está en rama local.
