# ADR-018: Observabilidad de Extremo a Extremo con OpenTelemetry y Trazabilidad Distribuida W3C

## Estado

Aceptado

## Contexto

La plataforma Pokédex dispone de dos de los tres pilares fundamentales de la observabilidad moderna:

1. **Métricas agregadas**: Raspadas por Prometheus mediante `/metrics` y declaradas en `ServiceMonitor` (`ADR-007`).
2. **Logs estructurados**: Emitidos en JSON por `PinoStructuredLogger` y agregados por Grafana Loki (`ADR-007`).

Sin embargo, en una arquitectura distribuida que interconecta el Ingress Controller (Nginx), el frontend web estático, el backend en Node.js (Express), PgBouncer, PostgreSQL, Redis y la API externa de Google AI Studio (Gemini), la ausencia del tercer pilar (**Trazabilidad Distribuida**) presenta las siguientes deficiencias operativas:

- **Falta de correlación causal inter-servicio**: Una petición lenta no permite discernir de inmediato si el retardo proviene de la resolución DNS del Ingress, contención de conexiones en el pool de PgBouncer, latencia en consultas PostgreSQL, operaciones en Redis o tiempos de respuesta erráticos en Gemini.
- **Dificultad de seguimiento en logs**: Aunque existía un identificador `X-Request-Id` ad-hoc, su formato arbitrario no cumplía con los estándares de interoperabilidad de la industria, impidiendo enlazar visualmente trazas en Grafana Tempo o Jaeger con registros en Grafana Loki.
- **Pérdida de contexto en proxies reversos**: Sin propagación estandarizada en Nginx, las peticiones que transitan desde el cliente o el proxy perimetral pierden la continuidad del árbol de ejecución.

## Decisión

Se adopta una arquitectura de trazabilidad distribuida extremo a extremo basada en el estándar oficial **W3C Trace Context** y el ecosistema **OpenTelemetry (OTel)**, articulada en las siguientes directivas:

1. **Adopción del Estándar W3C Trace Context (`traceparent`)**:
   - Se establece la cabecera `traceparent` como el mecanismo oficial de propagación de contexto distribuido a través de todos los componentes de la plataforma.
   - El formato obedece estrictamente a la especificación W3C: `00-${trace_id}-${span_id}-${trace_flags}`:
     - `version`: `00` (hexadecimal de 2 caracteres).
     - `trace_id`: identificador global único de 16 bytes (32 caracteres hexadecimales en minúsculas, no nulo).
     - `span_id`: identificador del tramo de ejecución de 8 bytes (16 caracteres hexadecimales en minúsculas, no nulo).
     - `trace_flags`: banderas de control de muestreo de 1 byte (por defecto `01` para indicar traza muestreada).

2. **Middleware de Propagación y Normalización en Express (`requestTracer`)**:
   - En `apps/backend/src/middleware/request-tracer.ts`, el middleware intercepta cada petición HTTP entrante:
     - Valida sintácticamente el encabezado `traceparent` mediante expresión regular estricta.
     - Si la petición incluye un `traceparent` válido, preserva el `trace_id` de origen y genera un nuevo `span_id` para el contexto del backend.
     - Si la petición carece de `traceparent`, genera un `trace_id` criptográfico seguro de 32 caracteres hexadecimales y un `span_id` de 16 caracteres.
     - Mantiene compatibilidad retroactiva con clientes HTTP que consumen `X-Request-Id` o `X-Correlation-Id`.
     - Inyecta tanto `traceparent` como `X-Request-Id` en las cabeceras de respuesta HTTP (`res.setHeader`).

3. **Correlación Automática en Logs Estructurados (Loki & AsyncLocalStorage)**:
   - El contexto de traza (`traceId`, `spanId`, `traceparent`) se almacena en `AsyncLocalStorage` (`traceStorage` en `apps/backend/src/utils/logger.ts`).
   - El mixin de Pino inyecta automáticamente `traceId`, `spanId` y `traceparent` en cada registro JSON emitido hacia stdout / Loki, permitiendo navegación bidireccional inmediata en Grafana: *Log → Trace* y *Trace → Log*.

4. **Propagación L7 en Nginx Reverse Proxy**:
   - En `apps/frontend/nginx.conf` y `nginx.conf.template`, las directivas de proxy para `/api/` y `/pokemons` propagan la cabecera `traceparent`:
     `proxy_set_header traceparent $http_traceparent;`
     `proxy_set_header X-Request-ID $request_id;`
   - Si el cliente externo envía un contexto W3C, este fluye sin degradación hacia Node.js.

5. **Parametrización Declarativa en Helm**:
   - `infra/helm/pokedex/templates/configmap.yaml` y `values.yaml` incorporan las variables estándar de OpenTelemetry:
     - `OTEL_EXPORTER_OTLP_ENDPOINT`: endpoint del colector OTLP (ej. Tempo / OpenTelemetry Collector).
     - `OTEL_SERVICE_NAME`: nombre del servicio registrado (`pokedex-api`).

## Consecuencias

- **Positivas**:
  - Triangulación completa de los tres pilares de observabilidad: Métricas (Prometheus) + Logs estructurados (Loki) + Trazas distribuidas (OpenTelemetry / W3C).
  - Identificación instantánea de la raíz de latencias en llamadas a PostgreSQL, Redis o servicios externos de IA mediante visualización gráfica en cascada (*waterfall charts*).
  - Cero dependencias propietarias: W3C Trace Context es el estándar abierto de la W3C soportado nativamente por OpenTelemetry, Datadog, Grafana Tempo, AWS X-Ray y Google Cloud Trace.
  - Compatibilidad transparente para clientes legados mediante coexistencia de `traceparent` y `X-Request-Id`.

- **Compensaciones**:
  - La generación de identificadores criptográficos aleatorios (`crypto.randomBytes`) y el almacenamiento en `AsyncLocalStorage` introducen una sobrecarga de CPU despreciable (< 0.05 ms por petición).
  - En clústeres locales o de laboratorio donde el OTel Collector no esté activo, las cabeceras W3C se propagan y los logs correlacionan los identificadores localmente, mientras que la exportación OTLP permanece inactiva sin degradar el servicio.
