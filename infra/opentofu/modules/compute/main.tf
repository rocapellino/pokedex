# ==============================================================================
# Módulo OpenTofu: compute - Especificación y Contrato Genérico de Nodos
# ==============================================================================
locals {
  generated_names = [
    for i in range(var.node_count) : format("%s-%02d", var.node_name_prefix, i + 1)
  ]

  total_vcpus    = var.node_count * var.cpu_cores
  total_memory_gb = (var.node_count * var.memory_mb) / 1024
  total_disk_gb   = var.node_count * var.disk_size_gb
}
