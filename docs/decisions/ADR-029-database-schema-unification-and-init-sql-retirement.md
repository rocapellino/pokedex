# ADR-029: Unificación de la Fuente de Verdad del Esquema en Drizzle ORM y Retiro de init.sql

## Estado

Aceptado

## Contexto

En etapas tempranas del proyecto, la inicialización de la base de datos PostgreSQL se realizaba mediante scripts SQL estáticos (`init.sql`):

1. En entornos de desarrollo local con Docker Compose, el servicio `postgres` montaba el archivo `infra/docker/postgres/init.sql` en `/docker-entrypoint-initdb.d/init.sql:ro`. Este archivo contenía sentencias DDL para crear la tabla `pokedex_entries`, índices y la secuencia `pokedex_id_seq`, además de un bloque de siembra (*seed*) manual de 27 Pokémon hardcodeados en formato JSONB.
2. En entornos de Kubernetes (Helm / GitOps), el chart desplegaba el ConfigMap declarativo `postgres-init-configmap.yaml`, el cual era montado como volumen (`init-script`) en el StatefulSet de PostgreSQL (`postgres-statefulset.yaml`).

Con la adopción formal de **Drizzle ORM** (establecida en [ADR-011](./ADR-011-persistence-drizzle-orm-and-pgbouncer.md)) y la creación del script de siembra masiva e idempotente de 1.025 Pokémon ([`apps/backend/src/seed.ts`](../../apps/backend/src/seed.ts)), la persistencia adquirió un mecanismo moderno de migraciones versionadas y tipado seguro en TypeScript:

- Las definiciones del esquema residen en [`apps/backend/src/db/schema.ts`](../../apps/backend/src/db/schema.ts).
- Las migraciones declarativas se generan y versionan en [`apps/backend/src/db/migrations/`](../../apps/backend/src/db/migrations/).
- El backend ejecuta automáticamente `runMigrations(DATABASE_URL)` en el evento de conexión ([`apps/backend/src/services/postgres.ts`](../../apps/backend/src/services/postgres.ts)).
- En Kubernetes, el despliegue cuenta con el Job oficial de siembra ([`infra/helm/pokedex/templates/seed-job.yaml`](../../infra/helm/pokedex/templates/seed-job.yaml)) configurado en ArgoCD Sync Wave 1.

Mantener en paralelo archivos `init.sql` creaba un problema de **doble fuente de verdad** (*Two Sources of Truth*):

- Riesgo de desalineación o deriva de esquema (*schema drift*): futuras migraciones de Drizzle podrían chocar con esquemas inicializados previamente por `init.sql`.
- Dispersión de datos: la existencia de 27 Pokémon hardcodeados en `init.sql` competía con la fuente oficial de 1.025 registros en [`initialPokemons.ts`](../../apps/backend/src/data/initialPokemons.ts).
- Deuda técnica: recursos innecesarios en Kubernetes (un ConfigMap y montajes de volumen dedicados a un script estático que ya no debe gobernar el esquema).

## Decisión

Se establece que **Drizzle ORM y sus migraciones versionadas son la única fuente de verdad (Single Source of Truth - SSOT) para la definición, evolución y estructura de la base de datos PostgreSQL**.

En consecuencia, se adoptan las siguientes acciones:

1. **Retiro de `init.sql` en Docker Compose:**
   - Se elimina el archivo físico `infra/docker/postgres/init.sql`.
   - Se retira el montaje de volumen `./infra/docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro` de `docker-compose.yaml`.
   - El contenedor de PostgreSQL arranca como motor relacional limpio; al iniciar el servicio de backend (`pokemon-api`), la aplicación ejecuta las migraciones Drizzle y construye el esquema canónico automáticamente.
2. **Retiro de ConfigMap y Montaje en Helm:**
   - Se elimina el template `infra/helm/pokedex/templates/postgres-init-configmap.yaml`.
   - Se suprimen el `volumeMounts` (`init-script`) y el `volumes` (`postgres-init-sql`) en `infra/helm/pokedex/templates/postgres-statefulset.yaml`.
   - En Kubernetes, el `seed-job` (Sync Wave 1) y el deployment de la API gestionan la evolución del esquema y la siembra mediante código de la aplicación.
3. **Consolidación de la Siembra de Datos (*Seed*):**
   - El catálogo inicial se gestiona exclusivamente mediante `apps/backend/src/seed.ts` (ejecutable vía `npm run seed` o `task db:seed`), garantizando validación de tipos, control de concurrencia y guardas de seguridad contra re-siembra accidental en producción.

## Consecuencias

### Positivas

- **Cero Divergencia de Esquemas:** Desaparece cualquier posibilidad de desfase entre los entornos locales (Compose), entornos de prueba y clústeres productivos.
- **Simplificación de Manifiestos:** Se eliminan artefactos redundantes en el Helm chart (un ConfigMap menos y configuración de volúmenes simplificada en el StatefulSet).
- **Higiene de Datos:** Se erradica el seed parcial desactualizado de 27 Pokémon, unificando todo el catálogo en el dataset oficial.
- **Alineación con Estándares Cloud-Native:** La inicialización de la base de datos se desacopla del ciclo de vida del contenedor PostgreSQL, permitiendo que PostgreSQL opere como servicio de infraestructura puro.

### Negativas / Mitigaciones

- **Arranque en Frío de PostgreSQL Aislado:** Si un desarrollador levanta exclusivamente el contenedor de base de datos (`docker compose up postgres`) sin ejecutar el backend, la base de datos estará vacía hasta que inicie el backend o ejecute explícitamente `npm run db:migrate`.
  - *Mitigación:* Se documenta en los runbooks y en `Taskfile.yml` que el comando de desarrollo estándar es `task dev` (o `npm run dev`), el cual orquesta los servicios de forma armónica.
