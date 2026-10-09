/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: OpenTofu Baseline, IaC State y Cloud Design
 * ==============================================================================
 *
 * Los `.tf` y `.tfvars` se leen con `helpers/hcl.ts` (bloques y atributos, sin comentarios), no con expresiones
 * regulares sobre el texto: un `[^}]*` se corta en la primera llave anidada y un atributo comentado seguía
 * contando como si estuviera activo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertDocsPortalLinksAdrIndex } from '../helpers/docs-portal.js';
import { blocksOf, readHcl, readHclDir, stringAttr } from '../helpers/hcl.js';
import { ROOT_DIR } from '../helpers/repo.js';
import { readYaml } from '../helpers/yaml.js';

const PROXMOX_ENV = 'infra/opentofu/environments/proxmox';

/** Variable declarada en `variables.tf` del entorno Proxmox. */
const proxmoxVariable = (name: string) => {
  const variable = blocksOf(readHcl(`${PROXMOX_ENV}/variables.tf`), 'variable', name)[0];
  assert.ok(variable, `variables.tf de Proxmox debe declarar la variable ${name}`);
  return variable;
};

test('🛡️ Infra Security: OpenTofu Proxmox variables.tf no tiene default hardcodeado en ssh_public_key', () => {
  const variable = proxmoxVariable('ssh_public_key');
  assert.equal(
    'default' in variable.attrs,
    false,
    'variable "ssh_public_key" no debe tener un valor default hardcodeado',
  );
});

test('🛡️ Infra Multi-Cloud: OpenTofu mantiene proxmox y cloud-template, sin entornos atados a un proveedor (ADR-030)', () => {
  const cloudTemplatePath = path.join(ROOT_DIR, 'infra/opentofu/environments/cloud-template');
  assert.ok(
    fs.existsSync(path.join(cloudTemplatePath, 'main.tf')),
    'cloud-template/main.tf debe existir como base del blueprint prod cloud',
  );

  const proxmoxEnvPath = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox');
  assert.ok(fs.existsSync(proxmoxEnvPath), 'infra/opentofu/environments/proxmox debe existir');

  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, 'infra/opentofu/environments/aws')),
    'infra/opentofu/environments/aws se retiró con ADR-030: prod cloud no fija proveedor',
  );
});

test('🛡️ Architecture Policy: CLOUD_INFRASTRUCTURE_DESIGN.md formaliza runtime universal y multi-backend', () => {
  const docPath = path.join(ROOT_DIR, 'docs/architecture/CLOUD_INFRASTRUCTURE_DESIGN.md');
  assert.ok(fs.existsSync(docPath), 'CLOUD_INFRASTRUCTURE_DESIGN.md debe existir');
  const content = fs.readFileSync(docPath, 'utf-8');
  assert.ok(
    content.includes('Kubernetes como el runtime universal'),
    'Debe formalizar Kubernetes como runtime universal',
  );
  assert.ok(content.includes('environments/cloud'), 'Debe referenciar el blueprint environments/cloud');
  assert.ok(content.includes('environments/proxmox'), 'Debe referenciar environments/proxmox');
  assert.ok(
    content.includes('Single Production Runtime') || content.includes('Producción Universal'),
    'Debe formalizar política de producción',
  );
  assert.ok(content.includes('task dev:compose'), 'Debe formalizar task dev:compose');
  assert.ok(content.includes('task dev:k8s:up'), 'Debe formalizar task dev:k8s:up');
});

test('🛡️ INFRA-007: toda imagen descargada por OpenTofu debe verificar checksum y URL inmutable', () => {
  const mainTf = readHcl(`${PROXMOX_ENV}/main.tf`);

  // 1. Todo recurso `proxmox_download_file` debe declarar checksum + checksum_algorithm (variables, no literales).
  //    ADR-030 retiró la imagen de la VM de prod; queda la plantilla LXC de pre-prod.
  const downloads = blocksOf(mainTf, 'resource', 'proxmox_download_file');
  assert.ok(downloads.length >= 1, 'Debe existir el recurso de descarga de la plantilla LXC');
  assert.deepEqual(
    blocksOf(mainTf, 'resource', 'proxmox_virtual_environment_vm'),
    [],
    'ADR-030: el entorno proxmox no aprovisiona VMs KVM',
  );

  for (const download of downloads) {
    const name = download.labels[1];
    assert.match(
      download.attrs.checksum ?? '',
      /^var\.\w+$/,
      `INFRA-007: el recurso proxmox_download_file.${name} no verifica checksum; una imagen sustituta pasaria desapercibida`,
    );
    assert.match(
      download.attrs.checksum_algorithm ?? '',
      /^var\.\w+$/,
      `INFRA-007: el recurso proxmox_download_file.${name} no declara checksum_algorithm`,
    );
    assert.equal(download.attrs.url, 'var.lxc_template_url', `INFRA-007: ${name} debe descargar la URL verificada`);
  }

  // 2. La URL por defecto de la plantilla LXC debe apuntar a un artefacto versionado,
  //    nunca a un alias mutable: un checksum sobre una URL cambiante no garantiza nada.
  const defaultUrl = stringAttr(proxmoxVariable('lxc_template_url'), 'default');
  assert.ok(defaultUrl, 'lxc_template_url debe declarar un valor por defecto');
  assert.ok(!/latest/.test(defaultUrl), `INFRA-007: lxc_template_url no debe usar un alias mutable (${defaultUrl})`);
  assert.match(defaultUrl, /^https:\/\//, 'INFRA-007: la plantilla LXC debe descargarse por HTTPS');
  assert.match(
    defaultUrl,
    /debian-\d+-standard_[\d.]+-\d+_amd64\.tar\.zst$/,
    'INFRA-007: lxc_template_url debe fijar la versión de la plantilla',
  );

  // 3. El ejemplo de variables debe documentar (de forma activa, no comentada) el checksum de la plantilla.
  const tfvars = readHcl(`${PROXMOX_ENV}/terraform.tfvars.example`);
  for (const name of ['lxc_template_checksum', 'lxc_template_checksum_algorithm']) {
    assert.ok(name in tfvars.attrs, `INFRA-007: terraform.tfvars.example debe documentar ${name}`);
  }
});

test('🛡️ INFRA-007: el checksum por defecto debe tener la longitud del algoritmo declarado', () => {
  const cases: Array<[string, string, number]> = [['lxc_template_checksum', 'lxc_template_checksum_algorithm', 64]];

  for (const [checksumVar, algVar, expectedLen] of cases) {
    const checksum = stringAttr(proxmoxVariable(checksumVar), 'default');
    const algorithm = stringAttr(proxmoxVariable(algVar), 'default');
    assert.ok(checksum, `${checksumVar} debe declarar un checksum por defecto`);
    assert.ok(algorithm, `${algVar} debe declarar el algoritmo por defecto`);

    const expectedAlgorithm = expectedLen === 64 ? 'sha256' : 'sha512';
    assert.equal(
      algorithm,
      expectedAlgorithm,
      `${algVar} debe ser '${expectedAlgorithm}' para que ${checksumVar} tenga ${expectedLen} caracteres`,
    );
    assert.equal(
      checksum.length,
      expectedLen,
      `${checksumVar} debe tener exactamente ${expectedLen} caracteres hexadecimales (${algorithm})`,
    );
    assert.match(
      checksum,
      new RegExp(`^[a-f0-9]{${expectedLen}}$`),
      `${checksumVar} debe ser un digest hexadecimal en minúsculas`,
    );
  }
});

test('🧹 INFRA-008: ninguna variable de OpenTofu puede quedar sin consumidor ni usarse sin declarar', () => {
  /** Variables declaradas sin ninguna referencia `var.<nombre>` fuera de su propio bloque, y referencias huérfanas. */
  function audit(envDir: string) {
    const files = readHclDir(envDir);
    const declared = blocksOf(files, 'variable').map((b) => b.labels[0]);
    const referencedBy = new Map<string, Set<string>>();
    for (const file of files) {
      for (const block of file.blocks) {
        const owner = block.type === 'variable' ? block.labels[0] : '';
        for (const [, name] of block.raw.matchAll(/\bvar\.([a-z0-9_]+)\b/g)) {
          if (name === owner) continue; // la propia declaración (p. ej. su `validation`) no cuenta como consumo
          referencedBy.set(name, (referencedBy.get(name) ?? new Set()).add(owner || '<recurso>'));
        }
      }
    }
    return {
      declared,
      dead: declared.filter((name) => !referencedBy.has(name)),
      undeclared: [...referencedBy.keys()].filter((name) => !declared.includes(name)),
    };
  }

  const envs = [PROXMOX_ENV, 'infra/opentofu/environments/lab', 'infra/opentofu/environments/cloud-template'];
  for (const envDir of envs) {
    const { declared, dead, undeclared } = audit(envDir);
    assert.ok(declared.length > 0, `${envDir}/variables.tf debe declarar variables`);
    assert.deepEqual(
      dead,
      [],
      `INFRA-008: variables declaradas y nunca consumidas en ${envDir}: ${dead.join(', ')}. ` +
        'Eliminalas o conectalas a un recurso: una variable muerta sugiere un control inexistente.',
    );
    assert.deepEqual(undeclared, [], `INFRA-008: ${envDir} usa variables no declaradas: ${undeclared.join(', ')}`);
  }

  assert.equal(
    'image_file_id' in
      Object.fromEntries(blocksOf(readHcl(`${PROXMOX_ENV}/variables.tf`), 'variable').map((b) => [b.labels[0], 1])),
    false,
    'INFRA-008: `image_file_id` no debe volver a declararse; los recursos LXC consumen ' +
      'proxmox_download_file.debian_lxc_template[0].id',
  );
});

test('🛡️ IaC Architecture: OpenTofu módulos, entorno lab y roles de Ansible estructurados correctamente', () => {
  const modules = ['compute', 'naming', 'tagging', 'security_baseline'];
  for (const mod of modules) {
    const modPath = path.join(ROOT_DIR, `infra/opentofu/modules/${mod}`);
    assert.ok(fs.existsSync(modPath), `Módulo infra/opentofu/modules/${mod} debe existir`);
    assert.ok(fs.existsSync(path.join(modPath, 'main.tf')), `${mod}/main.tf debe existir`);
    assert.ok(fs.existsSync(path.join(modPath, 'variables.tf')), `${mod}/variables.tf debe existir`);
    assert.ok(fs.existsSync(path.join(modPath, 'outputs.tf')), `${mod}/outputs.tf debe existir`);
  }

  const labEnvPath = path.join(ROOT_DIR, 'infra/opentofu/environments/lab');
  assert.ok(fs.existsSync(labEnvPath), 'infra/opentofu/environments/lab debe existir');
  assert.ok(fs.existsSync(path.join(labEnvPath, 'main.tf')), 'lab/main.tf debe existir');
  assert.ok(fs.existsSync(path.join(labEnvPath, 'providers.tf')), 'lab/providers.tf debe existir');
  assert.ok(fs.existsSync(path.join(labEnvPath, 'variables.tf')), 'lab/variables.tf debe existir');
  assert.ok(fs.existsSync(path.join(labEnvPath, 'outputs.tf')), 'lab/outputs.tf debe existir');

  const cloudTemplatePath = path.join(ROOT_DIR, 'infra/opentofu/environments/cloud-template');
  assert.ok(fs.existsSync(cloudTemplatePath), 'infra/opentofu/environments/cloud-template debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'main.tf')), 'cloud-template/main.tf debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'variables.tf')), 'cloud-template/variables.tf debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'outputs.tf')), 'cloud-template/outputs.tf debe existir');
  assert.ok(
    fs.existsSync(path.join(cloudTemplatePath, 'terraform.tfvars.example')),
    'cloud-template/terraform.tfvars.example debe existir',
  );
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'README.md')), 'cloud-template/README.md debe existir');
  const cloudVars = fs.readFileSync(path.join(cloudTemplatePath, 'variables.tf'), 'utf-8');
  assert.ok(
    cloudVars.includes('variable "network_id"'),
    'cloud-template/variables.tf debe parametrizar la red sin fijar un proveedor',
  );

  const backendExamplePath = path.join(ROOT_DIR, 'infra/opentofu/environments/backend.tf.example');
  assert.ok(fs.existsSync(backendExamplePath), 'backend.tf.example debe existir');
  const backendExampleContent = fs.readFileSync(backendExamplePath, 'utf-8');
  assert.ok(
    backendExampleContent.includes('key_provider "pbkdf2"'),
    'backend.tf.example debe documentar cifrado nativo del lado del cliente con pbkdf2',
  );
  assert.ok(
    backendExampleContent.includes('method "aes_gcm"'),
    'backend.tf.example debe documentar método de cifrado aes_gcm en reposo',
  );
});

test('🛡️ IaC State Security: ADR-012 formaliza backend remoto, bloqueo de concurrencia y cifrado nativo', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-012-iac-state-management-and-encryption.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const auditPath = path.join(ROOT_DIR, 'docs/security/DEVSECOPS_AUDIT.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-012 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.includes('OpenTofu'), 'ADR-012 debe documentar OpenTofu');
  assert.ok(adrContent.includes('.gitignore'), 'ADR-012 debe documentar exclusión en .gitignore');
  assert.ok(
    adrContent.includes('backend "s3"') || adrContent.includes('backend'),
    'ADR-012 debe documentar backend remoto',
  );
  assert.ok(
    adrContent.includes('dynamodb_table') || adrContent.includes('bloqueo'),
    'ADR-012 debe documentar state locking',
  );
  assert.ok(
    adrContent.includes('Client-Side Encryption') || adrContent.includes('encryption'),
    'ADR-012 debe documentar client-side encryption',
  );
  assert.ok(adrContent.includes('aes_gcm'), 'ADR-012 debe documentar método aes_gcm');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-012-iac-state-management-and-encryption.md'), 'README.md debe enlazar ADR-012');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(
    docsReadmeContent.includes('ADR-012-iac-state-management-and-encryption.md'),
    'docs/README.md debe enlazar ADR-012',
  );
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  const auditContent = fs.readFileSync(auditPath, 'utf-8');
  assert.ok(
    auditContent.includes('ADR-012-iac-state-management-and-encryption.md'),
    'DEVSECOPS_AUDIT.md debe enlazar ADR-012',
  );
  assert.ok(
    auditContent.includes('Implementado'),
    'DEVSECOPS_AUDIT.md debe marcar como Implementado la gestión de estados IaC',
  );
});

test('🛡️ Trivy IaC: sin excepciones huérfanas tras retirar el entorno aws (ADR-030)', () => {
  // AVD-AWS-0104 solo cubría el security group de EKS de infra/opentofu/environments/aws.
  // Retirado ese entorno, una supresión residual ocultaría hallazgos reales en IaC futura.
  for (const ignorePath of ['.trivyignore', 'infra/opentofu/.trivyignore']) {
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, ignorePath)),
      false,
      `${ignorePath} no debe existir sin un recurso que justifique la excepción`,
    );
  }

  const workflow = readYaml<{
    jobs: Record<string, { steps?: Array<{ uses?: string; with?: Record<string, string> }> }>;
  }>('.github/workflows/security-code-scanning.yaml');
  const trivySteps = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .filter((step) => String(step.uses ?? '').startsWith('aquasecurity/trivy-action'));
  const iacScan = trivySteps.filter((step) => step.with?.['scan-ref'] === 'infra/opentofu');
  assert.equal(iacScan.length, 1, 'El escaneo Trivy IaC debe seguir cubriendo infra/opentofu');
  assert.equal(iacScan[0].with?.['scan-type'], 'config', 'El escaneo de IaC debe ser de configuración');
  assert.ok(
    trivySteps.every((step) => !('trivyignores' in (step.with ?? {}))),
    'Ningún escaneo Trivy debe consumir archivos de exclusión retirados',
  );
});
