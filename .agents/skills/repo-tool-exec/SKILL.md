---
name: repo-tool-exec
description: "Resolución y ejecución reproducible de herramientas externas (local o contenedor efímero) con minimización de privilegios y catálogo declarativo."
---

# repo-tool-exec

## Objetivo

Proveer una capacidad transversal, determinista y genérica para resolver y ejecutar herramientas de análisis estático, linters, escáneres de seguridad y CLIs requeridas por las distintas skills del monorepo `rocapellino/pokedex`, sin asumir que dichas herramientas están instaladas previamente en el entorno local del host ni requerir su instalación global.

---

## Principio de Operación

La skill desacopla la intención funcional (*"necesito ejecutar la herramienta X con los argumentos Y"*) de la infraestructura de ejecución (*"¿está instalada?", "¿qué versión tiene?", "¿existe Docker o Podman?", "¿qué imagen OCI usar?", "¿cómo montar el volumen de forma segura?"*).

```text
requested command
       │
       ▼
detect executable
       │
       ├── available locally
       │       │
       │       ▼
       │   validate version
       │       │
       │       ├── satisfies requirement ──► execute locally
       │       │
       │       └── incompatible version ──► fallback to container
       │
       └── unavailable
               │
               ▼
       resolve container definition (tool-catalog.yaml)
               │
          ┌────┴────┐
          │         │
       defined   undefined
          │         │
          ▼         ▼
      detect runtime ──► unavailable runtime ──► UNAVAILABLE
          │
      available runtime (docker / podman / nerdctl)
          │
          ▼
      execute container (--rm, :ro, least privilege)
          │
          ▼
      propagate exit code & return structured evidence
```

---

## Alcance y Responsabilidades

- **Detección Dinámica de Ejecutables Locales:** Inspección del PATH del host (`where.exe` en Windows, `which` en Linux/macOS).
- **Validación Semver de Versiones:** Si la skill consumidora requiere una versión mínima o rango (ej. `>=1.7.7`), se extrae la versión del binario local y se valida antes de decidir si se ejecuta localmente o si se aplica fallback al contenedor.
- **Detección Agnóstica de Runtime de Contenedores:** Detección en orden de prioridad: `docker`, `podman`, `nerdctl`. Si el comando existe, se verifica que el daemon esté activo y responda (`info` o `version`).
- **Catálogo Declarativo Versionado:** Las definiciones de imágenes, argumentos por defecto, variables de entorno y modos de montaje residen en [`references/tool-catalog.yaml`](references/tool-catalog.yaml). Prohibido el uso de la etiqueta `latest`. Se privilegian digests SHA256 inmutables.
- **Seguridad y Minimización de Privilegios:**
  - Montaje del repositorio en solo lectura (`:ro`) por defecto, reservando `:rw` solo para herramientas que requieren escribir en disco (ej. `pre-commit` o cachés locales).
  - Eliminación obligatoria del contenedor al finalizar (`--rm`).
  - Prohibición estricta de `--privileged`.
  - Prohibición estricta de montar sockets de contenedores (`docker.sock`).
  - Prohibición estricta de montar directorios del host fuera del monorepo.
  - Gestión de rutas en Windows con aislamiento `MSYS_NO_PATHCONV=1`.
- **Higiene de Archivos Temporales:** Cualquier archivo transitorio o log debe utilizar obligatoriamente `<repository-root>/tmp/`, conforme a [repository-hygiene.md](../../rules/repository-hygiene.md).
- **Cero Instalaciones Globales Automáticas:** La ausencia de una herramienta jamás debe intentar `apt-get`, `brew`, `npm install -g`, `pip install` ni `go install`.

---

## Declaración de Dependencias en Skills Consumidoras

Las skills que requieran herramientas externas declaran sus necesidades en su propio frontmatter o especificación bajo el bloque `tools:` o invocan `repo-tool-exec` indicando el requerimiento:

```yaml
tools:
  - name: actionlint
    version: ">=1.7.12"
  - name: shellcheck
    version: ">=0.11.0"
```

La skill consumidora solo declara **qué** necesita, delegando en `repo-tool-exec` el **cómo**.

---

## Modelo de Evidencia Estructurada

Cada ejecución genera un reporte estructurado con el resultado fáctico:

```yaml
tool: actionlint
command: actionlint .
status: PASS
exit_code: 0
execution:
  mode: container
  runtime: docker
  image: rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
version:
  requested: ">=1.7.12"
  resolved: "1.7.12"
```

### Taxonomía de Estados

- `PASS`: La herramienta se ejecutó y retornó exit code 0.
- `FAIL`: La herramienta se ejecutó y reportó errores (exit code != 0).
- `UNAVAILABLE`: Ni la herramienta local ni un runtime de contenedor autorizado están disponibles para ejecutarla.
- `NOT_CONFIGURED`: La herramienta solicitada no está registrada en el catálogo declarativo.
- `NOT_APPLICABLE`: La herramienta no aplica al contexto o diff actual.

---

## Comandos

- `/repo-tool-exec run <tool> [args...]`: Ejecuta la herramienta resolviendo automáticamente entorno local o contenedor.
- `/repo-tool-exec check <tool> [--version-req <v>]`: Comprueba la disponibilidad de la herramienta (local o fallback) sin ejecutarla.
- `/repo-tool-exec catalog`: Lista las herramientas autorizadas registradas en el catálogo.

---

## Formato de Salida y Gobernanza

Aplica el contrato común de [skill-contract.md](../_shared/skill-contract.md): metodología, formato de hallazgos y reporte, Markdown Quality Gate e idioma.

Reglas propias de esta skill:

- **Catálogo de Herramientas:** [references/tool-catalog.yaml](references/tool-catalog.yaml)
- **Directivas de Seguridad en Contenedores:** [references/container-security.md](references/container-security.md)
- **Motor Ejecutable:** [scripts/tool-exec.ts](scripts/tool-exec.ts)
