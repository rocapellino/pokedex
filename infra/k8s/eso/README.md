# External Secrets Operator (ESO) — Arquitectura de Sincronización y Rotación Dinámica

Este directorio contiene la arquitectura declarativa de referencia para la gestión centralizada de secretos en Kubernetes mediante **External Secrets Operator (ESO)**.

## 🎯 Propósito
Complementa y evoluciona la estrategia de cifrado de secretos en Git (Bitnami Sealed Secrets) hacia un modelo donde los secretos se sincronizan dinámicamente desde un proveedor centralizado (HashiCorp Vault o AWS Secrets Manager) directamente a la memoria de Kubernetes.

## 📐 Manifiestos
1. **`cluster-secret-store.yaml`**: Define el conector de clúster (`ClusterSecretStore`) hacia la instancia de HashiCorp Vault on-premise (o AWS Secrets Manager en clústeres cloud) utilizando autenticación federada de Kubernetes ServiceAccount.
2. **`external-secret-pokedex.yaml`**: Define el recurso `ExternalSecret` que sondea el proveedor cada 1 hora (`refreshInterval: "1h"`) y proyecta las claves al Secret nativo `pokedex-credentials`.

## 🔄 Rotación de Secretos en Caliente
1. El operador de seguridad actualiza el secreto en Vault o AWS Secrets Manager.
2. ESO detecta el cambio en su siguiente ciclo de reconciliación y actualiza automáticamente el Secret `pokedex-credentials`.
3. Herramientas complementarias como Reloader (o reinicio progresivo) propagan la rotación a los pods de la API sin requerir commits en Git ni reempaquetado de artefactos Helm.
