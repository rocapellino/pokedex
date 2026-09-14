# ADR-013: Arquitectura de Red Zero-Trust, Microsegmentación en 4 Capas y Filtrado Egress Anti-SSRF y FQDN

## Estado

Aceptado

## Contexto

Las aplicaciones web desplegadas en clústeres Kubernetes comparten comúnmente una red plana (*flat network*) donde cualquier pod comprometido puede realizar movimientos laterales hacia bases de datos, consultar endpoints de metadatos de proveedores cloud (IMDS) para robar credenciales de roles IAM o establecer conexiones salientes hacia servidores de comando y control (C2).

En la plataforma Pokédex se identifican los siguientes vectores de riesgo de red:

1. **Movimiento Lateral desde la Capa Web**: El frontend (`pokemon-web`) sirve activos estáticos y actúa como proxy inverso. No debe poseer acceso directo bajo ninguna circunstancia a los motores de base de datos (`pokemon-postgres`) ni a la caché en memoria (`pokemon-redis`).
2. **Exfiltración de Credenciales de Nube (Ataques SSRF)**: Si un endpoint de backend permitiera la resolución o petición a URLs arbitrarias, un atacante podría solicitar la IP de enlace local del Instance Metadata Service (`169.254.169.254/32`) en AWS, GCP o Azure para sustraer tokens de corta duración de la instancia subyacente.
3. **Falta de Restricción Egress en Kubernetes**: Por defecto, Kubernetes permite tráfico saliente irrestricto (`0.0.0.0/0`) en todos los pods, facilitando la descarga de binarios maliciosos o exfiltración masiva de datos ante una vulnerabilidad de ejecución remota de código (RCE).
4. **Saturación y Acceso No Autorizado a PostgreSQL**: El acceso directo a PostgreSQL sin mediación satura el pool físico de conexiones y expone el motor relacional a peticiones no autenticadas o maliciosas originadas en componentes perimetrales.

## Decisión

Se adopta una arquitectura de red **Zero-Trust de Defensa en Profundidad** basada en cinco directivas técnicas implementadas mediante NetworkPolicies estándar de Kubernetes y Cilium NetworkPolicies L7 con eBPF:

1. **Topología de Red Microsegmentada en 4 Capas**:
   - **Capa 1: Zona DMZ / Pública (`pokedex-frontend-net`)**: Aloja el pod `pokemon-web` (Nginx). Única capa que expone puerto público (`8080`). Su tráfico de salida está restringido exclusivamente a CoreDNS (`:53`) y al puerto interno de la API (`:3000`).
   - **Capa 2: Zona de Aplicación (`pokedex-backend-net`)**: Aloja el pod `pokemon-api` (Node.js 22). Solo acepta tráfico entrante en `:3000` procedente de `pokemon-web` o del scraper de Prometheus en `monitoring-net`.
   - **Capa 3: Zona de Datos Aislada (`internal: true`)**: Aloja `pokemon-postgres`, `pgbouncer` y `pokemon-redis`. Sin salida a Internet ni exposición de puertos perimetrales. En producción, PostgreSQL únicamente acepta tráfico entrante procedente del pooler PgBouncer o del contenedor seeder.
   - **Capa 4: Zona de Observabilidad (`monitoring-net`)**: Conexión aislada punto a punto entre Prometheus y el endpoint `/metrics` de la API, sin visibilidad ni acceso a la zona de datos.

2. **Principio de Denegación por Defecto (*Default-Deny*)**:
   - Se aplica una política global `default-deny-all-ingress` (`podSelector: {}`, `policyTypes: [Ingress]`) que bloquea automáticamente cualquier tráfico entrante no autorizado explícitamente en el namespace.

3. **Filtrado Egress Anti-SSRF a Nivel de Kernel de Red**:
   - En `infra/helm/pokedex/templates/network-policies.yaml`, la regla de salida HTTPS (`443`) de la API excluye explícitamente mediante `ipBlock.except`:
     - `169.254.169.254/32`: Endpoint IMDS de metadatos de AWS/GCP/Azure (blindaje anti-SSRF).
     - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`: Rangos de redes privadas RFC 1918.
     - `127.0.0.0/8`: Rango de loopback.

4. **Control Egress Granular de Capa 7 con Cilium eBPF (`toFQDNs`)**:
   - Mediante `infra/helm/pokedex/templates/cilium-network-policies.yaml`, los clústeres con CNI Cilium aplican filtrado de nombres de dominio completos (*FQDN allowlist*):
     - `generativelanguage.googleapis.com`: Puerto 443 TCP (Google Gemini AI API).
     - `raw.githubusercontent.com`: Puerto 443 TCP (catálogo canónico de PokeAPI).
   - Cualquier petición hacia dominios no registrados en la lista blanca se descarta a nivel de kernel eBPF antes de salir del nodo.

5. **Aislamiento de Resolución DNS**:
   - Todas las reglas egress de resolución DNS (`:53` UDP/TCP) están estrictamente vinculadas a pods con etiqueta `k8s-app: kube-dns` en el clúster, previniendo el secuestro de DNS o el uso de resolvedores externos no autorizados.

## Consecuencias

- **Positivas**:
  - Eliminación absoluta de movimientos laterales no autorizados entre componentes de la aplicación.
  - Blindaje completo contra ataques SSRF hacia el plano de control y metadatos de proveedores cloud.
  - Protección estricta de bases de datos contra accesos directos o no mediados.
  - Trazabilidad y visibilidad granular del tráfico este-oeste y norte-sur en Kubernetes.

- **Compensaciones**:
  - La adición de nuevas integraciones externas (ej. nuevas APIs o webhooks) requiere actualizar explícitamente las listas blancas de CIDR o FQDN en los manifiestos de Helm.
  - El filtrado L7 avanzado requiere un clúster con CNI compatible con eBPF (Cilium v2).
  - **Gobernanza de CNI en CI y Entorno Local (Kind vs Cilium)**: El clúster de integración en CI y desarrollo local (`infra/k8s/kind-cluster.yaml`) utiliza `kindnet` como CNI ligero por defecto (< 30s de arranque). La conformidad de `NetworkPolicies` en CI se valida estáticamente mediante `kubeconform`, `kube-linter` y `kyverno test`, mientras que el enforcement activo de paquetes en el plano de datos reside en los clústeres productivos con Cilium. Para validación local de plano de datos, `kind-cluster.yaml` documenta el procedimiento opcional para desplegar Calico CNI.
