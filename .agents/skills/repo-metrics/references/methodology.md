# Metodología de repo-metrics

## Fuentes de verdad
1. Código/configuración ejecutable.
2. package.json/lockfiles y manifests.
3. workflows y scripts.
4. tests.
5. documentación.
6. comentarios históricos.

## Criterio
Un hallazgo debe indicar qué se observó, dónde, por qué importa y cómo verificar la corrección.

## Contexto Pokedex
Evitar recomendaciones genéricas: considerar explícitamente el monorepo, la cadena Compose -> Kubernetes/Helm -> ArgoCD, OpenTofu/Ansible, CI/CD y la superficie API/backend/frontend.
