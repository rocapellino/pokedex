# 🛡️ Arquitectura de Seguridad, DMZ y Aislamiento de Red

Este documento describe el modelo de **Defensa en Profundidad (*Defense in Depth*)**, segmentación de red (*DMZ*) y principio de mínimo privilegio (*Least Privilege*) aplicado tanto en **Kubernetes** como en **Docker Compose** para la plataforma Pokédex y su integración con el stack global de observabilidad **`docker_monitoreo`**.

---

## 📑 Tabla de Contenidos
1. [Principios de Seguridad y Aislamiento](#1-principios-de-seguridad-y-aislamiento)
2. [Matriz de Control de Acceso, Redes y Puertos](#2-matriz-de-control-de-acceso-redes-y-puertos)
3. [Topología de Red Global (4-Tier DMZ & Observabilidad)](#3-topología-de-red-global-4-tier-dmz--observabilidad)
4. [Segmentación en Docker Compose](#4-segmentación-en-docker-compose)
   - [Redes en Pokédex App (`pokedex`)](#redes-en-pokédex-app-pokedex)
   - [Redes en Stack de Observabilidad (`docker_monitoreo`)](#redes-en-stack-de-observabilidad-docker_monitoreo)
5. [Aislamiento en Kubernetes (`NetworkPolicies`)](#5-aislamiento-en-kubernetes-networkpolicies)
6. [Manejo Seguro de Secretos y Credenciales](#6-manejo-seguro-de-secretos-y-credenciales)

---

## 1. Principios de Seguridad y Aislamiento

1. **Superficie de Ataque Mínima:** Únicamente la capa de presentación Web (Nginx / Ingress Controller) y las interfaces administrativas de monitoreo (Grafana / Prometheus) exponen puertos hacia el host.
2. **Cero Exposición de Bases de Datos:** Ni PostgreSQL (`5432`), Redis (`6379`) ni MinIO (`9000/9001`) exponen puertos hacia redes públicas en entornos de producción.
3. **Aislamiento Lateral (Zero-Trust):** 
   - El frontend (`pokemon-web`) no tiene visibilidad de red hacia la base de datos PostgreSQL, Redis o MinIO.
   - El backend (`pokemon-api`) actúa como único intermediario de validación de datos.
   - El stack de monitoreo (`docker_monitoreo`) solo tiene acceso al endpoint `/metrics` de la API a través de una red dedicada (`monitoring-net`), sin acceso directo a las redes de datos (`pokedex-backend-net`).
4. **Ejecución No-Root:** Todos los contenedores de aplicación corren bajo usuarios no privilegiados (`appuser:1001` / `nginx`).

---

## 2. Matriz de Control de Acceso, Redes y Puertos

| Componente | Repositorio | Redes Asignadas | Puerto Interno | Puerto Host | Accesible Desde | Bloqueado Para |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **Frontend (`pokemon-web`)** | `pokedex` | `pokedex-frontend-net` | `80` (HTTP) | `8080` | Internet / Host | `pokedex-backend-net`, `monitoring-local-net` |
| **Backend API (`pokemon-api`)**| `pokedex` | `pokedex-frontend-net`<br>`pokedex-backend-net`<br>`monitoring-net` | `5000` | `5000` *(dev)* | `pokemon-web`<br>`prometheus` (`/metrics`) | Acceso directo sin proxy en producción |
| **PostgreSQL 16** | `pokedex` | `pokedex-backend-net` | `5432` | `5432` *(dev)* | `pokemon-api` | `pokemon-web`, Internet, `docker_monitoreo` |
| **Redis 7** | `pokedex` | `pokedex-backend-net` | `6379` | `6379` *(dev)* | `pokemon-api` | `pokemon-web`, Internet, `docker_monitoreo` |
| **MinIO Storage** | `pokedex` | `pokedex-backend-net` | `9000`, `9001` | `9000`, `9001` *(dev)* | `pokemon-api` | `pokemon-web`, Internet, `docker_monitoreo`, `docker_jenkins` |
| **Jenkins Controller** | `docker_jenkins` | `jenkins-net` | `8080`, `50000` | `8090`, `50000` | Host / CI Admins / Agentes | `pokedex-backend-net` (accede vía DooD socket) |
| **Prometheus** | `docker_monitoreo` | `monitoring-local-net`<br>`monitoring-net` | `9090` | `9090` | Host, `grafana` | `pokedex-backend-net`, `pokedex-frontend-net` |
| **Grafana** | `docker_monitoreo` | `monitoring-local-net` | `3000` | `3000` | Host / Usuarios | `pokedex-backend-net`, `pokedex-frontend-net`, `pokemon-api` |

---

## 3. Topología de Red Global (4-Tier DMZ & Observabilidad)

```text
[ Internet / Clientes ]                       [ Operadores / DevOps ]
          │                                              │
          │ (HTTP 8080)                                  │ (HTTP 3000 / 9090)
          ▼                                              ▼
┌──────────────────────────────────────────────┐ ┌──────────────────────────────────────────────┐
│ 🌐 CAPA 1: ZONA DMZ / PÚBLICA (pokedex)      │ │ 📊 CAPA 4: ZONA DE OBSERVABILIDAD            │
│ └── pokemon-web (Nginx Proxy)                │ │     (docker_monitoreo)                       │
└──────────────────────┬───────────────────────┘ │                                              │
                       │ (pokedex-frontend-net)  │  ┌──────────────┐      ┌──────────────┐      │
                       ▼                         │  │   Grafana    │ ────►│  Prometheus  │      │
┌──────────────────────────────────────────────┐ │  └──────────────┘      └──────┬───────┘      │
│ ⚙️ CAPA 2: ZONA DE APLICACIÓN (pokedex)       │ │   (monitoring-local-net)       │             │
│ └── pokemon-api (FastAPI + Uvicorn)          │ └────────────────────────────────┼─────────────┘
└──────────┬─────────────────────────┬─────────┘                                  │
           │ (pokedex-backend-net)   │ (monitoring-net: Scraping /metrics) ◄──────┘
           ▼                         ▼
┌────────────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐
│ 🗄️ CAPA 3A: DATOS SQL  │ │ ⚡ CAPA 3B: CACHÉ MEM  │ │ 📦 CAPA 3C: OBJETOS S3 │
│ └── pokemon-postgres   │ │ └── pokemon-redis      │ │ └── pokemon-minio      │
└────────────────────────┘ └────────────────────────┘ └────────────────────────┘
```

---

## 4. Segmentación en Docker Compose

### Redes en Pokédex App (`pokedex`)

Definidas en [`docker-compose.yml`](file:///c:/Users/Rodrigo/Documents/Git/pokedex/docker-compose.yml):

```yaml
networks:
  frontend-net:
    name: pokedex-frontend-net
    driver: bridge
    internal: false  # Permite al contenedor web publicar el puerto hacia el host
  backend-net:
    name: pokedex-backend-net
    driver: bridge
    internal: true   # Aislamiento total: sin enrutamiento de salida ni entrada a internet
  monitoring-net:
    name: monitoring-net
    driver: bridge   # Red compartida de observabilidad entre Pokédex y docker_monitoreo
```

1. **`pokedex-frontend-net`:** Conecta el reverse proxy `web` con `api`.
2. **`pokedex-backend-net`:** Conecta de forma 100% aislada (`internal: true` en prod) a `api`, `postgres`, `redis` y `minio`.
3. **`monitoring-net`:** Conecta a `api` con Prometheus para la recolección periódica de métricas vía `/metrics`.

### Redes en Stack de Observabilidad (`docker_monitoreo`)

Definidas en [`docker-compose.yml`](file:///c:/Users/Rodrigo/Documents/Git/docker_monitoreo/docker-compose.yml):

```yaml
networks:
  local-net:
    name: monitoring-local-net
    driver: bridge   # Red privada interna para Grafana y Prometheus
  monitoring-net:
    name: monitoring-net
    driver: bridge   # Red global compartida para scrapear contenedores de aplicaciones
```

1. **`monitoring-local-net`:** Red interna para que Grafana consulte a Prometheus (`http://prometheus:9090`) de forma segura.
2. **`monitoring-net`:** Red donde Prometheus descubre y scrapea a `pokemon-api:5000`.

---

## 5. Aislamiento en Kubernetes (`NetworkPolicies`)

Implementado en el template [`infra/helm/pokedex/templates/network-policies.yaml`](file:///infra/helm/pokedex/templates/network-policies.yaml):

* **`default-deny-all-ingress`:** Bloquea por defecto todo tráfico no autorizado en el namespace `pokemon-app`.
* **`allow-web-ingress`:** Permite tráfico HTTP al puerto 80 de los pods `pokemon-web`.
* **`allow-api-ingress`:** Permite tráfico al puerto 3000 de `pokemon-api` exclusivamente desde pods con etiqueta `app: pokemon-web` e Ingress.
* **`allow-postgres-ingress`:** Permite tráfico al puerto 5432 de PostgreSQL únicamente desde `pokemon-api`.
* **`allow-redis-ingress`:** Permite tráfico al puerto 6379 de Redis únicamente desde `pokemon-api`.

---

## 6. Manejo Seguro de Secretos y Credenciales

1. **Variables Sensibles:** Las credenciales de base de datos se desacoplan del código fuente y se inyectan mediante Secrets de Kubernetes (`pokemon-secrets`) o variables de entorno en Compose (`.env`).
2. **Conexiones Seguras:** Las URLs de conexión `DATABASE_URL` y `REDIS_URL` se construyen internamente usando nombres DNS de contenedor/servicio (`postgres:5432`, `redis:6379`).

