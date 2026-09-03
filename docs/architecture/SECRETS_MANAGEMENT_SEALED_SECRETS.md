# 🔐 Guía de Gestión de Secretos: .env, Gitleaks y Bitnami Sealed Secrets

Este documento describe la arquitectura y los estándares implementados en el repositorio para evitar la fuga de contraseñas y claves en texto plano a través del ciclo de vida DevOps.

---

## 📑 Tabla de Contenidos
1. [Estrategia de Secretos en Entornos Locales (`.env.example`)](#1-estrategia-de-secretos-en-entornos-locales-envexample)
2. [Prevención y Detección de Fugas con Gitleaks (CI/CD)](#2-prevención-y-detección-de-fugas-con-gitleaks-cicd)
3. [Cifrado Asimétrico en Kubernetes con Bitnami Sealed Secrets](#3-cifrado-asimétrico-en-kubernetes-con-bitnami-sealed-secrets)
4. [Flujo de Trabajo Operativo para Desarrolladores](#4-flujo-de-trabajo-operativo-para-desarrolladores)

---

## 1. Estrategia de Secretos en Entornos Locales (`.env.example`)

* **Regla de Oro:** Ningún archivo `.env` con credenciales reales debe commitearse en Git.
* **Plantilla Versionada:** El repositorio incluye [`.env.example`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/.env.example) con la estructura de variables y valores por defecto para desarrollo local.
* **Protección en `.gitignore`:** Se configuraron reglas estrictas para ignorar `.env`, `.env.*`, claves privadas (`*.pem`, `*.key`) y certificados.

### Uso con Docker Compose:
```bash
# Crear tu archivo local a partir de la plantilla:
cp .env.example .env

# Levantar con Docker Compose (las variables se interpolan automáticamente):
docker compose up -d
```

---

## 2. Prevención y Detección de Fugas con Gitleaks (CI/CD)

Para garantizar que ningún desarrollador comitee accidentalmente tokens, API keys o contraseñas, se implementó:

1. **Configuración de Reglas ([`.gitleaks.toml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/.gitleaks.toml)):**
   * Activa las reglas base de detección de entropía y patrones conocidos (AWS, GitHub Tokens, Postgres, etc.).
   * Añade allowlists específicas para archivos de ejemplo (`.env.example`) y mocks de pruebas unitarias.
2. **Pipeline de GitHub Actions ([`security-gitleaks.yml`](file:///c:/Users/Rodrigo/Documents/Git/introducci%C3%B3n_devops/test_prueba/.github/workflows/security-gitleaks.yml)):**
   * Se ejecuta automáticamente en cada `push` y `pull_request` analizando el historial completo de commits (`fetch-depth: 0`).
   * Bloquea el merge del Pull Request si detecta alguna credencial sin cifrar.

---

## 3. Cifrado Asimétrico en Kubernetes con Bitnami Sealed Secrets

En Kubernetes, los `Secrets` nativos solo están codificados en Base64, lo que no proporciona seguridad si se versionan en Git. Se implementó **Bitnami Sealed Secrets** como solución nativa de GitOps:

```
[ Desarrollador / CI ]
         │
         │ (kubeseal + Clave Pública del Clúster)
         ▼
┌────────────────────────────────────────────────────────┐
│ 🔏 SealedSecret (YAML Cifrado 100% Seguro para Git)   │
└────────────────────────┬───────────────────────────────┘
                         │ (git commit / kubectl apply)
                         ▼
┌────────────────────────────────────────────────────────┐
│ ☸️ Clúster Kubernetes                                  │
│ └── sealed-secrets-controller (Clave Privada)          │
│       │                                                │
│       │ (Descifra automáticamente en memoria)          │
│       ▼                                                │
│ 🔓 K8s Secret Nativo (`pokemon-secrets`)               │
└────────────────────────────────────────────────────────┘
```

---

## 4. Flujo de Trabajo Operativo para Desarrolladores

### Sellar un Secreto Nuevo o Modificado:
Se incluyen utilidades automatizadas multiplataforma para generar el manifiesto cifrado:

* **Vía Taskfile (Recomendado):**
  ```bash
  task secrets:seal
  ```

* **Vía Python (Multiplataforma Windows / Linux / macOS):**
  ```bash
  python scripts/seal_secret.py --name pokemon-secrets --namespace pokemon-app
  ```

* **Vía Bash (Linux / macOS):**
  ```bash
  bash scripts/seal_secret.sh pokemon-secrets pokemon-app
  ```

### Aplicar en el Clúster:
```bash
# Aplicar el SealedSecret en Kubernetes:
kubectl apply -f infra/k8s/01-sealed-secrets.yaml

# Verificar que el controlador creó el Secret descifrado:
kubectl get secret pokemon-secrets -n pokemon-app
```
