# 🛡️ Auditoría de Cadena de Suministro de Software (Supply Chain Security)

> **Fecha:** 2026-09-25
> **Estado:** COMPLETADO
> **Alcance:** Monorepo Pokédex (`rocapellino/pokedex`)
> **Estándar:** SLSA Nivel 3, NIST SP 800-218 (SSDF), Principio de Mínimo Privilegio y Cero Confianza.

---

## 📑 Resumen Ejecutivo

La seguridad de la cadena de suministro de software es un pilar crítico en Pokédex. Esta auditoría evalúa la integridad y procedencia de artefactos en cada fase del ciclo de vida de desarrollo de software (SDLC), abarcando dependencias de código abierto, compilación de imágenes OCI, firma criptográfica keyless y anclaje inmutable en GitOps.

**Resultado de la Evaluación:**
La plataforma alcanza una postura de madurez de nivel de producción corporativo, con **100% de imágenes OCI ancladas por digest SHA256 inmutable**, **100% de GitHub Actions fijadas por commit SHA estricto**, **firma criptográfica Keyless con Sigstore (Cosign y Gitsign)** y **bloqueo estricto de vulnerabilidades de severidad alta/crítica en CI**.

---

## 1. Gestión de Dependencias y SCA (Software Composition Analysis)

### 1.1. Control del Árbol de Paquetes (`package.json` / `package-lock.json`)

- **Gestor de Paquetes Canónico:** `npm@11.17.0` con `package-lock.json` v3 determinista.
- **Instalación Segura en CI:** Ejecución estricta de `npm ci --ignore-scripts`, bloqueando la ejecución arbitraria de scripts de ciclo de vida (`preinstall`, `postinstall`) de paquetes de terceros.
- **Overrides Declarativos para Remediación Rápida de CVEs:**
  En `package.json`, se declaran sobrescrituras explícitas (`overrides`) para garantizar que librerías transitivas vulnerables se eleven a versiones seguras:
  - `qs: ^6.16.0` (Protección contra DoS por polución de parámetros).
  - `uuid: ^11.1.1` (Generación segura de identificadores RFC4122).
  - `tmp: ^0.2.6` (Creación segura de archivos temporales sin colisiones de nombres).
  - `cookie: ^2.0.1` (Manejo robusto y seguro de atributos de cookies HTTP).
  - `esbuild: ^0.28.2` (Compilador actualizado libre de vulnerabilidades conocidas).
  - `@puppeteer/browsers: ^3.0.0` y `proxy-agent: ^8.0.2` (Dependencias auxiliares seguras).

### 1.2. Quality Gates de SCA en Pipeline

| Control | Herramienta | Evento de Ejecución | Umbral de Falla |
| :--- | :--- | :--- | :--- |
| **Auditoría de Vulnerabilidades** | `npm audit` | Push & PR (`ci.yml`) | `--audit-level=high --omit=dev` |
| **Dependency Review Gate** | `actions/dependency-review-action` | Pull Request (`ci.yml`) | `fail-on-severity: high` |
| **Sincronización de Dependencias** | Renovate Bot + Linear Sync | Programado (`renovate-linear-sync.yml`) | PRs automáticos de actualización |

---

## 2. Inmutabilidad y Hardening de Contenedores OCI

### 2.1. Imágenes Base y Principio de Mínimo Privilegio

- **Backend (`apps/backend/Dockerfile`):**
  - Base de ejecución: Distroless Google Container Tools (`gcr.io/distroless/nodejs22-debian12:nonroot`).
  - Ausencia total de shells (`/bin/sh`, `/bin/bash`), gestores de paquetes o utilidades del sistema en runtime.
  - Usuario de ejecución: `nonroot` (UID 65532).
  - Sistema de archivos raíz: `readOnlyRootFilesystem: true` con `/tmp` montado en memoria mediante `emptyDir`.
- **Frontend (`apps/frontend/Dockerfile`):**
  - Base de ejecución: `nginxinc/nginx-unprivileged:alpine-slim`.
  - Usuario de ejecución: `nginx` (UID 101).
  - Descarte total de Linux capabilities: `drop: ["ALL"]`.

### 2.2. Anclaje de Digests SHA256 Inmutables (Anti-Tampering)

Para evitar ataques de mutación de etiquetas (*tag poisoning* o desincronización de `:latest`), todos los entornos de Kubernetes consumen imágenes fijadas por su hash criptográfico SHA256:

- **Imágenes en Producción (SSOT Actual):**
  - `pokedex-api`: `ghcr.io/rocapellino/pokedex-api@sha256:4113ac3d61577bd4eef013e80ec8f05ffcfa4c079b51a1dcec9d884dacc4ddbd`
  - `pokedex-web`: `ghcr.io/rocapellino/pokedex-web@sha256:9cc9468cb10ed865e8182e4a2cf4fc0d0196d6fa6f88ac4cf921a70ca92b1b1c`
- **Verificación Criptográfica 1:1:**
  El script `scripts/verify-image-digest-parity.ts` valida en CI que las definiciones de AWS (`gitops/environments/aws/values.yaml`), Proxmox (`gitops/environments/proxmox/values.yaml`) y el chart base de Helm compartan idéntico digest.

---

## 3. Firma Criptográfica Keyless (Sigstore)

El proyecto erradicó el uso de claves privadas estáticas o certificados de larga duración almacenados como secretos en GitHub Actions, adoptando **Keyless Signing** mediante OIDC federado:

```text
GitHub Actions Workflow (Token OIDC Efímero)
              │
              ▼
    Fulgencio / Sigstore CA (OAuth OIDC Issuer: token.actions.githubusercontent.com)
              │
              ▼
    Certificado x509 de Corta Duración + Firma Criptográfica
              │
      ┌───────┴───────┐
      ▼               ▼
Git Releases      Imágenes OCI
 (Gitsign)         (Cosign)
```

1. **Firma de Git Tags con Gitsign:**
   En `.github/workflows/release-tag.yml`, cada nuevo tag de versión semántica se firma con `gitsign`, vinculando la identidad del repositorio (`https://github.com/rocapellino/pokedex`) al commit en el libro público de transparencia de Sigstore (Rekor).
2. **Firma de Imágenes OCI con Cosign:**
   En `.github/workflows/ci.yml`, tras compilar y publicar los artefactos en GitHub Container Registry (`ghcr.io`), Cosign genera y publica las firmas asociadas a los digests SHA256.

---

## 4. Hardening de Workflows de GitHub Actions

Para mitigar riesgos de compromiso en el plano de CI/CD (OWASP Top 10 CI/CD Security):

- **SHA Pinning Exhaustivo:** Todas las GitHub Actions invocadas utilizan hashes de commit completos de 40 caracteres (ej. `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`), neutralizando la alteración maliciosa de tags de Actions (`v1`, `v2`).
- **Principio de Mínimo Privilegio en `GITHUB_TOKEN`:**
  - El permiso global por defecto en todos los workflows es `permissions: contents: read`.
  - Solo los jobs específicos que generan releases o publican imágenes solicitan permisos adicionales (`packages: write`, `id-token: write`).
- **Gitleaks Secret Scanning:**
  Analiza en cada push y PR el historial íntegro (`fetch-depth: 0`) para bloquear la inclusión de tokens o secretos en texto plano.

---

## 5. Conclusión de Cadena de Suministro

La arquitectura de cadena de suministro de Pokédex cumple con las directivas más rigurosas de la industria (SLSA 3 ready, firmas keyless verificables, inmutabilidad por digest y mínimo privilegio estricto). No se registran dependencias huérfanas críticas ni rutas no autenticadas en el proceso de publicación.
