# ⚡ Pokémon: Monorepo

[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.21+-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![Google AI Studio](https://img.shields.io/badge/Google_AI_Studio-Gemini_2.5_Flash-4285F4?style=flat&logo=google&logoColor=white)](https://aistudio.google.com/)
[![Docker](https://img.shields.io/badge/Docker-27+-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.30+-326CE5?style=flat&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Helm](https://img.shields.io/badge/Helm-3.17-0F1689?style=flat&logo=helm&logoColor=white)](https://helm.sh/)
[![Security: Gitleaks](https://img.shields.io/badge/Security-Gitleaks_Protected-green?style=flat&logo=shield)](https://github.com/gitleaks/gitleaks)

---

## 1. Arquitectura del Sistema


```text
                             [ Usuarios / Navegadores ]
                                         │
                                         ▼ (HTTP :80 / :8080)
               ┌──────────────────────────────────────────────────┐
               │    Capa 1: Ingress / Nginx Reverse Proxy (DMZ)    │
               │  • Servido de estáticos HTML5/CSS3/JS Vanilla    │
               │  • Cabeceras de seguridad estrictas (CSP, CORS)  │
               └─────────────────────────┬────────────────────────┘
                                         │
                                         ▼ (HTTP interno :3000)
               ┌──────────────────────────────────────────────────┐
               │   Capa 2: Backend Pokédex Server (Express + TS)  │
               │  • Rate Limiting (Ventana deslizante en memoria) │
               │  • Autenticación Timing-Safe (SHA-256 + crypto)  │
               │  • Catálogo indexado en memoria O(1) con ETags   │
               │  • Exportador nativo de métricas (/metrics)      │
               └──────────────┬───────────────────┬───────────────┘
                              │                   │
                              ▼ (PokeAPI / SDK)   ▼ (SDK @google/genai)
                   ┌──────────────────┐   ┌────────────────────────┐
                   │  Catálogo PokéAPI│   │   Google AI Studio     │
                   │  (1.025 Pokémon) │   │   (Gemini 2.5 Flash)   │
                   └──────────────────┘   └────────────────────────┘
                              │
                              ▼ (Capa 3: Persistencia Segura)
               ┌──────────────────────────────────────────────────┐
               │  PostgreSQL 16 StatefulSet + Redis 7 Caché       │
               │  (Aislamiento total con Kubernetes NetworkPolicy)│
               └──────────────────────────────────────────────────┘
```