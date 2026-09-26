# ADR-002: Docker Compose Restringido a Desarrollo Interactivo Local

## Estado

Aceptado

## Contexto

El ciclo de vida de desarrollo requiere agilidad, recarga rápida (hot-reload) y consumo moderado de recursos en la máquina de los ingenieros. Levantar un clúster de Kubernetes completo para cada cambio menor introduce sobrecarga innecesaria en CPU y memoria durante la iteración temprana de código.

## Decisión

Se define **Docker Compose** (`docker compose up -d` o `task dev:compose`) como un **perfil rápido y exclusivo para desarrollo interactivo local**:

1. Compose no debe utilizarse en entornos de producción, staging ni disaster recovery.
2. Su propósito es proveer dependencias locales inmediatas (PostgreSQL y Redis) junto al frontend Nginx y la API Node.js con montaje de volúmenes de desarrollo.
3. Se mantiene el perfil `dev:k8s:up` (Kind) como paso de validación previo a la apertura de Pull Requests para certificar paridad exacta con Kubernetes.

## Consecuencias

- **Positivas**: Experiencia de desarrollo óptima (DX) con arranque inferior a 5 segundos y bajo consumo de recursos.
- **Compensaciones**: Requiere mantener sincronizadas las variables de entorno de `compose.yaml` con `values.yaml` de Helm.
