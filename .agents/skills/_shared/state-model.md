# Modelo Canónico de Estados del Repositorio (SDLC & GitOps)

Este documento define el modelo conceptual unificado de estados para gobernar la relación entre el desarrollo, la publicación de versiones, el despliegue declarativo y la ejecución en `rocapellino/pokedex`.

---

## 1. Los Cuatro Niveles de Estado

El repositorio opera bajo una arquitectura de cuatro niveles secuenciales y desacoplados:

```text
┌────────────────────────────────────────────────────────┐
│                        1. MAIN                         │
│                    Estado Candidato                    │
│      (Commits integrados en la rama principal)         │
└───────────────────────────┬────────────────────────────┘
                            │  Tagging SemVer + Build + Cosign
                            ▼
┌────────────────────────────────────────────────────────┐
│                       2. RELEASE                       │
│                  Estado Promocionable                  │
│       (Git Tags vX.Y.Z, OCI Digest inmutable, SBOM)    │
└───────────────────────────┬────────────────────────────┘
                            │  Promoción ArgoCD targetRevision
                            ▼
┌────────────────────────────────────────────────────────┐
│                       3. GITOPS                        │
│              Estado Declarado / Desplegable            │
│  (gitops/apps/*.yaml, targetRevision, values resueltos)│
└───────────────────────────┬────────────────────────────┘
                            │  Reconciliación de ArgoCD en clúster
                            ▼
┌────────────────────────────────────────────────────────┐
│                       4. RUNTIME                       │
│                    Estado Observado                    │
│      (Pods activos, servicios K8s, estado en vivo)     │
└────────────────────────────────────────────────────────┘
```

### Definición Formal de Cada Nivel

1. **`MAIN` (Estado Candidato):**
   Representa el código fuente, plantillas de Helm, scripts y configuraciones integradas en la rama `main`. Es un estado candidato a release, sometido a pruebas automatizadas continuas (CI), pero **NO representa producción**.
2. **`RELEASE` (Estado Promocionable):**
   Punto inmutable en la historia del repositorio identificado por un tag SemVer (`vX.Y.Z`). La existencia del Git Tag **no presupone la validez automática del release**. Para evitar la falacia de *"release = todo validado"*, el nivel `RELEASE` descompone su evaluación en seis comprobaciones independientes de la cadena de suministro (*supply chain*), evaluadas individualmente como `PASS`, `FAIL`, `UNKNOWN` o `NOT_APPLICABLE`:

   ```text
   RELEASE (vX.Y.Z)
    ├── 1. Git Tag (Existencia, inmutabilidad y firma GPG/SSH/Sigstore)
    ├── 2. OCI Image (Publicación verificada de la imagen en GHCR)
    ├── 3. OCI Digest (Digest SHA-256 inmutable y paridad con GitOps/Helm)
    ├── 4. Cosign Signature (Firma criptográfica keyless en imagen y chart)
    ├── 5. SBOM (Archivo CycloneDX generado y adjunto al digest OCI)
    └── 6. SLSA Provenance (Atestación in-toto de procedencia verificada)
   ```

3. **`GITOPS` (Estado Declarado / Desplegable):**
   Manifiestos de Kubernetes y configuraciones declaradas en `gitops/` que especifican qué versión (`targetRevision`) y qué valores (`values.yaml`) debe reconciliar ArgoCD para cada entorno (`proxmox`, `proxmox-preprod`, `cloud-aws`).
4. **`RUNTIME` (Estado Observado):**
   El estado real y vivo de los recursos desplegados en los clústeres físicos o virtuales. Si no existe conexión o telemetría activa directa hacia el clúster en el momento de la auditoría, su estado debe reportarse estrictamente como `UNKNOWN`.

---

## 2. Los Siete Estados del Ciclo de Vida de una Capacidad

Para evitar ambigüedades operativas, toda capacidad o feature técnica debe clasificarse según el siguiente ciclo de vida:

| Estado | Definición | Evidencia Requerida |
| :--- | :--- | :--- |
| **`IMPLEMENTED`** | La funcionalidad o template existe en el código fuente de `main`. | Archivo o función existente en el árbol de Git. |
| **`CONFIGURED`** | Parámetros declarados en los archivos de configuración o `values.yaml`. | Bloque de configuración presente en el archivo YAML. |
| **`ENABLED`** | El flag de activación está explícitamente en `true`. | `enabled: true` en el contexto evaluado. |
| **`RELEASED`** | El commit forma parte de un Git Tag inmutable publicado. | El commit está contenido en la historia de `git tag`. |
| **`GITOPS-PROMOTED`** | El `targetRevision` de la aplicación ArgoCD apunta a un tag que contiene la capacidad. | `targetRevision: vX.Y.Z` en `gitops/apps/` donde `vX.Y.Z` incluye la feature. |
| **`DEPLOYED`** | ArgoCD sincronizó exitosamente el manifiesto hacia el clúster. | Estado `Synced` y `Healthy` en ArgoCD. |
| **`OBSERVED`** | La capacidad fue validada mediante telemetría, logs o sondeo en vivo. | Endpoint respondiendo, logs del Pod, métricas Prometheus. |

---

## 3. Reglas Cardinales de Consistencia

> [!IMPORTANT]
>
> 1. **`MAIN != Producción`:** Una capacidad implementada y testeada en `main` no debe describirse en la documentación como "activa en producción" hasta que haya sido promocionada.
> 2. **`RELEASE != Runtime`:** La publicación de un tag no implica su despliegue inmediato. GitOps gobierna el momento de promoción.
> 3. **`GITOPS != Runtime`:** La declaración en ArgoCD es una intención; si el clúster está offline, en `SyncWindow Deny` (freeze) o con errores de reconciliación, el runtime diverge.
> 4. **Prohibición de Inventar Telemetría:** Si un agente o auditor no tiene acceso directo al clúster, el estado de `RUNTIME` debe declararse formalmente como `UNKNOWN`.
> 5. **Prohibición de Asumir Supply Chain Completo:** La verificación de que un Git Tag existe jamás certifica automáticamente la firma Cosign, la atestación SLSA ni la existencia de artefactos OCI. Cada una de las 6 sub-dimensiones de `RELEASE` debe auditarse con evidencia fáctica independiente (`PASS`, `FAIL`, `UNKNOWN` o `NOT_APPLICABLE`).
