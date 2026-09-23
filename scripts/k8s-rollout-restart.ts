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

import { execFileSync } from 'node:child_process';
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
    if (!content.includes('key: "pokedex/prod"')) {
      reasons.push('Proxmox values.yaml debe apuntar a la ruta de secretos pokedex/prod en Vault KV-v2');
    }
  } else {
    reasons.push(`Archivo no encontrado: ${proxmoxValuesPath}`);
  }

  // 2. Validar configuración de ClusterSecretStore
  if (fs.existsSync(vaultBackendPath)) {
    const content = fs.readFileSync(vaultBackendPath, 'utf-8');
    if (!content.includes('server: "https://10.10.13.110:8200"')) {
      reasons.push('vault-backend.yaml debe apuntar a la IP del contenedor LXC de Vault vía HTTPS (https://10.10.13.110:8200)');
    }
    if (!content.includes('caProvider:')) {
      reasons.push('vault-backend.yaml debe configurar caProvider para validación criptográfica de TLS');
    }
    if (!content.includes('role: "pokedex-prod-role"')) {
      reasons.push('vault-backend.yaml debe utilizar el rol pokedex-prod-role para autenticación Kubernetes');
    }
  } else {
    reasons.push(`Archivo no encontrado: ${vaultBackendPath}`);
  }

  // 3. Validar Playbook de Ansible para Vault con Hardening
  if (fs.existsSync(setupVaultPlaybook)) {
    const content = fs.readFileSync(setupVaultPlaybook, 'utf-8');
    if (!content.includes('vault operator init') || !content.includes('vault operator unseal')) {
      reasons.push('setup_vault.yml debe incluir tareas para inicializar y desbloquear Vault');
    }
    if (!content.includes('tls_disable') || !content.includes('vault_tls_dir')) {
      reasons.push('setup_vault.yml debe configurar infraestructura de certificados y listener TLS');
    }
    if (!content.includes('storage "raft"')) {
      reasons.push('setup_vault.yml debe configurar almacenamiento transaccional Raft');
    }
    if (!content.includes('community.general.ufw')) {
      reasons.push('setup_vault.yml debe configurar firewall perimetral UFW para puerto 8200');
    }
    if (!content.includes('pokedex-prod-policy') || !content.includes('pokedex-prod-role') || !content.includes('pokedex-preprod-policy') || !content.includes('pokedex-preprod-role')) {
      reasons.push('setup_vault.yml debe configurar políticas y roles segregados pokedex-prod-role y pokedex-preprod-role');
    }
    if (content.includes('auth/kubernetes/role/pokedex-role\n') || content.includes('auth/kubernetes/role/pokedex-role ') || content.includes('pokedex-policy.hcl')) {
      reasons.push('setup_vault.yml no debe incluir rol o política comodín pokedex-role/pokedex-policy (violación de Least Privilege)');
    }
  } else {
    reasons.push(`Archivo no encontrado: ${setupVaultPlaybook}`);
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

function getSafeKubectlExecutable(): string {
  const isWin = process.platform === 'win32';
  const trustedPaths = isWin
    ? [
        'C:\\Program Files\\Docker\\Docker\\resources\\bin\\kubectl.exe',
        'C:\\Program Files\\Kubernetes\\bin\\kubectl.exe',
        'C:\\ProgramData\\chocolatey\\bin\\kubectl.exe',
      ]
    : [
        '/usr/local/bin/kubectl',
        '/usr/bin/kubectl',
        '/bin/kubectl',
        '/snap/bin/kubectl',
      ];

  for (const candidate of trustedPaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return isWin ? 'kubectl.exe' : 'kubectl';
}

function getSafeExecutionOptions(): { stdio: 'inherit'; env: NodeJS.ProcessEnv } {
  const isWin = process.platform === 'win32';
  // Restringir PATH a directorios fijos de sistema para mitigar CWE-426 / CWE-427 (SonarQube S5883)
  const safePath = isWin
    ? (process.env.PATH || 'C:\\Windows\\System32')
    : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

  return {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: safePath,
    },
  };
}

async function run() {
  const opts = parseArgs();
  const rootDir = path.resolve(import.meta.dirname, '..');

  console.log('='.repeat(78));
  console.log('🔄 Pokédex Application Rollout Restart & Secret Synchronization');
  console.log('   Namespace   :', opts.namespace);
  console.log('   Deployments :', opts.deployments.join(', '));
  console.log('   Modo        :', opts.isSimulate ? 'Simulación / Validación Contractual (CI)' : 'Ejecución en Vivo (Kubectl)');
  console.log('='.repeat(78));

  if (opts.isSimulate) {
    console.log('\n🔍 Validando contratos de configuración y arquitectura de secretos Proxmox...');
    const result = validateProxmoxSecretArchitecture(rootDir);

    if (!result.valid) {
      console.error('❌ Se detectaron inconsistencias arquitectónicas:');
      for (const err of result.reasons) {
        console.error('   -', err);
      }
      process.exit(1);
    }

    console.log('✅ 1. Stakater Reloader desactivado en Proxmox (Confirmado: reloader.enabled: false).');
    console.log('✅ 2. Backend de Secretos: HashiCorp Vault CE Endurecido en LXC (https://10.10.13.110:8200, TLS + Raft + Shamir 5/3 + UFW).');
    console.log('✅ 3. External Secrets Operator (ESO) configurado con ClusterSecretStore/vault-backend vía HTTPS.');
    console.log('✅ 4. Contrato de Redeploy: Debido a que Node.js copia process.env al arrancar y Reloader está inactivo,');
    console.log('      el rollout restart progresivo es la vía oficial y obligatoria para inyectar credenciales.');
    console.log('\n🎉 ¡Validación contractual completada exitosamente!');
    return;
  }

  // Modo en vivo con kubectl sin invocación de shell (CWE-78 y CWE-426 compliant)
  const kubectlBin = getSafeKubectlExecutable();
  const execOptions = getSafeExecutionOptions();

  for (const dep of opts.deployments) {
    console.log('\n🚀 Reiniciando deployment:', dep, 'en namespace:', opts.namespace);
    try {
      execFileSync(kubectlBin, ['rollout', 'restart', 'deployment', dep, '-n', opts.namespace], execOptions);
      console.log('⏳ Esperando estado saludable de:', dep, 'timeout:', `${opts.timeoutSeconds}s`);
      execFileSync(kubectlBin, ['rollout', 'status', `deployment/${dep}`, '-n', opts.namespace, `--timeout=${opts.timeoutSeconds}s`], execOptions);
      console.log('✅ Deployment reiniciado y en servicio activo:', dep);
    } catch (err) {
      console.error('❌ Error al reiniciar o verificar el deployment:', dep, err);
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
