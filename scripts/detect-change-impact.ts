/**
 * ==============================================================================
 * scripts/detect-change-impact.ts
 * ==============================================================================
 * Motor canónico de Change Impact Analysis para repo-lifecycle y CI/CD.
 *
 * Evalúa los archivos modificados en un Git diff contra el contrato declarativo
 * `.github/ci-impact.yaml` y determina qué pipelines, Quality Gates y dominios
 * están afectados.
 *
 * Características:
 *   - Evaluación determinista por reglas de glob (picomatch).
 *   - Política Fail-Closed ante rutas desconocidas (Unknown -> Full CI).
 *   - Soporte para ejecución en CI ($GITHUB_OUTPUT) y entornos locales (JSON/Markdown).
 *   - Generación de tabla explicativa para el PR Template (repo-pr).
 * ==============================================================================
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import picomatch from 'picomatch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = path.join(ROOT_DIR, '.github', 'ci-impact.yaml');

export interface SecuritySubTriggers {
  secrets?: boolean;
  sast?: boolean;
  dependencies?: boolean;
  container?: boolean;
  iac?: boolean;
  supply_chain?: boolean;
  [key: string]: boolean | undefined;
}

export type TriggerValue = boolean | SecuritySubTriggers;

export interface ImpactRule {
  description?: string;
  paths: string[];
  triggers: Record<string, TriggerValue>;
}

export interface ImpactConfig {
  version: string;
  governance: {
    framework: string;
    component: string;
  };
  always: { id: string; description: string }[];
  global: {
    paths: string[];
    triggers: Record<string, TriggerValue>;
  };
  rules: Record<string, ImpactRule>;
  unknown: {
    policy: string;
    description: string;
    triggers: Record<string, TriggerValue>;
  };
}

export interface DomainTriggers {
  documentation: boolean;
  backend: boolean;
  frontend: boolean;
  tests: boolean;
  docker: boolean;
  kubernetes: boolean;
  helm: boolean;
  opentofu: boolean;
  ansible: boolean;
  linting: boolean;
  // Umbrella y dimensiones de seguridad granular
  security: boolean;
  security_secrets: boolean;
  security_sast: boolean;
  security_dependencies: boolean;
  security_container: boolean;
  security_iac: boolean;
  security_supply_chain: boolean;
  [key: string]: any;
}

export interface ChangeImpactResult {
  hasChanges: boolean;
  isUnknown: boolean;
  isGlobal: boolean;
  changedFiles: string[];
  matchedRules: string[];
  triggers: DomainTriggers;
  markdownSummary: string;
}

/**
 * Carga y parsea el contrato declarativo de impacto
 */
export function loadImpactConfig(customPath?: string): ImpactConfig {
  const targetPath = customPath ? path.resolve(customPath) : DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Contrato de impacto no encontrado en: ${targetPath}`);
  }
  const content = fs.readFileSync(targetPath, 'utf-8');
  return yaml.load(content) as ImpactConfig;
}

/**
 * Obtiene la lista de archivos modificados mediante Git
 */
export function getChangedFilesFromGit(baseRef: string = 'origin/main'): string[] {
  try {
    let diffTarget = baseRef;
    try {
      execSync(`git rev-parse --verify ${diffTarget}`, { stdio: 'ignore' });
    } catch {
      diffTarget = 'HEAD~1';
    }

    const output = execSync(`git diff --name-only ${diffTarget}...HEAD`, {
      encoding: 'utf-8',
      cwd: ROOT_DIR,
    });

    return output
      .split('\n')
      .map((line) => line.trim().replace(/\\/g, '/'))
      .filter((line) => line.length > 0);
  } catch (_error) {
    console.warn('[Change Impact] Advertencia: No se pudo obtener git diff contra la rama base. Aplicando política fail-closed.');
    return [];
  }
}

/**
 * Normaliza una ruta a formato POSIX relativo
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

/**
 * Aplica un conjunto de triggers declarativos a la estructura acumulativa de triggers
 */
export function applyTriggers(target: DomainTriggers, sourceTriggers: Record<string, TriggerValue>): void {
  for (const [key, value] of Object.entries(sourceTriggers)) {
    if (key === 'security') {
      if (typeof value === 'object' && value !== null) {
        for (const [secKey, secVal] of Object.entries(value)) {
          if (secVal) {
            target[`security_${secKey}`] = true;
            target.security = true;
          }
        }
      } else if (value === true) {
        target.security = true;
        target.security_secrets = true;
        target.security_sast = true;
        target.security_dependencies = true;
        target.security_container = true;
        target.security_iac = true;
        target.security_supply_chain = true;
      }
    } else if (typeof value === 'boolean' && value) {
      target[key] = true;
    }
  }
}

/**
 * Analiza el impacto de una lista de archivos modificados
 */
export function analyzeChangeImpact(options: {
  files?: string[];
  config?: ImpactConfig;
  configPath?: string;
  baseRef?: string;
}): ChangeImpactResult {
  const config = options.config || loadImpactConfig(options.configPath);
  let files = options.files;

  if (!files || files.length === 0) {
    files = getChangedFilesFromGit(options.baseRef);
  }

  files = files.map(normalizePath).filter(Boolean);

  const createBaseTriggers = (): DomainTriggers => ({
    documentation: false,
    backend: false,
    frontend: false,
    tests: false,
    docker: false,
    kubernetes: false,
    helm: false,
    opentofu: false,
    ansible: false,
    linting: false,
    security: false,
    security_secrets: false,
    security_sast: false,
    security_dependencies: false,
    security_container: false,
    security_iac: false,
    security_supply_chain: false,
  });

  // Caso 1: Sin archivos detectados o error de diff -> Política Fail-Closed (Unknown -> Full CI)
  if (files.length === 0) {
    const unknownTriggers = createBaseTriggers();
    applyTriggers(unknownTriggers, config.unknown.triggers);
    return {
      hasChanges: false,
      isUnknown: true,
      isGlobal: false,
      changedFiles: [],
      matchedRules: ['unknown'],
      triggers: unknownTriggers,
      markdownSummary: formatImpactMarkdown(unknownTriggers, ['unknown (sin archivos o diff no concluyente)'], []),
    };
  }

  const isGlobalMatcher = picomatch(config.global.paths, { dot: true });
  const hasGlobalChange = files.some((f) => isGlobalMatcher(f));

  // Caso 2: Modificación de archivo global transversal
  if (hasGlobalChange) {
    const globalTriggers = createBaseTriggers();
    applyTriggers(globalTriggers, config.global.triggers);
    return {
      hasChanges: true,
      isUnknown: false,
      isGlobal: true,
      changedFiles: files,
      matchedRules: ['global'],
      triggers: globalTriggers,
      markdownSummary: formatImpactMarkdown(globalTriggers, ['global (configuración transversal modificada)'], files),
    };
  }

  // Caso 3: Evaluación condicional por dominios
  const matchedRules: string[] = [];
  const currentTriggers = createBaseTriggers();
  const unmappedFiles: string[] = [];

  for (const file of files) {
    let fileMatched = false;

    for (const [ruleName, rule] of Object.entries(config.rules)) {
      const matcher = picomatch(rule.paths, { dot: true });
      if (matcher(file)) {
        fileMatched = true;
        if (!matchedRules.includes(ruleName)) {
          matchedRules.push(ruleName);
        }
        applyTriggers(currentTriggers, rule.triggers);
      }
    }

    if (!fileMatched) {
      unmappedFiles.push(file);
    }
  }

  // Caso 4: Existen archivos que no encajan en ninguna regla conocida -> Fail-Closed
  if (unmappedFiles.length > 0) {
    matchedRules.push('unknown');
    applyTriggers(currentTriggers, config.unknown.triggers);
    return {
      hasChanges: true,
      isUnknown: true,
      isGlobal: false,
      changedFiles: files,
      matchedRules,
      triggers: currentTriggers,
      markdownSummary: formatImpactMarkdown(currentTriggers, matchedRules, files, unmappedFiles),
    };
  }

  return {
    hasChanges: true,
    isUnknown: false,
    isGlobal: false,
    changedFiles: files,
    matchedRules,
    triggers: currentTriggers,
    markdownSummary: formatImpactMarkdown(currentTriggers, matchedRules, files),
  };
}

/**
 * Genera la tabla formateada en Markdown para el PR template y reportes
 */
export function formatImpactMarkdown(
  triggers: DomainTriggers,
  matchedRules: string[],
  files: string[],
  unmappedFiles?: string[]
): string {
  const rows: { domain: string; affected: boolean; pipeline: string }[] = [
    { domain: 'Documentation', affected: triggers.documentation, pipeline: 'docs-ci (Fast Track)' },
    { domain: 'Backend Core', affected: triggers.backend, pipeline: 'ci.yml (code-quality)' },
    { domain: 'Frontend SPA', affected: triggers.frontend, pipeline: 'ci.yml & web.yml' },
    { domain: 'Unit & Integration Tests', affected: triggers.tests, pipeline: 'npm test & fuzzing' },
    { domain: 'Docker Images', affected: triggers.docker, pipeline: 'build-docker & Cosign' },
    { domain: 'Kubernetes & GitOps', affected: triggers.kubernetes, pipeline: 'infra.yml & Kind' },
    { domain: 'Helm Packaging', affected: triggers.helm, pipeline: 'helm lint & parity' },
    { domain: 'OpenTofu IaC', affected: triggers.opentofu, pipeline: 'infra.yml (Tofu)' },
    { domain: 'Ansible Baseline', affected: triggers.ansible, pipeline: 'infra.yml (Ansible)' },
    { domain: 'Security: Secrets Scan', affected: triggers.security_secrets, pipeline: 'Gitleaks Detector' },
    { domain: 'Security: SAST Code', affected: triggers.security_sast, pipeline: 'Semgrep' },
    { domain: 'Security: Dependencies SCA', affected: triggers.security_dependencies, pipeline: 'Dependency Review' },
    { domain: 'Security: Container Scan', affected: triggers.security_container, pipeline: 'Trivy Image Scan' },
    { domain: 'Security: IaC & K8s Scan', affected: triggers.security_iac, pipeline: 'Checkov IaC' },
    { domain: 'Security: Supply Chain / SBOM', affected: triggers.security_supply_chain, pipeline: 'Cosign, SBOM & Digest' },
  ];

  let output = '### 🎯 Change Impact Analysis\n\n';
  output += `> **Reglas coincidentes:** \`${matchedRules.join('`, `')}\`  \n`;
  output += `> **Archivos analizados:** ${files.length}\n\n`;

  output += '| Dominio / Calidad | Impacto | Pipeline / Quality Gate |\n';
  output += '| :--- | :---: | :--- |\n';

  for (const row of rows) {
    const statusIcon = row.affected ? '✅ Afectado' : '⏭️ Omitido';
    output += `| **${row.domain}** | ${statusIcon} | \`${row.pipeline}\` |\n`;
  }

  if (unmappedFiles && unmappedFiles.length > 0) {
    output += `\n⚠️ **Archivos no clasificados (Fail-Closed activado):** \`${unmappedFiles.join('`, `')}\`\n`;
  }

  return output;
}

/**
 * CLI Entrypoint
 */
export function runCLI(): void {
  const args = process.argv.slice(2);
  let filesArg: string[] | undefined;
  let baseRefArg: string = 'origin/main';
  let formatArg: 'json' | 'markdown' | 'github' = 'json';
  let exportGitHub: boolean = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--files' && args[i + 1]) {
      filesArg = args[i + 1].split(',').map((s) => s.trim());
      i++;
    } else if (args[i] === '--base' && args[i + 1]) {
      baseRefArg = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      const requestedFormat = args[i + 1].toLowerCase();
      if (requestedFormat === 'md' || requestedFormat === 'markdown') {
        formatArg = 'markdown';
      } else if (requestedFormat === 'github') {
        formatArg = 'github';
      } else {
        formatArg = 'json';
      }
      i++;
    } else if (args[i] === '--github-output') {
      exportGitHub = true;
    }
  }

  const result = analyzeChangeImpact({ files: filesArg, baseRef: baseRefArg });

  // Exportar a $GITHUB_OUTPUT si se solicita o si la variable de entorno está presente
  const githubOutputFile = process.env.GITHUB_OUTPUT;
  if (exportGitHub && githubOutputFile && fs.existsSync(githubOutputFile)) {
    const outputs = [
      `has_changes=${result.hasChanges}`,
      `is_unknown=${result.isUnknown}`,
      `is_global=${result.isGlobal}`,
      `docs=${result.triggers.documentation}`,
      `backend=${result.triggers.backend}`,
      `frontend=${result.triggers.frontend}`,
      `tests=${result.triggers.tests}`,
      `security=${result.triggers.security}`,
      `security_secrets=${result.triggers.security_secrets}`,
      `security_sast=${result.triggers.security_sast}`,
      `security_dependencies=${result.triggers.security_dependencies}`,
      `security_container=${result.triggers.security_container}`,
      `security_iac=${result.triggers.security_iac}`,
      `security_supply_chain=${result.triggers.security_supply_chain}`,
      `docker=${result.triggers.docker}`,
      `kubernetes=${result.triggers.kubernetes}`,
      `helm=${result.triggers.helm}`,
      `opentofu=${result.triggers.opentofu}`,
      `ansible=${result.triggers.ansible}`,
    ];
    fs.appendFileSync(githubOutputFile, outputs.join('\n') + '\n', 'utf-8');
  }

  if (formatArg === 'markdown') {
    console.log(result.markdownSummary);
  } else if (formatArg === 'github') {
    for (const [key, value] of Object.entries(result.triggers)) {
      console.log(`${key}=${value}`);
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

// Ejecución directa si se invoca desde la línea de comandos
if (process.argv[1]) {
  const currentScriptPath = path.resolve(__filename);
  const executedScriptPath = path.resolve(process.argv[1]);
  if (currentScriptPath === executedScriptPath || executedScriptPath.includes('detect-change-impact')) {
    runCLI();
  }
}
