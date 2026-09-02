## 📌 Issues Vinculados
- **Linear:** <!-- Ej: PKE-15 / PER-6 -->
- **GitHub (opcional):** Closes #<!-- 123 -->

---

## 🏷️ Tipo de Cambio
- [ ] `feat`: Nueva funcionalidad
- [ ] `fix`: Corrección de bug
- [ ] `refactor`: Refactorización o mejora de código sin cambiar comportamiento
- [ ] `infra`: Cambios en infraestructura (Docker, Terraform, K8s, Ansible)
- [ ] `ci`/`cd`: Modificaciones en pipelines de GitHub Actions o CI
- [ ] `chore`: Mantenimiento, dependencias o tareas generales
- [ ] `docs`: Documentación

---

## 📝 Resumen de Cambios
<!-- Breve descripción del contexto, la solución implementada y el impacto -->

---

## 📦 Componentes Afectados
- [ ] `apps/api` (Backend FastAPI)
- [ ] `apps/web` (Frontend Web / Nginx)
- [ ] `infra` (Terraform / K8s / Ansible / Proxmox / Docker Compose)
- [ ] `scripts` (Scripts de mantenimiento, auditoría o seeders)
- [ ] `docs` / `.github` (Documentación, CI/CD Workflows, Dependabot)

---

## 🧪 Pruebas y Verificaciones Realizadas
- [ ] **Tests unitarios:** `pytest` ejecutado con cobertura (`task test`)
- [ ] **Linters y formato:** `ruff check` y `ruff format` sin advertencias (`task lint`)
- [ ] **Auditoría de calidad:** `python scripts/audit_code_quality.py` (`task audit`)
- [ ] **Validación IaC:** Manifiestos de K8s / Terraform validados (`infra/`)
- [ ] **Seguridad:** Verificado con Bandit / Gitleaks (`task security`)
- [ ] **Entorno local:** Probado en contenedores Docker (`task docker:up`)

---

## ⚠️ Variables de Entorno & Breaking Changes
- [ ] ¿Requiere nuevas variables en `.env`? *(Actualizar `.env.example` si aplica)*
- [ ] ¿Introduce algún cambio incompatible (Breaking Change)?

---
> *Tip:* Usar el formato de rama sugerido por Linear (`username/identifier-title`) vinculará automáticamente este PR al ticket correspondiente.
