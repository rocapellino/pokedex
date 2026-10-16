# Guía Contrastiva: Kubernetes, GitOps, Helm & Supply Chain

## 1. Por qué importa (Why It Matters)

La superficie de Kubernetes en producción y pre-producción debe protegerse contra ataques de escape de contenedor y vulnerabilidades de la cadena de suministro (*Supply Chain Security*). El despliegue de imágenes con etiquetas mutables (`:latest` o tags sin hash) impide auditorías reproducibles y permite ataques de tipo *Image Rug Pull*. Asimismo, la omisión de un `securityContext` estricto permite que un proceso comprometido escale privilegios o altere binarios del contenedor en disco.

---

## 2. Incorrecto (Incorrect)

```yaml
# ❌ ANTIPATRÓN: Tag mutable, permisos de root y sistema de archivos mutable
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pokedex-api
spec:
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/rocapellino/pokedex-api:latest # ❌ Tag flotante susceptible a envenenamiento
          securityContext:
            privileged: true # ❌ Riesgo crítico de escape de contenedor
            readOnlyRootFilesystem: false # ❌ Permite persistir malware en el filesystem
```

---

## 3. Correcto (Correct)

```yaml
# ✅ PATRÓN CANÓNICO: Digest Pinning inmutable y Zero-Trust Pod Hardening (ADR-008, ADR-013)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pokedex-api
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        fsGroup: 10001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: api
          # ✅ Digest criptográfico inmutable verificado por Cosign (ADR-008)
          image: ghcr.io/rocapellino/pokedex-api@sha256:4b12332338a402ebb9e0979b6d080ef422f948855bce07d13aa766bc193cb868
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          volumeMounts:
            - name: tmp-volume
              mountPath: /tmp
      volumes:
        - name: tmp-volume
          emptyDir: {}
```

Validación automatizada con:

```bash
npm run gitops:verify-parity:strict
task helm:lint
```

---

## 4. Referencias

- [ADR-008: Seguridad en la Cadena de Suministro](../../docs/decisions/ADR-008-supply-chain-security.md)
- [ADR-013: Zero-Trust Network Architecture](../../docs/decisions/ADR-013-zero-trust-network-architecture.md)
- [ADR-017: Kyverno Admission Control y Pod Security](../../docs/decisions/ADR-017-kyverno-admission-control-and-pod-security.md)
