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

    const isProduction = process.env.NODE_ENV === 'production';
    const forceSeedRaw = (process.env.FORCE_SEED || '').trim();
    const isForceSeedRequested = forceSeedRaw === 'true' || forceSeedRaw === '1' || forceSeedRaw === 'OVERRIDE_PRODUCTION_CONFIRMED';

    if (total >= initialPokemons.length) {
      if (!isForceSeedRequested) {
        console.log('✅ [Seed Job] El catálogo ya se encuentra completo y sincronizado. No se requieren cambios.');
        process.exit(0);
      }

      // En entornos de producción se requiere la confirmación explícita para evitar sobreescrituras accidentales
      if (isProduction && forceSeedRaw !== 'OVERRIDE_PRODUCTION_CONFIRMED') {
        console.warn('⚠️ [Seed Job: Seguridad] FORCE_SEED bloqueado en producción: no se permite reactivación accidental con true/1.');
        console.warn('⚠️ [Seed Job: Seguridad] Para forzar la resiembra deliberada en producción configure FORCE_SEED="OVERRIDE_PRODUCTION_CONFIRMED".');
        process.exit(0);
      }

      console.warn('⚠️ [Seed Job: Advertencia] FORCE_SEED activado explícitamente: se sincronizarán y actualizarán los registros del catálogo base.');
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
