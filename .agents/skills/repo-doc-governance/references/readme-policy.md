# 📖 Política Canónica de `README.md` (`readme-policy.md`)

Esta política define los estándares editoriales, estructurales y cuantitativos que rigen el archivo `README.md` del repositorio **Pokédex**.

---

## 1. Misión del `README.md`

El `README.md` debe actuar como el **portal de bienvenida y brújula de navegación** del repositorio. Debe ser:

- **Estable:** No debe requerir cambios ante refactorizaciones internas menores ni parches de dependencias.
- **Autocontenido para Onboarding:** Cualquier ingeniero debe poder clonar el repositorio, entender el propósito del sistema y levantar la aplicación localmente en menos de 5 minutos siguiendo únicamente las instrucciones de este archivo.
- **Agnóstico y Verificable:** Reflejar las capacidades reales del código sin acoplar la arquitectura a proveedores específicos ni formular promesas de rendimiento no respaldadas.

---

## 2. Estructura Canónica Recomendada

El archivo `README.md` debe estructurarse estrictamente en las siguientes secciones (máximo 12 secciones principales):

1. **Título e Identidad Visual:** Nombre del proyecto, descripción de una línea y badges esenciales de estado (CI, cobertura, release).
2. **Propósito y Visión General:** Qué es Pokédex, a quién sirve y qué problemas de arquitectura resuelve.
3. **Características Destacadas:** Catálogo interactivo, backoffice, capacidades generativas con Gemini e ingeniería Cloud-Native.
4. **Arquitectura del Sistema (Resumen):** Diagrama conceptual de alto nivel (Frontend, Backend unificado, PostgreSQL, Redis) y mención de portabilidad K8s.
5. **Stack Tecnológico:** Tabla sintética con las tecnologías core (Node.js 22, TypeScript, Express, PostgreSQL 16, Redis 7, Helm).
6. **Requisitos Previos:** Requisitos mínimos de sistema (Node.js LTS, Docker Engine).
7. **Puesta en Marcha Local (Quickstart):** Comandos paso a paso (`npm install`, `npm run dev`, `docker compose up`).
8. **Estrategia y Ejecución de Pruebas:** Comandos para suites unitarias, de integración, linters y Markdown.
9. **Despliegue y Orquestación:** Resumen agnóstico de despliegue mediante Helm/ArgoCD hacia Kubernetes.
10. **Seguridad y Cumplimiento:** Resumen de DevSecOps de alto nivel y enlace explícito a [SECURITY.md](../../../SECURITY.md).
11. **Índice de Documentación:** Enlaces hacia las guías técnicas en `docs/` organizadas por dominio.
12. **Licencia y Gobernanza:** Licencia del proyecto y lineamientos de contribución.

---

## 3. Presupuesto Cuantitativo (*Documentation Budget*)

Para evitar el crecimiento descontrolado y mantener alta legibilidad:

| Métrica | Límite Máximo | Justificación |
| :--- | :---: | :--- |
| **Líneas Totales** | **260 líneas** | Garantiza lectura completa en menos de 3 minutos. |
| **Secciones Principales (`##`)** | **12 secciones** | Evita la dispersión temática y la fatiga visual. |
| **Diagramas Mermaid** | **1 diagrama** | Un único diagrama arquitectónico conceptual de alto nivel. |
| **Comandos de Terminal** | **≤ 10 bloques** | Solo comandos de onboarding y validación inmediata. |

---

## 4. Criterios de Evaluación y Detección de Deriva

Durante las auditorías de gobernanza documental, el evaluador debe contrastar:

1. **¿El stack listado coincide con `package.json` y `infra/helm/`?**
   - Si el README indica Python o frameworks no utilizados, marcar como `DRIFT_HIGH`.
2. **¿Los comandos de ejecución rápida funcionan en un entorno limpio?**
   - Si un script referenciado no existe en `package.json` o `scripts/`, marcar como `DRIFT_HIGH`.
3. **¿La arquitectura se presenta como agnóstica?**
   - Si se presenta AWS, GCP o Proxmox como requisito mandatorio en vez de runtime soportado, marcar como `DRIFT_HIGH`.
4. **¿Existen enlaces rotos hacia `docs/`?**
   - Todo link relativo debe resolver a un archivo Markdown existente en disco.
