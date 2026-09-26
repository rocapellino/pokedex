# ADR-023: Adopción del Compilador Nativo TypeScript 7.x

| Campo       | Valor                        |
|-------------|------------------------------|
| **Estado**  | Aceptado                     |
| **Fecha**   | 2026-09-14                   |
| **Autores** | Rodrigo Capellino            |
| **Tags**    | build, toolchain, typescript |

---

## Contexto

El proyecto utiliza un monorepo con dos workspaces (`@pokedex/backend`, `@pokedex/frontend`) y tipado estricto en todo el código TypeScript. El compilador oficial de TypeScript (versión 5.x) está implementado en JavaScript/Node.js, lo que limita su performance en proyectos con alto volumen de tipos y chequeos estrictos.

A partir de la versión 7.x, el equipo de TypeScript lanzó un port nativo del compilador en Go (`typescript@7.x`), que promete mejoras de velocidad de compilación de hasta 10× en monorepos. Dado que el proyecto CI/CD ejecuta `tsc --noEmit` en cada PR y branch, la performance del compilador impacta directamente en el tiempo de feedback de los desarrolladores.

En el análisis de auditoría de sept. 2026 (HAL-6) se identificó que `typescript: ~7.0.2` estaba en `package-lock.json` pero no estaba documentado como decisión explícita, generando ambigüedad operativa dado que toda la documentación del proyecto (README, ADRs anteriores, TOOLS_AND_TECH_STACK.md) referenciaba "TypeScript 5.7+".

---

## Decisión

Se adopta **TypeScript `~7.0.2`** (compilador nativo Go/port) como compilador de TypeScript del monorepo, fijado con `~` para recibir parches sin saltar a versiones menores potencialmente disruptivas.

La versión se pina en `package.json` raíz y en `apps/backend/package.json`:

```json
"typescript": "~7.0.2"
```

---

## Motivaciones

1. **Performance de build**: El compilador nativo reduce el tiempo de `tsc --noEmit` en entornos CI. Con el volumen de tipos estrictos del proyecto (zod schemas, drizzle, express types), la mejora es materialmente relevante.
2. **Adopción proactiva de roadmap oficial**: TypeScript 7.x es la dirección oficial del equipo de Microsoft/TypeScript. Adoptar temprano permite detectar incompatibilidades antes de que sean blockers en una migración forzada.
3. **Compatibilidad de API de tipos**: Según las pruebas realizadas, el compilador 7.x es compatible con el subset de features de TypeScript utilizado en el proyecto (generics, conditional types, mapped types, template literal types).

---

## Riesgos Asumidos

| Riesgo | Severidad | Mitigación |
| -------- | ----------- | ------------ |
| Comportamiento de tipos no completamente estabilizado respecto a tsc 5.x | Media | Pinning `~7.0.2`, CI con `tsc --noEmit` en cada PR |
| Posibles diferencias en mensajes de error / diagnósticos | Baja | No impacta runtime, solo developer experience |
| Incompatibilidad con plugins/transformers que asumen API de tsc 5.x | Media | Revisar changelog en cada upgrade de patch |
| Soporte de IDEs puede rezagarse respecto al compilador nativo | Baja | Language Service usa la versión de typescript del node_modules |

---

## Salvaguardas

- **Pinning estricto con `~`**: Solo se aceptan actualizaciones de patch (`~7.0.x`), no de minor o major.
- **CI obligatorio**: `npm run lint` incluye `tsc --noEmit` en cada PR. Cualquier regresión de tipos es un error de CI.
- **`@types/node` alineado con runtime**: Se usa `@types/node: "^22.x"` (runtime real del backend Node 22 LTS) para evitar divergencia de tipos vs. runtime de producción.

---

## Estrategia de Escape

Si se detectan regresiones de tipos no aceptables con `~7.0.x`:

1. Abrir issue en <https://github.com/microsoft/TypeScript> con reproducción mínima.
2. Bajar a la última versión estable de TypeScript 5.x: `"typescript": "~5.7.0"`.
3. Actualizar este ADR con el motivo del rollback y la fecha.

---

## Consecuencias

- **Documentación**: README, ADRs previos y `TOOLS_AND_TECH_STACK.md` deben actualizarse para reflejar "TypeScript 7.x" en lugar de "TypeScript 5.7+".
- **Onboarding**: Los nuevos colaboradores deben ser informados de que el proyecto usa el compilador nativo experimental.
- **Dependencias**: Herramientas que dependen de `typescript` como peer dependency deben verificar compatibilidad con la serie 7.x.

---

## Referencias

- [TypeScript Native Port Announcement](https://devblogs.microsoft.com/typescript/)
- [HAL-6 — Auditoría de seguridad y calidad, sept. 2026]
- [ADR-019 — Monorepo Build Optimization](./ADR-019-monorepo-build-optimization-and-dependency-graph.md)
- [ADR-008 — Supply Chain Security](./ADR-008-supply-chain-security.md)
