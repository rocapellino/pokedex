# 🛡️ Política Canónica de `SECURITY.md` (`security-policy.md`)

Esta política define los estándares editoriales, estructurales y de seguridad que rigen el archivo `SECURITY.md` del repositorio **Pokédex**.

---

## 1. Misión de `SECURITY.md`

El archivo `SECURITY.md` debe ser una **política pública clara y accionable** para la notificación de incidentes de seguridad y el reporte coordinado de vulnerabilidades.

- **Foco en el Reportero:** Proporcionar al investigador o usuario externo un canal inequívoco para reportar fallos de forma segura y privada.
- **Claridad de Alcance:** Delimitar con precisión qué sistemas y versiones están cubiertos por el programa de soporte de seguridad.
- **Sobriedad Técnica:** No es una memoria técnica de DevSecOps ni una auditoría de controles. Los detalles técnicos de implementación interna pertenecen a `docs/security/`.

---

## 2. Estructura Canónica Recomendada

El archivo `SECURITY.md` debe estructurarse en las siguientes secciones (máximo 8 secciones principales):

1. **Compromiso de Seguridad:** Declaración del enfoque de seguridad por diseño del proyecto.
2. **Procedimiento de Reporte de Vulnerabilidades:** Canal privado de contacto (correo o GitHub Security Advisories) y datos requeridos en el reporte.
3. **Versiones Soportadas:** Tabla concisa indicando las ramas o versiones que reciben parches de seguridad activos.
4. **Alcance de Seguridad (*In-Scope*):** Componentes cubiertos (API, catálogo web, endpoints públicos, autenticación).
5. **Fuera de Alcance (*Out-of-Scope*):** Pruebas destructivas (DoS masivo, ingeniería social, spam de issues).
6. **Proceso y Tiempos de Respuesta:** Acuse de recibo inicial (SLA), triage, plan de remediación y liberación de parches.
7. **Política de Divulgación Coordinada (*Coordinated Disclosure*):** Compromiso de transparencia y plazos razonables antes de publicación.
8. **Referencias Técnicas de Seguridad:** Enlaces canónicos hacia [docs/security/](../../../docs/security/) y [docs/architecture/](../../../docs/architecture/).

---

## 3. Presupuesto Cuantitativo (*Documentation Budget*)

| Métrica | Límite Máximo | Justificación |
| :--- | :---: | :--- |
| **Líneas Totales** | **180 líneas** | Mantiene el documento conciso, directo y fácil de procesar. |
| **Secciones Principales (`##`)** | **8 secciones** | Evita la inclusión de inventarios o guías operativas. |
| **Tablas** | **1 tabla** | Únicamente la matriz de versiones soportadas. |
| **Diagramas** | **0 diagramas** | No se requieren diagramas en una política de reporte público. |

---

## 4. Criterios de Evaluación y Detección de Deriva

Durante las auditorías de gobernanza documental:

1. **¿Las versiones soportadas reflejan la realidad de mantenimiento?**
   - Debe listar ramas activas (`main`, líneas vigentes) sin declarar soporte irrealizable para versiones abandonadas.
2. **¿Contiene detalles excesivos de herramientas internas?**
   - Si describe paso a paso la configuración de Trivy, Semgrep o Gitleaks, marcar como `OVERDOCUMENTED`. Debe resumirse y referenciar a `docs/security/`.
3. **¿Declara endpoints o rutas de secretos inexistentes?**
   - Verificar que no mencione endpoints retirados ni rutas de secretos en Vault.
4. **¿Los SLAs de respuesta están respaldados?**
   - No formular promesas de tiempo de respuesta que no puedan cumplirse operativamente.
