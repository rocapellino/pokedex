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

> [!WARNING]
> **Vault 2.0 o superior (CVE-2026-5807):** `sys/generate-root` exige un token válido además de las llaves. Si no
> queda ningún token con privilegios (por ejemplo, tras revocar el root sin haber creado antes al `operador`),
> el flujo falla con `403 permission denied` aunque las llaves sean correctas. Comprobarlo con
> `curl -sk -i "$VAULT_ADDR/v1/sys/generate-root/attempt"`: un `403` indica que el endpoint está cerrado y hay
> que aplicar el paso 2.1. Con un token válido se omite.

### 2.1 Abrir `generate-root` temporalmente (solo si el endpoint devuelve 403)

En el LXC de Vault, añadir al nivel superior de `/etc/vault.d/vault.hcl` el parámetro oficial
`enable_unauthenticated_access` y recargar con `SIGHUP` (no reinicia ni sella Vault):

```bash
ssh root@10.10.13.110
cp -p /etc/vault.d/vault.hcl /root/vault.hcl.bak
echo 'enable_unauthenticated_access = ["generate-root"]' >> /etc/vault.d/vault.hcl
systemctl kill -s HUP vault
```

Habilitar solo `generate-root`, nunca `rekey`. Mientras esté activo, cualquiera con acceso de red puede iniciar y
bloquear la generación del token root (el DoS que corrige la 2.0), por lo que se retira en el paso 2.4.
Ejecutar el bloque una sola vez: una segunda ejecución sobrescribe el respaldo con el archivo ya modificado.

### 2.2 Generar el token root temporal

```bash
export VAULT_ADDR=https://10.10.13.110:8200
unset VAULT_TOKEN
vault operator generate-root -init
```

Anotar el `Nonce` y el `OTP` que imprime. Aportar tres llaves de desellado distintas, una por ejecución. Con el
prompt oculto basta `vault operator generate-root`. Para no pegar la llave a mano se lee del archivo de
inicialización por entrada estándar; en ese modo el nonce es obligatorio:

```bash
for i in 0 1 2; do
  jq -r ".unseal_keys_b64[$i]" /root/vault-init-vault-01.json | vault operator generate-root -nonce=<NONCE> -
done
```

La tercera ejecución imprime el `Encoded Token`. Decodificarlo y entrar sin mostrar el token por pantalla:

```bash
vault operator generate-root -decode=<ENCODED_TOKEN> -otp=<OTP> | vault login -no-print -
```

No pegar el `Encoded Token` junto con el `OTP` en chats, tickets ni capturas: juntos reconstruyen el token root.

### 2.3 Crear la política y el usuario

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

Si `userpass` ya estaba habilitado, `vault auth enable` responde `path is already in use` y se puede continuar.

### 2.4 Cerrar el acceso temporal, probar al operador y revocar el root

Orden obligatorio: el root solo se revoca cuando el `operador` ya está probado; si no, vuelve a quedar sin ningún
token con privilegios.

1. Si se aplicó el paso 2.1, quitar el parámetro (borrar la línea en lugar de restaurar un respaldo que pudo
   copiarse ya modificado) y recargar:

   ```bash
   sed -i '/^enable_unauthenticated_access/d' /etc/vault.d/vault.hcl
   systemctl kill -s HUP vault
   rm -f /root/vault.hcl.bak
   ```

   Desde el Bastion, `curl -sk -i "$VAULT_ADDR/v1/sys/generate-root/attempt"` debe volver a dar `403`.

2. Probar al `operador` en una segunda sesión (sección 4) sin cerrar la del root.
3. Revocar el token root temporal:

   ```bash
   vault token revoke -self
   rm -f ~/.vault-token
   ```

## 3. Uso diario

```bash
export VAULT_ADDR=https://10.10.13.110:8200
vault login -no-print -method=userpass username=operador
vault kv patch secret/pokedex/preprod NOMBRE="valor"
vault token revoke -self
```

El token dura una hora. `-no-print` evita que `vault login` imprima el token. No se usa `vault token lookup` sin filtrar: imprime el valor del token. Para
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
