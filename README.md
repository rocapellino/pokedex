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
| **Frontend Web** | HTML5, CSS3, JS Vanilla, Nginx 1.27 | Interfaz de usuario interactiva y proxy inverso local. |
| **Backend API** | Python 3.11, Flask, Gunicorn WSGI | Microservicio REST para gestión del catálogo Pokémon. |
| **Base de Datos** | PostgreSQL 16 Alpine | Persistencia relacional con esquema estructurado (WikiDex). |
| **Connection Pooling**| PgBouncer | Gestión eficiente de conexiones ante escalado masivo de pods. |
| **Caché en Memoria** | Redis 7 Alpine | Aceleración de lecturas frecuentes e invalidación inteligente. |
| **Orquestación Cloud**| Kubernetes (Kind / Docker Desktop / Cloud) | Autoescalado horizontal (**HPA v2**), Service Discovery y self-healing. |

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
   * 🔌 **API:** [http://localhost:8080/api/pokemons](http://localhost:8080/api/pokemons)

---

### Opción B: Despliegue con Docker Compose

```bash
# Iniciar todos los servicios (Postgres, Redis, MinIO, API y Web)
docker-compose up -d --build

# Verificar estado de los contenedores
docker-compose ps
```

---

## 4. Pruebas Automatizadas y Validación

### Ejecutar Suite de Tests Unitarios (Pytest):
```bash
pytest -v
```

### Ejecutar Prueba de Estrés para Validar Autoescalado (HPA):
```powershell
python scripts/k8s_load_test.py --url http://localhost:8080/api/pokemons --concurrency 60 --total-requests 3000
```

---

## 5. Centro de Documentación (`docs/`)

Para profundizar en los aspectos técnicos, consulta la documentación detallada:

* 📂 [**Estructura del Monorepo y Organización por Dominios**](file:///docs/architecture/MONOREPO_STRUCTURE.md)
* 📊 [**Análisis de Base de Datos (SQL vs NoSQL)**](file:///docs/architecture/DATABASE_ANALYSIS.md)
* ☸️ [**Análisis de Escalado en Kubernetes, HPA y Balanceadores**](file:///docs/architecture/KUBERNETES_SCALING_ANALYSIS.md)
* 🛡️ [**Arquitectura de Seguridad, DMZ y Aislamiento de Red**](file:///docs/architecture/SECURITY_AND_NETWORK_ISOLATION.md)
* 🌿 [**Guía de Mejores Prácticas Git y Flujo de Ramas**](file:///docs/best-practices/MEJORES_PRACTICAS_GIT.md)
* 🐳 [**Guía de Mejores Prácticas para Dockerfiles**](file:///docs/best-practices/MEJORES_PRACTICAS_DOCKERFILE.md)
* 📡 [**Especificación de Endpoints y Contratos REST**](file:///docs/api/API_SPECIFICATION.md)
* 🚀 [**Manual de Operación de Kubernetes**](file:///docs/runbooks/KUBERNETES_AUTOSCALING_GUIDE.md)
* 🧪 [**Guía Operativa de Pruebas de Estrés**](file:///docs/runbooks/STRESS_TESTING_GUIDE.md)
