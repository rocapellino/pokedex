# Detección de Monolitos, God Files y Antipatrones Estructurales

Este documento establece los criterios y heurísticas para detectar puntos de centralización desmedida en el código fuente de `rocapellino/pokedex`.

---

## 1. Detección de "God File"

Un *God File* es un archivo que asume excesivas responsabilidades y se convierte en el epicentro de modificaciones del sistema.

### Señales Primarias de Alerta

1. **Acumulación de capas:** El archivo contiene lógica de transporte HTTP, parsing de parámetros, validación de esquemas, consultas a bases de datos, llamadas a servicios externos de IA o logging de métricas simultáneamente.
2. **Volumen de importaciones dispares:** Más de 12-15 dependencias salientes importadas de dominios completamente ajenos (ej. `express`, `pg`, `ioredis`, `@google/genai`, `zod`, `crypto`, `fs`).
3. **Múltiples razones para cambiar (Violación de SRP):** Si cambios de UI, cambios en el esquema de base de datos, cambios de autenticación y cambios en el proveedor de LLM requieren modificar el mismo archivo, es un God File.
4. **Estado mutable global o compartido:** Mantiene variables a nivel de módulo que almacenan clientes, cachés, secuencias y flags de ciclo de vida sin encapsulación.

### Ejemplo de Referencia: `server.ts` Histórico vs. Actual

- **Antiguo `server.ts` (~1.178 LOC) [GOD FILE]:**
  - Manejaba inicialización de Express.
  - Definía endpoints de Pokemons, Auth, Gemini AI, Health y Metrics.
  - Ejecutaba queries directas con PostgreSQL y Redis.
  - Implementaba rate limiting en memoria y algoritmos de sesión.
  - Resultado: Fragilidad extrema; cualquier cambio corría riesgo de romper el servidor entero.
- **`server.ts` Actual (~280 LOC) [ESTRUCTURA SALUDABLE]:**
  - Actúa estrictamente como ensamblador de la aplicación (*composition root*).
  - Configura middlewares globales (`requestTracer`, `cors`, `helmet`/security headers).
  - Monta enrutadores modulares (`authRouter`, `pokemonsRouter`, `aiRouter`, `healthRouter`).
  - Gestiona graceful shutdown delegando en `src/utils/lifecycle.js`.

---

## 2. Detección de "God Class" y "God Object"

Aplica a clases o instancias únicas (*singletons*) que acumulan métodos no relacionados:

- **Síntomas:**
  - Clase con más de 15-20 métodos públicos heterogéneos.
  - Mezcla de métodos de negocio, métodos de persistencia y métodos de presentación en la misma clase.
  - Dependencia masiva en el constructor (inyección de más de 5-6 servicios independientes).
  - Dificultad para escribir mocks o pruebas unitarias sin levantar el entorno completo.

---

## 3. Detección de "God Module"

Un módulo o paquete (por ejemplo, todo `src/services/db.ts` si acumula demasiados motores) que actúa como embudo de toda la persistencia:

- **Síntomas:**
  - Mezcla de PostgreSQL con Drizzle, cliente de Redis para caché, fallback en memoria sincrónico y lógica de inicialización en el mismo módulo.
  - Exposición de funciones de alto nivel de negocio combinadas con primitivas de conexión de bajo nivel (`connectPg`, `connectRedis`, `getStorageHealth`).
- **Tratamiento recomendado:**
  - Desacoplar la infraestructura de conexión (`connection-pool.ts`, `redis-client.ts`) del repositorio de dominio (`pokemon.repository.ts`).

---

## 4. Auditoría de Carpetas Cajón de Sastre (`utils/`, `helpers/`, `common/`)

Las carpetas utilitarias no deben ser condenadas por su nombre, sino analizadas por su contenido y cohesión real.

### Criterios de Evaluación

```text
                  ¿La función es pura y determinista?
                         │               │
                        YES              NO
                         │               │
                         ▼               ▼
                 ¿Depende de I/O,    ¿Es un helper
                  BD o red?           de dominio?
                   │      │            │       │
                  YES     NO          YES      NO
                   │      │            │       │
                   ▼      ▼            ▼       ▼
                Mover a  VÁLIDO     Mover a  Refactorizar
               Servicios  (Util)   Dominio   o extraer
```

- **Utilidades Válidas:**
  - Funciones puras (sin efectos secundarios, sin I/O).
  - Helpers genéricos reutilizables en cualquier parte (formateo de cadenas, cálculo matemático de paginación, manipulación de fechas, constructores de `Result<T, E>`).
- **Degradación Estructural (Cajón de sastre):**
  - Archivos que importan clientes de base de datos o llamadas a red.
  - Funciones que contienen lógica de negocio central (ej. `calculatePokemonDamage` dentro de `utils/general.ts` en lugar de un servicio de dominio).
  - Variables con estado mutable global dentro de utilitarios.

---

## 5. Detección de Monolito Trasladado (*Monolith Relocated*)

Un riesgo frecuente en refactorizaciones apresuradas es trasladar el código sin dividirlo:

### Patrón del Antipatrón

1. El auditor o el linter advierte que `archivoA.ts` tiene 1.000 líneas.
2. El desarrollador corta 750 líneas de `archivoA.ts` y las pega en `archivoB.ts`.
3. `archivoA.ts` queda en 250 líneas y parece limpio a primera vista.
4. `archivoB.ts` hereda exactamente la misma mezcla de capas y acoplamiento, solo que con un nombre distinto.

### Heurística de Detección

- Al evaluar una reducción significativa en un archivo:
  1. Identificar si en el mismo commit o hito apareció un nuevo archivo de gran volumen.
  2. Comparar el grafo de imports y dependencias de la nueva pieza.
  3. Si la nueva pieza no dividió las responsabilidades entre dominios cohesivos, reportar el hallazgo como:
     > **"Monolith Relocated: La complejidad fue desplazada pero no modularizada."**
