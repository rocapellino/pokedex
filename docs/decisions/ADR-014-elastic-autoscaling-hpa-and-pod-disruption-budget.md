# ADR-014: Estrategia de Autoescalado Elástico con HPA v2, PodDisruptionBudget y Alta Disponibilidad de Cómputo

## Estado

Aceptado

## Contexto

La plataforma Pokédex opera bajo patrones de demanda asimétricos y fluctuantes: tráfico basal ligero durante navegación pasiva y picos intensivos de concurrencia durante filtrados complejos, consultas al servicio de IA (Google Gemini 2.5 Flash) o siembra masiva de catálogo.

En una arquitectura de contenedores estáticos o réplicas fijas se manifiestan tres riesgos críticos:

1. **Saturación de CPU y Degradación de Latencia**: Ante ráfagas de tráfico, una única réplica o un recuento fijo de pods alcanza el límite de CPU asignado, degradando el tiempo de respuesta y elevando el riesgo de terminaciones abruptas por memoria (*OOMKilled*).
2. **Indisponibilidad por Mantenimiento de Nodos y Desalojos Involuntarios**: Durante operaciones rutinarias del clúster (actualizaciones de Kubernetes, rotación de nodos o drenado con `kubectl drain`), todos los pods de un Deployment podrían terminarse simultáneamente sin una garantía mínima de disponibilidad (*budget de interrupción*), causando caída total del servicio.
3. **Fenómeno de Oscilación (*Thrashing / Flapping*)**: Si el algoritmo de autoescalado reduce pods inmediatamente al detectar una caída transitoria de carga, el sistema entra en un ciclo destructivo de escalado y desescalado continuo que satura el plano de control de Kubernetes y desestabiliza los pools de conexiones de base de datos.
4. **Acoplamiento de Estado en Pods Elásticos**: Para que el escalado horizontal sea verdaderamente elástico, los pods deben ser estrictamente *stateless* (sin estado local persistente) y converger de manera transaccionalmente segura hacia la capa de persistencia mediada (PostgreSQL con PgBouncer y Redis).

## Decisión

Se adopta una arquitectura de escalabilidad elástica y alta disponibilidad para Kubernetes estructurada en cinco directivas técnicas:

1. **Adopción de Horizontal Pod Autoscaler v2 (`autoscaling/v2`)**:
   - Se implementan los recursos declarativos `api-hpa.yaml` y `web-hpa.yaml` gestionados mediante Helm.
   - Para `pokemon-api`, se configura un rango dinámico de 2 a 10 réplicas en producción (`values.prod.yaml`) con un umbral de utilización objetivo de CPU del 75% (`averageUtilization: 75%`), calculado contra los `resources.requests.cpu`.
   - Para `pokemon-web`, se configura un rango dinámico de 2 a 5 réplicas con objetivo del 75% de CPU.

2. **Ventanas de Estabilización Asimétricas Anti-Oscilación**:
   - **Escalado Hacia Arriba (*Scale Up*)**: Inmediato (sin ventana de retraso o 15 segundos) para absorber picos súbitos de tráfico sin encolar peticiones HTTP.
   - **Escalado Hacia Abajo (*Scale Down*)**: Ventana de estabilización amortiguada de 300 segundos (5 minutos), asegurando que la demanda se mantenga baja de forma sostenida antes de desalojar réplicas y liberando conexiones ordenadamente.

3. **Garantía de Disponibilidad Continua con PodDisruptionBudget (PDB)**:
   - Se despliega obligatoriamente `infra/helm/pokedex/templates/pdb.yaml` en entornos productivos para `pokemon-api` y `pokemon-web`.
   - Se declara `minAvailable: 1`, impidiendo que el API Server de Kubernetes autorice el desalojo voluntario del último pod activo durante drenados de nodos, actualizaciones de parches del kernel o rebalanceos del clúster.

4. **Distribución Antiafinidad y Topología de Dispersión (*TopologySpreadConstraints*)**:
   - En `values.prod.yaml`, se configuran restricciones de dispersión topológica mediante `topologyKey: "kubernetes.io/hostname"` con `maxSkew: 1`.
   - Esto fuerza al scheduler de Kubernetes a distribuir las réplicas de `pokemon-api` y `pokemon-web` uniformemente a lo largo de diferentes nodos físicos o zonas de disponibilidad, evitando puntos únicos de falla a nivel de nodo.

5. **Gobernanza de Recursos con LimitRange y ResourceQuota**:
   - Se formaliza la definición de `requests` y `limits` en todos los componentes del Helm Chart.
   - Se implementan los manifiestos `limitrange.yaml` y `resourcequota.yaml` en producción para fijar techos máximos de memoria y CPU a nivel de namespace, garantizando que el autoescalado de réplicas no consuma recursos que pongan en peligro la estabilidad global del clúster.

## Consecuencias

- **Positivas**:
  - Absorción elástica y autónoma de picos de concurrencia manteniendo SLAs de respuesta óptimos.
  - Cero tiempo de inactividad durante operaciones de mantenimiento del clúster o rotación de nodos gracias al PDB.
  - Distribución resiliente en múltiples hosts físicos protegiendo contra caídas de hipervisores o instancias cloud.
  - Prevención efectiva de oscilación destructiva mediante ventanas de estabilización asimétricas.

- **Compensaciones**:
  - Requiere el despliegue y correcto funcionamiento del `metrics-server` en el namespace `kube-system`.
  - El clúster Kubernetes subyacente debe disponer de capacidad de nodos elástica (Cluster Autoscaler o capacidad suficiente reservada) para admitir la expansión horizontal hasta 10 réplicas de API.
