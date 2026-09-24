# Acoplamiento, Cohesión y Separación de Capas

Este documento describe los principios arquitectónicos para mantener bajo acoplamiento, alta cohesión y una delimitación limpia de responsabilidades en `rocapellino/pokedex`.

---

## 1. Separación Canónica de Capas

En el backend y frontend de la plataforma, el flujo de llamadas y dependencias debe ser estrictamente unidireccional:

```text
┌────────────────────────────────────────────────────────┐
│               Capa de Transporte / HTTP                │
│  (src/routes/*.ts, src/middleware/*.ts, Express app)   │
└───────────────────────────┬────────────────────────────┘
                            │  invoca servicios / DTOs
                            ▼
┌────────────────────────────────────────────────────────┐
│               Capa de Aplicación / Dominio             │
│        (src/services/*.ts, validadores de negocio)     │
└───────────────────────────┬────────────────────────────┘
                            │  invoca repositorios / clientes
                            ▼
┌────────────────────────────────────────────────────────┐
│             Capa de Infraestructura & Datos            │
│  (src/db/*.ts, Drizzle ORM, Redis, Gemini AI, Red)     │
└────────────────────────────────────────────────────────┘
```

### Reglas de Dirección de Dependencias

1. Las capas superiores dependen de las capas inferiores o de interfaces/contratos abstractos.
2. Las capas inferiores **NUNCA** dependen de capas superiores:
   - `src/db/` no puede importar nada de `src/routes/` o `src/services/`.
   - `src/services/` no puede importar objetos de petición o respuesta de Express (`Request`, `Response`, `NextFunction`).
3. **Prohibición de Bypass de Capas:**
   - Un enrutador HTTP (`src/routes/pokemons.ts`) **no debe** ejecutar consultas directas SQL con `pgPool.query()` o Drizzle `db.select()`. Debe invocar funciones expuestas por la capa de servicio/repositorio.

---

## 2. Tipología de Cohesión

Para clasificar la calidad interna de los módulos, se emplea la escala clásica de cohesión:

| Tipo de Cohesión | Calificación | Descripción | Ejemplo en Pokédex |
| :--- | :---: | :--- | :--- |
| **Funcional** | **ÓPTIMA** | Todas las partes colaboran para realizar una única tarea bien definida. | `sanitizer.ts`: Funciones puras orientadas exclusivamente a desinfectar strings y HTML. |
| **Secuencial** | **BUENA** | La salida de una función es la entrada de la siguiente en un pipeline. | Cadena de middleware: `requestTracer` → `rateLimiter` → `auth`. |
| **Comunicacional** | **ACEPTABLE** | Múltiples funciones que operan sobre la misma estructura de datos central. | `pokemons.repository.ts`: Funciones que leen y escriben registros del esquema `pokedexEntries`. |
| **Lógica** | **DEFICIENTE** | Funciones agrupadas porque realizan tareas vagamente similares pero disjuntas. | Un archivo `validators.ts` que valida emails de usuarios, payloads de Pokémon y firmas de webhooks. |
| **Coincidente** | **ANTIPATRÓN** | Funciones agrupadas arbitrariamente sin ninguna relación lógica ni de datos. | Un archivo `helpers.ts` con cálculo matemático, formateo de fechas y envío de emails. |

---

## 3. Antipatrones Críticos de Acoplamiento

### A. Fuga de Abstracción (*Abstraction Leakage*)

- Ocurre cuando detalles internos de la base de datos (nombres de columnas físicas, tipos de error de Postgres con códigos `23505`) se propagan sin transformar hasta el cliente HTTP en la respuesta JSON.
- **Solución:** Mapear en la capa de servicio a tipos de dominio claros y códigos de estado semánticos (`400 Bad Request`, `409 Conflict`, `422 Unprocessable Entity`).

### B. Acoplamiento a Frameworks en el Dominio

- Ocurre cuando la lógica de cálculo o validación recibe directamente `req: Request` de Express o muta `res.locals`.
- **Solución:** Los servicios deben recibir parámetros primitivos tipados o DTOs (Data Transfer Objects), permitiendo que la lógica pueda ser testeada sin simular objetos complejos de Express.

### C. Dependencias Circulares Ocultas

- Ocurre cuando dos módulos se importan mutuamente:

  ```text
  routes/auth.ts  ───────►  services/auth.ts
        ▲                         │
        │                         │
        └─────────────────────────┘
  ```

- En Node.js con módulos ESM, esto provoca que una de las exportaciones se evalúe como `undefined` durante el arranque o en entornos de prueba aislados.

---

## 4. Estrategias de Desacoplamiento Seguro

1. **Inversión de Control Ligera:** Pasar dependencias como parámetros en fábricas de funciones en lugar de instanciar clientes globales dentro de cada función.
2. **Uso del Patrón Result:** Adoptar estructuras como `Result<T, E>` (ver [`src/utils/result.js`](../../apps/backend/src/utils/result.js)) para comunicar errores de forma determinista sin arrojar excepciones descontroladas que rompan el call stack.
3. **Contratos Claros de DTO:** Definir esquemas con Zod en la capa de validación para garantizar que únicamente datos desinfectados y con tipos validados ingresen a los servicios de dominio.
