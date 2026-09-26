# 🔍 Auditoría de Superficie de Comandos y Duplicación (Fase B)

> **Fecha:** 2026-09-25
> **Estado:** COMPLETADO
> **Alcance:** Interfaz de Comandos del Monorepo (`Taskfile.yml`, `package.json`, `.github/workflows/`, `scripts/`, `.agents/skills/`)
> **Objetivo:** Detectar solapamientos de responsabilidades, comandos huérfanos, duplicaciones y definir la matriz canónica de propiedad.

---

## 📑 Resumen Ejecutivo

La superficie de comandos de Pokédex fue analizada exhaustivamente para responder a las siguientes preguntas clave de gobernanza:

1. ¿Existen herramientas resolviendo la misma responsabilidad técnica con lógicas divergentes?
2. ¿Existen tareas o scripts huérfanos sin invocación en CI, Taskfile o directivas operativas?
3. ¿Cómo interactúan el plano de desarrollo local (Developer Experience - DX) y el plano de integración continua (CI/CD)?

**Resultado Principal:**
No existe divergencia lógica en el repositorio. `Taskfile.yml` actúa estrictamente como **fachada ergonómica (DX Gateway)** delegando de manera limpia hacia `package.json` y contenedores Docker estándar. Se identificó **un único script huérfano sin referencias (`scripts/dev-backup-gdrive.ts`)**, el cual es clasificado como candidato directo a depuración en Fase D.

---

## 1. Matriz de Propiedad y Deslinde de Responsabilidades

| Plano / Herramienta | Audiencia Primaria | Responsabilidad Canónica | Regla de Implementación |
| :--- | :--- | :--- | :--- |
| **`Taskfile.yml`** | Desarrollador Humano / Local DX | Catálogo ergonómico de comandos rápidos (`task dev`, `task test`, `task validate`). | **Prohibido duplicar lógica:** Debe invocar `npm run <script>` o comandos de contenedor limpios. |
| **`package.json`** | Monorepo Engine / Node.js | Definición canónica de scripts ejecutables con TypeScript (`tsx`, `node --experimental-strip-types`). | Fuente Única de Verdad de comandos ejecutables del monorepo. |
| **`GitHub Actions`** | CI/CD Runners | Orquestación automatizada de Quality Gates, compilación, scans y despliegues OCI. | **Nunca invocar `task` en CI:** Invocar directamente `npm run ...` para evitar instalar dependencias innecesarias en los runners. |
| **`scripts/`** | Scripts de Plataforma | Lógica de mantenimiento, gobernanza, verificación criptográfica y rotación. | Deben ser TypeScript fuertemente tipado (ADR-020). Cero shell scripts salvo el canónico `dr_verify_restore.sh`. |
| **`.agents/skills/`** | Agentes de IA (Antigravity) | Guías operativas paso a paso y despacho condicional ante cambios. | Invocan `npm run ...` según la *Change Impact Matrix*. |

---

## 2. Inventario y Mapeo Cruzado de Comandos

### 2.1. Tareas de `Taskfile.yml` vs. `package.json`

| Tarea en `Taskfile.yml` | Comando Subyacente Ejecutado | Script en `package.json` | ¿Duplicación de Lógica? |
| :--- | :--- | :--- | :--- |
| `task dev` | `npm run dev` | `npm run dev --workspace=@pokedex/backend` | ❌ No (Delegación pura) |
| `task build` | `npm run build` | `npm run build --workspace=@pokedex/backend && ...` | ❌ No (Delegación pura) |
| `task validate` | `npm run validate` | `npm run lint && npm run build && npm test && ...` | ❌ No (Delegación pura) |
| `task test` | `npm run lint && npm test` | `npm run lint` + `npm test` | ❌ No (Composición ergonómica) |
| `task test:e2e` | `npm run test:e2e` | `playwright test` | ❌ No (Delegación pura) |
| `task test:a11y` | `npm run test:a11y` | `playwright test -g @a11y` | ❌ No (Delegación pura) |
| `task test:coverage` | `npm run test:coverage` | `tsx --test --experimental-test-coverage ...` | ❌ No (Delegación pura) |
| `task lint:md` | `npm run lint:md` | `tsx scripts/lint-markdown.ts` | ❌ No (Delegación pura) |
| `task secrets:audit-rotation` | `npm run secrets:audit-rotation` | `node --experimental-strip-types scripts/verify-secret-rotation.ts` | ❌ No (Delegación pura) |
| `task gitops:verify-parity` | `npm run gitops:verify-parity` | `node --experimental-strip-types scripts/verify-image-digest-parity.ts` | ❌ No (Delegación pura) |
| `task gitops:pin` | `npm run gitops:pin` | `node --experimental-strip-types scripts/update-gitops-pin.ts` | ❌ No (Delegación pura) |
| `task k8s:rollout-restart` | `npm run k8s:rollout-restart` | `node --experimental-strip-types scripts/k8s-rollout-restart.ts` | ❌ No (Delegación pura) |
| `task dr:drill:e2e` | `npm run dr:drill:e2e` | `tsx scripts/dr-drill.ts` | ❌ No (Delegación pura) |
| `task ghcr:retention` | `npm run ghcr:retention` | `node --experimental-strip-types scripts/ghcr-retention.ts` | ❌ No (Delegación pura) |
| `task lint:mega` | `docker run oxsecurity/megalinter-cupcake` | N/A (Herramienta containerizada externa) | ❌ No (Wrapper ergonómico local) |
| `task sonar` | `docker run sonarsource/sonar-scanner-cli` | N/A (Herramienta containerizada externa) | ❌ No (Wrapper ergonómico local) |

---

## 3. Auditoría del Directorio `scripts/`

El directorio `scripts/` contiene 13 archivos. Se analizó la referencia y utilidad operativa de cada uno:

| Archivo | Rol Técnico | Referenciado En | Estado |
| :--- | :--- | :--- | :--- |
| `declarations.d.ts` | Tipos TypeScript auxiliares para scripts | Compilador TypeScript | ✅ Activo |
| `dr-drill.ts` | Simulación E2E de Disaster Recovery y cifrado | `package.json`, `Taskfile`, `dr-simulation.yml` | ✅ Activo (Crítico) |
| `dr_verify_restore.sh` | Shell script de restauración PostgreSQL | Helm CronJob restore, `governance.test.ts` | ✅ Activo (Autorizado) |
| `ghcr-retention.ts` | Poda y retención de imágenes OCI en GHCR | `package.json`, `Taskfile`, `ghcr-retention.yml` | ✅ Activo |
| `github-security-linear-sync.ts` | Sincronización de alertas de seguridad con Linear | `.github/workflows/github-security-linear-sync.yml` | ✅ Activo |
| `k8s-rollout-restart.ts` | Rollout restart sin downtime y verificación Vault | `package.json`, `Taskfile`, `docs/architecture` | ✅ Activo |
| `lint-markdown.ts` | Linter Markdown canónico con motor markdownlint | `package.json`, `Taskfile`, `AGENTS.md` | ✅ Activo (Gate obligatorio) |
| `probe-egress-security.ts` | Sonda de validación de egress Cilium L7 eBPF | `package.json`, `egress_anti_ssrf.test.ts` | ✅ Activo (Seguridad) |
| `sonar-linear-sync.ts` | Sincronización de issues de SonarQube con Linear | `.github/workflows/sonar-linear-sync.yml` | ✅ Activo |
| `update-gitops-pin.ts` | Auditoría y anclaje de versión en ArgoCD | `package.json`, `Taskfile`, `argocd_pinning.test.ts` | ✅ Activo (GitOps) |
| `verify-image-digest-parity.ts` | Verificación de paridad 1:1 de digest OCI | `package.json`, `Taskfile`, `ci.yml`, tests | ✅ Activo (Supply Chain) |
| `verify-secret-rotation.ts` | Auditoría de rotación continua de secretos | `package.json`, `Taskfile`, tests de seguridad | ✅ Activo (Seguridad) |
| `dev-backup-gdrive.ts` | Respaldo local y sync a Google Drive en Docker Compose | `Taskfile.yml` (`task dr:gdrive:backup:dev`), `dr_backup_security.test.ts` | ✅ Activo (DR Dev) |

---

## 4. Análisis de Cobertura en `scripts/`

- **100% de Scripts en Uso Activo:** La totalidad de los 13 scripts en `scripts/` está vinculada a tareas de `package.json`, comandos de `Taskfile.yml` o suites contractuales de pruebas unitarias y de seguridad.
- **Sin Código Huérfano:** La inspección de `scripts/dev-backup-gdrive.ts` confirmó que está asociado a la tarea `task dr:gdrive:backup:dev` y respaldado por la prueba `tests/security/dr_backup_security.test.ts:165` como parte de la Alternativa A (desarrollo local en Docker Compose con perfil `backup`).
- **Conclusión de Superficie:** La totalidad de los scripts tiene un rol activo y justificado dentro de la matriz de comandos del monorepo.

---

## 5. Conclusión de Fase B

La superficie de comandos de Pokédex es ordenada y disciplinada. Se preserva una frontera nítida:

- `Taskfile.yml` = Interfaz para el desarrollador humano (DX ergonómica).
- `package.json` = Contratos de ejecución reproducibles (fuente de verdad para CI y Node.js).
- `GitHub Actions` = Ejecución sin wrappers intermediarios.
- `scripts/` = 100% de scripts activos con propósito crítico, verificados y testeados.
