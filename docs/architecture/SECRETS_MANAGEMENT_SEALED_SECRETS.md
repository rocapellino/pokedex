# 🔐 Guía de Gestión de Secretos: .env, Gitleaks, Sealed Secrets y External Secrets Operator

Este documento describe la arquitectura, herramientas y estándares implementados en el repositorio para garantizar el desacoplamiento total de credenciales y evitar la fuga de contraseñas y claves en texto plano a través de todo el ciclo de vida DevOps.

---

## 📑 Tabla de Contenidos
1. [Estrategia de Secretos en Entornos Locales (`.env.example`)](#1-estrategia-de-secretos-en-entornos-locales-envexample)
2. [Prevención y Detección de Fugas con Gitleaks (CI/CD)](#2-prevención-y-detección-de-fugas-con-gitleaks-cicd)
3. [Estrategia Híbrida de Secretos en Kubernetes](#3-estrategia-híbrida-de-secretos-en-kubernetes)
   * [3.1. Enfoque Cloud Enterprise: External Secrets Operator (ESO) & `existingSecret`](#31-enfoque-cloud-enterprise-external-secrets-operator-eso--existingsecret)
   * [3.2. Enfoque On-Premise / GitOps: Bitnami Sealed Secrets](#32-enfoque-on-premise--gitops-bitnami-sealed-secrets)
4. [Helper de Resolución Dinámica en Helm (`pokedex.secretName`)](#4-helper-de-resolución-dinámica-en-helm-pokedexsecretname)
5. [Flujo de Trabajo Operativo para Desarrolladores](#5-flujo-de-trabajo-operativo-para-desarrolladores)

---

## 1. Estrategia de Secretos en Entornos Locales (`.env.example`)

* **Regla de Oro:** Ningún archivo `.env` con credenciales reales debe commitearse en Git.
* **Plantilla Versionada:** El repositorio incluye [`.env.example`](../../.env.example) con la estructura de variables y valores por defecto para desarrollo local.
* **Variables Críticas Obligatorias:**
  * `ADMIN_API_KEY`: Clave administrativa requerida para operaciones de mutación directa y generación de tokens.
  * `ADMIN_SESSION_SECRET`: Secreto criptográfico independiente y obligatorio para firma y verificación de tokens HMAC SHA-256 de sesión.
  * `AI_API_KEY`: Clave requerida para los microservicios de Inteligencia Artificial (Google Gemini 2.5 Flash).
  * `DATABASE_URL` / `POSTGRES_PASSWORD`: Credenciales de persistencia ACID.
  * `REDIS_PASSWORD`: Credenciales de acceso a la caché y rate limiter.
* **Protección en `.gitignore`:** Reglas estrictas ignoran `.env`, `.env.*`, claves privadas (`*.pem`, `*.key`) y certificados.

### Uso con Docker Compose:
```bash
# Crear el archivo local a partir de la plantilla:
cp .env.example .env

# Levantar con Docker Compose:
docker compose up -d
```

---

## 2. Prevención y Detección de Fugas con Gitleaks (CI/CD)

Para garantizar que ningún desarrollador comitee accidentalmente tokens, API keys o contraseñas:

1. **Configuración de Reglas ([`.gitleaks.toml`](../../.gitleaks.toml)):**
   * Activa detección de entropía y patrones conocidos (AWS, GitHub Tokens, Postgres, Gemini API Keys, etc.).
   * Allowlist estricta para ejemplos (`.env.example`), documentación y mocks de pruebas unitarias.
2. **Hooks de Pre-Commit ([`.pre-commit-config.yaml`](../../.pre-commit-config.yaml)):**
   * Escaneo automático antes de registrar cualquier commit en la máquina del desarrollador.
3. **Pipeline de CI/CD ([`.github/workflows/security-gitleaks.yml`](../../.github/workflows/security-gitleaks.yml)):**
   * Se ejecuta en cada `push` y `pull_request` analizando el historial completo de commits (`fetch-depth: 0`).
   * Bloquea de manera intransigente el merge del PR si detecta cualquier credencial expuesta.

---

## 3. Estrategia Híbrida de Secretos en Kubernetes

En Kubernetes, los `Secrets` nativos están codificados en Base64, lo que **no constituye cifrado**. El proyecto soporta dos modelos enterprise según el entorno de despliegue:

### 3.1. Enfoque Cloud Enterprise: External Secrets Operator (ESO) & `existingSecret`
Para entornos de producción cloud (AWS EKS, GCP GKE, Azure AKS) o nubes privadas con HashiCorp Vault:

```text
[ AWS Secrets Manager / Vault / GCP Secret Manager ]
                         │
                         ▼ (Sincronización periódica)
         ┌───────────────────────────────┐
         │  External Secrets Operator   │
         │  (Resource: ExternalSecret)   │
         └───────────────┬───────────────┘
                         │ (Genera Secret en memoria k8s)
                         ▼
         ┌───────────────────────────────┐
         │ K8s Secret: pokedex-prod-secrets
         └───────────────┬───────────────┘
                         │ (Montado como env/secretKeyRef)
                         ▼
          [ Pods: pokemon-api, postgres, redis ]
```

* **Desacoplamiento en Helm:** En `values.prod.yaml`, se define:
  ```yaml
  secrets:
    existingSecret: "pokedex-prod-secrets"
  ```
  Esto instruye a Helm a **no generar ningún recurso `kind: Secret`** en el clúster, impidiendo el paso de credenciales en flags de línea de comandos (`--set`) o en repositorios GitOps.
* **Manifiesto de ExternalSecret:** Parametrizado en `infra/helm/pokedex/templates/externalsecret.yaml` (`external-secrets.io/v1beta1`) para sincronizar automáticamente secretos desde el `SecretStore` configurado.

### 3.2. Enfoque On-Premise / GitOps: Bitnami Sealed Secrets
Para clústeres bare-metal o entornos Proxmox VE sin acceso a gestores de secretos cloud:

```text
[ Desarrollador / CI ]
         │ (kubeseal + Clave Pública del Clúster)
         ▼
┌────────────────────────────────────────────────────────┐
│ 🔏 SealedSecret (YAML Cifrado 100% Seguro para Git)   │
└────────────────────────┬───────────────────────────────┘
                         │ (git commit / ArgoCD sync)
                         ▼
┌────────────────────────────────────────────────────────┐
│ ☸️ Clúster Kubernetes                                  │
│ └── sealed-secrets-controller (Clave Privada)          │
│       │ (Descifra en memoria del clúster)             │
│       ▼                                                │
│ 🔓 K8s Secret Nativo (`pokemon-secrets`)               │
└────────────────────────────────────────────────────────┘
```

---

## 4. Helper de Resolución Dinámica en Helm (`pokedex.secretName`)

Para garantizar que todos los componentes (API, PostgreSQL, Redis, PgBouncer) consuman el secreto correcto de forma uniforme y sin duplicar lógica, se implementó el helper en `infra/helm/pokedex/templates/_helpers.tpl`:

```gotemplate
{{- define "pokedex.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
    {{- .Values.secrets.existingSecret -}}
{{- else if and .Values.externalSecrets.enabled .Values.externalSecrets.targetSecretName -}}
    {{- .Values.externalSecrets.targetSecretName -}}
{{- else -}}
    {{- default (printf "%s-secrets" (include "pokedex.fullname" .)) .Values.secrets.name -}}
{{- end -}}
{{- end -}}
```

**Comportamiento de `secret.yaml`:**
El template `secret.yaml` contiene la condición:
`{{- if and (not .Values.secrets.existingSecret) (not .Values.externalSecrets.enabled) -}}`
garantizando que en producción nunca se renderice un Secret en blanco ni se sobreescriba un secreto preexistente inyectado por el operador.

---

## 5. Flujo de Trabajo Operativo para Desarrolladores

### 5.1. Para Despliegues Locales / Desarrollo:
Helm genera el secreto por defecto `pokemon-secrets` con valores autogenerados o provistos en `values.yaml`.

### 5.2. Para Sellar Secretos con Sealed Secrets (Proxmox):
```bash
# Vía Taskfile:
task secrets:seal

# Vía Python:
python scripts/seal_secret.py --name pokemon-secrets --namespace pokemon-app
```

### 5.3. Para Producción con Secret Pre-creado:
```bash
# Crear el secret en Kubernetes de forma segura mediante archivo temporal o kubectl:
kubectl create secret generic pokedex-prod-secrets \
  --namespace pokemon-app \
  --from-literal=admin-api-key="<CLAVE_ADMIN_PROD>" \
  --from-literal=admin-session-secret="<HMAC_SECRET_PROD>" \
  --from-literal=ai-api-key="<GEMINI_KEY_PROD>" \
  --from-literal=postgres-password="<PG_PASS_PROD>" \
  --from-literal=redis-password="<REDIS_PASS_PROD>"

# Desplegar Helm enlazando al secreto existente:
helm upgrade --install pokedex ./infra/helm/pokedex \
  --namespace pokemon-app \
  --values ./infra/helm/pokedex/values.prod.yaml
```
