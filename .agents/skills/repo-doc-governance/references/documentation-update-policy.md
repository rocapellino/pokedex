# 🔄 Política de Actualización Documental Reactiva (`documentation-update-policy.md`)

Esta política define cuándo y cómo debe actualizarse la documentación a partir de modificaciones en el código fuente, configuración e infraestructura del repositorio.

---

## 1. Modos de Ejecución de Gobernanza Documental

Para prevenir que un agente o skill modifique indiscriminadamente la documentación sin supervisión, la gobernanza documental opera bajo tres modos estrictos:

### A. Modo `AUDIT` (Solo Lectura)

- **Comportamiento:** Examina los documentos impactados contra la evidencia del repositorio, detecta inconsistencias, calcula la deriva y emite un informe estructurado.
- **Acción sobre Archivos:** No modifica ningún archivo en disco.
- **Uso:** En pipelines de CI, compuertas de PR en `repo-pr` y diagnósticos periódicos.

### B. Modo `PROPOSE` (Plan de Cambios)

- **Comportamiento:** Detecta la deriva, genera el diff sugerido con los cambios precisos a aplicar y presenta la propuesta al usuario o revisor técnico.
- **Acción sobre Archivos:** Redacta el plan de modificación sin alterar los archivos Markdown canónicos hasta recibir confirmación explícita.
- **Uso:** Durante el desarrollo interactivo de features o refactors arquitectónicos.

### C. Modo `UPDATE` (Aplicación Controlada)

- **Comportamiento:** Aplica modificaciones quirúrgicas estrictamente delimitadas a resolver la deriva detectada, ejecuta de inmediato el *Markdown Quality Gate* (`npm run lint:md`) y valida la suite de tests.
- **Acción sobre Archivos:** Modifica únicamente los archivos correspondientes a las reglas infringidas.
- **Uso:** Ejecución autorizada por el usuario o en tareas de sincronización documental aprobadas.

---

## 2. Disparadores de Auditoría por Tipo de Cambio

Toda modificación en el repositorio activa la auditoría condicional de los documentos correspondientes según la siguiente matriz:

| Archivo / Área Modificada | Pregunta Clave de Auditoría | Documentos a Auditar |
| :--- | :--- | :--- |
| `package.json`, `bun.lock` | ¿Se modificó el runtime, dependencias base o scripts? | `README.md`, `docs/architecture/` |
| `infra/helm/`, `gitops/` | ¿Cambió la arquitectura, puertos o recursos K8s? | `README.md`, `docs/architecture/`, `docs/operations/` |
| `infra/tofu/`, `infra/ansible/` | ¿Se alteró el aprovisionamiento de nodos o red? | `docs/operations/`, `docs/runbooks/` |
| `.github/workflows/` | ¿Se modificaron linters, scanners o pipelines de build? | `README.md`, `docs/devops/`, `SECURITY.md` |
| Configuración de Vault / ESO | ¿Cambiaron los roles o rutas de secretos? | `SECURITY.md`, `docs/security/` |
| Modificación directa de `README.md` | ¿Las nuevas afirmaciones derivan de la evidencia del repo? | `README.md` |
| Modificación directa de `SECURITY.md` | ¿Las versiones y contactos son válidos y respetan los límites? | `SECURITY.md` |

---

## 3. Principio de Intervención Mínima Necesaria

- **Prohibición de Reescritura Masiva:** Una corrección documental nunca debe reemplazar párrafos no relacionados ni reescribir secciones estables.
- **Preservación de Tono y Estilo:** Las actualizaciones deben mantener la estructura canónica y la concisión exigida por las políticas de cada documento.
- **Validación Inmediata:** Toda actualización debe superar el linter de Markdown (`npm run lint:md -- <archivos-modificados>`) antes de considerarse completa.
