# Operador humano de Pre-producción (mínimo privilegio).
# Crea y actualiza los secretos de pre-prod; no puede borrarlos ni destruirlos, no usa `sudo` y no
# alcanza ninguna otra ruta de Vault ni la API de sistema (sys/).
# La política de External Secrets (`pokedex-preprod-policy`) es de solo lectura y se mantiene aparte.
path "secret/data/pokedex/preprod" {
  capabilities = ["create", "read", "update", "patch"]
}

path "secret/data/pokedex/preprod/*" {
  capabilities = ["create", "read", "update", "patch"]
}

path "secret/metadata/pokedex/preprod" {
  capabilities = ["read", "list"]
}

path "secret/metadata/pokedex/preprod/*" {
  capabilities = ["read", "list"]
}
