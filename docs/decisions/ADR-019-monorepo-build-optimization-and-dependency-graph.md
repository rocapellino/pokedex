# ADR-019: Optimización de Build en Monorepo, Grafo de Dependencias y Caché Declarativo con Turborepo

## Estado

Aceptado

## Contexto

El repositorio Pokédex está estructurado como un monorepo modular que aloja múltiples paquetes interconectados: `@pokedex/backend` (API Node.js/Express, Drizzle ORM, OpenTelemetry, Pino) y `@pokedex/frontend` (Single Page Application con Vite, Vanilla TypeScript, DOMPurify, CSS modular).

Previamente, la orquestación del ciclo de vida de compilación, verificación de tipos y análisis estático se gestionaba mediante scripts iterativos en `package.json` utilizando las capacidades nativas de npm workspaces (`npm run build --workspace=@pokedex/backend && npm run build --workspace=@pokedex/frontend`).

Si bien este enfoque inicial ofrece simplicidad, presenta limitaciones severas en pipelines de CI/CD y flujos de desarrollo local a medida que el proyecto escala:

1. **Ausencia de Grafo de Dependencias Dirigido (DAG)**: Las tareas se ejecutaban de forma secuencial y ciega, sin modelar formalmente la topología de dependencias entre paquetes (`dependsOn: ["^build"]`).
2. **Re-ejecución Redundante y Falta de Caché de Artefactos**: Cada invocación de `npm run build` o validación completa compilaba nuevamente ambos paquetes (re-empaquetando `esbuild` y `vite build`), incluso cuando ningún archivo fuente ni dependencia había cambiado.
3. **Penalización en Tiempos de CI**: En GitHub Actions, la ausencia de hash fingerprinting sobre inputs (`src/**`, `tsconfig.json`, variables de entorno) incrementaba los tiempos de pipeline innecesariamente.

## Decisión

Se adopta **Turborepo 2.x** como motor de orquestación de build, modelado de grafo de dependencias y sistema de almacenamiento en caché declarativo, articulado en conjunto con **Taskfile** y los workspaces nativos de Node.js/npm.

### 1. Manifiesto Declarativo `turbo.json`

Se define `turbo.json` en la raíz del repositorio alineado con el esquema oficial (`https://turbo.build/schema.json`):

- **Pipeline de `build`**: Configurado con `dependsOn: ["^build"]`, invalidación reactiva basada en inputs (`$TURBO_DEFAULT$`, `.env*`) y preservación de salidas inmutables en `dist/**`.
- **Pipeline de `lint` y `typecheck`**: Ejecución en paralelo sobre todos los paquetes con caché determinista de inputs de código fuente.
- **Pipeline de `dev`**: Marcado explícitamente con `cache: false` y `persistent: true` para servidores de desarrollo reactivos.

### 2. Estandarización de Contratos de Workspaces

Se alinean los scripts de ciclo de vida en `apps/backend/package.json` y `apps/frontend/package.json`:

- Ambos paquetes declaran formalmente sus tareas canónicas: `build`, `lint` y `typecheck` (`tsc --noEmit`).
- El `package.json` raíz especifica `packageManager: "npm@11.17.0"` para permitir a Turborepo resolver el grafo de workspaces sin ambigüedad.

### 3. Sinergia con Taskfile y Aislamiento de Caché

- Se amplía `Taskfile.yml` con tareas especializadas: `task turbo:build`, `task turbo:lint`, `task turbo:typecheck` y `task turbo:clean`.
- Se incorpora `.turbo/` en `.gitignore` para impedir que la caché local de hashes y logs sea versionada accidentalmente.

## Consecuencias

### Positivas

- **Aceleración Extrema (FULL TURBO)**: Cuando los inputs no se han modificado, las tareas se resuelven en menos de 100ms mediante recuperación directa de caché local.
- **Paralelismo Seguro**: Turborepo analiza el grafo de dependencias y maximiza la concurrencia de compilación y análisis sin condiciones de carrera.
- **Trazabilidad y Reproducibilidad**: Cada ejecución genera un hash criptográfico de entradas (archivos, dependencias, variables), garantizando builds deterministas.

### Negativas / Mitigaciones

- **Dependencia de Herramienta Adicional**: Introduce la dependencia de desarrollo `turbo`. *Mitigación*: Se fija en `devDependencies` y se mantiene la compatibilidad de ejecución directa con los comandos estándar de npm en `package.json` (`npm run build`).
