# Plan de Implementación: Migración a PostgreSQL 17 y Valkey 8

> **Estado:** Histórico (documento auxiliar de planificación; su ejecución se llevará a cabo en una sesión posterior)
>
> **Fecha de captura:** 2026-10-14
>
> **Rama de trabajo:** `docs/plan-migracion-postgres17-valkey8`
>
> [!IMPORTANT]
> Este documento es evidencia histórica y de planificación técnica para la transición escalonada de persistencia relacional (PostgreSQL 16 -> 17) y capa de caché en memoria (Redis 7 -> Valkey 8). No es SSOT: el estado vigente reside en `apps/`, `infra/`, `gitops/`, `scripts/`, `tests/` y `docs/architecture/`.

---

## 1. Resumen Ejecutivo y Alcance

### A. Contexto

- El monorepo `rocapellino/pokedex` opera actualmente sobre **PostgreSQL 16** (`postgres:16-alpine`) y **Redis 7** (`redis:7-alpine`), fijados contractualmente en `RENOVATE-001` ([renovate_config_contract.test.ts](../../../tests/contracts/delivery/renovate_config_contract.test.ts)) para evitar derivas automáticas en el Dependency Dashboard ([Issue #586](https://github.com/rocapellino/pokedex/issues/586)).
- **Valkey 8** (gobernado por la Linux Foundation bajo licencia abierta BSD-3) sustituye a Redis tras el cambio de licenciamiento hacia licencias restrictivas no-OSI (RSALv2/SSPL).
- **PostgreSQL 17** consolida la versión LTS de mayor rendimiento y optimizaciones de memoria en el stack relacional.

### B. Estrategia de Entrega en Dos Fases

1. **Fase 1 (Local):** Migración y certificación completa en el entorno de desarrollo local (`docker-compose.yaml`, `docker-compose.dev.yaml`, pruebas de integración y CI local).
2. **Fase 2 (Pre-prod / Plataforma):** Una vez validada la Fase 1, ejecución de la migración en infraestructura Kubernetes / Proxmox (`infra/helm/pokedex/values.yaml`, CronJobs de backup y Disaster Recovery `ADR-006`).

```mermaid
flowchart TD
    subgraph Fase 1: Entorno Local
        L1["docker-compose.yaml (postgres:17 & valkey:8)"] --> L2["Pruebas Unitarias y de Integración"]
        L2 --> L3["Certificación ioredis + Drizzle ORM"]
        L3 --> L4["Validación Local Completa (npm run validate)"]
    end

    subgraph Fase 2: Entorno Pre-prod y Helm
        P1["Backup Preventivo (CronJob / pg_dumpall)"] --> P2["Helm Values (values.yaml & values.dev.yaml)"]
        P2 --> P3["Sincronización DR (postgres:17-bookworm)"]
        P3 --> P4["Despliegue GitOps / Proxmox"]
        P4 --> P5["Verificación DR Automática (dr:drill:e2e)"]
    end

    subgraph Fase 3: Gobernanza y ADR
        G1["Formalizar ADR-031"] --> G2["Actualizar Contrato RENOVATE-001"]
        G2 --> G3["Ajustar Reglas en renovate.json"]
    end

    Fase 1 ==>|Validación Exitosa| Fase 2
    Fase 2 ==> Fase 3
```

---

## 2. Fase 1: Implementación en Entorno Local

### A. Componentes Afectados

- `docker-compose.yaml`: Servicios `postgres` y `redis`.
- `docker-compose.dev.yaml`: Configuración de desarrollo extendida.
- `tests/helpers/services.ts`: Comandos de arranque de contenedores para pruebas.
- `tests/unit/compose_postgres_tls.test.ts`: Verificación de flags y redes.
- `tests/ci/db_integration_services.test.ts`: Puertos y healthchecks.

### B. Procedimiento Paso a Paso (Local)

1. **Aprovisionar Worktree Canónico:**

   ```bash
   npm run worktree:create -- --type chore --slug upgrade-local-postgres17-valkey8
   ```

2. **Actualizar `docker-compose.yaml`:**
   - **PostgreSQL:**

     ```yaml
     postgres:
       image: postgres:17-alpine@sha256:<digest_sha256_pg17>
       container_name: pokemon-postgres
       # variables y volúmenes se mantienen idénticos
     ```

   - **Valkey (manteniendo alias de red `redis` para compatibilidad de DNS interno):**

     ```yaml
     redis:
       image: valkey/valkey:8-alpine@sha256:<digest_sha256_vk8>
       container_name: pokemon-redis
       restart: unless-stopped
       command: >
         sh -c "exec valkey-server --requirepass \"$${REDIS_PASSWORD}\""
       environment:
         REDIS_PASSWORD: "${REDIS_PASSWORD:?Error: Variable REDIS_PASSWORD requerida en .env}"
       expose:
         - "6379"
       volumes:
         - redis_data:/data
       networks:
         - backend-net
       healthcheck:
         test: ["CMD-SHELL", "valkey-cli -a \"$${REDIS_PASSWORD}\" ping || redis-cli -a \"$${REDIS_PASSWORD}\" ping"]
         interval: 10s
         timeout: 3s
         retries: 3
         start_period: 5s
     ```

3. **Migración del Volumen de Datos Local:**
   - Dado que PostgreSQL 17 no puede leer el volumen `$PGDATA` de PostgreSQL 16:

     ```bash
     # 1. Exportar datos previos si se desea conservar estado local
     docker compose exec -T postgres pg_dumpall -U pokedex_app -c > tmp/local_pg16_dump.sql

     # 2. Bajar y recrear volumen limpio
     docker compose down -v
     docker compose up -d postgres redis

     # 3. Aplicar migraciones y seed inicial
     npm run db:migrate
     npm run seed
     ```

4. **Validación de Capa de Aplicación (`apps/backend`):**
   - Ejecutar pruebas de conectividad de pool Drizzle ORM:

     ```bash
     npm run test:integration:db
     ```

   - Validar autenticación, sesiones JWT revocadas y rate limiter con Valkey:

     ```bash
     npm run test:unit
     npm run test:security
     ```

5. **Aprobación de la Fase Local:**

   ```bash
   npm run validate
   ```

---

## 3. Fase 2: Implementación en Pre-prod (Kubernetes / Proxmox)

### A. Componentes Afectados

- `infra/helm/pokedex/values.yaml`:
  - `postgresql.image`: Tag `17-alpine` y digest dedicado.
  - `redis.image`: Repositorio `valkey/valkey`, tag `8-alpine` y digest dedicado.
  - `backup.image`: Tag `17-bookworm` y digest dedicado.
- `scripts/dr_verify_restore.sh`: Contenedor efímero de prueba (`postgres:17-alpine`).
- `tests/security/dr_backup_security.test.ts`: Aserciones de imagen y cifrado.
- `tests/gitops/platform_bootstrap_contract.test.ts`: Paridad de imágenes de backup.

### B. Procedimiento Operativo (Pre-prod)

1. **Backup Criptográfico Preventivo (Inmutable):**

   ```bash
   kubectl -n pokemon-app create job --from=cronjob/pokedex-preprod-db-backup pre-upgrade-pg17-backup
   kubectl -n pokemon-app wait --for=condition=complete job/pre-upgrade-pg17-backup --timeout=180s
   ```

2. **Drenado de Conexiones y Ventana de Mantenimiento:**
   - Escalar `pokemon-api` a 0 para detener escrituras concurrentes:

     ```bash
     kubectl -n pokemon-app scale deployment/pokemon-api --replicas=0
     ```

3. **Exportación Lógica Completa:**

   ```bash
   kubectl -n pokemon-app exec -it statefulset/pokemon-postgres -- pg_dumpall -U pokedex_app -c > tmp/preprod_pg16_full.sql
   ```

4. **Despliegue GitOps de las Nuevas Imágenes:**
   - Actualizar `infra/helm/pokedex/values.yaml` con las imágenes de PostgreSQL 17 y Valkey 8.
   - Recrear el PVC de PostgreSQL o apuntar al nuevo release.
   - Valkey 8 reutiliza el PVC de Redis montando `/data` directamente (compatible RDB).

5. **Restauración de Datos e Integridad:**

   ```bash
   kubectl -n pokemon-app exec -i statefulset/pokemon-postgres -- psql -U pokedex_app -d pokedex_db < tmp/preprod_pg16_full.sql
   ```

6. **Restablecimiento y Smoke Tests:**
   - Restaurar réplicas del microservicio API:

     ```bash
     kubectl -n pokemon-app scale deployment/pokemon-api --replicas=2
     ```

   - Ejecutar la suite de simulación de Disaster Recovery:

     ```bash
     npm run dr:drill:e2e
     ```

---

## 4. Fase 3: Gobernanza, ADR y Contratos

1. **Formalización de Arquitectura:**
   - Crear `docs/decisions/ADR-031-adopcion-valkey-y-actualizacion-postgresql-17.md`.
   - Registrar la justificación de licenciamiento (Linux Foundation BSD-3 vs. SSPL).

2. **Actualización de Contrato `RENOVATE-001`:**
   - En `tests/contracts/delivery/renovate_config_contract.test.ts`:
     - Sustituir la comprobación de `redis` por `valkey/valkey`.
     - Actualizar la regla para asegurar que Renovate bloquee los *major* de `postgres` (v18+) y `valkey/valkey` (v9+).

3. **Actualización de `renovate.json`:**
   - Añadir `valkey/valkey` a los gestores `custom.regex` y a las reglas de supply chain con digest pinning.

---

## 5. Matriz de Verificación y Criterios de Aceptación

| Compuerta | Comando de Verificación | Resultado Esperado |
| :--- | :--- | :--- |
| **Integración Local** | `npm run test:integration:db` | `PASS` con PostgreSQL 17 y Valkey 8. |
| **Pruebas de Rate Limit** | `npm test -- tests/security/app/pentest.test.ts` | `PASS` validando scripts Lua en Valkey. |
| **Disaster Recovery** | `npm run dr:drill:e2e` | `PASS` restauración y descifrado en < 2 segundos. |
| **Gobernanza de Imágenes** | `npm run gitops:verify-parity:strict` | `PASS` 100% paridad de digest entre compose y Helm. |
| **Contratos de Entrega** | `npm run test:contracts` | `PASS` `renovate_config_contract.test.ts` actualizado. |
| **Markdown Quality Gate** | `npm run lint:md` | `PASS` sin violaciones en auditoría y ADR. |
| **Gobernanza Documental** | `npm run docs:validate` | `PASS` 100% sin enlaces rotos ni drift. |

---

## 6. Procedimiento de Rollback Inmediato

En caso de fallo crítico en la restauración de Pre-prod:

1. Revertir el commit de GitOps en la rama de despliegue (`git revert HEAD`).
2. Desplegar el Helm chart con las imágenes canónicas anteriores (`postgres:16-alpine` y `redis:7-alpine`).
3. Restaurar la base de datos a partir del backup inmutable previo:

   ```bash
   kubectl -n pokemon-app create job --from=cronjob/pokedex-preprod-dr-restore-verify emergency-rollback
   ```

4. Restaurar réplicas y reanudar el tráfico.
