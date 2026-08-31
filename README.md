# ⚡ Plataforma Pokémon DevOps: Monorepo & Cloud-Native Architecture

[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.36+-326CE5?style=flat&logo=kubernetes&logoColor=white)](https://kubernetes.io/) [![Docker](https://img.shields.io/badge/Docker-29.0+-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/) [![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/) [![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/) [![Nginx](https://img.shields.io/badge/Nginx-1.27-009639?style=flat&logo=nginx&logoColor=white)](https://nginx.org/)

Este repositorio implementa una solución completa de ingeniería **DevOps y Cloud-Native** para la plataforma **Pokédex API**, diseñada bajo una arquitectura de **Monorepo por dominios**, contenerización segura multi-stage, autoescalado elástico horizontal (**HPA en Kubernetes**) y consistencia transaccional centralizada.

---

## 📑 Tabla de Contenidos
1. [Resumen General y Arquitectura](#1-resumen-general-y-arquitectura)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Inicio Rápido (Quickstart)](#3-inicio-rápido-quickstart)
   * [Opción A: Despliegue en Kubernetes (Recomendado)](#opción-a-despliegue-en-kubernetes-recomendado)
   * [Opción B: Despliegue con Docker Compose](#opción-b-despliegue-con-docker-compose)
4. [Pruebas Automatizadas y Validación](#4-pruebas-automatizadas-y-validación)
5. [Centro de Documentación (`docs/`)](#5-centro-de-documentación-docs)

---

## 1. Resumen General y Arquitectura

La plataforma separa claramente las capas de cómputo elástico sin estado (*Stateless*) de la capa de persistencia única (*Stateful*), resolviendo la concurrencia masiva y los picos de demanda:

```
                                  [ Usuarios / Internet ]
                                             │
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │    External Load Balancer (Capa 4/7)    │
                        └────────────────────┬────────────────────┘
                                             │
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │    Ingress Controller (Proxy Inverso)   │
                        └────────────┬───────────────┬────────────┘
                                     │               │
                            (Ruta /) │               │ (Ruta /api)
                                     ▼               ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │ pokemon-web-svc │     │ pokemon-api-svc │
                        └────────┬────────┘     └────────┬────────┘
                                 │                       │
                     ┌───────────┴──────────┐┌───────────┴──────────┐
                     ▼                      ▼▼                      ▼
               ┌───────────┐          ┌───────────┐           ┌───────────┐
               │  Web Pod  │          │  API Pod  │ ◄── (HPA) │  API Pod  │
               └───────────┘          └─────┬─────┘           └─────┬─────┘
                                            │                       │
                                            └───────────┬───────────┘
                                                        ▼
                                                ┌───────────────┐
                                                │   PgBouncer   │ (Connection Pooler)
                                                └───────┬───────┘
                                                        │
                                    ┌───────────────────┴───────────────────┐
                                    ▼                                       ▼
                         ┌─────────────────────┐                 ┌─────────────────────┐
                         │    PostgreSQL 16    │                 │       Redis 7       │
                         │ (StatefulSet + PVC) │                 │  (Caché Compartido) │
                         └─────────────────────┘                 └─────────────────────┘
```

---

## 2. Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Frontend Web** | HTML5, CSS3, JS Vanilla, Nginx 1.27 | Interfaz de usuario interactiva, temas dinámicos y proxy inverso local. |
| **Backend API** | Python 3.11, FastAPI, Uvicorn ASGI | Microservicio REST asíncrono, OpenAPI Swagger (`/docs`) y Pydantic v2. |
| **Base de Datos** | PostgreSQL 16 Alpine | Persistencia relacional con esquema estructurado (WikiDex / PKParaíso). |
| **Connection Pooling**| PgBouncer | Gestión eficiente de conexiones ante escalado masivo de pods. |
| **Caché en Memoria** | Redis 7 Alpine | Aceleración de lecturas frecuentes (< 3ms) e invalidación inteligente. |
| **Orquestación Cloud**| Kubernetes (Kind / Docker Desktop / Cloud) | Autoescalado horizontal (**HPA v2**), Service Discovery y self-healing. |
| **CI/CD Pipelines**   | [docker_jenkins](https://github.com/rocapellino/docker_jenkins) / GitLab CI | Automatización de testing, escaneo de seguridad y despliegues continuos. |
| **Observabilidad**    | [docker_monitoreo](https://github.com/rocapellino/docker_monitoreo) (Prometheus & Grafana) | Scraping de métricas en tiempo real (`/metrics`) y dashboards de salud (desacoplado global). |

---

## 3. Inicio Rápido (Quickstart)

### Opción A: Despliegue en Kubernetes (Recomendado)

1. **Construir imágenes y desplegar con el script automatizado:**
   ```powershell
   .\scripts\k8s_deploy.ps1 -BuildImages -SeedDatabase
   ```

2. **Habilitar acceso local:**
   ```powershell
   kubectl port-forward svc/pokemon-web-svc 8080:8080 -n pokemon-app
   ```

3. **Abrir en tu navegador:**
   * 🖥️ **Web:** [http://localhost:8080/](http://localhost:8080/)
   * 🔌 **API Docs:** [http://localhost:8080/docs](http://localhost:8080/docs)

---

### Opción B: Despliegue con Docker Compose (Multi-Entorno)

#### 🟢 Modo Desarrollo (Hot-Reload & Puertos Abiertos):
```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

#### 🌐 Modo Producción (Limpio & Endurecido):
```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

### Opción C: Despliegue en Proxmox VE (On-Premises / Homelab)

```powershell
# Despliegue automatizado en contenedor LXC o VM de Proxmox
.\scripts\proxmox_deploy.ps1 -ProxmoxHost "192.168.1.150" -User "root"
```

---

## 4. Pruebas Automatizadas y Auditoría de Código

Para ver el detalle exhaustivo de todas las pruebas implementadas y cómo ejecutarlas, consulta la [**Guía Completa de Pruebas (`docs/testing-guide.md`)**](file:///docs/testing-guide.md).

### Ejecución Rápida:
* **Suite de Pruebas Unitarias (Pytest):**
  ```powershell
  .\.venv\Scripts\python -m pytest -v
  ```
* **Auditoría de Calidad, Duplicación y Complejidad:**
  ```powershell
  .\.venv\Scripts\python scripts/audit_code_quality.py
  ```
* **Prueba de Carga y Autoescalado (HPA):**
  ```powershell
  .\.venv\Scripts\python scripts/k8s_load_test.py
  ```
* **Vía Tareas de VS Code:** Presiona `Ctrl + Shift + P` -> `Tasks: Run Task` y selecciona la prueba a ejecutar.

---

## 5. Centro de Documentación (`docs/`)

Para profundizar en los aspectos técnicos, consulta la documentación detallada:

* 🤖 [**Guía Completa de Workflows de GitHub Actions**](file:///docs/devops/GITHUB_WORKFLOWS_GUIDE.md)
* 🖥️ [**Guía de Despliegue en Proxmox VE (LXC & VM)**](file:///docs/architecture/PROXMOX_DEPLOYMENT_GUIDE.md)
* ☁️ [**Diseño de Arquitectura en la Nube (Cloud Design)**](file:///docs/architecture/CLOUD_INFRASTRUCTURE_DESIGN.md)
* 🧪 [**Guía Completa de Pruebas y Validación (Testing Guide)**](file:///docs/testing-guide.md)
* 🛠️ [**Guía de Herramientas DevOps (DevOps Guide)**](file:///docs/devops-guide.md)
* 📂 [**Estructura del Monorepo y Organización por Dominios**](file:///docs/architecture/MONOREPO_STRUCTURE.md)
* 📊 [**Análisis de Base de Datos (SQL vs NoSQL)**](file:///docs/architecture/DATABASE_ANALYSIS.md)
* ☸️ [**Análisis de Escalado en Kubernetes, HPA y Balanceadores**](file:///docs/architecture/KUBERNETES_SCALING_ANALYSIS.md)
* 🛡️ [**Arquitectura de Seguridad, DMZ y Aislamiento de Red**](file:///docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md)
* 🔐 [**Gestión de Secretos: .env, Gitleaks y Bitnami Sealed Secrets**](file:///docs/architecture/SECRETS_MANAGEMENT_SEALED_SECRETS.md)
* 🌿 [**Guía de Mejores Prácticas Git y Flujo de Ramas**](file:///docs/best-practices/MEJORES_PRACTICAS_GIT.md)
* 🐳 [**Guía de Mejores Prácticas para Dockerfiles**](file:///docs/best-practices/MEJORES_PRACTICAS_DOCKERFILE.md)
* 📡 [**Especificación de Endpoints y Contratos REST**](file:///docs/api/API_SPECIFICATION.md)
* 🚀 [**Manual de Operación de Kubernetes**](file:///docs/runbooks/KUBERNETES_AUTOSCALING_GUIDE.md)
* 🧪 [**Guía Operativa de Pruebas de Estrés**](file:///docs/runbooks/STRESS_TESTING_GUIDE.md)
