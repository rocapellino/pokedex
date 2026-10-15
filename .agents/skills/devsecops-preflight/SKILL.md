---
name: devsecops-preflight
description: "Lista de comprobación de pre-vuelo obligatoria antes de abrir un Pull Request. Ejecuta linters de código, verificación estricta de tipos, calidad de Markdown, escaneo de secretos y suite multi-nivel de pruebas."
---

# devsecops-preflight

## Objetivo

Consolidar la compuerta de aseguramiento de calidad y seguridad previa al envío de Pull Requests, garantizando que ninguna regresión funcional, sintáctica, de tipos o de seguridad ingrese al repositorio.

## Checklist Obligatorio de Pre-Vuelo

El agente o desarrollador debe ejecutar secuencialmente y validar en verde los siguientes pasos:

1. **Higiene de Trabajo y Worktree Canónico:**
   - Confirmar que la tarea se ejecuta en un worktree canónico bajo `../.worktrees/pokedex/` creado mediante `npm run worktree:create`.
   - Limpiar cualquier residuo en `tmp/` antes de concluir.

2. **Linters de Código y Formateo:**

   ```bash
   npm run lint
   ```

   *Verifica Biome en 315+ archivos y comprobación de tipos estricta en backend, frontend y contratos.*

3. **Verificación Estricta de Tipos de TypeScript:**

   ```bash
   npm run typecheck
   ```

   *Compilación estricta con 0 errores TypeScript en todos los workspaces.*

4. **Calidad de Documentación Markdown:**

   ```bash
   npm run lint:md
   npm run docs:validate
   ```

   *0 violaciones MDxxx y 100% de cumplimiento en gobernanza documental sin drift.*

5. **Detección de Secretos y Fugas:**

   ```bash
   gitleaks detect --verbose --no-git
   ```

   *Verifica que no existan API keys, contraseñas ni tokens expuestos bajo las reglas de `.gitleaks.toml`.*

6. **Suite Multi-Nivel de Pruebas:**

   ```bash
   npm test
   ```

   *Ejecuta pruebas unitarias, de integración, contratos arquitectónicos y pentest de seguridad.*

7. **Consistencia de Artefactos de Dependencias:**

   ```bash
   npm run lint:ignore
   npm run lint:yaml
   ```

   *Garantiza higiene en `.gitignore` / `.dockerignore` y cumplimiento de la política de extensión `.yaml`.*

## Criterio de Aceptación

Todos los comandos deben finalizar con código de salida `0`. Si algún paso falla, el agente debe corregir el hallazgo y reejecutar el preflight antes de declarar la tarea lista para Pull Request (`READY_FOR_PR`).
