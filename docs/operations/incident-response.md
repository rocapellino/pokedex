# Runbook: Respuesta ante Incidentes y Triage Operativo

## 1. Propósito

Definir la matriz de escalado, niveles de severidad y acciones inmediatas de diagnóstico y remediación ante degradación o indisponibilidad de la plataforma Pokédex.

## 2. Clasificación de Severidad

| Nivel | Definición | Criterio de Activación | SLA de Respuesta |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Crítico)** | Caída total del servicio | `/healthz` o `/readyz` fallando en todas las réplicas, fallo catastrófico en PostgreSQL | < 15 minutos |
| **SEV-2 (Mayor)** | Degradación parcial | Tasa de errores 5xx > 5%, fallo de conectividad a Redis (modo degradado activo) | < 1 hora |
| **SEV-3 (Menor)** | Incidencia no bloqueante | Latencia elevada en consultas complejas, fallo en llamadas opcionales a Gemini | < 4 horas |

## 3. Matriz de Diagnóstico Rápido

1. **Salud de la API**:

   ```bash
   curl -I http://<API_URL>/healthz    # Proceso vivo
   curl -I http://<API_URL>/readyz     # Conectividad a bases de datos
   ```

2. **Estado de Pods y Eventos**:

   ```bash
   kubectl get pods -n pokemon-app -o wide
   kubectl get events -n pokemon-app --sort-by='.metadata.creationTimestamp'
   ```

3. **Inspección de Logs con Correlation ID**:

   ```bash
   kubectl logs -n pokemon-app -l app=pokemon-api --tail=200 | jq .
   ```

4. **Verificación de Políticas de Red**:

   ```bash
   kubectl get netpol,ciliumnetworkpolicies -n pokemon-app
   ```
