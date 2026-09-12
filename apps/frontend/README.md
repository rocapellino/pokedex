# 🌐 Frontend Web - Pokédex

Este directorio aloja la aplicación web cliente de la **Pokédex**, empaquetada como un contenedor ligero basado en **Nginx Alpine**.

---

## 📑 Estructura

```text
apps/frontend/
├── Dockerfile          # Imagen de producción Nginx Alpine multi-stage no-root
├── nginx.conf          # Configuración de Nginx (Reverse Proxy a la API, gzip y CSP)
├── nginx.conf.template # Plantilla Nginx con inyección de variables por envsubst
├── vite.config.ts      # Configuración de Vite para empaquetado multi-página (MPA)
├── tsconfig.json       # Configuración del compilador TypeScript
├── index.html          # SPA del Catálogo Pokédex (Punto de entrada Vite)
├── backoffice.html     # Panel administrativo CRUD (Punto de entrada Vite)
├── src/                # Código fuente TypeScript con tipado estricto
│   ├── pokedex.ts      # Catálogo interactivo con sanitización DOMPurify
│   ├── backoffice.ts   # Operaciones CRUD, auth y métricas
│   ├── theme.ts        # Selector de tema (Claro / Oscuro / Sistema) Zero-FOUC
│   ├── sanitizer.ts    # Envoltorio de seguridad DOMPurify anti-XSS
│   └── types.ts        # Tipos e interfaces de Pokémon y estado
└── public/             # Assets estáticos servidos al navegador
    ├── css/            # Estilos modernos con variables CSS y glassmorphism
    │   ├── style.css
    │   └── backoffice.css
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
