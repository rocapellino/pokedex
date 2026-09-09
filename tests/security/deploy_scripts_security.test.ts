/**
 * ==============================================================================
 * Test de Seguridad Estática para Scripts de Despliegue y Configuración de Infra
 * ==============================================================================
 * Valida de forma automatizada que:
 * 1. Los scripts de empaquetado (tar/rsync/ansible) excluyan obligatoriamente .env y .env.*
 * 2. La lista canónica scripts/deploy_excludes.txt contenga reglas contra fuga de secretos.
 * 3. OpenTofu no contenga claves públicas SSH con defaults hardcodeados.
 * 4. Nginx no exponga endpoints administrativos o métricas a rangos masivos RFC 1918.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

test('🛡️ Deploy Security: scripts/deploy_excludes.txt existe y excluye .env y .env.*', () => {
  const filePath = path.join(ROOT_DIR, 'scripts/deploy_excludes.txt');
  assert.ok(fs.existsSync(filePath), 'El archivo scripts/deploy_excludes.txt debe existir');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(content.includes('.env'), 'deploy_excludes.txt debe excluir .env');
  assert.ok(content.includes('.env.*'), 'deploy_excludes.txt debe excluir .env.*');
});

test('🛡️ Deploy Security: scripts/proxmox_deploy.sh excluye obligatoriamente archivos .env locales', () => {
  const filePath = path.join(ROOT_DIR, 'scripts/proxmox_deploy.sh');
  assert.ok(fs.existsSync(filePath), 'El script proxmox_deploy.sh debe existir');
  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(content.includes('--exclude=.env') || content.includes("--exclude='.env'"), 'proxmox_deploy.sh debe contener exclusión explícita de .env');
  assert.ok(content.includes('--exclude=.env.*') || content.includes("--exclude='.env.*'"), 'proxmox_deploy.sh debe contener exclusión explícita de .env.*');
});

test('🛡️ Deploy Security: Ansible playbooks excluyen .env en módulos synchronize', () => {
  const playbooks = [
    'infra/ansible/playbooks/deploy_proxmox.yml',
    'infra/ansible/playbooks/deploy_app.yml'
  ];

  for (const relPath of playbooks) {
    const filePath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(filePath), `El playbook ${relPath} debe existir`);
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('--exclude=.env'), `${relPath} debe incluir --exclude=.env en rsync_opts`);
    assert.ok(content.includes('--exclude=.env.*'), `${relPath} debe incluir --exclude=.env.* en rsync_opts`);
  }
});

test('🛡️ Infra Security: OpenTofu Proxmox variables.tf no tiene default hardcodeado en ssh_public_key', () => {
  const filePath = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/variables.tf');
  assert.ok(fs.existsSync(filePath), 'variables.tf de Proxmox debe existir');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extraer el bloque de la variable ssh_public_key
  const match = content.match(/variable\s+"ssh_public_key"\s*\{([\s\S]*?)\}/);
  assert.ok(match, 'Debe existir la variable ssh_public_key');
  const varBlock = match[1];
  assert.ok(!varBlock.includes('default'), 'variable "ssh_public_key" no debe tener un valor default hardcodeado');
});

test('🛡️ Nginx Security: apps/frontend/nginx.conf no contiene allowlists masivas RFC 1918 en /metrics ni /admin', () => {
  const filePath = path.join(ROOT_DIR, 'apps/frontend/nginx.conf');
  assert.ok(fs.existsSync(filePath), 'nginx.conf debe existir');
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // No debe contener rangos /8 ni /12 globales en allow
  assert.ok(!content.includes('allow 10.0.0.0/8;'), 'nginx.conf no debe permitir 10.0.0.0/8 indiscriminado');
  assert.ok(!content.includes('allow 172.16.0.0/12;'), 'nginx.conf no debe permitir 172.16.0.0/12 indiscriminado');
  assert.ok(!content.includes('allow 192.168.0.0/16;'), 'nginx.conf no debe permitir 192.168.0.0/16 indiscriminado');
});
