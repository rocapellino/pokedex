# Gobernanza de Fuente Única de Verdad (SSOT) vs. Evidencia Histórica

Esta regla aplica a todos los agentes de IA, procesos automatizados y herramientas en `rocapellino/pokedex`.

---

## 1. Demarcación de Fuentes

| Directorio / Ruta | Clasificación | Propósito y Tratamiento Operativo |
| :--- | :--- | :--- |
| `gitops/` | **SSOT Actual** | Definiciones declarativas vigentes por entorno (ArgoCD, values por cluster). |
| `infra/` | **SSOT Actual** | Helm charts, templates, Ansible playbooks, OpenTofu y K8s manifests vigentes. |
| `docs/architecture/` | **SSOT Actual** | Especificaciones canónicas vigentes de arquitectura y seguridad. |
| `src/`, `apps/`, `scripts/` | **SSOT Actual** | Código fuente ejecutable y tests automatizados en producción. |
| `docs/audits/` | **Evidencia Histórica** | Informes fechados, auditorías pasadas, snapshots y diagnósticos previos. |

---

## 2. Regla Operativa para Agentes de IA (Antigravity)

1. **Prohibición de Inferencia desde Auditorías:**
   - Queda estrictamente prohibido utilizar `docs/audits/` como base de conocimiento para determinar el estado actual de la infraestructura, nombres de secretos, rutas de Vault, imágenes o variables de entorno.
   - Cualquier discrepancia o referencia encontrada en `docs/audits/` (como `pokedex/production`) es evidencia histórica inmutable del momento en que se realizó el análisis, no un problema operativo vigente.

2. **Resolución de Verdad Técnica (SSOT Vigente):**
   - La verdad operativa del sistema se extrae exclusivamente de:
     - `gitops/`
     - `infra/`
     - `docs/architecture/`
     - Código fuente y tests en `tests/`
   - **Convención canónica de secretos en Vault:**
     - Producción: `pokedex/prod`
     - Pre-producción: `pokedex/preprod`

3. **Inmutabilidad de Auditorías Pasadas:**
   - Los archivos dentro de `docs/audits/` no deben modificarse retroactivamente para "actualizarlos" a convenciones nuevas, ya que representan registros de auditoría forense y cumplimiento histórico.
