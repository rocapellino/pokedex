# Restricciones y Políticas de Seguridad para Contenedores Efímeros

Este documento define las directivas de seguridad obligatorias que rigen la ejecución de herramientas mediante contenedores en `.agents/skills/repo-tool-exec/`.

---

## 1. Principio de Menor Privilegio

Toda herramienta ejecutada mediante contenedor debe operar con los mínimos privilegios necesarios para cumplir su función de análisis, linting o validación.

### Reglas Obligatorias

1. **Sin Modo Privilegiado:** Queda estrictamente prohibido el uso del flag `--privileged`. Ninguna herramienta de linting o verificación requiere acceso al kernel ni a dispositivos del host.
2. **Sin Acceso al Docker Socket:** Prohibido montar `/var/run/docker.sock` o named pipes (`//./pipe/docker_engine`). La herramienta no debe tener capacidad de interactuar con el daemon de contenedores ni crear contenedores hermanos.
3. **Sin Montaje del Host Completo:** El único directorio del host autorizado a montarse es el directorio raíz del repositorio actual (`<repository-root>`), mapeado a `/repo`. Está terminantemente prohibido montar `/`, `C:\`, `/etc`, `/home`, o el perfil de usuario del host.
4. **Montaje de Solo Lectura por Defecto (`:ro`):** Salvo que la herramienta deba estrictamente modificar o generar archivos (por ejemplo `pre-commit` o herramientas que persisten en caché temporal), el repositorio se monta como `-v "<repoRoot>:/repo:ro"`.
5. **Aislamiento de Variables de Entorno:** No se heredan automáticamente todas las variables de entorno del host. Solo se inyectan variables de configuración técnica expresamente declaradas en el catálogo (por ejemplo `SHELLCHECK_OPTS`). Nunca se propagan secretos o tokens salvo que la herramienta lo requiera bajo justificación documentada.
6. **Limpieza Automática (`--rm`):** Todo contenedor debe ejecutarse con `--rm` para garantizar que no permanezca en disco tras finalizar.
7. **Usuario No-Root cuando esté Soportado:** Se alienta el uso de usuarios numéricos no privilegiados o la configuración del catálogo cuando la imagen lo soporte. Con montaje `rw` y sin `user` en el catálogo, se usa el uid:gid del host para no dejar archivos propiedad de root.
8. **Sin Red por Defecto:** Todo contenedor corre con `--network none`. Solo las herramientas que descargan datos (`trivy`, `opentofu`, `terraform`, `pre-commit`) declaran `network: "bridge"` en el catálogo.
9. **Endurecimiento del Runtime:** Siempre `--security-opt no-new-privileges`; con montaje `ro` además `--cap-drop ALL`. Los filtros sobre `--privileged` y `docker.sock` en los argumentos son una defensa adicional y no sustituyen estas restricciones.
10. **Raíz del Repositorio Verificada:** Si no se encuentra `.git` ni `package.json`, la ejecución falla en lugar de montar el directorio actual.

---

## 2. Gestión de Archivos Temporales

Conforme a la regla transversal `.agents/rules/repository-hygiene.md`:

- Todo archivo transitorio o log emitido durante la ejecución de contenedores debe dirigirse a `<repository-root>/tmp/`.
- No deben dejarse artefactos temporales en subdirectorios de código o infraestructura.
- Si una herramienta requiere escribir un archivo de salida, debe usar una ruta bajo `tmp/` (ej. `tmp/rendered-dev.yaml`).
