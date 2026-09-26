---
name: repo-doc-governance
description: Definir políticas, contratos, límites y presupuestos documentales para el repositorio.
---

# repo-doc-governance

## Objetivo

Establecer la **capa de gobernanza documental** del repositorio `rocapellino/pokedex`, definiendo las políticas, límites (*boundaries*), presupuestos (*budgets*) y contratos declarativos que determinan qué información pertenece a `README.md`, `SECURITY.md` y `docs/`, desacoplando la definición normativa de su ejecución técnica.

`repo-doc-governance` actúa como la **Fuente Normativa de Verdad** sobre la estructura documental, mientras que `repo-docs` opera como el brazo ejecutor para auditorías, actualizaciones y depuración.

---

## Arquitectura del Ecosistema de Gobernanza

```text
                         ┌──────────────────────┐
                         │ repo-doc-governance  │
                         │      SSOT            │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    │               │                │
                    ▼               ▼                ▼
              README.md       SECURITY.md       docs/**/*.md
                    │               │                │
                    └───────────────┼────────────────┘
                                    ▼
                         ┌──────────────────────┐
                         │      repo-docs       │
                         │ auditor / updater    │
                         └──────────┬───────────┘
                                    │
             ┌──────────────────────┼─────────────────────┐
             ▼                      ▼                     ▼
       repo-lifecycle           repo-pr              CI/pre-commit
```

---

## Modos de Ejecución

Para garantizar control estricto y evitar reescrituras no autorizadas:

1. **`AUDIT` (Modo Diagnóstico - Solo Lectura):**
   - Evalúa `README.md`, `SECURITY.md` y `docs/` contra el contrato declarativo [`references/documentation-contract.yaml`](references/documentation-contract.yaml).
   - Clasifica afirmaciones en la taxonomía de volatilidad (`STABLE`, `DYNAMIC`, `TECHNICAL`, etc.).
   - Calcula métricas cuantitativas contra el presupuesto (*budget*).
   - Genera el reporte estándar sin tocar archivos en disco.
2. **`PROPOSE` (Modo Propuesta - Plan de Cambios):**
   - Genera un plan de acción con diffs sugeridos para resolver la deriva detectada.
   - Solicita validación al usuario o al revisor técnico antes de aplicar cambios.
3. **`UPDATE` (Modo Aplicación Quirúrgica):**
   - Aplica las correcciones estrictamente necesarias para subsanar violaciones de reglas.
   - Ejecuta de forma inmediata el Quality Gate (`npm run lint:md`) y la suite de tests.

---

## Referencias Normativas

Las reglas y políticas se desacoplan de este documento y residen en `references/`:

- [documentation-contract.yaml](references/documentation-contract.yaml): Contrato formal declarativo de propósitos, elementos permitidos/prohibidos, presupuesto y catálogo de reglas.
- [documentation-boundaries.md](references/documentation-boundaries.md): Delimitación formal de qué pertenece a `README.md`, `SECURITY.md`, `docs/` y `docs/audits/`.
- [readme-policy.md](references/readme-policy.md): Estándares editoriales, estructura canónica (máximo 12 secciones) y presupuesto (máximo 260 líneas) para `README.md`.
- [security-policy.md](references/security-policy.md): Estándares restrictivos para `SECURITY.md` (reporte, versiones soportadas, alcance, SLA, sin sobre-documentación técnica).
- [documentation-drift-policy.md](references/documentation-drift-policy.md): Matriz de severidad de deriva (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) y taxonomía de afirmaciones.
- [documentation-update-policy.md](references/documentation-update-policy.md): Disparadores reactivos de auditoría según los componentes modificados en el repositorio.
- [documentation-retirement-policy.md](references/documentation-retirement-policy.md): Ciclo de vida documental, regla de promoción y las 6 salvaguardas de poda segura.
- [documentation-evidence-policy.md](references/documentation-evidence-policy.md): Jerarquía canónica de verdad (10 niveles) basada en evidencia fáctica del repositorio.

---

## Comandos Soportados

| Comando | Modo | Descripción |
| :--- | :---: | :--- |
| `/doc-governance` | `AUDIT` | Ejecuta la auditoría integral de gobernanza documental sobre todo el repositorio. |
| `/doc-governance audit [archivo]` | `AUDIT` | Audita un archivo específico (`README.md`, `SECURITY.md` o ruta en `docs/`). |
| `/doc-governance propose [archivo]` | `PROPOSE` | Genera propuesta de cambios para corregir deriva en el archivo especificado. |
| `/doc-governance update [archivo]` | `UPDATE` | Aplica correcciones automáticas delimitadas y ejecuta el Markdown Quality Gate. |
| `/doc-governance budget` | `AUDIT` | Evalúa exclusivamente el cumplimiento de presupuestos de líneas y secciones. |

---

## Integración con Otras Skills

- **`repo-docs`:** Consume las políticas de `repo-doc-governance` como su norma rectora para clasificar, actualizar y validar documentos.
- **`repo-lifecycle`:** Utiliza la matriz de impacto documental para disparar auditorías selectivas sobre `README.md`, `SECURITY.md` o `docs/` según los archivos modificados.
- **`repo-pr`:** Integra la compuerta **Documentation Governance Gate**, impidiendo el merge de Pull Requests con deriva `CRITICAL` o `HIGH`.

---

## Formato del Reporte Estándar

Toda auditoría genera o actualiza el reporte en `docs/audits/<FECHA>/documentation-governance.md`:

```markdown
# Documentation Governance Audit

## Resumen Ejecutivo
| Documento | Estado | Drift Crítico | Drift Alto | Líneas | Presupuesto | Acción |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| README.md | FAIL | 0 | 2 | 240 | PASS | Actualizar arquitectura |
| SECURITY.md | FAIL | 0 | 1 | 165 | PASS | Alinear versiones |
| docs/architecture/ | PASS | 0 | 0 | - | PASS | Conforme |

## Hallazgos por Documento
### README.md
- [HIGH] [README-ARCH-001]: Deriva en stack o runtime...
- [MEDIUM] [README-SEC-001]: Detalle excesivo de seguridad...

## Acciones de Remediación
1. ...
```
