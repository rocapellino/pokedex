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
    ├── fonts/          # Fuentes autoalojadas (.woff2, subset latino; ver sección Tipografía)
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
5. **Sin terceros en runtime (fuentes):** la tipografía se sirve desde el mismo origen, por lo que `style-src` y `font-src` de la CSP son solo `'self'`.
6. **Compresión `gzip`:** nginx comprime CSS, JS, JSON y SVG (`gzip_types`, mínimo 1 KiB, `Vary: Accept-Encoding`); medido, `style.css` pasa de 44,8 a 9,0 KB y cada página de `/pokemons` de 78 a 14 KB. `/api/` y `/metrics` van sin comprimir (`gzip off`, mitigación de BREACH). `lighthouserc.json` lo vigila con `uses-text-compression`.
7. **SEO básico:** `index.html` declara `meta description` y `public/robots.txt` es válido; no se añade `Disallow: /backoffice`, porque Lighthouse marcaría esa página como no rastreable y su acceso ya está restringido por IP.

---

## 🔤 Tipografía autoalojada

| Familia | Archivo | Pesos | Uso |
| :--- | :--- | :---: | :--- |
| Outfit | `public/fonts/outfit-latin.woff2` | 300 a 800 (variable) | Texto base |
| Space Grotesk | `public/fonts/space-grotesk-latin.woff2` | 500 a 700 (variable) | Títulos y cifras |

- **Licencia:** SIL Open Font License 1.1 (ambas familias), que permite redistribuirlas.
- **Origen:** Google Fonts (subset `latin`, versiones `v15` de Outfit y `v22` de Space Grotesk, descargadas el 2026-10-06). El subset cubre el español.
- **Declaración:** `@font-face` con `font-display: swap` al inicio de `public/css/style.css`; `index.html` y `backoffice.html` precargan solo Outfit.
- **Cambiar una fuente:** reemplazar el archivo con **otro nombre** (nginx sirve `public/` con `max-age` de 1 día y sin hash) y actualizar el `@font-face`.
- **Gate:** `tests/frontend/fonts_selfhosted.test.ts` falla si alguna página vuelve a depender de Google Fonts.

---

## 🧱 Plantillas HTML con escapado automático

Las vistas se generan con la plantilla etiquetada `html` de `src/shared/html.ts`, que **escapa por defecto todo valor interpolado** (texto, números, atributos entre comillas). Solo pasan intactos los fragmentos `SafeHtml`: el resultado de otro `html` o de `trustedHtml()`, que se reserva para constantes del propio código y nunca para datos de la API.

```ts
html`<li data-id="${p.id}">${p.nombre}</li>`;                 // `id` y `nombre` se escapan
html`<ul>${pokemons.map((p) => html`<li>${p.nombre}</li>`)}</ul>`; // un arreglo de fragmentos se une
```

- **Por qué:** antes cada campo debía pasar por `escapeText()` a mano, y los campos con tipo `number` no se escapaban, pese a que el tipo no se comprueba en ejecución. Con datos hostiles en `id`, `fuerza`, `peso` o `altura`, la cadena generada contenía un `<script>`, un `<img>` y manejadores `onerror` y `onmouseover` antes de llegar a `DOMPurify`; `tests/frontend/html_injection.test.ts` lo fija.
- **Reglas:** los atributos van siempre entre comillas (`escapeText` neutraliza `"`, `'` y el acento grave, pero no protege un valor sin comillas) y no se llama a `escapeText()` dentro de una plantilla `html` (se escaparía dos veces).
- **Booleanos:** `false`, `null` y `undefined` no pintan nada, así que un atributo de texto booleano (`aria-selected="true|false"`) se interpola con `String(valor)`.
- **Inserción en el DOM:** `setHtml(elemento, fragmento)` es el único punto que asigna HTML. Solo acepta `SafeHtml` (una `string` no compila ni se admite en ejecución) y vuelve a sanear con DOMPurify, de modo que ni un `trustedHtml` mal usado llega al DOM tal cual. No se asigna `innerHTML` ni se llama a `sanitizeHtml` o `escapeText` fuera de `shared/html.ts`.
- **Estado de la migración:** completa. Todas las vistas (`pokemon-card`, `admin-table`, `shared/ui`, los módulos del modal, los estados de carga, error y vacío) generan HTML con `html` y se insertan con `setHtml`.
- **Guardas:** `tests/frontend/html_guard.test.ts` falla si aparece `innerHTML`, `outerHTML`, `insertAdjacentHTML` o `document.write` fuera de `shared/html.ts`, `escapeText` o `sanitizeHtml` fuera de los archivos permitidos, o `trustedHtml(` fuera de `shared/html.ts` y `shared/ui.ts`. Es una comprobación de texto, no un análisis de flujo: la barrera real son el tipo `SafeHtml` y DOMPurify. Añadir una excepción exige editar esa prueba y justificarlo en la revisión.
- **Paridad:** `tests/frontend/html_parity.test.ts` (tarjetas, tabla y utilidades) y `html_parity_modals.test.ts` (el modal de detalle) y `html_parity_states.test.ts` (estados de carga, error y vacío) comparan la salida de cada `render*` migrado con la generada por el código anterior (`tests/frontend/golden/`); los datos de ejemplo están en `html_fixtures.ts` y `UPDATE_GOLDEN=1` regenera los goldens de forma deliberada.
- **Inyección:** `html_injection.test.ts` (incluido el mensaje de un error de carga), `html_injection_modals.test.ts` y `html_set.test.ts` pasan marcado hostil por cada campo de cada plantilla y analizan el DOM resultante.

---

## ⌨️ Navegación con teclado

- **Tarjetas:** cada tarjeta es una sola parada de tabulador (botón extendido dentro del `h2`), de modo que una página de 48 recorre 48 paradas.
- **Saltar a la paginación:** `#skipToPagination` es el primer elemento enfocable justo antes del catálogo. Queda fuera de pantalla hasta recibir foco con el teclado y `renderPokemons` lo oculta (`hidden`) cuando hay una sola página o ningún resultado. Al activarlo, el foco pasa al primer botón habilitado de `#paginationBar` ("Siguiente" en la primera página, "Anterior" en la última).
- **Por qué no usa el ancla:** `pokedex.ts` conserva `location.hash` al guardar los filtros en la URL; navegar a `#paginationBar` dejaría ese hash en la dirección compartida y al recargarla saltaría a la paginación. Un controlador hace `preventDefault()` y mueve el foco con JavaScript (`shared/skip-link.ts`).
- **Barra de paginación:** es un `nav` con `aria-label="Paginación del catálogo"`.
- **Pruebas:** `tests/frontend/skip_pagination.test.ts` (estructura, foco, URL y visibilidad), `skip_link_contrast.test.ts` (contraste calculado en ambos temas, porque Axe no analiza un elemento fuera de pantalla) y un E2E en `tests/e2e/pokedex.spec.ts`.

---

## 📈 Medición de rendimiento (Lighthouse CI)

`npm run perf:lighthouse` (`task perf:lighthouse`) mide la aplicación **con datos reales**, no un servidor estático:

- **Entorno medido:** `lighthouserc.json` ejecuta `scripts/lighthouse-stack.ts` (`startServerCommand`), que levanta la imagen de nginx de producción (el digest del `Dockerfile`) con `nginx.conf` y sus cabeceras reales (CSP, COEP, CORP) y una API simulada con el catálogo nacional completo (1.025 Pokémon), con la paginación del backend (máximo 100, `X-Total-Count`).
- **Imágenes locales:** la API simulada sirve las imágenes desde `/favicon.png`, así que la puntuación mide el coste propio de la aplicación y no la latencia de `raw.githubusercontent.com`.
- **URL medidas:** `/` y `/backoffice`, con la mediana de 5 ejecuciones (móvil, *throttling* simulado).
- **Salida:** los informes quedan en `.lighthouseci/` (artefacto `lighthouse-reports` del job, 14 días) y el resumen con puntuaciones y métricas por URL se escribe en el *summary* del job (`scripts/lighthouse-summary.ts`). Ya no se suben a un almacenamiento público.

| Aserción | Nivel | Motivo |
| :--- | :---: | :--- |
| `errors-in-console` | `error` | Un error de consola con la API simulada es una regresión funcional. |
| Accesibilidad ≥ 0,90, buenas prácticas ≥ 0,90 y SEO ≥ 0,90 | `error` | Puntuaciones deterministas. |
| `uses-text-compression` | `error` | Protege la compresión `gzip` de nginx (CSS, JS y `/pokemons`) frente a una retirada accidental. |
| Rendimiento ≥ 0,90, FCP ≤ 2,0 s, LCP ≤ 2,5 s y CLS ≤ 0,25 | `error` | Fijados sobre la línea base medida en el runner tras el `gzip` (mediana de 5; entre paréntesis la peor ejecución): rendimiento 97 (95), FCP 1,27 s (1,35), LCP 1,80 s (2,32), CLS 0,002. Todos conservan margen, y bloquean una regresión real. |
| TBT ≤ 300 ms | `warn` | Depende de la CPU del runner (su índice de rendimiento varió de 1.800 a 2.500 entre ejecuciones): 183 ms de mediana y 227 ms en el peor caso, solo se vigila. |

Al revisar un cambio que empeore estas cifras, comparar siempre contra el resumen del job de CI (el artefacto `lighthouse-reports` trae los informes completos), no contra mediciones locales.

**Reproducir en local** (requiere Docker y Chromium; en Windows indicar `CHROME_PATH`):

```bash
npm run build:frontend
npx lhci autorun --collect.numberOfRuns=1 --collect.settings.chromeFlags="--no-sandbox --headless=new"
```

Si una ejecución anterior no cerró (puerto `3000` ocupado o contenedor `lighthouse-nginx` vivo), detenerla con `docker rm -f lighthouse-nginx`. Las cifras locales dependen del equipo: comparar solo contra mediciones del mismo entorno.

---

## 🚀 Ejecución

El frontend se levanta automáticamente como parte del stack de Docker Compose o del Chart de Helm:

```bash
# Desarrollo local con Docker Compose
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d --build

# Acceso local
http://localhost:8080/
```
