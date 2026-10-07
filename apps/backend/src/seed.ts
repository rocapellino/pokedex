// ==============================================================================
// Script CLI de Siembra Masiva del Catálogo Pokédex (K8s Job / DevOps Tooling)
// ==============================================================================
import {
  loadSeedCatalog,
  planClassificationEnrichment,
  planMegaEnrichment,
  planSeed,
  resolveSeedDataset,
} from './data/seed-catalog.js';
import {
  initStorage,
  savePokemon,
  getStorageHealth,
  listPersistedClassifications,
  listPersistedMegaEvolutions,
  listPersistedPokemonIds,
  setPokemonClassification,
  setPokemonMegaEvolutions,
  syncPokedexIdSequence,
} from './services/db.js';
import { errorMessage } from './utils/errors.js';

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

    console.log(
      `📡 [Seed Job] Modo de almacenamiento activo: ${health.database.toUpperCase()} (PG conectado: ${health.postgres_connected})`,
    );

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
      console.warn(
        '⚠️ [Seed Job: Advertencia] FORCE_SEED activado explícitamente: se reescribirán los registros del catálogo base.',
      );
    }

    // 3. Enriquecer filas existentes con megaevoluciones y clasificación (legendario/mítico): solo esos
    // campos, sin pisar ediciones. Con force-sync el catálogo completo se reescribe en el paso 4.
    const enrichment =
      plan.mode === 'force-sync' ? [] : planMegaEnrichment(catalog, await listPersistedMegaEvolutions(), existingIds);
    const classification =
      plan.mode === 'force-sync'
        ? []
        : planClassificationEnrichment(catalog, await listPersistedClassifications(), existingIds);

    if (plan.toSeed.length === 0 && enrichment.length === 0 && classification.length === 0) {
      console.log('✅ [Seed Job] El catálogo ya se encuentra completo. No se requieren cambios.');
      process.exit(0);
    }

    // 4. Sembrar (insertar faltantes o reescribir con FORCE_SEED)
    let count = 0;
    if (plan.toSeed.length > 0) {
      console.log(
        `🚀 [Seed Job] Sembrando ${plan.toSeed.length} entradas (${plan.mode}) en almacenamiento persistente...`,
      );
      for (const p of plan.toSeed) {
        await savePokemon(p);
        count++;
        if (count % 200 === 0 || count === plan.toSeed.length) {
          console.log(`⏳ [Seed Job] Progreso: ${count}/${plan.toSeed.length} Pokémon procesados...`);
        }
      }
    }

    // 5. Aplicar el enriquecimiento de megaevoluciones sobre las filas existentes
    let enriched = 0;
    for (const item of enrichment) {
      if (await setPokemonMegaEvolutions(item.id, item.megaevoluciones)) enriched++;
    }
    if (enrichment.length > 0) {
      console.log(
        `🧬 [Seed Job] Megaevoluciones aplicadas a ${enriched} de ${enrichment.length} Pokémon existentes (ediciones conservadas).`,
      );
    }

    // 5b. Aplicar la clasificación sobre las filas existentes
    let classified = 0;
    for (const item of classification) {
      if (await setPokemonClassification(item.id, item.clasificacion)) classified++;
    }
    if (classification.length > 0) {
      console.log(
        `🌟 [Seed Job] Clasificación legendario/mítico aplicada a ${classified} de ${classification.length} Pokémon existentes (ediciones conservadas).`,
      );
    }

    // 6. Alinear la secuencia de IDs con los IDs explícitos recién sembrados
    await syncPokedexIdSequence();

    console.log(
      `🎉 [Seed Job] ¡Siembra finalizada con éxito! Pokémon sembrados: ${count}; enriquecidos con megaevoluciones: ${enriched}; clasificados: ${classified}.`,
    );
    process.exit(0);
  } catch (err) {
    console.error('❌ [Seed Job] Error fatal durante la siembra:', errorMessage(err));
    process.exit(1);
  }
}

void main();
