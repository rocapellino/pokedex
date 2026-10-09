/**
 * Metadata del catálogo de superficie de testing: suites de `tests/unit/` y `tests/security/app/`.
 */

import type { FileMetadata } from './metadata.js';

const BE = 'apps/backend/src';

export const BACKEND_FILE_METADATA: Record<string, FileMetadata> = {
  'tests/unit/admin_ip_allowlist.test.ts': {
    type: 'Unit',
    targetDomain: 'Backend / Lista Blanca de IP de Admin',
    targetArtifacts: [`${BE}/middleware/auth.ts`],
    description:
      'Verifica la lista blanca de IP de administración: coincidencia exacta y por CIDR (IPv4 e IPv6), normalización de IPv4 mapeada y loopback siempre permitido.',
  },
  'tests/unit/ai_security.test.ts': {
    type: 'Unit',
    targetDomain: 'Backend / Seguridad de IA',
    targetArtifacts: [`${BE}/validation/ai-security.ts`, `${BE}/services/ai-circuit-breaker.ts`],
    description:
      'Verifica la sanitización del HTML generado por IA (scripts, iframes, pseudo-protocolos) y el comportamiento del circuit breaker.',
  },
  'tests/unit/backend_lifecycle.test.ts': {
    type: 'Unit',
    targetDomain: 'Backend / Apagado Grácil',
    targetArtifacts: [`${BE}/utils/lifecycle.ts`, `${BE}/services/db.ts`],
    description: 'Verifica que closeStorage y setShuttingDownForTest gestionen el estado de apagado grácil.',
  },
  'tests/unit/classification_legendary.test.ts': {
    type: 'Unit',
    targetDomain: 'Catálogo / Clasificación Legendario y Mítico',
    targetArtifacts: [
      'scripts/generate-pokemon-catalog.ts',
      `${BE}/data/seed-catalog.ts`,
      `${BE}/controllers/pokemon-mapper.ts`,
    ],
    description:
      'Verifica el generador y el catálogo: classificationOf (el mítico prevalece), enriquecimiento del catálogo, validación y propagación del campo al backend.',
  },
  'tests/unit/compose_postgres_tls.test.ts': {
    type: 'Contract / Persistence',
    targetDomain: 'Docker Compose / TLS de PostgreSQL',
    targetArtifacts: ['docker-compose.yaml', `${BE}/services/postgres.ts`],
    description: 'Regresión: el API en Compose no debe exigir TLS a un PostgreSQL local que no lo ofrece.',
  },
  'tests/unit/error_helpers.test.ts': {
    type: 'Unit',
    targetDomain: 'Utilidades / Mensajes y Estados de Error',
    targetArtifacts: [`${BE}/utils/errors.ts`, 'apps/frontend/src/shared/errors.ts'],
    description:
      'Verifica errorMessage (backend y frontend) y errorStatus, que extrae el código HTTP solo si el error lo expone como número.',
  },
  'tests/unit/mega_evolution_catalog.test.ts': {
    type: 'Unit',
    targetDomain: 'Megaevoluciones / Catálogo',
    targetArtifacts: [`${BE}/data/seed-catalog.ts`, `${BE}/data/pokemon-catalog.full.json`],
    description:
      'Comprueba el catálogo de megaevoluciones: cobertura de PokeAPI, sin número de Pokédex propio, claves únicas y datos completos (arte, tipos, estadísticas).',
  },
  'tests/unit/mega_evolution_generator.test.ts': {
    type: 'Unit',
    targetDomain: 'Megaevoluciones / Generador',
    targetArtifacts: ['scripts/generate-pokemon-catalog.ts'],
    description:
      'Verifica el generador: reconocimiento de formas mega, nombres oficiales en español, calificativos desconocidos y slugs tratados como texto literal.',
  },
  'tests/unit/mega_evolution_mapper.test.ts': {
    type: 'Unit',
    targetDomain: 'Megaevoluciones / Mapper del Backend',
    targetArtifacts: [`${BE}/controllers/pokemon-mapper.ts`],
    description:
      'Verifica que las megaevoluciones sean de solo lectura: editar un Pokémon las conserva y un cuerpo del cliente no las crea ni las reemplaza.',
  },
  'tests/unit/mega_evolution_seed.test.ts': {
    type: 'Unit',
    targetDomain: 'Megaevoluciones / Siembra',
    targetArtifacts: [`${BE}/services/pokemon.repository.ts`, `${BE}/data/seed-catalog.ts`],
    description:
      'Verifica canonicalJson y planMegaEnrichment: solo actualiza filas existentes sin megaevoluciones o con datos cambiados, de forma idempotente.',
  },
  'tests/unit/mega_evolution_validation.test.ts': {
    type: 'Unit',
    targetDomain: 'Megaevoluciones / Validación de Payload',
    targetArtifacts: [`${BE}/validation/pokemon.ts`, `${BE}/validation/schemas.ts`],
    description:
      'Verifica la validación de megaevoluciones: forma válida, campo opcional, lista blanca de claves (mass assignment) y rechazo de datos mal formados.',
  },
  'tests/unit/migrate_baseline.test.ts': {
    type: 'Unit',
    targetDomain: 'Persistencia / Línea Base de Migraciones',
    targetArtifacts: [`${BE}/db/migrate.ts`],
    description:
      'Verifica la línea base de migraciones: no toca bases vacías o con journal, registra la migración inicial en esquemas heredados y falla sin escribir si el esquema difiere.',
  },
  'tests/unit/monolith_guardrails.test.ts': {
    type: 'Unit',
    targetDomain: 'Backend / Guardas de Monolito y Red',
    targetArtifacts: [`${BE}/validation/network-security.ts`],
    description:
      'Comprueba umbrales de LOC e imports de archivos clave (APPS-008), el desacople de network-security y las reglas anti-SSRF de IP e imágenes.',
  },
  'tests/unit/node_version_consistency.test.ts': {
    type: 'Contract / Release',
    targetDomain: 'Versión de Node',
    targetArtifacts: ['.nvmrc', 'package.json', 'apps/backend/Dockerfile'],
    description: 'Comprueba que .nvmrc, engines, Dockerfiles y workflows usen la misma versión mayor de Node.',
  },
  'tests/unit/pokemon_mapper.test.ts': {
    type: 'Unit',
    targetDomain: 'Backend / Mapper y Utilidades',
    targetArtifacts: [`${BE}/controllers/pokemon-mapper.ts`, `${BE}/utils/etag.ts`, `${BE}/utils/logger.ts`],
    description:
      'Verifica calculateETag, sanitizeLogString contra log injection y los mappers buildPokemonFromPayload y applyPokemonUpdates.',
  },
  'tests/unit/repo_tool_exec.test.ts': {
    type: 'Unit',
    targetDomain: 'Skills / Ejecución de Herramientas',
    targetArtifacts: [
      '.agents/skills/repo-tool-exec/scripts/tool-exec.ts',
      '.agents/skills/repo-tool-exec/references/tool-catalog.yaml',
    ],
    description:
      'Verifica repo-tool-exec: parseo del catálogo, comparación semver, detección local, ejecución en contenedor y validación de version_regex.',
  },
  'tests/unit/seed_catalog.test.ts': {
    type: 'Unit',
    targetDomain: 'Catálogo / Selección de Dataset de Siembra',
    targetArtifacts: [`${BE}/data/seed-catalog.ts`, `${BE}/data/initialPokemons.ts`],
    description:
      'Verifica SEED_DATASET (muestra o catálogo completo, valor desconocido falla) y que el catálogo completo tenga IDs contiguos y supere el validador del backend.',
  },
  'tests/unit/zod_resolution.test.ts': {
    type: 'Contract / Dependencies',
    targetDomain: 'Resolución de zod en el Monorepo',
    targetArtifacts: ['apps/backend/package.json', 'package.json'],
    description:
      'Comprueba que el backend resuelva zod 4 y que solo él lo importe, porque la raíz hoistea una copia de zod 3 (AUD-DEP-ZOD-001).',
  },
  'tests/security/app/backup_hmac.test.ts': {
    type: 'Security / Application',
    targetDomain: 'Copias de Seguridad / Integridad HMAC',
    targetArtifacts: ['scripts/lib/backup-integrity.ts', 'scripts/dr-drill.ts'],
    description:
      'Verifica el HMAC de los backups: detección de clave incorrecta y manipulación, derivación de clave, formato sha256sum e interoperabilidad con openssl.',
  },
  'tests/security/app/cors_rejection.test.ts': {
    type: 'Security / Application',
    targetDomain: 'API / Rechazo de Origen CORS',
    targetArtifacts: ['apps/backend/server.ts'],
    description:
      'Verifica que un origen no autorizado reciba 403 con código propio y no un error genérico (AUD-SEC-CORS-002).',
  },
  'tests/security/app/csrf_origin.test.ts': {
    type: 'Security / Application',
    targetDomain: 'API / CSRF en Mutaciones de Admin',
    targetArtifacts: [`${BE}/middleware/auth.ts`],
    description:
      'Verifica la validación de Origin y Referer en mutaciones autenticadas por cookie: rechaza subcadenas y ausencia de ambos, acepta el mismo host (AUD-SEC-CSRF-001).',
  },
  'tests/security/app/http_hardening.test.ts': {
    type: 'Security / Application',
    targetDomain: 'API / Endurecimiento HTTP',
    targetArtifacts: ['apps/backend/server.ts'],
    description:
      'Verifica X-XSS-Protection desactivado con CSP presente y que el fallback SPA consuma un solo cupo del limitador global.',
  },
  'tests/security/app/metrics_auth.test.ts': {
    type: 'Security / Application',
    targetDomain: 'API / Autenticación de /metrics',
    targetArtifacts: [`${BE}/middleware/metrics-auth.ts`, `${BE}/config/startup-env-check.ts`],
    description:
      'Verifica que /metrics exija el token Bearer (401 sin credenciales o con token incorrecto), lo acepte si es correcto y no afecte a /healthz ni /readyz (AUD-SEC-OBS-001).',
  },
  'tests/security/app/nginx_effective_headers.test.ts': {
    type: 'Security / Application',
    targetDomain: 'Nginx / Cabeceras Efectivas',
    targetArtifacts: ['apps/frontend/nginx.conf.template', 'apps/frontend/nginx.conf'],
    description:
      'Comprueba la seguridad de nginx: cabeceras efectivas (nivel server, herencia de add_header por location, ocultamiento del upstream), valores de COOP y CORP, CSP sin unsafe-inline en style-src y sin allowlists RFC 1918 masivas.',
  },
};
