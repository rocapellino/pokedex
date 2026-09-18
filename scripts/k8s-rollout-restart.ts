#!/usr/bin/env node
/**
 * k8s-rollout-restart.ts
 *
 * Utilidad de reinicio progresivo (Rollout Restart) sin downtime para Pokédex en Proxmox VE.
 *
 * Racional Arquitectónico:
 * En Proxmox, Stakater Reloader está desactivado (reloader.enabled: false) para ahorrar
 * recursos. Los procesos Node.js copian las variables de entorno de 'pokemon-secrets' en
 * memoria al momento del execve(). Por lo tanto, cuando HashiCorp Vault y External Secrets
 * Operator (ESO) sincronizan o rotan credenciales, un 'rollout restart' progresivo es
 * estrictamente necesario para que los nuevos Pods monten los valores actualizados.
 *
 * Modos:
 *  --simulate: Valida formalmente los contratos de configuración y el estado de la arquitectura (para CI/CD).
 *  --live:     Ejecuta 'kubectl rollout restart' y monitorea 'kubectl rollout status' en el clúster.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface RolloutOptions {
  namespace: string;
  deployments: string[];
  timeoutSeconds: number;
  isSimulate: boolean;
}

function parseArgs(): RolloutOptions {
  const args = process.argv.slice(2);
  const isSimulate = args.includes('--simulate') || process.env.ROLLOUT_SIMULATE === 'true';
  const nsArg = args.find(a => a.startsWith('--namespace='));
  const namespace = nsArg ? nsArg.split('=')[1] : 'pokemon-app';
  const depArg = args.find(a => a.startsWith('--deployments='));
  const deployments = depArg ? depArg.split('=')[1].split(',') : ['pokedex-api', 'pokedex-web'];
  const timeoutArg = args.find(a => a.startsWith('--timeout='));
  const timeoutSeconds = timeoutArg ? Number.parseInt(timeoutArg.split('=')[1], 10) : 120;

  return { namespace, deployments, timeoutSeconds, isSimulate };
}

export function validateProxmoxSecretArchitecture(rootDir: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const proxmoxValuesPath = path.join(rootDir, 'gitops/environments/proxmox/values.yaml');
  const vaultBackendPath = path.join(rootDir, 'infra/k8s/eso/vault-backend.yaml');
  const setupVaultPlaybook = path.join(rootDir, 'infra/ansible/playbooks/setup_vault.yml');

  // 1. Validar que Reloader está desactivado en Proxmox
  if (fs.existsSync(proxmoxValuesPath)) {
    const content = fs.readFileSync(proxmoxValuesPath, 'utf-8');
    if (!content.includes('reloader:\n  enabled: false') && !content.includes('reloader:\r\n  enabled: false')) {
      reasons.push('Proxmox values.yaml debe tener reloader.enabled: false para perfil Lean');
    }
    if (!content.includes('secretStoreRef:\n    name: "vault-backend"') && !content.includes('secretStoreRef:\r\n    name: "vault-backend"')) {
      reasons.push('Proxmox values.yaml debe referenciar a vault-backend como ClusterSecretStore');
    }
    if (!content.includes('key: "pokedex/production"')) {
      reasons.push('Proxmox values.yaml debe apuntar a la ruta de secretos pokedex/production en Vault KV-v2');
    }
  } else {
    reasons.push(`Archivo no encontrado: ${proxmoxValuesPath}`);
  }

  // 2. Validar configuración de ClusterSecretStore
  if (fs.existsSync(vaultBackendPath)) {
    const content = fs.readFileSync(vaultBackendPath, 'utf-8');
    if (!content.includes('server: "http://10.10.13.110:8200"')) {
      reasons.push('vault-backend.yaml debe apuntar a la IP del contenedor LXC de Vault (http://10.10.13.110:8200)');
    }
    if (!content.includes('role: "pokedex-role"')) {
      reasons.push('vault-backend.yaml debe utilizar el rol pokedex-role para autenticación Kubernetes');
    }
  } else {
    reasons.push(`Archivo no encontrado: ${vaultBackendPath}`);
  }

  // 3. Validar Playbook de Ansible para Vault
  if (fs.existsSync(setupVaultPlaybook)) {
    const content = fs.readFileSync(setupVaultPlaybook, 'utf-8');
    if (!content.includes('vault operator init') || !content.includes('vault operator unseal')) {
      reasons.push('setup_vault.yml debe incluir tareas para inicializar y desbloquear Vault');
    }
    if (!content.includes('pokedex-policy') || !content.includes('pokedex-role')) {
      reasons.push('setup_vault.yml debe configurar pokedex-policy y el rol pokedex-role');
    }
  } else {
    reasons.push(`Archivo no encontrado: ${setupVaultPlaybook}`);
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

async function run() {
  const opts = parseArgs();
  const rootDir = path.resolve(import.meta.dirname, '..');

  console.log('='.repeat(78));
  console.log('🔄 Pokédex Application Rollout Restart & Secret Synchronization');
  console.log(`   Namespace   : ${opts.namespace}`);
  console.log(`   Deployments : ${opts.deployments.join(', ')}`);
  console.log(`   Modo        : ${opts.isSimulate ? 'Simulación / Validación Contractual (CI)' : 'Ejecución en Vivo (Kubectl)'}`);
  console.log('='.repeat(78));

  if (opts.isSimulate) {
    console.log('\n🔍 Validando contratos de configuración y arquitectura de secretos Proxmox...');
    const result = validateProxmoxSecretArchitecture(rootDir);

    if (!result.valid) {
      console.error('❌ Se detectaron inconsistencias arquitectónicas:');
      for (const err of result.reasons) {
        console.error(`   - ${err}`);
      }
      process.exit(1);
    }

    console.log('✅ 1. Stakater Reloader desactivado en Proxmox (Confirmado: reloader.enabled: false).');
    console.log('✅ 2. Backend de Secretos: HashiCorp Vault CE en LXC (10.10.13.110:8200).');
    console.log('✅ 3. External Secrets Operator (ESO) configurado con ClusterSecretStore/vault-backend.');
    console.log('✅ 4. Contrato de Redeploy: Debido a que Node.js copia process.env al arrancar y Reloader está inactivo,');
    console.log('      el rollout restart progresivo es la vía oficial y obligatoria para inyectar credenciales.');
    console.log('\n🎉 ¡Validación contractual completada exitosamente!');
    return;
  }

  // Modo en vivo con kubectl
  for (const dep of opts.deployments) {
    console.log(`\n🚀 Reiniciando deployment ${dep} en namespace ${opts.namespace}...`);
    try {
      execSync(`kubectl rollout restart deployment ${dep} -n ${opts.namespace}`, { stdio: 'inherit' });
      console.log(`⏳ Esperando estado saludable de ${dep} (timeout ${opts.timeoutSeconds}s)...`);
      execSync(`kubectl rollout status deployment ${dep} -n ${opts.namespace} --timeout=${opts.timeoutSeconds}s`, { stdio: 'inherit' });
      console.log(`✅ Deployment ${dep} reiniciado y en servicio activo.`);
    } catch (err) {
      console.error(`❌ Error al reiniciar o verificar el deployment ${dep}:`, err);
      process.exit(1);
    }
  }

  console.log('\n🎉 ¡Todos los deployments de la Pokédex se han actualizado con las credenciales de Vault!');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('k8s-rollout-restart')) {
  run().catch(err => {
    console.error('Error fatal durante el rollout restart:', err);
    process.exit(1);
  });
}
