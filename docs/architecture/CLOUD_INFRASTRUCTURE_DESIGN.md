# ☁️ Diseño de Arquitectura en la Nube (Cloud Infrastructure Design)

Este documento describe formalmente la estructura de objetos, servicios administrados y segmentación de red para la implementación de la plataforma Pokédex en la nube (Google Cloud / AWS / Azure), replicando el modelo de capas de contenedores y Kubernetes.

---

## 📑 Tabla de Contenidos
1. [Estructura de Capas en la Nube](#1-estructura-de-capas-en-la-nube)
2. [Matriz de Objetos Cloud Implementados (IaC con Terraform)](#2-matriz-de-objetos-cloud-implementados-iac-con-terraform)
3. [Topología de Red y Aislamiento (Zero-Trust)](#3-topología-de-red-y-aislamiento-zero-trust)
4. [Flujo de Solicitud de Extremo a Extremo](#4-flujo-de-solicitud-de-extremo-a-extremo)
5. [Estructura del Código Terraform](#5-estructura-del-código-terraform)

---

## 1. Estructura de Capas en la Nube

```
                                [ Usuarios Globales ]
                                          │
                                          ▼
  ════════════════════════════════════════════════════════════════════════════════
  CAPA 1: EDGE, WAF Y CDN GLOBAL (Cloud Armor / CloudFront / Front Door)
  ════════════════════════════════════════════════════════════════════════════════
                     │                                           │
          (Ruta / /index.html / assets)                 (Ruta /api /pokemons)
                     │                                           │
                     ▼                                           ▼
  ┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
  │ CAPA 2: FRONTEND ESTÁTICO           │     │ CAPA 3: CÓMPUTO SERVERLESS          │
  │ • Cloud Storage Bucket / S3         │     │ • Cloud Run / ECS Fargate (FastAPI) │
  │ • Cloud CDN Caching                 │     │ • Autoescalado 0 a N instancias     │
  └─────────────────────────────────────┘     └──────────────────┬──────────────────┘
                                                                 │
                                                   (VPC Access Connector Privado)
                                                                 │
                                                                 ▼
  ════════════════════════════════════════════════════════════════════════════════
  VPC PRIVADA AISLADA (Zero-Trust Network - Sin IPs públicas)
  ════════════════════════════════════════════════════════════════════════════════
                                 │                               │
                                 ▼                               ▼
  ┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
  │ CAPA 4: CACHÉ EN MEMORIA (IN-MEMORY)│     │ CAPA 5: BASE DE DATOS (STATEFUL)    │
  │ • Cloud Memorystore Redis 7         │     │ • Cloud SQL PostgreSQL 16           │
  │ • Sub-3ms Lecturas de Catálogo      │     │ • Backups automáticos & HA multi-AZ │
  └─────────────────────────────────────┘     └─────────────────────────────────────┘
```

---

## 2. Matriz de Objetos Cloud Implementados (IaC con Terraform)

| Objeto Cloud | Módulo Terraform | Propósito Arquitectónico | SLA / Ventaja |
| :--- | :--- | :--- | :--- |
| **VPC & Subnets** | `modules/networking` | Red privada virtual con subredes separadas para DMZ, Aplicación y Datos. | Aislamiento total de red. |
| **Cloud NAT & Router** | `modules/networking` | Permite a la API descargar parches o consultar PokeAPI sin exponer IP pública. | Seguridad perimetral. |
| **Cloud Run Service** | `modules/compute` | Servicio de contenedores serverless para la API FastAPI. | Autoescalado automático por concurrencia. |
| **VPC Connector** | `modules/compute` | Túnel privado seguro entre Cloud Run y la VPC interna. | Cero exposición en internet. |
| **Cloud SQL PostgreSQL**| `modules/database` | Instancia gestionada de PostgreSQL 16 con disco SSD autoescalable. | 99.95% disponibilidad y réplicas. |
| **Memorystore Redis** | `modules/database` | Clúster en memoria para caché del catálogo de 1025 Pokémon. | Latencia de lectura < 3 ms. |
| **Frontend Bucket** | `modules/storage` | Almacenamiento serverless de archivos HTML, CSS y JS con soporte web. | 90% reducción de costo vs VM. |
| **Media/Backup Bucket**| `modules/storage` | Almacenamiento de assets multimedia y dumps SQL con ciclo de vida Nearline. | Durabilidad de 99.999999999%. |
| **Cloud CDN Backend** | `modules/storage` | Caché perimetral de baja latencia para el frontend. | Tiempos de carga < 20 ms global. |

---

## 3. Topología de Red y Aislamiento (Zero-Trust)

1. **Subred Pública (`10.0.1.0/24`):**
   * Aloja únicamente el balanceador de carga y puntos de entrada de CDN.
2. **Subred Privada de Aplicación (`10.0.10.0/24`):**
   * Aloja el conector de acceso VPC para los contenedores de FastAPI. No tiene IP pública asignada.
3. **Subred Privada de Datos (`10.0.20.0/24`):**
   * Conectada vía *Private Service Access* a PostgreSQL y Redis. Solo acepta tráfico en puertos `5432` y `6379` originado dentro de la VPC.

---

## 4. Flujo de Solicitud de Extremo a Extremo

1. **Usuario visita `https://pokedex.ejemplo.com/`:**
   * La solicitud es atendida en el Edge por **Cloud CDN / Bucket**. Los assets estáticos se descargan en milisegundos.
2. **El navegador consulta `GET /pokemons`:**
   * La llamada viaja al **Load Balancer**, que la enruta hacia el contenedor de **FastAPI en Cloud Run**.
3. **FastAPI consulta la caché de Redis:**
   * A través del **VPC Connector**, consulta **Memorystore Redis** en la subred de datos privada.
   * Si hay *Cache Hit*, responde en **~2ms**.
   * Si hay *Cache Miss*, consulta **Cloud SQL PostgreSQL**, guarda el resultado en Redis y responde.

---

## 5. Estructura del Código Terraform

```
infra/terraform/
├── envs/
│   └── dev/                  <- Configuración del entorno de desarrollo
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── modules/
    ├── networking/           <- VPC, Subnets, NAT, Firewall
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── compute/              <- Cloud Run, VPC Connector, Autoescalado
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── database/             <- Cloud SQL PostgreSQL, Memorystore Redis
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── storage/              <- Cloud Storage Buckets, Cloud CDN
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```
