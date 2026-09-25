# 🔐 Guía de Gestión de Secretos: HashiCorp Vault CE, ESO, .env y Gitleaks

> [!NOTE]
> **ESTADO DEL DOCUMENTO: VIGENTE (SSOT Actual)**
> Este documento representa la Fuente Única de Verdad para la gestión de credenciales y secretos en Pokédex mediante HashiCorp Vault CE, AWS Secrets Manager y External Secrets Operator (ESO).

Este documento describe la arquitectura, herramientas y estándares implementados en el repositorio para garantizar el desacoplamiento total de credenciales y evitar la fuga de contraseñas y claves en texto plano a través de todo el ciclo de vida DevOps, de conformidad con el [ADR-005](../decisions/ADR-005-secret-management.md), el [ADR-022](../decisions/ADR-022-automated-credential-rotation-and-reloader.md) y el [ADR-025](../decisions/ADR-025-management-plane-runtime-plane-and-cloud-ready-separation.md).

---

## 📑 Tabla de Contenidos

1. [Estrategia de Secretos en Entornos Locales (`.env.example`)](#1-estrategia-de-secretos-en-entornos-locales-envexample)
2. [Prevención y Detección de Fugas con Gitleaks (CI/CD)](#2-prevención-y-detección-de-fugas-con-gitleaks-cicd)
3. [Arquitectura Canónica de Secretos en Kubernetes (ESO)](#3-arquitectura-canónica-de-secretos-en-kubernetes-eso)
   - [3.1. Entorno On-Premise (Proxmox VE): HashiCorp Vault CE](#31-entorno-on-premise-proxmox-ve-hashicorp-vault-ce)
   - [3.2. Entorno Cloud (AWS EKS): AWS Secrets Manager](#32-entorno-cloud-aws-eks-aws-secrets-manager)
   - [3.3. Transición y Soporte Histórico: Bitnami Sealed Secrets](#33-transición-y-soporte-histórico-bitnami-sealed-secrets)
4. [Helper de Resolución Dinámica en Helm (`pokedex.secretName`)](#4-helper-de-resolución-dinámica-en-helm-pokedexsecretname)
5. [Rotación y Reinicio Progresivo (Rollout Restart)](#5-rotación-y-reinicio-progresivo-rollout-restart)

---

## 1. Estrategia de Secretos en Entornos Locales (`.env.example`)

- **Regla de Oro:** Ningún archivo `.env` con credenciales reales debe commitearse en Git.
- **Plantilla Versionada:** El repositorio incluye [`.env.example`](../../.env.example) con la estructura de variables y valores por defecto para desarrollo local.
- **Variables Críticas Obligatorias:**
  - `ADMIN_API_KEY`: Clave administrativa requerida para operaciones de mutación directa y generación de tokens.
  - `ADMIN_SESSION_SECRET`: Secreto criptográfico independiente y obligatorio para firma y verificación de tokens HMAC SHA-256 de sesión.
  - `AI_API_KEY` / `GEMINI_API_KEY`: Clave requerida para los microservicios de Inteligencia Artificial (Google Gemini Flash).
  - `DATABASE_URL` / `POSTGRES_PASSWORD`: Credenciales de persistencia PostgreSQL.
  - `REDIS_PASSWORD` / `REDIS_URL`: Credenciales de acceso a la caché y rate limiter.
  - `BACKUP_ENCRYPTION_KEY`: Frase de paso para cifrado AES-256-CBC de respaldos.
- **Protección en `.gitignore`:** Reglas estrictas ignoran `.env`, `.env.*`, claves privadas (`*.pem`, `*.key`) y certificados.

---

## 2. Prevención y Detección de Fugas con Gitleaks (CI/CD)

Para garantizar que ningún desarrollador comitee accidentalmente tokens, API keys o contraseñas:

1. **Configuración de Reglas ([`.gitleaks.toml`](../../.gitleaks.toml)):**
   - Activa detección de entropía y patrones conocidos (AWS, GitHub Tokens, Postgres, Gemini API Keys, etc.).
   - Allowlist estricta para ejemplos (`.env.example`), documentación y mocks de pruebas unitarias.
2. **Hooks de Pre-Commit ([`.pre-commit-config.yaml`](../../.pre-commit-config.yaml)):**
   - Escaneo automático antes de registrar cualquier commit en la máquina del desarrollador.
3. **Pipeline de CI/CD ([`.github/workflows/security-gitleaks.yml`](../../.github/workflows/security-gitleaks.yml)):**
   - Se ejecuta en cada `push` y `pull_request` analizando el historial completo de commits (`fetch-depth: 0`).
   - Bloquea de manera intransigente el merge del PR si detecta cualquier credencial expuesta.

---

## 3. Arquitectura Canónica de Secretos en Kubernetes (ESO)

En Kubernetes, los `Secrets` nativos están codificados en Base64, lo que **no constituye cifrado**. El proyecto estandariza la sincronización declarativa desacoplada mediante **External Secrets Operator (ESO)**:

```text
                                  External Secrets Operator (ESO)
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
        On-Premise (Proxmox VE)                                         Cloud (AWS EKS)
        ClusterSecretStore: vault-backend                              ClusterSecretStore: aws-secrets-manager
        Server: https://10.10.13.110:8200                               Provider: AWS Secrets Manager (IRSA)
        Auth: K8s SA (pokedex-prod-role / preprod-role)                 Auth: AWS IAM Roles for Service Accounts
                  │                                                             │
                  └──────────────────────────────┬──────────────────────────────┘
                                                 ▼
                                     ExternalSecret (pokedex)
                                                 │
                                                 ▼
                                  v1/Secret pokemon-secrets (K8s)
                                                 │ (envFrom)
                                                 ▼
                                      Pods (pokedex-api / web)
```

### 3.1. Entorno On-Premise (Proxmox VE): HashiCorp Vault CE

- **Instancia:** Desplegada en contenedor LXC dedicado (ID `810`, IP `10.10.13.110`) con almacenamiento transaccional **Raft**, cifrado en tránsito **TLS 1.2+**, esquema **Shamir 5/3** y Zero-Disk persistence.
- **Segregación Estricta de Secretos y Roles RBAC (Erradicación de Roles Comodín - Zero-Trust):**
  - **Pre-producción:** `secret/data/pokedex/preprod/*` bajo el rol `pokedex-preprod-role` (política `pokedex-preprod-policy`).
  - **Producción:** `secret/data/pokedex/prod/*` bajo el rol `pokedex-prod-role` (política `pokedex-prod-policy`).
  - *Principio de Blast Radius Reducido:* Se eliminó el rol global genérico `pokedex-role` y su política comodín `secret/data/pokedex/*`. Las credenciales comprometidas en pre-producción no tienen alcance ni visibilidad sobre los secretos de producción.
- **Manifiestos:**
  - Producción: [`infra/k8s/eso/vault-backend.yaml`](../../infra/k8s/eso/vault-backend.yaml) (`ClusterSecretStore/vault-backend`).
  - Pre-producción: [`infra/k8s/eso/vault-backend-preprod.yaml`](../../infra/k8s/eso/vault-backend-preprod.yaml) (`ClusterSecretStore/vault-backend-preprod`).

### 3.2. Entorno Cloud (AWS EKS): AWS Secrets Manager

- **Instancia:** Almacén gestionado nativo de AWS con autenticación IAM mediante IRSA (`eks.amazonaws.com/role-arn`).
- **Manifiesto:** [`infra/k8s/eso/aws-secrets-manager.yaml`](../../infra/k8s/eso/aws-secrets-manager.yaml).

### 3.3. Transición y Soporte Histórico: Bitnami Sealed Secrets

- Bitnami Sealed Secrets se utilizó en fases iniciales del proyecto para cifrar credenciales asimétricamente en Git (`SealedSecret`).
- **Estado Actual:** Superado por Vault CE + ESO. La utilidad legada `scripts/seal-secret.ts` fue retirada formalmente bajo el hito `CLN-002`, consolidando la totalidad de la plataforma en manifiestos declarativos de External Secrets Operator.

---

## 4. Helper de Resolución Dinámica en Helm (`pokedex.secretName`)

El Chart de Helm ([`infra/helm/pokedex`](../../infra/helm/pokedex)) desacopla el nombre del Secret mediante un helper canónico en `_helpers.tpl`:

```yaml
{{/*
Retorna el nombre del Secret que contiene las credenciales de la app.
Prioridad: .Values.secrets.existingSecret -> pokemon-secrets
*/}}
{{- define "pokedex.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "pokedex.fullname" . }}-secrets
{{- end }}
{{- end }}
```

Tanto en AWS como en Proxmox, `.Values.secrets.existingSecret: "pokemon-secrets"` mapea directamente hacia el Secret sincronizado por ESO.

---

## 5. Rotación y Reinicio Progresivo (Rollout Restart)

- **En AWS EKS:** El controlador **Stakater Reloader** detecta mutaciones en `pokemon-secrets` y reinicia los pods automáticamente sin intervención humana.
- **En Proxmox VE (Perfil Lean MVP):** Reloader está desactivado (`reloader.enabled: false`) por [ADR-024](../decisions/ADR-024-proxmox-bimodal-compute-lxc-preprod-vm-prod.md). Tras actualizar credenciales en Vault, el operador ejecuta el reinicio progresivo canónico:

  ```bash
  npm run k8s:rollout-restart -- --live
  # o vía Taskfile:
  task k8s:rollout-restart -- --live
  ```
