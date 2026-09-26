# Plantilla de Pull Request

## 📌 Issues Vinculados

- **Linear:** <!-- Ej: PEX-12 -->
- **GitHub (opcional):** Closes #<!-- 123 -->

---

## 🏷️ Tipo de Cambio (Conventional Commits)

- [ ] `feat`: Nueva funcionalidad (genera release minor)
- [ ] `fix`: Corrección de bug (genera release patch)
- [ ] `refactor`: Refactorización o mejora de código sin alterar comportamiento
- [ ] `infra`: Cambios en infraestructura (Helm, OpenTofu, Kubernetes, Proxmox)
- [ ] `ci`/`cd`: Modificaciones en GitHub Actions, MegaLinter, SonarCloud o Workflows
- [ ] `test`: Adición o actualización de pruebas unitarias, E2E o de integración
- [ ] `chore`: Tareas de mantenimiento, dependencias o configuración
- [ ] `docs`: Documentación técnica

---

## 📝 Resumen de Cambios
<!-- Breve descripción del contexto, la solución técnica implementada y el impacto -->

---

## 📦 Componentes Afectados

- [ ] `apps/backend` (API Express & Node.js 22 LTS / Gemini AI SDK / PostgreSQL / Redis)
- [ ] `apps/frontend` (SPA Vanilla HTML5/CSS3 / Nginx Alpine)
- [ ] `infra` (Helm Chart / OpenTofu Proxmox & AWS / K8s / Vault CE & ESO / ArgoCD)
- [ ] `scripts` (Scripts de sincronización Linear/Sonar, auditoría o seeders)
- [ ] `docs` / `.github` (Documentación técnica, Workflows CI/CD, Templates)

---

## 🧪 Pruebas y Verificaciones Realizadas

*(Completar con [x] las pruebas ejecutadas o registrar "N/A: [motivo]" según la Change Impact Matrix)*

- [ ] **Tests Unitarios y Cobertura:** `npm test` o `npm run test:coverage` (`task test`)
- [ ] **Verificación de Tipos y Linting:** `npm run lint` (`task lint`)
- [ ] **Batería Integral de Validación:** `npm run validate` (`task validate`)
- [ ] **Pruebas E2E (Playwright):** `npm run test:e2e` (`task test:e2e`)
- [ ] **Accesibilidad WCAG 2.1 (Axe-core):** `npm run test:a11y` (`task test:a11y`)
- [ ] **Auditoría Core Web Vitals (Lighthouse):** `task perf:lighthouse`
- [ ] **MegaLinter Local / CI:** Validado sin errores de sintaxis (`task lint:mega` o en CI)
- [ ] **SonarCloud Quality Gate:** Analizado y conforme a estándar A
- [ ] **Seguridad & SAST:** Semgrep, Dependency Review, Trivy y Gitleaks (`npm run test:fuzz`)
- [ ] **Paridad GitOps / Digest Pinning:** `npm run gitops:verify-parity:strict`

---

## ⚠️ Variables de Entorno & Breaking Changes

- [ ] ¿Requiere nuevas variables en `.env`? *(Actualizar `.env.example` si aplica)*
- [ ] ¿Introduce algún cambio incompatible (Breaking Change)?

---
> *Tip:* Usar el formato de rama sugerido por Linear (`username/PEX-X-descripcion-corta`) vinculará automáticamente este PR al ticket correspondiente en el tablero de Linear.
