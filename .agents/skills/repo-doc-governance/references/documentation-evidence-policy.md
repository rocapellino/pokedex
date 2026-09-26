# ⚖️ Jerarquía de Evidencia y Verdad Canónica (`documentation-evidence-policy.md`)

Esta política formaliza el principio rector de que **toda afirmación en la documentación debe derivar del estado comprobable del repositorio**, estableciendo el orden de precedencia ante discrepancias entre documentos y código.

---

## 1. Principio Fundamental: Documentación Derivada de Evidencia

> **Regla de Oro:** **`README.md` y `SECURITY.md` nunca son la Fuente Única de Verdad (SSOT) de la arquitectura del sistema.**
>
> Son representaciones sintéticas y derivadas del estado real del repositorio. Si un documento contradice lo implementado en el código, la infraestructura o los tests, **el documento contiene deriva y debe corregirse**.

---

## 2. Jerarquía Canónica de Verdad (10 Niveles)

Ante cualquier contradicción entre artefactos del repositorio, la verdad técnica se dirime siguiendo rigurosamente el siguiente orden de precedencia:

```text
 1. Código Fuente Ejecutable y Configuración Activa  (apps/, server.ts, src/)
    │
 2. Suites de Pruebas Automatizadas                  (tests/)
    │
 3. Pipelines de Integración y Entrega Continua      (.github/workflows/)
    │
 4. Infraestructura Declarativa (IaC)                (infra/helm/, infra/tofu/, infra/ansible/)
    │
 5. Manifiestos de Paquetes y Lockfiles              (package.json, bun.lock)
    │
 6. Manifiestos de GitOps y Runtime                  (gitops/)
    │
 7. Architectural Decision Records (ADR)             (docs/decisions/)
    │
 8. Documentación Técnica y Runbooks                 (docs/architecture/, docs/operations/)
    │
 9. Documentación Pública Derivada                   (README.md, SECURITY.md)
    │
10. Evidencia y Snapshots Históricos                 (docs/audits/)
```

---

## 3. Resolución de Discrepancias Frecuentes

| Discrepancia Observada | Fuente Primaria (SSOT) | Documento Derivado a Corregir | Acción |
| :--- | :--- | :--- | :--- |
| El documento indica que se requiere AWS EKS, pero Helm soporta cualquier K8s y Proxmox corre K3s. | `infra/helm/pokedex/values.yaml` y `gitops/` | `README.md` | Corregir el documento para presentar la arquitectura como Kubernetes portable. |
| El documento describe Sealed Secrets, pero los manifiestos usan Vault y ExternalSecrets. | `infra/k8s/eso/` y `gitops/` | `README.md` y `SECURITY.md` | Actualizar a Vault CE + ESO. |
| El documento indica soporte para versiones de Node.js no declaradas. | `package.json` (`engines`) y `Dockerfile` | `README.md` | Alinear con `node:22-alpine` y `Node 22 LTS`. |
| El documento promete un tiempo de despliegue sin respaldo empírico. | Tests de integración o benchmarks reales | `README.md` | Remover la afirmación no respaldada (*unsupported claim*). |

---

## 4. Auditoría de Afirmaciones no Respaldadas (*Unsupported Claims*)

Una afirmación se clasifica como `UNSUPPORTED` y debe ser eliminada o corregida si:

1. No existe ningún archivo en el repositorio que sustente la capacidad descrita.
2. Ningún test automatizado valida el comportamiento afirmado.
3. Se proclaman niveles de SLA, tiempos de recuperación o rendimientos que no cuentan con medición documentada en `docs/runbooks/` o pruebas k6.
