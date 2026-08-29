# Monorepo Pokémon DevOps

Este repositorio se reorganizó para mantener un monorepo con separación clara por dominio, facilitando el crecimiento del proyecto sin mezclar backend, frontend e infraestructura en una sola carpeta.

## Estructura propuesta

```text
pokemon-monorepo/
├── .github/
│   ├── workflows/
│   │   ├── api.yml
│   │   ├── web.yml
│   │   └── infra.yml
│   └── pull_request_template.md
├── apps/
│   ├── api/
│   │   ├── src/
│   │   ├── tests/
│   │   ├── scripts/
│   │   ├── templates/
│   │   ├── static/
│   │   ├── requirements.txt
│   │   ├── Dockerfile
│   │   └── .env.example
│   └── web/
│       └── README.md
├── infra/
│   ├── docker/
│   ├── terraform/
│   ├── scripts/
│   └── README.md
├── docs/
│   ├── README.md
│   ├── architecture/
│   ├── api/
│   └── runbooks/
├── app.py
├── src/
├── tests/
├── scripts/
├── Dockerfile
├── requirements.txt
├── .env.example
├── .pre-commit-config.yaml
├── .gitignore
├── MEJORES_PRACTICAS_GIT.md
├── MEJORES_PRACTICAS_DOCKERFILE.md
└── README.md
```

## Qué se movió

- Backend Flask quedó bajo `apps/api/`
- La API sigue siendo compatible con la estructura antigua mediante shims en `src/` y `app.py`
- El futuro frontend quedó preparado en `apps/web/`
- Infraestructura y despliegues quedaron bajo `infra/`
- Documentación general se centraliza en `docs/`

## Cómo ejecutar el backend

```bash
# Opción 1: compatibilidad con la estructura anterior
python app.py

# Opción 2: ejecución directa desde el backend monorepo
cd apps/api
python src/app.py
```

## Cómo ejecutar pruebas

```bash
pytest -v tests/
```

## CI/CD recomendado

- `api.yml`: dispara solo si cambian archivos de `apps/api/**`
- `web.yml`: dispara solo si cambian archivos de `apps/web/**`
- `infra.yml`: dispara solo si cambian archivos de `infra/**`

## Recomendación final

Para este proyecto, el monorepo se mantiene “suave”: una raíz común con subáreas bien definidas, compatibilidad con rutas antiguas y un punto de entrada unificado. Eso permite crecer hacia un frontend independiente o infra como código sin romper el flujo de trabajo actual.

## Enlaces útiles

- [MEJORES_PRACTICAS_GIT.md](./MEJORES_PRACTICAS_GIT.md)
- [MEJORES_PRACTICAS_DOCKERFILE.md](./MEJORES_PRACTICAS_DOCKERFILE.md)
