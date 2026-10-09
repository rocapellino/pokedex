import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocksOf, parseHcl, stringAttr, stripHclComments } from '../helpers/hcl.js';

test('🧩 HCL: los comentarios de línea y de bloque no forman parte de la estructura, pero las cadenas conservan # y //', () => {
  const tree = parseHcl(`
# variable "fantasma" { }
// resource "x" "y" { }
/* variable "bloque" { } */
variable "real" {
  default = "https://example.com/#ancla" # comentario final
}
`);
  assert.deepEqual(
    tree.blocks.map((b) => b.labels[0]),
    ['real'],
  );
  assert.equal(stringAttr(tree.blocks[0], 'default'), 'https://example.com/#ancla');
  assert.equal(stripHclComments('a = 1 # nota\nb = "# no"'), 'a = 1 \nb = "# no"');
});

test('🧩 HCL: un bloque con sub-bloques conserva atributos posteriores a la llave anidada', () => {
  // Una expresión `[^}]*` se corta en la primera `}` y no vería `default` tras la validación.
  const [variable] = blocksOf(
    parseHcl(`
variable "ssh_public_key" {
  type = string
  validation {
    condition     = length(var.ssh_public_key) > 0
    error_message = "obligatoria"
  }
  default = "ssh-ed25519 AAAA"
}
`),
    'variable',
    'ssh_public_key',
  );
  assert.equal(variable.blocks.length, 1);
  assert.equal(variable.blocks[0].type, 'validation');
  assert.equal(stringAttr(variable, 'default'), 'ssh-ed25519 AAAA');
  assert.equal(variable.attrs.condition, undefined, 'los atributos del sub-bloque no se mezclan con los del padre');
});

test('🧩 HCL: respeta interpolaciones con comillas y llaves, listas multilínea y las etiquetas de los recursos', () => {
  const tree = parseHcl(`
resource "proxmox_download_file" "plantilla" {
  count    = 1
  url      = "\${join("/", [var.base, "img"])}/x.tar.zst"
  tags     = [
    "a",
    "b",
  ]
  checksum = var.lxc_template_checksum
}
`);
  const [resource] = blocksOf(tree, 'resource', 'proxmox_download_file');
  assert.deepEqual(resource.labels, ['proxmox_download_file', 'plantilla']);
  assert.equal(resource.attrs.checksum, 'var.lxc_template_checksum');
  assert.match(resource.attrs.tags, /^\[\s*"a",\s*"b",\s*]$/);
  assert.ok(resource.attrs.url.includes('join("/"'));
  assert.equal(resource.attrs.count, '1');
});
