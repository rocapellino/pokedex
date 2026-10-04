/**
 * ==============================================================================
 * Test de Seguridad y Arquitectura: OpenTofu Baseline, IaC State y Cloud Design
 * ==============================================================================
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDocsPortalLinksAdrIndex } from '../helpers/docs-portal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

/**
 * Extrae los nombres de variable declarados en un archivo `.tf` de OpenTofu.
 *
 * Se usa una expresion literal (no dinamica) por dos motivos: el conjunto de
 * archivos es finito y conocido, y Semgrep SAST marca `new RegExp()` con
 * argumento no literal como potencial ReDoS.
 */
function declaredVariables(source: string): string[] {
  return [...source.matchAll(/^variable\s+"([a-z0-9_]+)"/gim)].map((m) => m[1]);
}

/**
 * Cuenta las referencias a una variable fuera de su propia declaracion.
 *
 * La busqueda es por comparacion de cadenas, no por RegExp construida en
 * runtime: Semgrep SAST marca `new RegExp()` con argumento no literal como
 * potencial ReDoS, y los nombres de variable de OpenTofu son identificadores
 * `[a-z0-9_]` que no contienen metacaracteres, de modo que un conteo por
 * comparacion de subcadena es exacto.
 */
function referenceCount(sources: string[], name: string): number {
  let count = 0;
  for (const src of sources) {
    for (const line of src.split('\n')) {
      // Se excluye la linea `variable "<name>"` y las claves `default`, para que
      // la propia declaracion no cuente como consumo de si misma.
      if (line.includes(`variable "${name}"`)) continue;
      if (line.trimStart().startsWith('default')) continue;

      const from = 0;
      let at = line.indexOf(name, from);
      while (at !== -1) {
        const before = at === 0 ? '' : line[at - 1];
        const after = line[at + name.length] ?? '';
        const isWord = !/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after);
        if (isWord) count++;
        at = line.indexOf(name, at + name.length);
      }
    }
  }
  return count;
}

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

test('🛡️ Infra Multi-Cloud: OpenTofu mantiene proxmox y cloud-template, sin entornos atados a un proveedor (ADR-030)', () => {
  const cloudTemplatePath = path.join(ROOT_DIR, 'infra/opentofu/environments/cloud-template');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'main.tf')), 'cloud-template/main.tf debe existir como base del blueprint prod cloud');

  const proxmoxEnvPath = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox');
  assert.ok(fs.existsSync(proxmoxEnvPath), 'infra/opentofu/environments/proxmox debe existir');

  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, 'infra/opentofu/environments/aws')),
    'infra/opentofu/environments/aws se retiró con ADR-030: prod cloud no fija proveedor'
  );
});

test('🛡️ Architecture Policy: CLOUD_INFRASTRUCTURE_DESIGN.md formaliza runtime universal y multi-backend', () => {
  const docPath = path.join(ROOT_DIR, 'docs/architecture/CLOUD_INFRASTRUCTURE_DESIGN.md');
  assert.ok(fs.existsSync(docPath), 'CLOUD_INFRASTRUCTURE_DESIGN.md debe existir');
  const content = fs.readFileSync(docPath, 'utf-8');
  assert.ok(content.includes('Kubernetes como el runtime universal'), 'Debe formalizar Kubernetes como runtime universal');
  assert.ok(content.includes('environments/cloud'), 'Debe referenciar el blueprint environments/cloud');
  assert.ok(content.includes('environments/proxmox'), 'Debe referenciar environments/proxmox');
  assert.ok(content.includes('Single Production Runtime') || content.includes('Producción Universal'), 'Debe formalizar política de producción');
  assert.ok(content.includes('task dev:compose'), 'Debe formalizar task dev:compose');
  assert.ok(content.includes('task dev:k8s:up'), 'Debe formalizar task dev:k8s:up');
});

test('🛡️ INFRA-007: toda imagen descargada por OpenTofu debe verificar checksum y URL inmutable', () => {
  const mainTf = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/main.tf'),
    'utf-8'
  );
  const varsTf = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/variables.tf'),
    'utf-8'
  );
  const tfvars = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/terraform.tfvars.example'),
    'utf-8'
  );

  // 1. Todo recurso `proxmox_download_file` debe declarar checksum + checksum_algorithm.
  //    ADR-030 retiró la imagen de la VM de prod; queda la plantilla LXC de pre-prod.
  const downloadBlocks = [...mainTf.matchAll(/resource\s+"proxmox_download_file"\s+"([\w.]+)"\s*\{([^}]*)\}/g)];
  assert.ok(downloadBlocks.length >= 1, 'Debe existir el recurso de descarga de la plantilla LXC');
  assert.ok(!/proxmox_virtual_environment_vm/.test(mainTf), 'ADR-030: el entorno proxmox no aprovisiona VMs KVM');

  for (const [, name, body] of downloadBlocks) {
    assert.ok(
      /checksum\s*=\s*var\.\w+/.test(body),
      `INFRA-007: el recurso proxmox_download_file.${name} no verifica checksum; una imagen sustituta pasaria desapercibida`
    );
    assert.ok(
      /checksum_algorithm\s*=\s*var\.\w+/.test(body),
      `INFRA-007: el recurso proxmox_download_file.${name} no declara checksum_algorithm`
    );
  }

  // 2. La URL por defecto de la plantilla LXC debe apuntar a un artefacto versionado,
  //    nunca a un alias mutable: un checksum sobre una URL cambiante no garantiza nada.
  const defaultUrl = varsTf.match(/variable\s+"lxc_template_url"[\s\S]*?default\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(defaultUrl, 'lxc_template_url debe declarar un valor por defecto');
  assert.ok(!/latest/.test(defaultUrl), `INFRA-007: lxc_template_url no debe usar un alias mutable (${defaultUrl})`);
  assert.match(defaultUrl, /^https:\/\//, 'INFRA-007: la plantilla LXC debe descargarse por HTTPS');
  assert.match(defaultUrl, /debian-\d+-standard_[\d.]+-\d+_amd64\.tar\.zst$/, 'INFRA-007: lxc_template_url debe fijar la versión de la plantilla');

  // 3. El ejemplo de variables debe documentar el checksum de la plantilla.
  assert.ok(/lxc_template_checksum\s*=/.test(tfvars), 'INFRA-007: terraform.tfvars.example debe documentar lxc_template_checksum');
  assert.ok(/lxc_template_checksum_algorithm\s*=/.test(tfvars), 'INFRA-007: terraform.tfvars.example debe documentar lxc_template_checksum_algorithm');
});

test('🛡️ INFRA-007: el checksum por defecto debe tener la longitud del algoritmo declarado', () => {
  const varsTf = fs.readFileSync(
    path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox/variables.tf'),
    'utf-8'
  );

  const tfSource = varsTf.replace(/\r\n/g, '\n');
  const readDefault = (name: string): string | undefined => {
    const start = tfSource.indexOf(`variable "${name}" {`);
    if (start === -1) return undefined;
    const rest = tfSource.slice(start);
    const end = rest.slice(1).search(/\n(?=variable |#)/);
    const block = end === -1 ? rest : rest.slice(0, end + 1);
    return block.match(/default\s*=\s*"([^"]+)"/)?.[1];
  };

  const cases: Array<[string, string, number]> = [
    ['lxc_template_checksum', 'lxc_template_checksum_algorithm', 64],
  ];

  for (const [checksumVar, algVar, expectedLen] of cases) {
    const checksum = readDefault(checksumVar);
    const algorithm = readDefault(algVar);
    assert.ok(checksum, `${checksumVar} debe declarar un checksum por defecto`);
    assert.ok(algorithm, `${algVar} debe declarar el algoritmo por defecto`);

    const expectedAlgorithm = expectedLen === 64 ? 'sha256' : 'sha512';
    assert.equal(
      algorithm,
      expectedAlgorithm,
      `${algVar} debe ser '${expectedAlgorithm}' para que ${checksumVar} tenga ${expectedLen} caracteres`
    );
    assert.equal(
      checksum.length,
      expectedLen,
      `${checksumVar} debe tener exactamente ${expectedLen} caracteres hexadecimales (${algorithm})`
    );
    assert.match(
      checksum,
      new RegExp(`^[a-f0-9]{${expectedLen}}$`),
      `${checksumVar} debe ser un digest hexadecimal en minúsculas`
    );
  }
});

test('🧹 INFRA-008: ninguna variable de OpenTofu puede quedar sin consumidor', () => {
  const envDir = path.join(ROOT_DIR, 'infra/opentofu/environments/proxmox');

  const tfFiles = fs
    .readdirSync(envDir)
    .filter((f) => f.endsWith('.tf'))
    .map((f) => fs.readFileSync(path.join(envDir, f), 'utf-8'));

  const varsTf = fs.readFileSync(path.join(envDir, 'variables.tf'), 'utf-8');
  const declared = declaredVariables(varsTf);

  assert.ok(declared.length > 0, 'variables.tf debe declarar variables');

  const dead = declared.filter((name) => referenceCount(tfFiles, name) === 0);

  assert.deepEqual(
    dead,
    [],
    `INFRA-008: variables declaradas y nunca consumidas: ${dead.join(', ')}. ` +
    'Eliminalas o conectalas a un recurso: una variable muerta sugiere un control inexistente.'
  );

  assert.ok(
    !varsTf.includes('image_file_id'),
    'INFRA-008: `image_file_id` no debe volver a declararse; los recursos LXC consumen ' +
    'proxmox_download_file.debian_lxc_template[0].id'
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
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'terraform.tfvars.example')), 'cloud-template/terraform.tfvars.example debe existir');
  assert.ok(fs.existsSync(path.join(cloudTemplatePath, 'README.md')), 'cloud-template/README.md debe existir');
  const cloudVars = fs.readFileSync(path.join(cloudTemplatePath, 'variables.tf'), 'utf-8');
  assert.ok(cloudVars.includes('variable "network_id"'), 'cloud-template/variables.tf debe parametrizar la red sin fijar un proveedor');

  const backendExamplePath = path.join(ROOT_DIR, 'infra/opentofu/environments/backend.tf.example');
  assert.ok(fs.existsSync(backendExamplePath), 'backend.tf.example debe existir');
  const backendExampleContent = fs.readFileSync(backendExamplePath, 'utf-8');
  assert.ok(
    backendExampleContent.includes('key_provider "pbkdf2"'),
    'backend.tf.example debe documentar cifrado nativo del lado del cliente con pbkdf2'
  );
  assert.ok(
    backendExampleContent.includes('method "aes_gcm"'),
    'backend.tf.example debe documentar método de cifrado aes_gcm en reposo'
  );
});

test('🛡️ IaC State Security: ADR-012 formaliza backend remoto, bloqueo de concurrencia y cifrado nativo', () => {
  const adrPath = path.join(ROOT_DIR, 'docs/decisions/ADR-012-iac-state-management-and-encryption.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  const docsReadmePath = path.join(ROOT_DIR, 'docs/README.md');
  const auditPath = path.join(ROOT_DIR, 'docs/security/DEVSECOPS_AUDIT.md');

  assert.ok(fs.existsSync(adrPath), 'ADR-012 debe existir en docs/decisions/');
  const adrContent = fs.readFileSync(adrPath, 'utf-8');

  assert.ok(adrContent.replace(/\r\n/g, '\n').includes('## Estado\n\nAceptado'), 'ADR-012 debe estar aceptado');
  assert.ok(adrContent.includes('OpenTofu'), 'ADR-012 debe documentar OpenTofu');
  assert.ok(adrContent.includes('.gitignore'), 'ADR-012 debe documentar exclusión en .gitignore');
  assert.ok(adrContent.includes('backend "s3"') || adrContent.includes('backend'), 'ADR-012 debe documentar backend remoto');
  assert.ok(adrContent.includes('dynamodb_table') || adrContent.includes('bloqueo'), 'ADR-012 debe documentar state locking');
  assert.ok(adrContent.includes('Client-Side Encryption') || adrContent.includes('encryption'), 'ADR-012 debe documentar client-side encryption');
  assert.ok(adrContent.includes('aes_gcm'), 'ADR-012 debe documentar método aes_gcm');

  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  assert.ok(readmeContent.includes('ADR-012-iac-state-management-and-encryption.md'), 'README.md debe enlazar ADR-012');

  const docsReadmeContent = fs.readFileSync(docsReadmePath, 'utf-8');
  assert.ok(docsReadmeContent.includes('ADR-012-iac-state-management-and-encryption.md'), 'docs/README.md debe enlazar ADR-012');
  assertDocsPortalLinksAdrIndex(docsReadmeContent);

  const auditContent = fs.readFileSync(auditPath, 'utf-8');
  assert.ok(auditContent.includes('ADR-012-iac-state-management-and-encryption.md'), 'DEVSECOPS_AUDIT.md debe enlazar ADR-012');
  assert.ok(auditContent.includes('Implementado'), 'DEVSECOPS_AUDIT.md debe marcar como Implementado la gestión de estados IaC');

  for (let i = 1; i <= 12; i++) {
    const num = String(i).padStart(3, '0');
    const files = fs.readdirSync(path.join(ROOT_DIR, 'docs/decisions'));
    const match = files.find(f => f.startsWith(`ADR-${num}`));
    assert.ok(match, `Debe existir archivo para ADR-${num} en docs/decisions/`);
  }
});

test('🛡️ Trivy IaC: sin excepciones huérfanas tras retirar el entorno aws (ADR-030)', () => {
  // AVD-AWS-0104 solo cubría el security group de EKS de infra/opentofu/environments/aws.
  // Retirado ese entorno, una supresión residual ocultaría hallazgos reales en IaC futura.
  for (const ignorePath of ['.trivyignore', 'infra/opentofu/.trivyignore']) {
    assert.equal(fs.existsSync(path.join(ROOT_DIR, ignorePath)), false, `${ignorePath} no debe existir sin un recurso que justifique la excepción`);
  }

  const workflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/security-code-scanning.yaml'), 'utf-8');
  assert.ok(workflow.includes("scan-ref: 'infra/opentofu'"), 'El escaneo Trivy IaC debe seguir cubriendo infra/opentofu');
  assert.ok(!workflow.includes('trivyignores:'), 'El escaneo Trivy IaC no debe consumir archivos de exclusión retirados');
});
