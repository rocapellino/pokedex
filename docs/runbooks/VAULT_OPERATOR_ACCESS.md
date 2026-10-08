# Runbook: Acceso de Operador a Vault con Mínimo Privilegio

> [!IMPORTANT]
> El token root solo se usa para el bootstrap y para crear este acceso. Las tareas rutinarias (guardar o
> rotar secretos de pre-prod) se hacen con un usuario `operador` de vida corta y con la política acotada
> [`pokedex-preprod-operator.hcl`](../../infra/vault/policies/pokedex-preprod-operator.hcl).

## 1. Por qué existe

Guardar un secreto de pre-prod exigía el token root, que es ilimitado, no expira y no se puede acotar. Un
solo descuido lo expone (ocurrió el 2026-10-08, al mostrarse por pantalla). Con esta política, un token
filtrado solo puede escribir en `secret/data/pokedex/preprod`, caduca en una hora y no puede borrar
secretos ni tocar el resto de Vault.

| Identidad | Política | Capacidades |
| :--- | :--- | :--- |
| External Secrets (`pokedex-preprod-role`) | `pokedex-preprod-policy` | Solo lectura de `pokedex/preprod` |
| Operador humano (`operador`) | `pokedex-preprod-operator` | Crear, leer, actualizar y parchear datos; leer y listar metadatos. Sin `delete`, `destroy` ni `sudo` |

## 2. Alta del acceso (una sola vez)

Requiere un token root temporal. Se genera con las llaves Shamir (3 de 5) en lugar de reutilizar el de la
inicialización.

```bash
export VAULT_ADDR=https://10.10.13.110:8200
vault operator generate-root -init
```

Anotar el `Nonce` y el `OTP` que imprime. Repetir tres veces con una llave de desellado distinta cada vez; el
prompt es oculto:

```bash
vault operator generate-root
```

La tercera ejecución imprime el `Encoded Token`. Decodificarlo y entrar sin mostrar el token por pantalla:

```bash
vault operator generate-root -decode=<ENCODED_TOKEN> -otp=<OTP> | vault login -
```

Crear la política y el usuario:

```bash
vault policy write pokedex-preprod-operator - <<'EOF'
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
EOF
vault auth enable userpass
read -rs PW && vault write auth/userpass/users/operador password="$PW" policies=pokedex-preprod-operator token_ttl=1h token_max_ttl=4h; unset PW
```

Revocar el token root temporal inmediatamente:

```bash
vault token revoke -self
rm -f ~/.vault-token
```

## 3. Uso diario

```bash
export VAULT_ADDR=https://10.10.13.110:8200
vault login -method=userpass username=operador
vault kv patch secret/pokedex/preprod NOMBRE="valor"
vault token revoke -self
```

El token dura una hora. No se usa `vault token lookup` sin filtrar: imprime el valor del token. Para
inspeccionarlo sin exponerlo: `vault token lookup -format=json | jq 'del(.data.id)'`.

## 4. Verificación

Con el usuario `operador`, escribir en la ruta de pre-prod debe funcionar y todo lo demás debe fallar:

```bash
vault kv patch secret/pokedex/preprod PRUEBA=1      # permitido
vault kv put secret/pokedex/otro-entorno x=1        # permission denied
vault kv metadata delete secret/pokedex/preprod     # permission denied
vault policy list                                   # permission denied
```

## 5. Custodia del archivo de inicialización

El playbook [`setup_vault.yaml`](../../infra/ansible/playbooks/setup_vault.yaml) establece que el archivo de
inicialización (`vault-init-<host>.json`) existe solo durante el bootstrap: las 5 llaves se reparten entre
custodios, el token root se guarda fuera de línea y el archivo se elimina con `shred -u`. Mantenerlo en el
Bastion junto a las llaves anula el esquema de Shamir: quien acceda al Bastion puede desellar Vault y obtener
el token root. Una vez repartidas las llaves:

```bash
shred -u /root/vault-init-vault-01.json
```

Si hay que desellar tras un reinicio, se hace con las llaves de los custodios (`vault operator unseal`, tres
veces), no desde un archivo en el Bastion.
