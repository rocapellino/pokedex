---
name: repo-audit
description: Fase 1 (Auditar) del ciclo de vida, read-only: modos quick, full y delta. Usar cuando se pida analizar, auditar o diagnosticar el repositorio, o antes de planificar trabajo sin hallazgos previos.
---

# repo-audit

## Objetivo

Ejecutar auditorías técnicas integrales, estrictamente de sólo lectura, para evaluar el estado de salud, seguridad, consistencia arquitectónica y mantenibilidad general de `rocapellino/pokedex`.

## Alcance y Verificaciones de Dominio

- **Arquitectura y Stack:** Detección de desviaciones entre la arquitectura documentada y la ejecutada en el monorepo.
- **Calidad de Código y Aplicación:** Buenas prácticas en API Express, Vanilla TS/Vite, migraciones Drizzle y esquemas de persistencia.
- **Superficie de Seguridad:** Secretos en código o historial, políticas RBAC, NetworkPolicies, permisos en CI/CD y contratos de External Secrets.
- **Supply Chain e Integridad:** Pinning de imágenes por digest SHA256 inmutable, firmas Cosign, atestaciones SLSA y escaneos de dependencias.
- **Higiene del Repositorio y Configuración:** Detección de dependencias no utilizadas, overrides dudosos en `package.json`, scripts no autorizados (ADR-020), documentación desactualizada y auditoría de archivos de exclusión (`*.ignore`) mediante el dominio `configuration-hygiene` de `repo-lifecycle`.
- **Resiliencia y Confiabilidad:** Verificación de planes de backup (local / Google Drive / NAS), SLAs, RPO/RTO y pruebas de Disaster Recovery.
- **Taxonomía de Hallazgos:** Calificar cada discrepancia objetivamente según su impacto real (P0 a P3), nivel de confianza y esfuerzo de mitigación.

## Comandos y Delegación por Dominio

`repo-audit` es una **superficie de invocación de sólo lectura**, no un orquestador. Delega el análisis exhaustivo en las skills especializadas de cada dominio y en el flujo `full-audit` de `repo-lifecycle` (único orquestador del ciclo de vida), evitando duplicación de verificaciones:

- `/repo-audit quick`: Auditoría acotada de alto rendimiento, sin delegar las 16 etapas. Ver [Modo `quick`](#modo-quick).
- `/repo-audit`: Auditoría integral completa coordinando todas las dimensiones técnicas (ejecutando el flujo de `full-audit` de `repo-lifecycle`).
- `/repo-audit hygiene`: Enfoque en higiene de configuración y archivos de exclusión `*.ignore` (delega en `repo-lifecycle`).
- `/repo-audit security`: Enfoque exclusivo en vulnerabilidades, secretos, supply chain y permisos (delega en `repo-security`).
- `/repo-audit architecture`: Enfoque en límites del monorepo, acoplamiento y coherencia GitOps (delega en `repo-architecture`).
- `/repo-audit quality`: Calidad estática de código, tipado y prevención de God Files (delega en `repo-quality`).
- `/repo-audit dependencies`: Auditoría de ciclo de vida de paquetes, CVEs y overrides (delega en `repo-dependencies`).
- `/repo-audit maintenance`: Auditoría de deuda técnica, archivos huérfanos y artefactos retirados (delega en `repo-maintenance`).
- `/repo-audit delta`: Auditoría incremental enfocada en los cambios recientes clasificados según `repo-impact`.

## Modo `quick`

Diagnóstico de una sesión, pensado para ejecutarse antes de planificar trabajo. Prioriza los defectos que los gates no ven sobre la exhaustividad:

1. **Gates automáticos:** ejecutar `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:validate`, `npm run lint:md`, `npm run gitops:verify-parity` y `npm audit`. Registrar cada uno con su estado real; un gate no ejecutado es `NOT_EXECUTED`, nunca `PASS`.
2. **Trazado de rutas por entorno:** `/repo-architecture route-trace` sobre los entornos activos.
3. **Superficie de seguridad de la aplicación:** autenticación, CSRF, cabeceras y rate limiting en `apps/backend/src/middleware/` y `apps/backend/server.ts`.
4. **Hotspots:** los archivos de mayor tamaño en `apps/`, `scripts/` y `tests/` (`git ls-files | xargs wc -l`).
5. **Drift de ADRs y skills:** cada afirmación verificable de los ADRs activos y de `_shared/methodology.md` §2 contrastada contra el código.

Los hallazgos de los pasos 2 a 5 se reportan aunque todos los gates del paso 1 estén en verde ([methodology.md](../_shared/methodology.md) §1, *Gates en Verde no Certifican Ausencia de Defectos*).

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Regla Cardinal de Auditoría:** Una auditoría histórica nunca puede utilizarse como evidencia del estado actual del repositorio. Todo diagnóstico emitido por `repo-audit` representa un snapshot fechado y debe apoyarse estrictamente en el estado de las Fuentes Únicas de Verdad vigentes.
- **Planes de Cambio:** Si el usuario solicita remediar un hallazgo, modelar el cambio con [change-plan.md](../_shared/change-plan.md) y transferir la ejecución a `repo-impact` y luego a `repo-fix` (si altera comportamiento) o `repo-refactor` (si lo preserva).
