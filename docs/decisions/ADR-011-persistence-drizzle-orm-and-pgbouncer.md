# ADR-011: Estrategia de Persistencia Relacional, Migraciones Declarativas con Drizzle ORM y Connection Pooling con PgBouncer

## Estado

Aceptado (Activo — Consolida y absorbe ADR-029)

## Contexto

La plataforma Pokédex opera en un entorno de producción distribuido en Kubernetes con escalabilidad horizontal dinámica (HPA hasta 5 réplicas de `pokemon-api`). La capa de persistencia debe resolver desafíos críticos de rendimiento, consistencia y tipado:

1. **Patrón de Tráfico Asimétrico**: El sistema exhibe un patrón de carga dominado por lecturas (99% lecturas contra 1% mutaciones administrativas), donde las consultas requieren búsqueda por nombre, filtrado por tipo elemental y paginación determinista eficiente.
2. **Saturación de Conexiones de Base de Datos en Kubernetes**: Cada réplica de la API Node.js/Express mantiene un pool de conexiones locales. Sin un intermediario, el escalado automático de pods puede agotar rápidamente el límite de conexiones concurrentes (`max_connections`) de PostgreSQL, donde cada conexión asigna memoria dedicada y procesos backend en el motor relacional.
3. **Seguridad de Tipado y Prevención de Deriva de Esquemas (*Schema Drift*)**: El uso de SQL sin tipar o de ORMs pesados basados en abstracciones opacas incrementa el riesgo de desajustes entre la base de datos y la aplicación, aumentando la sobrecarga en tiempo de ejecución (*runtime overhead*).
4. **Modelo Híbrido Relacional y Documental (JSONB)**: Las propiedades canónicas de los Pokémon exigen consultas rápidas e indexadas sobre atributos clave (`id`, `nombre`, `tipo`), a la vez que requieren flexibilidad para almacenar estructuras jerárquicas completas de estadísticas, movimientos y habilidades (`data JSONB`).
5. **Concurrencia Atómica en Mutaciones**: En escenarios de inserción simultánea de nuevos Pokémon, la asignación de identificadores numéricos debe ser atómica y continua, previniendo condiciones de carrera e inconsistencias con el catálogo base de Pokémon canónicos iniciales.
6. **Riesgo Histórico de Doble Fuente de Verdad (*Two Sources of Truth*)**: En etapas tempranas, la inicialización se realizaba mediante scripts estáticos `init.sql` montados en Docker Compose y un ConfigMap en Kubernetes. Esta dualidad competía con las migraciones tipadas de Drizzle y causaba riesgo de divergencia de esquemas y dispersión de datos.

## Decisión

Se adopta una arquitectura de persistencia relacional, migraciones declarativas y multiplexación de conexiones basada en seis directivas técnicas:

### 1. Adopción de Drizzle ORM para Tipado Estricto en Tiempo de Compilación

- Se utiliza **Drizzle ORM** (`drizzle-orm/node-postgres`) para modelar la base de datos en TypeScript puro (`apps/backend/src/db/schema.ts`).
- Drizzle no impone capas de abstracción opacas ni metaprogramación pesada, proporcionando inferencia de tipos estricta (`$inferSelect`, `$inferInsert`) y consultas SQL transparentes y optimizadas.

### 2. Modelo de Datos Híbrido Relacional + JSONB con Índices Especializados

Tabla canónica `pokedex_entries`:

- `id`: Entero clave primaria (`INT PRIMARY KEY`).
- `nombre`: Cadena (`VARCHAR(100)`), indexada mediante `idx_pokedex_nombre` para búsquedas case-insensitive rápidas.
- `tipo`: Cadena (`VARCHAR(50)`), indexada mediante `idx_pokedex_tipo` para filtrado por afinidad elemental.
- `data`: Documento JSONB (`jsonb('data').$type<Pokemon>()`) que almacena la entidad completa validada.
- `updated_at`: Marca temporal con zona horaria (`TIMESTAMP WITH TIME ZONE`) para auditoría y consistencia de réplica.

### 3. Secuencias Atómicas Nativas de PostgreSQL (`pokedex_id_seq`)

- Se implementa la secuencia nativa `pokedex_id_seq` con valor inicial `START WITH 1009`.
- La reserva de nuevos identificadores se ejecuta a nivel de motor relacional mediante `nextval('pokedex_id_seq')`, garantizando unicidad estricta y atomicidad aún bajo alta concurrencia de mutaciones sin requerir bloqueos de tabla (*table locks*).

### 4. Multiplexación de Conexiones con PgBouncer (Perfil Enterprise vs. Lean)

- **Plantilla Canónica en Helm**: El chart (`infra/helm/pokedex/templates/pgbouncer-deployment.yaml`) provee la plantilla de PgBouncer con `pool_mode = transaction` y aislamiento de red listo para alta concurrencia.
- **Perfil On-Premise Lean (Proxmox VE - ADR-030)**: Para optimizar memoria (< 150MB) en el clúster K3s mononodo, PgBouncer se mantiene como capacidad preparada pero **desactivada** (`pgbouncer.enabled: false`). La API utiliza el pool nativo de Node.js (`pg.Pool` con `max: 20` conexiones por pod = 40 totales), satisfaciendo plenamente la carga de producción actual sin sobrecosto de pods intermediarios.
- **Perfil Cloud-Ready (AWS EKS)**: Se activa bajo demanda para gestionar picos elásticos con HPA sin agotar conexiones en Amazon RDS.

### 5. Drizzle ORM como SSOT Exclusivo y Retiro Definitivo de `init.sql`

- **Drizzle ORM y sus migraciones versionadas son la única fuente de verdad (Single Source of Truth - SSOT)** para la definición, evolución y estructura de la base de datos PostgreSQL.
- **Retiro de `init.sql` en Docker Compose**: Se eliminó el archivo físico `infra/docker/postgres/init.sql` y su montaje en `docker-compose.yaml`. PostgreSQL arranca como motor limpio; al iniciar el backend, este aplica automáticamente las migraciones.
- **Retiro en Manifiestos de Kubernetes**: Se eliminó el template `postgres-init-configmap.yaml` y los montajes en `postgres-statefulset.yaml`. En su lugar, el `seed-job` oficial (Sync Wave 1) y el deployment de la API gestionan la evolución y siembra mediante código de la aplicación.
- **Siembra Canónica Idempotente**: El catálogo inicial de Pokémon se gestiona exclusivamente mediante `apps/backend/src/seed.ts` (ejecutable vía `npm run seed` o `task k8s:seed`), garantizando tipado estricto y prevención de re-siembra accidental en producción.

### 6. Migraciones Declarativas Versionadas y Fallback Resiliente Dual

- Las migraciones se definen de forma declarativa y versionada en `apps/backend/src/db/migrations/`, gestionadas mediante `drizzle-kit` y aplicadas a través de `apps/backend/src/db/migrate.ts` con control transaccional e idempotencia.
- En ausencia de PostgreSQL (ej. suites de pruebas unitarias o desarrollo desconectado), el servicio `apps/backend/src/services/db.ts` activa un fallback transparente en memoria (`memoryMap`) pre-poblado con los 1.008 Pokémon iniciales, emulando la secuencia de IDs (`inMemorySequence`) y sincronizando la salud del almacenamiento en `/version`.

## Consecuencias

### Positivas

- Inferencia estricta de tipos de punta a punta entre la base de datos PostgreSQL, la API Express y los contratos de TypeScript.
- Cero divergencia de esquemas (*zero schema drift*) al consolidar Drizzle como SSOT y erradicar scripts SQL estáticos paralelos.
- Mitigación absoluta de la saturación de conexiones en PostgreSQL ante picos de escalado de réplicas en Kubernetes gracias a PgBouncer.
- Consultas optimizadas con índices dedicados en atributos de alta cardinalidad combinados con la flexibilidad de JSONB para datos de combate y evoluciones.
- Cero condiciones de carrera en la asignación de IDs de Pokémon mediante secuencias atómicas nativas.
- Alta resiliencia operativa: la plataforma se degrada elegantemente a almacenamiento en memoria cuando la base de datos no está disponible.

### Compensaciones

- El uso de PgBouncer en modo transacción (`pool_mode = transaction`) restringe el uso de sentencias preparadas a nivel de sesión (`PREPARE` persistente entre transacciones) y variables de configuración de sesión (`SET SESSION`), requiriendo que todas las consultas sean transaccionalmente autocontenidas.
- La sincronización dual (PostgreSQL + Fallback en memoria) exige mantener la coherencia de la secuencia en ambos almacenes durante el ciclo de vida del proceso.

---

## Trazabilidad y Decisiones Consolidadas

- **ADR-029 (Database Schema Unification and init.sql Retirement)**: Absorbido íntegramente en esta decisión. ADR-029 formalizó el retiro de los scripts estáticos `init.sql` en Compose y el ConfigMap de Helm, estableciendo a Drizzle ORM y sus migraciones versionadas como la única fuente de verdad (SSOT) del esquema de base de datos.
