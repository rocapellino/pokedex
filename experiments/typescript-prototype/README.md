# 🧪 TypeScript / Express Prototype (Experimental)

> [!WARNING]
> Este directorio contiene una implementación experimental y prototipo del backend en **TypeScript con Express.js y `@google/genai`**.
> **NO está destinado para despliegue en producción**. La fuente de verdad y backend productivo oficial de esta plataforma es el servicio Python FastAPI ubicado en [`apps/api`](../../apps/api).

---

## 📌 Propósito de este Prototipo

Este prototipo se desarrolló durante el análisis de alternativas arquitectónicas documentado en:
* [`docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md`](../../docs/architecture/ANALISIS_LENGUAJES_Y_MEJORES_PRACTICAS.md)

### Objetivos exploratorios:
1. Comparar latencias y concurrencia entre runtime Node.js/Bun (TypeScript) y Python 3.13 (FastAPI/Uvicorn).
2. Evaluar el SDK `@google/genai` en TypeScript frente a `google-genai` en Python.
3. Servir como referencia de tipado estricto con interfaces de TypeScript (`Pokemon`, `PokemonCharacteristics`, `PokemonStats`).

---

## 🚀 Ejecución Local (Solo para Pruebas / Benchmarking)

```bash
# Desde la raíz del repositorio
npm install
npm run dev # Ejecuta tsx experiments/typescript-prototype/server.ts
```
