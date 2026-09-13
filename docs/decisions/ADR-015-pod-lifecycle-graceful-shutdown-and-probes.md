# ADR-015: Estrategia de Terminación Grácil (Graceful Shutdown), Sondas de Salud y Ciclo de Vida de Pods

## Estado

Aceptado

## Contexto

En clústeres Kubernetes de alta disponibilidad, los Pods de backend (`pokemon-api`) y frontend (`pokemon-web`) operan en un entorno efímero y elástico. Se encuentran sujetos a eventos frecuentes de desalojo voluntario e involuntario:

1. **Desescalado Elástico del HPA**: Al disminuir la demanda de tráfico, el Horizontal Pod Autoscaler reduce réplicas de forma dinámica.
2. **Despliegues Continuos y Rolling Updates**: Nuevas versiones desplegadas mediante ArgoCD o Helm reemplazan progresivamente réplicas antiguas por nuevas.
3. **Mantenimiento Operativo de Nodos**: Comandos como `kubectl drain` o actualizaciones del sistema operativo anfitrión desalojan Pods para reiniciar nodos físicos o máquinas virtuales.

Si la aplicación no orquesta adecuadamente su ciclo de vida y terminación:

- Las peticiones HTTP en vuelo se interrumpen abruptamente con errores de socket roto (`ECONNRESET` o `502 Bad Gateway` en los clientes).
- Las conexiones abiertas hacia el pool de PostgreSQL y las sesiones de Redis quedan huérfanas en el servidor hasta que expiren sus *keep-alive timeouts*, consumiendo descriptores de archivo y agotando la capacidad de los poolers (`PgBouncer`).
- Si las sondas de Kubernetes (*Probes*) no reflejan fielmente el estado interno del proceso, el API Server podría continuar enrutando tráfico a Pods que ya comenzaron su secuencia de terminación.

## Decisión

Se adopta una arquitectura de ciclo de vida de Pods estandarizada y coordinada en cinco directivas técnicas:

1. **Captura y Orquestación de Señales de Terminación (`SIGTERM` / `SIGINT`)**:
   - `apps/backend/server.ts` implementa la función `setupGracefulShutdown`, escuchando las señales `SIGTERM` (enviada por el kubelet) y `SIGINT`.
   - Al capturar la señal, se activa inmediatamente el indicador interno `isShuttingDown = true`.
   - Se establece un temporizador de salvaguarda (*safety timeout*) de 15 segundos mediante `setTimeout().unref()` para forzar la terminación con código de error si sockets o tareas en segundo plano quedan bloqueados.

2. **Transición Instantánea de la Sonda de Preparación (`/readyz`)**:
   - Ante `isShuttingDown = true`, el endpoint `/readyz` responde de inmediato con código HTTP `503 Service Unavailable` (`status: 'shutting_down'`).
   - Esto notifica al *EndpointSlice Controller* de Kubernetes para que desasocie el Pod del `Service` y retire su IP de las reglas de enrutamiento de kube-proxy antes de cerrar el servidor HTTP.

3. **Ventana de Amortiguación y Drenado de Conexiones HTTP**:
   - Se introduce un breve retraso configurable de amortiguación (2 segundos en producción, 10 ms en pruebas) antes de invocar `server.close()`. Esto compensa la latencia de propagación de iptables/IPVS y CoreDNS en el clúster.
   - Tras la amortiguación, `server.close()` deja de aceptar nuevas conexiones y permite que las peticiones HTTP activas finalicen su procesamiento ordenadamente.

4. **Cierre Controlado de la Capa de Persistencia y Caché (`closeStorage`)**:
   - `apps/backend/src/services/db.ts` exporta `closeStorage()`, responsable de:
     - Cancelar timers activos de reconexión y monitoreo (*heartbeat*).
     - Drenar y cerrar el pool de conexiones de PostgreSQL (`pgPool.end()`).
     - Desconectar limpiamente el cliente de Redis (`redisClient.quit()`).
   - El proceso finaliza con código de salida 0 únicamente tras confirmar el cierre de los recursos de datos.

5. **Paridad Declarativa en Manifiestos de Helm**:
   - Se estandariza `terminationGracePeriodSeconds: 30` en `infra/helm/pokedex/values.yaml` y en las plantillas `api-deployment.yaml` y `web-deployment.yaml`.
   - Se garantiza que el kubelet conceda un margen de 30 segundos entre la señal inicial `SIGTERM` y la señal forzada `SIGKILL`.
   - Se formaliza la semántica de las sondas:
     - **`livenessProbe` (`/healthz`)**: Evalúa vivacidad del event loop y servidor HTTP.
     - **`readinessProbe` (`/readyz`)**: Evalúa disponibilidad de persistencia y estado de ciclo de vida (no en apagado).

## Consecuencias

- **Positivas**:
  - Eliminación de errores `502 Bad Gateway` y cortes de conexión durante rolling updates y desescalados del HPA.
  - Cierre limpio de descriptores de sockets en PgBouncer y PostgreSQL, previniendo fuga de conexiones.
  - Compatibilidad nativa con los estándares de diseño de aplicaciones resilientes para la nube (*Cloud Native 12-Factor App*).

- **Compensaciones**:
  - El tiempo total de terminación de un Pod se incrementa entre 2 y 5 segundos para permitir el drenado limpio de peticiones.
  - Los scripts y suites de prueba deben invocar `setupGracefulShutdown` de forma controlada para no interferir con la ejecución asíncrona de tests unitarios.
