// ==============================================================================
// Script CLI de Siembra Masiva del Catálogo Pokédex (K8s Job / DevOps Tooling)
// ==============================================================================
import { initialPokemons } from './data/initialPokemons.js';
import { initStorage, savePokemon, getAllPokemons, getStorageHealth } from './services/db.js';

async function main() {
  console.log('🌱 [Seed Job] Iniciando verificación y siembra de catálogo Pokémon...');
  console.log(`📦 [Seed Job] Catálogo base disponible: ${initialPokemons.length} Pokémon.`);

  try {
    // 1. Inicializar conexiones a PostgreSQL y Redis
    await initStorage();
    const health = getStorageHealth();

    console.log(`📡 [Seed Job] Modo de almacenamiento activo: ${health.database.toUpperCase()} (PG conectado: ${health.postgres_connected})`);

    // 2. Verificar estado actual del catálogo
    const { total } = await getAllPokemons({ limit: 1, offset: 0 });
    console.log(`📊 [Seed Job] Registros actualmente en base de datos: ${total}.`);

    if (total >= initialPokemons.length && !process.env.FORCE_SEED) {
      console.log('✅ [Seed Job] El catálogo ya se encuentra completo y sincronizado. No se requieren cambios.');
      process.exit(0);
    }

    console.log(`🚀 [Seed Job] Sembrando/sincronizando ${initialPokemons.length} entradas en almacenamiento persistente...`);
    let count = 0;
    for (const p of initialPokemons) {
      await savePokemon(p);
      count++;
      if (count % 200 === 0 || count === initialPokemons.length) {
        console.log(`⏳ [Seed Job] Progreso: ${count}/${initialPokemons.length} Pokémon procesados...`);
      }
    }

    console.log(`🎉 [Seed Job] ¡Siembra finalizada con éxito! Total de Pokémon registrados: ${count}.`);
    process.exit(0);
  } catch (err: any) {
    console.error('❌ [Seed Job] Error fatal durante la siembra:', err?.message || err);
    process.exit(1);
  }
}

main();
