/**
 * Metadata del catálogo de superficie de testing: suites de `tests/frontend/` y helpers asociados.
 */

import type { FileMetadata } from './metadata.js';

const SRC = 'apps/frontend/src';

export const FRONTEND_FILE_METADATA: Record<string, FileMetadata> = {
  'tests/frontend/catalog_ability_controller.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Filtro por Habilidad',
    targetArtifacts: [`${SRC}/pokedex.ts`, `${SRC}/shared/catalog-filters.ts`],
    description:
      'Valida con JSDOM el autocompletado de habilidades: lista única ordenada, filtro, chip, URL, normalización de tildes y campo no válido.',
  },
  'tests/frontend/catalog_class_controller.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Filtro por Clasificación',
    targetArtifacts: [`${SRC}/pokedex.ts`, `${SRC}/shared/catalog-filters.ts`],
    description:
      'Valida con JSDOM el filtro de legendarios y míticos: selector, chip, URL y restablecimiento con «Limpiar filtros».',
  },
  'tests/frontend/catalog_fetch.test.ts': {
    type: 'Unit',
    targetDomain: 'Catálogo / Descarga Paginada',
    targetArtifacts: [`${SRC}/shared/api.ts`],
    description:
      'Regresión del catálogo nacional: fetchAllPokemons descarga todas las páginas hasta X-Total-Count y termina aunque el total cambie.',
  },
  'tests/frontend/catalog_filters_controller.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Controlador de Filtros',
    targetArtifacts: [`${SRC}/pokedex.ts`, `${SRC}/components/filters-panel.ts`],
    description:
      'Valida con JSDOM el controlador de filtros: tipos múltiples, búsqueda, generación, megaevolución, chips y botón «Limpiar filtros».',
  },
  'tests/frontend/catalog_filters.test.ts': {
    type: 'Unit',
    targetDomain: 'Catálogo / Lógica de Filtros',
    targetArtifacts: [`${SRC}/shared/catalog-filters.ts`],
    description:
      'Verifica el filtrado puro del catálogo: tipos combinados, búsqueda sin tildes por nombre, habilidad, hábitat e ID, generación y megaevolución.',
  },
  'tests/frontend/catalog_history_controller.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Historial del Navegador',
    targetArtifacts: [`${SRC}/pokedex.ts`, `${SRC}/shared/filter-history.ts`],
    description:
      'Valida que cada cambio de filtro cree una entrada de historial, que escribir reescriba la actual y que atrás/adelante restauren el estado.',
  },
  'tests/frontend/catalog_page_url.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Página en la URL',
    targetArtifacts: [`${SRC}/pokedex.ts`, `${SRC}/shared/filter-url.ts`],
    description:
      'Valida el parámetro ?pagina: apertura directa, ajuste de páginas fuera de rango, valores inválidos y navegación atrás/adelante.',
  },
  'tests/frontend/catalog_page.ts': {
    type: 'Helper / Environment',
    targetDomain: 'Página del Catálogo para Pruebas',
    targetArtifacts: ['apps/frontend/index.html'],
    description:
      'Monta el marcado real de index.html en el JSDOM compartido y ofrece documentReady, serveCatalog y mk, en lugar de esqueletos de DOM escritos a mano en cada test.',
  },
  'tests/frontend/catalog_sort_chip_controller.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Chip de Orden',
    targetArtifacts: [`${SRC}/pokedex.ts`, `${SRC}/shared/catalog-sort.ts`],
    description:
      'Valida el chip «Orden: criterio» con JSDOM: aparición al cambiar de criterio, flecha de sentido y ocultamiento al volver al orden natural.',
  },
  'tests/frontend/catalog_sort.test.ts': {
    type: 'Unit',
    targetDomain: 'Catálogo / Lógica de Orden',
    targetArtifacts: [`${SRC}/shared/catalog-sort.ts`],
    description:
      'Verifica el orden por número, nombre y estadística: tildes, empates por número, datos ausentes al final y entrada sin mutar.',
  },
  'tests/frontend/css_cache_busting.test.ts': {
    type: 'Contract / Frontend',
    targetDomain: 'Caché de CSS',
    targetArtifacts: ['apps/frontend/css-version.ts', 'apps/frontend/index.html', 'apps/frontend/backoffice.html'],
    description:
      'Comprueba que la versión del enlace al CSS derive de su contenido, que no se toquen otros enlaces y que las páginas no la fijen a mano.',
  },
  'tests/frontend/filter_url.test.ts': {
    type: 'Unit',
    targetDomain: 'Catálogo / Estado de Filtros en la URL',
    targetArtifacts: [`${SRC}/shared/filter-url.ts`],
    description:
      'Verifica la lectura y escritura del estado de filtros en la URL: búsqueda, tipos, generación, megaevolución, página y descarte de valores inválidos.',
  },
  'tests/frontend/filters_panel.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Panel de Filtros',
    targetArtifacts: [`${SRC}/components/filters-panel.ts`],
    description:
      'Valida el panel de filtros: apertura y cierre accesibles, contador de filtros activos y resumen del desplegable de tipos.',
  },
  'tests/frontend/fonts_selfhosted.test.ts': {
    type: 'Contract / Frontend',
    targetDomain: 'Fuentes Autoalojadas y CSP',
    targetArtifacts: ['apps/frontend/index.html', 'apps/frontend/nginx.conf.template'],
    description:
      'Comprueba que no se dependa de Google Fonts, que los .woff2 declarados existan y sean válidos, y que style-src y font-src sean solo self.',
  },
  'tests/frontend/html_assertions.ts': {
    type: 'Helper',
    targetDomain: 'Inyección HTML / Datos Hostiles',
    targetArtifacts: [`${SRC}/shared/html.ts`],
    description:
      'Datos hostiles y aserción assertNeutralized reutilizados por las pruebas de inyección del render HTML.',
  },
  'tests/frontend/html_fixtures.ts': {
    type: 'Helper',
    targetDomain: 'Render HTML / Datos de Ejemplo',
    targetArtifacts: [`${SRC}/components/`],
    description:
      'Datos de ejemplo compartidos por las pruebas de paridad y de inyección; cubren las ramas de cada plantilla (valores ausentes, cadenas evolutivas, megaevoluciones).',
  },
  'tests/frontend/html_guard.test.ts': {
    type: 'Contract / Frontend',
    targetDomain: 'Punto Único de Inserción de HTML',
    targetArtifacts: [`${SRC}/shared/html.ts`, `${SRC}/sanitizer.ts`],
    description:
      'Guarda textual de que solo shared/html.ts asigne HTML al DOM y de que escapeText, sanitizeHtml y trustedHtml se usen únicamente donde corresponde.',
  },
  'tests/frontend/html_injection_modals.test.ts': {
    type: 'Security / Frontend',
    targetDomain: 'Inyección HTML en Modales',
    targetArtifacts: [
      `${SRC}/components/modal-detail.ts`,
      `${SRC}/components/modal-evolution.ts`,
      `${SRC}/components/modal-mega.ts`,
    ],
    description:
      'Verifica que los modales de detalle, evolución y megaevolución neutralicen campos hostiles en nombre, método, imagen, tipos y estadísticas.',
  },
  'tests/frontend/html_injection.test.ts': {
    type: 'Security / Frontend',
    targetDomain: 'Inyección HTML en el Render',
    targetArtifacts: [`${SRC}/components/pokemon-card.ts`, `${SRC}/components/admin-table.ts`],
    description:
      'Verifica que tarjetas, tabla del backoffice, insignias y estados vacíos neutralicen campos hostiles sin doble escapado de datos legítimos.',
  },
  'tests/frontend/html_parity_modals.test.ts': {
    type: 'Snapshot Parity',
    targetDomain: 'Paridad de Render / Modales',
    targetArtifacts: [`${SRC}/components/`],
    description:
      'Compara el HTML de los modales (detalle, evolución, megaevolución) con su instantánea nativa, capturada con la versión anterior del render.',
  },
  'tests/frontend/html_parity_states.test.ts': {
    type: 'Snapshot Parity',
    targetDomain: 'Paridad de Render / Estados',
    targetArtifacts: [`${SRC}/components/`],
    description:
      'Compara el HTML de los estados (vacío, error, carga, sin resultados) con su instantánea nativa, capturada con la versión anterior.',
  },
  'tests/frontend/html_parity.test.ts': {
    type: 'Snapshot Parity',
    targetDomain: 'Paridad de Render / Componentes',
    targetArtifacts: [`${SRC}/components/`],
    description:
      'Compara el HTML de tarjetas, insignias y filas con su instantánea nativa, capturada con la versión anterior del render.',
  },
  'tests/frontend/html_snapshot.ts': {
    type: 'Helper',
    targetDomain: 'Instantáneas de HTML',
    targetArtifacts: [`${SRC}/shared/html.ts`],
    description:
      'Normaliza el HTML (espacios finales y saltos de línea) y lo compara con la instantánea nativa de node:test serializada como texto plano.',
  },
  'tests/frontend/html_set.test.ts': {
    type: 'Unit',
    targetDomain: 'Inserción de HTML (setHtml)',
    targetArtifacts: [`${SRC}/shared/html.ts`],
    description:
      'Verifica que setHtml inserte fragmentos legítimos, sanee los marcados como confiables por error, escape datos interpolados y reemplace el contenido.',
  },
  'tests/frontend/html_template.test.ts': {
    type: 'Unit',
    targetDomain: 'Plantilla html``',
    targetArtifacts: [`${SRC}/shared/html.ts`],
    description:
      'Verifica la etiqueta html: escape por defecto (también en atributos), valores nulos y numéricos, y fragmentos SafeHtml sin doble escape.',
  },
  'tests/frontend/keyboard_access.test.ts': {
    type: 'Accessibility',
    targetDomain: 'Accesibilidad por Teclado / Render',
    targetArtifacts: [`${SRC}/components/pokemon-card.ts`, `${SRC}/components/modal-evolution.ts`],
    description:
      'Verifica que el nombre de la tarjeta sea un botón nativo, la pista táctil decorativa y los nodos de evolución operables con teclado y aria-current.',
  },
  'tests/frontend/keyboard_navigation.test.ts': {
    type: 'Accessibility',
    targetDomain: 'Accesibilidad por Teclado / Foco',
    targetArtifacts: [`${SRC}/components/modal-detail.ts`, `${SRC}/components/modal-evolution.ts`],
    description: 'Valida el foco del modal de detalle y la navegación entre evoluciones con Enter y barra espaciadora.',
  },
  'tests/frontend/mega_env.ts': {
    type: 'Helper / Environment',
    targetDomain: 'Entorno JSDOM para el Frontend',
    targetArtifacts: [`${SRC}/sanitizer.ts`],
    description:
      'Entorno de navegador mínimo (JSDOM) que debe importarse antes que los módulos del frontend, porque DOMPurify necesita window al cargarse.',
  },
  'tests/frontend/mega_evolution.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Megaevoluciones / Interfaz',
    targetArtifacts: [`${SRC}/components/modal-mega.ts`, `${SRC}/shared/base-stats.ts`],
    description:
      'Valida la sección de megaevoluciones del modal: comparación de estadísticas con la forma base, alternancia entre formas y ausencia de sección.',
  },
  'tests/frontend/modal_dialog.test.ts': {
    type: 'Accessibility',
    targetDomain: 'Modales / Elemento dialog',
    targetArtifacts: ['apps/frontend/index.html', 'apps/frontend/backoffice.html', `${SRC}/components/modal-detail.ts`],
    description:
      'Comprueba que los modales sean dialog con nombre accesible, botón de cierre con nombre y que no dependan de la clase .active.',
  },
  'tests/frontend/nginx_config.test.ts': {
    type: 'Contract / Frontend',
    targetDomain: 'Nginx / SSOT y Rutas de API',
    targetArtifacts: [
      'apps/frontend/nginx.conf.template',
      'scripts/generate-nginx-conf.mjs',
      'apps/frontend/Dockerfile',
    ],
    description:
      'Comprueba el SSOT de nginx: nginx.conf sincronizado con la plantilla (APPS-001), generador unificado, labels OCI de la imagen y que cada ruta /api/ llegue a una ruta registrada del backend.',
  },
  'tests/frontend/page_focus.test.ts': {
    type: 'Accessibility',
    targetDomain: 'Catálogo / Foco y Anuncio de Página',
    targetArtifacts: [`${SRC}/shared/page-focus.ts`],
    description:
      'Valida el anunciador de región viva y que el foco pase al catálogo al cambiar de página, sin caer en BODY en la última.',
  },
  'tests/frontend/seo_compression.test.ts': {
    type: 'Contract / Frontend',
    targetDomain: 'SEO y Compresión',
    targetArtifacts: ['apps/frontend/index.html', 'apps/frontend/nginx.conf'],
    description:
      'Comprueba la meta description, un robots.txt válido y que gzip esté activo para texto y desactivado en /api/ y /metrics.',
  },
  'tests/frontend/skip_link_contrast.test.ts': {
    type: 'Accessibility',
    targetDomain: 'Contraste del Enlace de Salto',
    targetArtifacts: ['apps/frontend/index.html'],
    description:
      'Calcula el contraste del enlace de salto con los colores de la hoja de estilos (4,5:1 de texto y 3:1 frente al fondo) y su tamaño mínimo WCAG 2.5.8.',
  },
  'tests/frontend/skip_pagination.test.ts': {
    type: 'Accessibility',
    targetDomain: 'Enlace de Salto a la Paginación',
    targetArtifacts: [`${SRC}/shared/skip-link.ts`],
    description:
      'Valida el enlace de salto: precede al catálogo, es visible con varias páginas, lleva el foco a «Siguiente» o «Anterior» y no deja rastro en la URL.',
  },
  'tests/frontend/sticky_autohide.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Zona Fija Superior en Móvil',
    targetArtifacts: [`${SRC}/shared/sticky-autohide.ts`, 'apps/frontend/public/css/style.css'],
    description:
      'Valida que en móvil la zona fija se oculte al bajar y reaparezca al subir, que el panel abierto o el foco visible la mantengan y que fuera de móvil no se oculte.',
  },
  'tests/frontend/sticky_header.test.ts': {
    type: 'Component / DOM',
    targetDomain: 'Catálogo / Zona Fija Superior',
    targetArtifacts: [
      `${SRC}/shared/sticky-header.ts`,
      'apps/frontend/index.html',
      'apps/frontend/public/css/style.css',
    ],
    description:
      'Verifica que la zona fija publique su altura al cambiar de tamaño, que el HTML la componga de cabecera, búsqueda y filtros, y que el CSS la pegue arriba y reserve su altura.',
  },
  'tests/frontend/type_badge_contrast.test.ts': {
    type: 'Accessibility',
    targetDomain: 'Contraste de Insignias de Tipo',
    targetArtifacts: [`${SRC}/shared/pokemon-types.ts`],
    description:
      'Comprueba las 18 reglas de tipo con sus cuatro colores y el cumplimiento WCAG AA de cada insignia y del degradado Mega.',
  },
};
