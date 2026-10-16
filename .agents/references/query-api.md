# Guía Contrastiva: Contratos de API, Tipado y Límites de Runtime

## 1. Por qué importa (Why It Matters)

La frontera entre el backend (Node.js 24 LTS / Express) y el frontend (Vite / MPA) requiere contratos estructurales inmutables para erradicar el *API drift* y garantizar interoperabilidad sin recompilaciones acopladas. Por gobernanza de dependencias (`AUD-DEP-ZOD-001`), la raíz del monorepo aloja Zod 3 (heredado por Lighthouse CI), mientras que el backend opera con Zod 4. Importar librerías de validación en `@pokedex/contracts` quiebra la resolución determinista del gestor de paquetes. Por ello, `@pokedex/contracts` debe contener **estrictamente tipos puros de TypeScript**, y toda validación runtime debe ocurrir dentro de `apps/backend/` bajo arquitectura *Fail-Closed* (ADR-027).

---

## 2. Incorrecto (Incorrect)

```typescript
// ❌ ANTIPATRÓN: Duplicación manual de tipos e importación de Zod en contratos compartidos

// En packages/contracts/src/pokemon.ts:
import { z } from 'zod'; // Prohibido por AUD-DEP-ZOD-001 (conflicto de versiones monorepo)
export const PokemonSchema = z.object({ id: z.number(), name: z.string() });

// En apps/frontend/src/types.ts:
// Duplicar interfaces manualmente copiando y pegando desde backend genera drift
export interface PokemonLocal {
  id: number;
  nombre: string; // Inconsistente con el payload real de la API
}

// En endpoint: Fail-open silenciando errores
app.post('/api/v1/pokemon', async (req, res) => {
  try {
    await savePokemon(req.body);
  } catch (err) {
    // ❌ Fail-open: responder con 200 OK y mensaje falso oculta caídas de infraestructura
    res.status(200).json({ success: false, error: 'ignored' });
  }
});
```

---

## 3. Correcto (Correct)

```typescript
// ✅ PATRÓN CANÓNICO: Tipos puros en @pokedex/contracts y validación Fail-Closed

// 1. En packages/contracts/src/pokemon.ts (TypeScript puro, sin dependencias runtime):
export interface Pokemon {
  id: number;
  name: string;
  types: string[];
  hp: number;
  attack: number;
  defense: number;
}
export type PokemonListResponse = {
  data: Pokemon[];
  total: number;
};

// 2. En apps/backend/src/routes/pokemon.ts (Zod 4 aislado en backend):
import type { Pokemon, PokemonListResponse } from '@pokedex/contracts';
import { z } from 'zod';

const CreatePokemonDto = z.object({
  name: z.string().min(1),
  hp: z.number().int().positive(),
});

app.post('/api/v1/pokemon', async (req, res, next) => {
  try {
    const validated = CreatePokemonDto.parse(req.body);
    const created: Pokemon = await service.create(validated);
    res.status(201).json(created);
  } catch (err) {
    // ✅ Fail-closed estricto: denegación inmediata ante fallos
    next(err);
  }
});
```

---

## 4. Referencias

- [ADR-020: Gobernanza Unificada de Despliegue](../../docs/decisions/ADR-020-unified-deployment-governance-and-script-retirement.md)
- [ADR-027: Arquitectura Fail-Closed y Anti-Fuerza Bruta](../../docs/decisions/ADR-027-resilience-fail-open-vs-fail-closed-contracts.md)
- [Contrato de Resolución Zod](../../tests/unit/zod_resolution.test.ts)
