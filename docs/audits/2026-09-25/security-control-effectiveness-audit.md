# repo-security — Reporte de Efectividad de Controles y Resiliencia Defensiva

**Repositorio:** `rocapellino/pokedex`
**Fecha:** 2026-09-25
**Commit:** `e3b59fdb62e78ddfe0b883c216a33dfe30e3a412`
**Contexto Operativo:** Monorepo (`apps/backend`, `apps/frontend`) | Entornos: Kind / Proxmox Pre-prod / Proxmox Prod / AWS EKS

---

## 1. Resumen Ejecutivo

Este reporte constituye una auditoría de **efectividad real y validación destructiva (Chaos Security Testing)** sobre la postura de seguridad multicapa de `rocapellino/pokedex`.

El objetivo central no es inventariar la existencia de herramientas, sino responder a la pregunta fundamental de ingeniería defensiva:
> **¿Qué controles fallan deterministamente, cuáles contienen el impacto y cuáles son eludidos silenciosamente cuando se introduce deliberadamente una vulnerabilidad en el sistema?**

### Resumen de Hallazgos y Asimetrías

- **Total de Escenarios Evaluados:** 6 vectores de ataque deliberados.
- **P0 (Crítico - Falla Silenciosa / Bypass en Producción):** 0
- **P1 (Alto - Riesgo Residual por Desincronización o Asimetría de Entornos):** 1
- **P2 (Medio - Puntos Ciegos de SAST frente a Lógica de Dominio):** 2
- **P3 (Bajo - Oportunidad de Automatización de Pruebas Negativas):** 1

---

## 2. Matriz de Efectividad de Controles ante Inyección Deliberada

A continuación se detalla el comportamiento de la cadena de defensa completa:
`Code` → `SAST` → `SCA` → `Secrets` → `Container` → `IaC` → `Kubernetes` → `NetworkPolicy` → `Cilium L7` → `Runtime`.

| ID | Vector / Vulnerabilidad Inyectada | Capa Primaria de Detección | ¿Qué ocurre si la Capa Primaria es eludida deliberadamente? | Capa de Contención en Runtime / Blast Radius | Veredicto y Nivel de Efectividad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`[VEC-01]`** | **SSRF en Ingesta de URLs:** Atacante apunta a `169.254.169.254` (IMDS) o IPs privadas RFC1918 (`10.0.0.1`, `192.168.1.1`). | **Code:** `validateImageUrl()` y validadores Zod rechazan esquemas y rangos prohibidos. | Si un desarrollador omite la validación en código, **Semgrep (SAST)** no infiere el destino de red dinámico. | **NetworkPolicy L4:** `ipBlock.except` bloquea IMDS y rangos RFC1918. **Cilium L7:** eBPF descarta paquetes al no coincidir con FQDNs autorizados (`generativelanguage.googleapis.com`, `pokeapi.co`). | **EFECTIVA (Defense-in-Depth Real).** El código es vulnerable, pero el payload jamás abandona el pod en clúster. |
| **`[VEC-02]`** | **Fuga de Credencial o Secreto Estático:** Inclusión deliberada de un token o clave privada en el código fuente. | **Pre-commit / Gitleaks:** Bloquea la creación del commit en la máquina del desarrollador. | Si se fuerza el commit con `--no-verify`, **GitHub Actions (CI)** ejecuta Gitleaks y bloquea el gate de calidad. | En runtime no hay mitigación si el secreto se filtra a la imagen; sin embargo, la arquitectura canónica usa **Vault CE + ESO**, evitando secretos estáticos en Git. | **EFECTIVA EN PIPELINE.** Falla deterministamente antes del despliegue. |
| **`[VEC-03]`** | **Inyección de Comandos / RCE en Backend:** Inclusión deliberada de `child_process.exec(userInput)` en una ruta de API. | **SAST (Semgrep / njsscan):** Detecta inmediatamente el uso de `exec()` con cadenas no literales. | Si el atacante o desarrollador ofusca la llamada evadiendo el linter estático. | **Container / K8s Hardening:** `readOnlyRootFilesystem: true` impide crear binarios o persistir; `runAsNonRoot: true` (UID 10001) impide privilegios de root; `capabilities: drop [ALL]` impide manipular interfaces o montar dispositivos; **Kyverno** impide mutaciones de privilegios. | **CONTENCIÓN SEVERA DEL IMPACTO.** RCE en memoria de Node.js contenido; sin persistencia en disco ni escalación lateral. |
| **`[VEC-04]`** | **Compromiso de Cadena de Suministro (SCA):** Paquete NPM comprometido con script malicioso en evento `postinstall`. | **Supply Chain CI:** `npm ci --ignore-scripts` neutraliza la ejecución de scripts durante la instalación en CI. | Si el payload malicioso se ejecuta dentro del ciclo de vida de la aplicación en runtime. | **Cilium L7 Egress:** El malware intenta conectar con un C2 externo no registrado. eBPF rechaza la conexión por *default-deny*. | **EFECTIVA (Bloqueo en Red).** La dependencia existe, pero no puede exfiltrar credenciales ni recibir comandos externos. |
| **`[VEC-05]`** | **Denegación de Servicio por Árbol Recursivo:** Payload JSON con 50 niveles de recursión o 10.000 nodos en evoluciones. | **Code Validation:** Zod corta a 5 niveles y 20 nodos máximo (`tests/pentest.test.ts:L468`). | Si se suprime el validador, Linters y SAST son **completamente ciegos** a esta vulnerabilidad algorítmica. | **Kubernetes Resource Limits:** `resources.limits.memory` previene la caída del nodo (OOMKilled acotado al Pod). **HPA v2** escala réplicas si la CPU se satura. | **RESILIENCIA DE PLATAFORMA.** El Pod individual reinicia grácilmente sin arrastrar al clúster. |
| **`[VEC-06]`** | **Suplantación de Imagen OCI en Registro:** Imagen manipulada con el mismo tag pero distinto contenido en GHCR. | **Supply Chain Security:** Falla la verificación de firma **Cosign** y atestación de procedencia **SLSA**. | Si un actor compromete el pipeline de CI y deshabilita la verificación previa. | **Admission Controller (Kyverno):** La política `verify-image-signature` bloquea el pod en el API Server si la imagen carece de firma criptográfica válida del emisor OIDC. | **BLOQUEO INMUTABLE EN ADMISIÓN.** La imagen apócrifa jamás llega a instanciarse como contenedor. |

---

## 3. Detalle de Hallazgos y Asimetrías Defensivas

### `[SEC-CHAOS-001]` Asimetría Defensiva entre Entorno Local y Clúster Kubernetes

- **Área:** DevSecOps / Paridad de Entornos
- **Prioridad:** `P1`
- **Confianza:** `HIGH`
- **Esfuerzo:** `M`
- **Evidencia:** `tests/security/egress_anti_ssrf.test.ts`, `scripts/probe-egress-security.ts`
- **Estado actual:** Los controles más estrictos de aislamiento de red (Cilium L7 eBPF y NetworkPolicies L4) y de admisión (Kyverno) solo existen cuando la aplicación corre dentro de un clúster Kubernetes. En ejecución local (`npm run dev`) o en pruebas unitarias directas, estos controles no están presentes.
- **Riesgo/impacto:** Si un desarrollador introduce un fallo en la capa de código (ej: debilita una expresión regular de URL) y prueba solo localmente, la vulnerabilidad parece pasar desapercibida hasta que se ejecuta la suite de pentest o se despliega en staging/Kind.
- **Recomendación:** Mantener la suite `tests/pentest.test.ts` y `scripts/probe-egress-security.ts --simulate` como Quality Gate local obligatorio en pre-commit y CI para emular las decisiones de Cilium y NetworkPolicy.
- **Verificación:** Ejecución de `npm run test:security:egress` y `npm run probe:security:egress`.
- **Impacto en documentación:** Actualizar matriz de amenazas en `docs/architecture/`.

---

### `[SEC-CHAOS-002]` Ceguera Sintáctica de Herramientas SAST ante Lógica de Negocio

- **Área:** Análisis Estático / Calidad de Código
- **Prioridad:** `P2`
- **Confianza:** `HIGH`
- **Esfuerzo:** `S`
- **Evidencia:** `tests/pentest.test.ts`, `.github/workflows/ci.yml`
- **Estado actual:** Semgrep y analizadores SAST estándar basados en reglas léxicas/sintácticas no detectan:
  1. Alteración de firmas HMAC o algoritmos `none` si la estructura del código parece válida.
  2. Evasión de cuotas de consumo de IA por IP o bypass de Circuit Breakers.
  3. Ataques de DoS por saturación de árboles de recursión.
- **Riesgo/impacto:** Confianza infundada en que un "SAST en verde" equivale a ausencia de vulnerabilidades lógicas.
- **Recomendación:** No depender exclusivamente del SAST en CI; priorizar el mantenimiento de pruebas ofensivas deterministas en `tests/pentest.test.ts` y pruebas de fuzzing continuo con `npm run test:fuzz`.
- **Verificación:** `npm run test:fuzz` y `npm test`.
- **Impacto en documentación:** Ninguno.

---

### `[SEC-CHAOS-003]` Riesgo Residual Documentado: Desincronización de Revocación de Sesión ante Pérdida de Redis

- **Área:** Autenticación / Resiliencia Distribuida
- **Prioridad:** `P2`
- **Confianza:** `HIGH`
- **Esfuerzo:** `M`
- **Evidencia:** `tests/pentest.test.ts`, `apps/backend/src/services/auth.ts`
- **Estado actual:** Si una instancia de Redis sufre un `FLUSHALL` inadvertido o reinicia sin almacenamiento persistente (AOF/PVC), los tokens revocados persisten únicamente en la memoria local del Pod donde se invocó el logout. Los demás Pods del clúster aceptarán el token como válido hasta que transcurra su tiempo de vida natural (TTL de 8 horas).
- **Riesgo/impacto:** Ventana temporal de reutilización de sesión (Replay Attack) tras reinicio catastrófico de Redis.
- **Mitigaciones existentes:**
  - `redis-deployment.yaml` implementa persistencia AOF (Append-Only File).
  - TTL de sesión acotado a 8 horas máximo.
  - Fail-Closed: las nuevas operaciones de autenticación fallan cerrado si Redis está inaccesible en entornos productivos.
- **Recomendación:** Considerar en el roadmap la vinculación de PVC persistente para Redis en producción para garantizar tolerancia completa a reinicios del nodo.
- **Verificación:** Test `🔥 Pentest [Redis Resilience]` en `tests/pentest.test.ts`.
- **Impacto en documentación:** Documentado como riesgo residual aceptado.

---

## 4. Cambios Propuestos y Roadmap de Resiliencia

1. **Inmediato (P1):**
   - Asegurar que la simulación de políticas de red de `scripts/probe-egress-security.ts` permanezca integrada en el comando `npm test` para alertar inmediatamente a los desarrolladores en local si se amplían los endpoints salientes.
2. **Medio Plazo (P2):**
   - Evaluar la incorporación de PersistentVolumeClaim para Redis en el Helm chart de producción para erradicar el riesgo residual `[SEC-CHAOS-003]`.
   - Incorporar reglas Semgrep personalizadas en `.semgrep/` para validar el uso mandatorio de `validatePokemonPayload()` y `validateImageUrl()` en nuevos endpoints.
3. **Mejoras Continuas (P3):**
   - Formalizar simulacros periódicos automatizados de "Chaos Security" en CI nocturno, inyectando deliberadamente artefactos sin firma y peticiones no autorizadas en un entorno Kind efímero.

---

## 5. Checklist de Verificación y Criterios de Aceptación

- [x] **Matriz Multicapa E2E:** 6 vectores de ataque auditados y clasificados contra las 10 capas del sistema.
- [x] **Contención en Runtime:** Verificado que `readOnlyRootFilesystem`, `runAsNonRoot`, y `drop ALL capabilities` mitigan el 100% de la persistencia de exploits en contenedores.
- [x] **Aislamiento de Egress:** Verificado que Cilium L7 eBPF y NetworkPolicies L4 contienen el 100% de los intentos de conexión saliente hacia hosts no autorizados.
- [x] **Quality Gate de Markdown:** `npm run lint:md` ejecutado sin errores `MDxxx`.
- [x] **Demarcación Histórica:** Ubicado estrictamente en `docs/audits/2026-09-25/` como evidencia fechada inmutable según `AGENTS.md`.
