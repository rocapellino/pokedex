# Gobernanza Documental Transversal (`documentation-governance.md`)

Esta regla aplica a todos los agentes de IA, procesos automatizados y colaboradores en `rocapellino/pokedex`.

---

## 1. Principio Fundamental: SSOT y Verificación Fáctica

1. **La documentación no es fuente de verdad por sí misma:** Todo claim técnico (endpoints, variables de entorno, puertos, versiones, comandos o dependencias) debe verificarse contra el SSOT correspondiente (código en `apps/`, configuración, `infra/`, Helm y GitOps).
2. **Deriva Inaceptable:** Cualquier discrepancia entre el comportamiento real del código o la infraestructura y el texto documental debe resolverse mediante actualización o enmienda formal gobernada por `repo-docs`.

---

## 2. Límites y Presupuesto por Nivel Documental

| Documento / Directorio | Audiencia y Rol | Contenido Permitido / Obligatorio | Contenido Expresamente Prohibido |
| :--- | :--- | :--- | :--- |
| `README.md` | Desarrolladores y evaluadores técnicos (portal de entrada). | Propósito, características principales, resumen de arquitectura (máx. 1 diagrama Mermaid), stack resumido, requisitos previos, quickstart local (≤ 5 min), comandos de test y enlaces canónicos a `docs/`. | Código fuente extenso, reportes de auditoría, bitácoras cronológicas de commits, ADRs íntegros, troubleshooting profundo. **Presupuesto:** máx. 260 líneas, máx. 12 secciones (`##`). |
| `SECURITY.md` | Investigadores de seguridad y operadores. | Proceso formal de reporte de vulnerabilidades, versiones soportadas, alcance de evaluación, SLA de respuesta y divulgación responsable. | Detalles de vulnerabilidades resueltas en el pasado, instrucciones de ataque, sobre-documentación de configuración interna. **Presupuesto:** máx. 180 líneas. |
| `docs/architecture/` | Mantenedores y arquitectos. | Especificaciones canónicas vigentes de arquitectura, modelos de datos, seguridad de red y topología del sistema. | Procedimientos de despliegue paso a paso o registros de auditorías fechadas. |
| `docs/operations/` / `docs/runbooks/` | Operadores de plataforma e infraestructura. | Procedimientos operativos estándar, recuperación ante desastres (DR), rotación de credenciales y guías de diagnóstico. | Especificaciones de diseño teórico desacopladas de playbooks o manifests reales. |
| `docs/decisions/` | Equipo de ingeniería y gobernanza. | Architectural Decision Records (ADRs) formalizados en formato canónico. | Modificaciones retroactivas sin proceso formal de superseding / enmienda. |
| `docs/audits/` | Registro forense e histórico. | Snapshots de auditoría fechados, diagnósticos estáticos e informes de remediación puntuales. | **NUNCA SSOT actual.** Inmutable retrospectivamente. Prohibido inferir convenciones operativas vigentes desde aquí. |

---

## 3. Inmutabilidad de Evidencia Histórica

- La documentación en `docs/audits/` y los ADRs sustituidos constituyen evidencia histórica inmutable.
- Si un componente o convención cambia (por ejemplo, nombres de rutas en Vault de `pokedex/production` a `pokedex/prod`), los informes históricos no se modifican; se preservan y cualquier nuevo análisis contrasta contra el SSOT vigente.

---

## 4. Reglas de Actualización y Mantenimiento

1. **Impacto por Cambios de Código o Infraestructura:**
   - Si un PR modifica arquitectura, variables de entorno, tareas de `Taskfile.yaml`, Helm charts o pipelines de CI, se debe auditar y sincronizar la documentación afectada utilizando `repo-docs`.
2. **Cambios Puramente Documentales (Fast Track):**
   - Los cambios delimitados exclusivamente a archivos `.md` aplican el flujo Fast Track: validación de coherencia con `repo-docs` y verificación obligatoria del Markdown Quality Gate.
3. **Referencias Huérfanas Prohibidas:**
   - Queda prohibido documentar scripts retirados, comandos inexistentes o rutas eliminadas. Toda referencia a archivos del monorepo debe apuntar a rutas existentes.

---

## 5. Markdown Quality Gate Obligatorio

Todo archivo Markdown (`.md`) creado, modificado o generado por un agente o desarrollador debe superar estrictamente:

```bash
npm run lint:md -- <archivos-modificados>
```

- **Tolerancia cero:** No se considera terminada ninguna tarea ni se aprueba ningún Pull Request que introduzca violaciones `MDxxx`.
- **Enforcement en CI:** El pipeline de integración (`docs-gate` en `.github/workflows/ci.yaml`) valida de forma fail-closed el árbol documental completo.
