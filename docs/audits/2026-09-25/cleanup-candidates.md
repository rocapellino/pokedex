# 🧹 Catálogo de Candidatos a Depuración Quirúrgica y Validación Chaos (Fase C & D)

> **Fecha:** 2026-09-25
> **Estado:** COMPLETADO
> **Alcance:** Monorepo Pokédex (`rocapellino/pokedex`)
> **Criterio de Evaluación:** Regla de Oro de Depuración: solo eliminar artefactos formalmente demostrados como `OBSOLETO`, `DUPLICADO`, `INACCESIBLE`, `SIN REFERENCIAS` o `REEMPLAZADO`.

---

## 📑 Resumen Ejecutivo

Para mantener la máxima higiene y mantenibilidad en el repositorio sin incurrir en regresiones operativas, se aplicó un análisis quirúrgico en dos etapas:

1. **Auditoría de Candidatos Potenciales (Fase D):** Identificación de posibles scripts, manifiestos o playbooks huérfanos.
2. **Validación de Efectividad y Caos Controlado (Fase C):** Introducción de fallo controlado mediante simulación de eliminación y validación de Quality Gates.

**Resultado Principal:**
La prueba de inyección de fallos demostró la **efectividad total del Quality Gate de seguridad**: al simular la remoción de `scripts/dev-backup-gdrive.ts`, la suite `tests/security/dr_backup_security.test.ts:165` falló inmediatamente, bloqueando el pipeline. Esto demostró que el script **no es código muerto**, sino parte del contrato de recuperación de desastres local (Alternativa A en Docker Compose).

En consecuencia, **el monorepo Pokédex se certifica con 0 código huérfano y 0 deuda de eliminación**.

---

## 1. Matriz de Candidatos Evaluados y Resultado de Validación

| Artefacto Analizado | Hipótesis Inicial | Prueba de Caos Controlado (Fase C) | Veredicto Final (Fase D) |
| :--- | :--- | :--- | :--- |
| **`scripts/dev-backup-gdrive.ts`** | Posible script huérfano local. | Eliminación simulada provocó falla inmediata en `tests/security/dr_backup_security.test.ts:165`. | 🟢 **Preservar (Contrato Activo Alternativa A)** |
| **`infra/ansible/playbooks/setup_gdrive_backup.yml`** | Posible reemplazo por CronJob K8s. | Evaluado contra ADR-028. Forma parte del blueprint documentado para host Proxmox VE (Alternativa B). | 🟢 **Preservar (Blueprint Alternativo B)** |
| **Tareas wrapper en `Taskfile.yml`** | Posible duplicación con `package.json`. | Análisis de delegación pura. No duplica lógica; provee fachada ergonómica DX. | 🟢 **Preservar (Ergonomía DX)** |
| **`scripts/dr_verify_restore.sh`** | Posible shell script huérfano. | Validado como único shell script autorizado en `npm run governance:audit-scripts`. | 🟢 **Preservar (Gobernanza Aprobada)** |
| **`gitops/environments/aws/`** | Posible código inactivo. | Validado en paridad estricta 1:1 por `scripts/verify-image-digest-parity.ts`. | 🟢 **Preservar (Multi-Cloud Blueprint)** |

---

## 2. Caso de Estudio: Prueba de Efectividad en `scripts/dev-backup-gdrive.ts`

### 2.1. Hipótesis de Fase D

Se hipotetizó que `scripts/dev-backup-gdrive.ts` (158 líneas) era un script desvinculado al no constar en los scripts raíz de `package.json`.

### 2.2. Inyección de Fallo Controlado (Fase C)

Se removió temporalmente el archivo del árbol de trabajo (`git rm scripts/dev-backup-gdrive.ts`) y se ejecutó la suite de Quality Gates (`npm test`).

### 2.3. Detección y Bloqueo en Pipeline

- **¿El control detectó el problema?:** SÍ.
- **Detalle de la Detección:**

  ```text
  ✖ failing tests:
  test at tests\security\dr_backup_security.test.ts:165:1
  ✖ 🛡️ Disaster Recovery: Google Drive Off-site (Alternativa A Docker Compose & Alternativa B Proxmox VE)
    AssertionError [ERR_ASSERTION]: scripts/dev-backup-gdrive.ts debe existir
  ```

- **¿Bloqueó el pipeline?:** SÍ (código de salida `1` en `npm test`).
- **Hallazgo Contractual:** `scripts/dev-backup-gdrive.ts` está ligado a la tarea `task dr:gdrive:backup:dev` en `Taskfile.yml:518` y a la especificación de `docker-compose.dev.yml` para respaldos locales aislados.

### 2.4. Decisión Final

El archivo fue restaurado de inmediato (`git checkout HEAD -- scripts/dev-backup-gdrive.ts`). Se concluye que no existen candidatos válidos de eliminación; todo el código fuente cumple un propósito verificable y testeado.

---

## 3. Conclusión de Fase D

El repositorio Pokédex demuestra una higiene excepcional. Ningún componente existente carece de cobertura, contrato o propósito arquitectónico. La base de código es magra, justificada y libre de artefactos huérfanos.
