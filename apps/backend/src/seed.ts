// ==============================================================================
// Script CLI de Siembra Masiva del Catálogo Pokédex (K8s Job / DevOps Tooling)
// ==============================================================================
import { loadSeedCatalog, planSeed, resolveSeedDataset } from './data/seed-catalog.js';
import {
  initStorage,
  savePokemon,
  getStorageHealth,
  listPersistedPokemonIds,
  syncPokedexIdSequence,
} from './services/db.js';

async function main() {
  console.log('🌱 [Seed Job] Iniciando verificación y siembra de catálogo Pokémon...');

  try {
    // 0. Seleccionar el dataset (ADR-030): `sample` por defecto, `full` en pre-prod y prod
    const dataset = resolveSeedDataset(process.env.SEED_DATASET);
    const catalog = loadSeedCatalog(dataset);
    console.log(`📦 [Seed Job] Dataset '${dataset}': ${catalog.length} Pokémon.`);

    // 1. Inicializar conexiones a PostgreSQL y Redis
    await initStorage();
    const health = getStorageHealth();

    console.log(`📡 [Seed Job] Modo de almacenamiento activo: ${health.database.toUpperCase()} (PG conectado: ${health.postgres_connected})`);

    // 2. Comparar el catálogo con los IDs ya persistidos
    const existingIds = await listPersistedPokemonIds();
    console.log(`📊 [Seed Job] Registros actualmente en base de datos: ${existingIds.size}.`);

    const plan = planSeed(catalog, existingIds, {
      forceSeed: process.env.FORCE_SEED,
      isProduction: process.env.NODE_ENV === 'production',
    });
    if (plan.blockedForce) {
      console.warn(`⚠️ [Seed Job: Seguridad] ${plan.blockedForce}`);
    }
    if (plan.mode === 'force-sync') {
      console.warn('⚠️ [Seed Job: Advertencia] FORCE_SEED activado explícitamente: se reescribirán los registros del catálogo base.');
    }

    if (plan.toSeed.length === 0) {
      console.log('✅ [Seed Job] El catálogo ya se encuentra completo. No se requieren cambios.');
      process.exit(0);
    }

    // 3. Sembrar (insertar faltantes o reescribir con FORCE_SEED)
    console.log(`🚀 [Seed Job] Sembrando ${plan.toSeed.length} entradas (${plan.mode}) en almacenamiento persistente...`);
    let count = 0;
    for (const p of plan.toSeed) {
      await savePokemon(p);
      count++;
      if (count % 200 === 0 || count === plan.toSeed.length) {
        console.log(`⏳ [Seed Job] Progreso: ${count}/${plan.toSeed.length} Pokémon procesados...`);
      }
    }

    // 4. Alinear la secuencia de IDs con los IDs explícitos recién sembrados
    await syncPokedexIdSequence();

    console.log(`🎉 [Seed Job] ¡Siembra finalizada con éxito! Pokémon sembrados: ${count}.`);
    process.exit(0);
  } catch (err: any) {
    console.error('❌ [Seed Job] Error fatal durante la siembra:', err?.message || err);
    process.exit(1);
  }
}

void main();
