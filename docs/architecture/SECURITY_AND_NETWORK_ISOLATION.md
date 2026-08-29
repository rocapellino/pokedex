# 🛡️ Arquitectura de Seguridad, DMZ y Aislamiento de Red

Este documento describe el modelo de **Defensa en Profundidad (*Defense in Depth*)**, segmentación de red (*DMZ*) y principio de mínimo privilegio (*Least Privilege*) aplicado tanto en **Kubernetes** como en **Docker Compose**.

---

## 📑 Tabla de Contenidos
1. [Principios de Seguridad y Aislamiento](#1-principios-de-seguridad-y-aislamiento)
2. [Matriz de Control de Acceso y Puertos](#2-matriz-de-control-de-acceso-y-puertos)
3. [Topología de Red DMZ (3-Tier Architecture)](#3-topología-de-red-dmz-3-tier-architecture)
4. [Aislamiento en Kubernetes (NetworkPolicies)](#4-aislamiento-en-kubernetes-networkpolicies)
5. [Aislamiento en Docker Compose](#5-aislamiento-en-docker-compose)
6. [Manejo Seguro de Secretos y Credenciales](#6-manejo-seguro-de-secretos-y-credenciales)

---

## 1. Principios de Seguridad y Aislamiento

1. **Superficie de Ataque Mínima:** Únicamente la capa de presentación Web (Nginx / Ingress Controller) debe ser accesible desde fuera del clúster o del host.
2. **Cero Exposición de Bases de Datos:** Ni PostgreSQL (5432) ni Redis (6379) deben exponer puertos hacia redes públicas o el host.
3. **Aislamiento Lateral (Zero-Trust):** Un pod del frontend (`pokemon-web`) no tiene permisos de red para conectarse directamente a la base de datos PostgreSQL ni a Redis. Todo el acceso a datos debe estar mediado y validado por la API (`pokemon-api`).
4. **Ejecución No-Root:** Todos los contenedores de aplicación corren bajo usuarios no privilegiados (`appuser:1001` / `nginx`).

---

## 2. Matriz de Control de Acceso y Puertos

| Componente | Puerto Interno | ¿Expuesto al Exterior? | Accesible Desde | Bloqueado Para |
| :--- | :---: | :---: | :--- | :--- |
| **Frontend (Nginx)** | `80` (HTTP) | ✅ **SÍ** (`8080` / Ingress `80/443`) | Internet / Clientes externos | - |
| **Backend (Flask API)**| `5000` | ❌ **NO** | `pokemon-web`, Ingress Controller | Internet directo |
| **PgBouncer** | `5432` | ❌ **NO** | `pokemon-api`, Jobs de seed | Internet, `pokemon-web` |
| **PostgreSQL 16** | `5432` | ❌ **NO** | `pgbouncer`, `pokemon-api` | Internet, `pokemon-web`, clientes externos |
| **Redis 7** | `6379` | ❌ **NO** | `pokemon-api` | Internet, `pokemon-web`, clientes externos |

---

## 3. Topología de Red DMZ (3-Tier Architecture)

```
[ Internet / Clientes ]
          │ (HTTP / HTTPS)
          ▼
┌────────────────────────────────────────────────────────┐
│ 🌐 CAPA 1: ZONA DMZ / PÚBLICA                          │
│ └── pokemon-web (Nginx) / Ingress Controller           │
└────────────────────────┬───────────────────────────────┘
                         │ (Proxy Pass / Enrutamiento /api/*)
                         ▼
┌────────────────────────────────────────────────────────┐
│ ⚙️ CAPA 2: ZONA DE APLICACIÓN (Privada)                │
│ └── pokemon-api (Flask + Gunicorn)                     │
└──────────────┬─────────────────────────┬───────────────┘
               │ (Pool SQL: 5432)        │ (Cache TCP: 6379)
               ▼                         ▼
┌──────────────────────────────┐ ┌──────────────────────┐
│ 🗄️ CAPA 3A: ZONA DE DATOS     │ │ ⚡ CAPA 3B: CACHÉ    │
│ ├── pgbouncer                │ │ └── redis            │
│ └── postgres (StatefulSet)   │ │                      │
└──────────────────────────────┘ └──────────────────────┘
```

---

## 4. Aislamiento en Kubernetes (`NetworkPolicies`)

Implementado en [`infra/k8s/09-network-policies.yaml`](file:///infra/k8s/09-network-policies.yaml):

* **`default-deny-all-ingress`:** Bloquea por defecto todo tráfico no autorizado en el namespace `pokemon-app`.
* **`allow-web-ingress`:** Permite tráfico HTTP al puerto 80 de los pods `pokemon-web`.
* **`allow-api-ingress`:** Permite tráfico al puerto 5000 de `pokemon-api` **exclusivamente** desde pods con etiqueta `app: pokemon-web` y el namespace de Ingress.
* **`allow-postgres-ingress`:** Permite tráfico al puerto 5432 de PostgreSQL **únicamente** desde `pgbouncer` y `pokemon-api`.
* **`allow-redis-ingress`:** Permite tráfico al puerto 6379 de Redis **únicamente** desde `pokemon-api`.

---

## 5. Aislamiento en Docker Compose

Implementado en [`docker-compose.yml`](file:///docker-compose.yml):

* **Red `frontend-net` (`internal: false`):** Conecta a `web` (que publica el puerto `8080:80`) y a `api`.
* **Red `backend-net` (`internal: true`):** Conecta a `api`, `postgres`, `redis` y `minio`. Esta red está configurada como `internal: true`, impidiendo cualquier enrutamiento directo hacia o desde el exterior.
* **Sin `ports:` en el Host:** Los servicios `postgres`, `redis`, `api` y `minio` no mapean puertos hacia el host `0.0.0.0`, usando únicamente directivas `expose:`.

---

## 6. Manejo Seguro de Secretos y Credenciales

1. **Variables Sensibles:** Las credenciales de base de datos se desacoplan del código fuente y se inyectan mediante el Secret de Kubernetes `pokemon-secrets` codificado en base64.
2. **Conexiones Seguras:** La URL de conexión `DATABASE_URL` y `REDIS_URL` son construidas internamente usando los nombres de los Services del clúster (`postgres-service`, `redis-service`).
