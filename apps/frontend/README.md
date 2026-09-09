# 🌐 Frontend Web - Pokédex

Este directorio aloja la aplicación web cliente de la **Pokédex**, empaquetada como un contenedor ligero basado en **Nginx Alpine**.

---

## 📑 Estructura

```text
apps/frontend/
├── Dockerfile          # Imagen de producción Nginx Alpine multi-stage no-root
├── nginx.conf          # Configuración de Nginx (Reverse Proxy a la API, compresión gzip y headers CSP)
└── public/             # Assets estáticos servidos al navegador
    ├── index.html      # SPA del Catálogo Pokédex (Bento Grid, filtros reactivos, modal de detalle)
    ├── backoffice.html # Panel administrativo CRUD con métricas y gestión del catálogo
    ├── css/            # Estilos modernos con variables/tokens CSS y glassmorphism
    │   ├── style.css
    │   └── backoffice.css
    ├── js/             # Lógica cliente en JavaScript Vanilla modular
    │   ├── pokedex.js  # Búsqueda insensible a tildes, filtros por tipo/gen y modales
    │   ├── theme.js    # Selector de tema (Claro / Oscuro / Sistema)
    │   └── backoffice.js # Operaciones CRUD, autenticación y pooling de salud
    └── favicon.*       # Iconografía y branding
```

---

## 🛡️ Características de Seguridad y Rendimiento

1. **Reverse Proxy Integrado:** Nginx actúa como proxy reverso enrutando las peticiones `/api/` directamente al backend (`pokemon-api:3000`), ocultando la topología interna.
2. **Políticas de Seguridad HTTP:**
   - Cabeceras estrictas: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Content-Security-Policy`: Protección contra inyecciones XSS restringiendo orígenes de scripts, estilos y conexiones.
3. **Contenedor no privilegiado:** Nginx se ejecuta con el usuario no-root `nginx` (UID/GID 101) garantizando el principio de menor privilegio.
4. **Healthcheck Nativo:** Monitoreo periódico a `/healthz`.

---

## 🚀 Ejecución

El frontend se levanta automáticamente como parte del stack de Docker Compose o del Chart de Helm:

```bash
# Desarrollo local con Docker Compose
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Acceso local
http://localhost:8080/
```
