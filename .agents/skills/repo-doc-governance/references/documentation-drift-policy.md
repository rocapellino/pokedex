# 🔍 Política de Detección y Clasificación de Deriva Documental (`documentation-drift-policy.md`)

Esta política formaliza el modelo de detección, clasificación por severidad y tratamiento de la deriva entre la documentación y el estado real del repositorio (**Documentation Drift**).

---

## 1. Definición de Deriva Documental (*Documentation Drift*)

Existe **deriva documental** cuando una afirmación, instrucción, diagrama o referencia presente en los archivos Markdown del repositorio contradice, omite o tergiversa la realidad comprobable del código fuente, dependencias, infraestructura, pipelines de CI o pruebas automatizadas.

---

## 2. Taxonomía de Clasificación de Afirmaciones

Para analizar el grado de volatilidad y riesgo de desactualización, cada afirmación relevante en la documentación se clasifica en una de las siguientes categorías:

| Categoría | Definición | Ejemplo | Riesgo de Drift |
| :--- | :--- | :--- | :---: |
| **`STABLE`** | Conceptos fundacionales de dominio y propósitos centrales. | "Pokédex es un catálogo interactivo de especímenes." | Muy Bajo |
| **`DYNAMIC`** | Runtimes, dependencias principales y versiones semánticas. | "Node.js 22 LTS", "TypeScript 5.x" | Medio |
| **`TECHNICAL`** | Patrones de código, schemas de base de datos o contratos API. | "Validación de esquema con Zod en endpoints POST." | Medio |
| **`OPERATIONAL`** | Comandos de despliegue, scripts de migración o variables de entorno. | "npm run dev", "docker compose up" | Medio-Alto |
| **`SECURITY`** | Protocolos de reporte, controles de acceso y gestión de secretos. | "Secretos inyectados dinámicamente con Vault y ESO." | Alto |
| **`TEMPORARY`** | Estados transitorios de migración o sprints activos. | "En proceso de refactorización hacia microservicios." | Crítico |
| **`HISTORICAL`** | Decisiones pasadas, bitácoras o auditorías fechadas. | "ADR-001: Adopción inicial de Node.js." | Solo Lectura |
| **`UNSUPPORTED`** | Afirmaciones de rendimiento o capacidades sin evidencia comprobable. | "Despliegue garantizado en menos de 30 segundos." | Inaceptable |

---

## 3. Niveles de Severidad de Deriva (*Drift Severity Matrix*)

Cuando se detecta una discrepancia entre un documento y la evidencia del repositorio, se le asigna uno de los siguientes niveles de severidad:

### 🔴 `CRITICAL` (Bloqueo Inmediato de PR)

Información errónea o engañosa sobre aspectos críticos de seguridad, acceso y supervivencia del sistema:

- Procedimientos de autenticación, autorización o gestión de secretos erróneos (ej. documentar Sealed Secrets cuando el runtime usa Vault).
- Exposición de rutas internas de credenciales o claves privadas.
- Protocolos de reporte de vulnerabilidades rotos o inaccesibles.
- Instrucciones de despliegue en producción que provocarían destrucción o pérdida irreversible de datos.

### 🟠 `HIGH` (Requiere Corrección antes del Merge)

Discrepancias arquitectónicas o de infraestructura que desorientan al equipo o rompen la portabilidad:

- Declarar que la aplicación corre en un runtime o lenguaje diferente al real (ej. documentar Python cuando el backend es TypeScript).
- Declarar requerimientos de proveedores propietarios obligatorios (ej. requerir AWS EKS cuando la arquitectura es K8s portable).
- Comandos de inicio rápido (`npm run dev`) que fallan por parámetros inexistentes.
- Afirmaciones de arquitectura que contradicen los manifiestos Helm vigentes.

### 🟡 `MEDIUM` (Corrección en el Ciclo Actual)

Información desactualizada que no impide el funcionamiento pero introduce ruido cognitivo:

- Versiones de parches secundarias desalineadas (ej. `v1.78.0` vs `v1.78.4`).
- Nombres de herramientas o dependencias auxiliares renombradas.
- Enlaces hacia secciones renombradas de documentos internos.

### 🟢 `LOW` (Mejora Editorial)

Desviaciones estéticas o menores de formato:

- Redundancia de explicaciones en múltiples párrafos.
- Errores tipográficos menores o inconsistencias de estilo.

---

## 4. Umbral de Aprobación en Pull Requests (`repo-pr`)

Para que la compuerta de **Documentation Governance** apruebe un Pull Request:

```text
CRITICAL Drift:  0 permitido (FAIL automático si > 0)
HIGH Drift:      0 permitido (FAIL automático si > 0)
MEDIUM Drift:    ≤ 3 permitidos (WARNING informativo)
LOW Drift:       Permitido (No bloqueante)
```
