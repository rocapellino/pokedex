# ADR-009: Arquitectura de Resiliencia, Contratos Estructurados y Mitigación de Fallas para Servicios de Inteligencia Artificial (Google Gemini)

## Estado

Aceptado

## Contexto

La integración de modelos fundacionales de inteligencia artificial generativa (LLMs) como Google Gemini para enriquecer la experiencia de usuario de la plataforma Pokédex (asistente de arquitectura para diagramas Mermaid y generador de maquetaciones UI reactivas) introduce retos operacionales y de seguridad particulares:

1. **Variabilidad de Red y Cuotas**: Riesgo de degradación por latencia en llamadas externas o bloqueos por agotamiento de cuotas (HTTP 429 Too Many Requests).
2. **Ambigüedad en Salidas No Estructuradas**: Las respuestas en texto libre o bloques Markdown sin esquema rígido son susceptibles de romper la integración frontend ante alucinaciones o cambios imprevistos de sintaxis.
3. **Vectores de Inseguridad en LLMs**: Exposición a ataques de *Prompt Injection*, manipulación de contexto de sistema e intentos de evasión de instrucciones (*jailbreak*).
4. **Continuidad Operativa Offline**: El sistema no debe degradarse ni fallar catastróficamente en entornos donde no se disponga de conexión a Internet, en pipelines de CI efímeros o cuando la variable `GEMINI_API_KEY` no esté configurada.

## Decisión

Se adopta una arquitectura de resiliencia y contratos estructurados de siete capas para el subsistema de IA (`apps/backend/src/services/ai.ts`):

1. **SDK Canónico y Modelo Optimizado (`@google/genai`)**:
   - Adopción exclusiva del SDK oficial de Google Gen AI (`GoogleGenAI`), configurando el modelo `gemini-2.5-flash` por defecto por su balance óptimo de velocidad, precisión de razonamiento y consumo eficiente de tokens.

2. **Contratos Estructurados Obligatorios (`responseMimeType: 'application/json'`)**:
   - Se forzó el modo estructurado JSON en las llamadas al modelo, tipando estrictamente las respuestas mediante interfaces TypeScript (`generateDiagram` con `{ mermaid_code, explanation }` y `generateMockup` con `{ html_code, design_tokens }`).
   - Se eliminó el parseo frágil basado en expresiones regulares para bloques Markdown.

3. **Patrón Circuit Breaker (`AICircuitBreaker`)**:
   - Implementación de un disyuntor en memoria con tres estados (`CLOSED`, `OPEN`, `HALF_OPEN`).
   - Si se registran 3 fallos consecutivos (por timeout, cuota o error 5xx del upstream), el circuito pasa a `OPEN`, interrumpiendo las llamadas externas durante un período de enfriamiento (*cooldown* de 30 segundos) para prevenir la saturación de recursos.

4. **Caché Semántica Distribuida en Redis**:
   - Normalización del prompt y cálculo de clave única SHA-256 (`getSemanticCacheKey`), almacenando respuestas validadas con un TTL de 24 horas en Redis.
   - Provee latencias sub-3ms para solicitudes idénticas o recurrentes, reduciendo drásticamente el consumo de cuota de API.

5. **Sanitización Semántica contra Prompt Injection (`sanitizePrompt`)**:
   - Delimitación de longitud máxima (500 caracteres) para neutralizar intentos de DoS o saturación de tokens.
   - Neutralización preventiva de bloques de escape markdown (` ``` `), suplantación de roles de sistema (`system:`, `user:`, `assistant:`) y patrones conocidos de desacato de directivas previas (*jailbreaks*).

6. **Degradación Elegante y Fallback Determinista Local**:
   - Si el circuito está abierto, la API externa no está disponible o `GEMINI_API_KEY` no está configurada, el servicio responde inmediatamente mediante generadores deterministas locales (`getDeterministicDiagram` y `getDeterministicMockup`).
   - Cero tiempo de inactividad para el usuario final y compatibilidad total en pruebas automatizadas y entornos de desarrollo offline.

7. **Telemetría y Observabilidad en Tiempo Real**:
   - Exposición de métricas nativas en `/metrics`: `pokedex_ai_circuit_breaker_open` (1/0) y `pokedex_ai_circuit_breaker_failures`.
   - Regla de alerta Prometheus `PokedexAICircuitBreakerOpen` en `infra/monitoring/alerts.yml` y procedimiento operativo estándar SOP 3.7 en `docs/operations/observability-alerts.md`.

## Consecuencias

- **Positivas**:
  - Resiliencia de nivel empresarial: la plataforma nunca bloquea las solicitudes de usuario ante indisponibilidad de proveedores externos de IA.
  - Mitigación efectiva de ataques de inyección y sobrecostos por saturación de tokens.
  - Observabilidad continua que permite a los operadores diagnosticar cuotas y latencias desde Alertmanager y Grafana.
  - Facilidad de pruebas en CI sin requerir credenciales externas reales.

- **Compensaciones**:
  - Durante el período en que el circuito permanezca abierto, las respuestas generadas son representaciones locales estructuradas en lugar de inferencias dinámicas de Gemini.
