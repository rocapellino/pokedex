# 🌐 Frontend Web - Pokédex

Este directorio aloja la aplicación web cliente de la **Pokédex**, empaquetada como un contenedor ligero basado en **Nginx Alpine**.

---

## 📑 Estructura

```text
apps/frontend/
├── Dockerfile          # Imagen de producción Nginx Alpine multi-stage no-root
├── nginx.conf.template # SSOT de la configuración de Nginx (inyección de variables por envsubst)
├── nginx.conf          # Artefacto GENERADO desde la plantilla (fallback dev local sin Docker)
├── vite.config.ts      # Configuración de Vite para empaquetado multi-página (MPA)
├── tsconfig.json       # Configuración del compilador TypeScript
├── index.html          # Catálogo público interactivo (Entrypoint Vite)
├── backoffice.html     # Consola de administración CRUD (Entrypoint Vite)
├── src/                # Código fuente TypeScript con tipado estricto
│   ├── pokedex.ts      # Catálogo interactivo con sanitización DOMPurify
│   ├── backoffice.ts   # Operaciones CRUD, auth y métricas
│   ├── theme.ts        # Selector de tema (Claro / Oscuro / Sistema) Zero-FOUC
│   ├── sanitizer.ts    # Envoltorio de seguridad DOMPurify anti-XSS
│   ├── types.ts        # Tipos e interfaces de Pokémon y estado
│   ├── components/     # Componentes de UI reutilizables entre ambas páginas
│   │   ├── pokemon-card.ts     # Tarjeta de resumen del catálogo
│   │   ├── modal-detail.ts     # Detalle: stats, debilidades y evolución
│   │   ├── modal-auth.ts       # Autenticación y emisión de token
│   │   ├── modal-crud.ts       # Formularios de alta/edición/borrado
│   │   ├── admin-table.ts      # Tabla de administración con paginación
│   │   ├── admin-events.ts     # Suscripción a eventos del panel
│   │   └── index.ts            # Barrel de exportación
│   └── shared/         # Lógica compartida (client API, constantes, formato, UI)
│       ├── api.ts            # Cliente HTTP tipado contra el backend
│       ├── constants.ts      # Colores por tipo, catálogos y umbrales
│       ├── formatters.ts     # Normalización y formateo de datos de Pokémon
│       ├── ui.ts             # Helpers de render: badges, toasts, plantillas
│       └── index.ts          # Barrel de exportación
└── public/             # Assets estáticos servidos al navegador
    ├── css/            # Estilos modernos con variables CSS y glassmorphism
    │   ├── style.css
    │   └── backoffice.css
    └── favicon.*       # Iconografía y branding
```

> [!IMPORTANT]
> **`nginx.conf.template` es el SSOT; `nginx.conf` es un artefacto generado.**
> No edites `nginx.conf` a mano: cualquier cambio se perdería al regenerar.
> Edita la plantilla y ejecuta `npm run nginx:conf`. El gate
> `npm run nginx:conf:check` falla si el artefacto queda desactualizado.
>
> `src/components/` y `src/shared/` existen para evitar duplicación entre el
> catálogo público y el backoffice: ambos consumen los mismos helpers de API,
> tipos y formateo. No recrear lógica compartida en la raíz de `src/`.

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
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d --build

# Acceso local
http://localhost:8080/
```
