import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AAS_VERSION = "18.6.0";
export const AAS_INTEGRITY =
  "sha256-03db2fa823981728151843f4f278982b518c8e1e27d980e173218cb1f82025c0";

type ApprovedSkill = {
  risk: "safe" | "critical";
  governedBy: readonly string[];
};

export const AAS_APPROVED_SKILLS = {
  "systematic-debugging": { risk: "critical", governedBy: ["repo-quality", "repo-refactor"] },
  "project-skill-audit": { risk: "safe", governedBy: ["repo-lifecycle"] },
  "code-review-excellence": { risk: "safe", governedBy: ["repo-pr", "repo-quality"] },
  "dependency-scanning": { risk: "safe", governedBy: ["repo-dependencies", "repo-security"] },
  "documentation-and-adrs": { risk: "critical", governedBy: ["repo-docs", "repo-doc-governance"] },
  "senior-architect": { risk: "critical", governedBy: ["repo-architecture"] },
  "gitops-workflow": { risk: "critical", governedBy: ["repo-architecture", "repo-release"] },
  "kubernetes-hardening": { risk: "critical", governedBy: ["repo-security", "repo-architecture"] },
} as const satisfies Record<string, ApprovedSkill>;

type Stack = {
  schemaVersion: number;
  catalog: { package: string; version: string; integrity: string };
  targets: Array<{ host: string; scope: string }>;
  skills: Array<{ id: string }>;
};

type ReviewDecision = {
  id: string;
  risk: string;
  disposition: string;
  governedBy: string[];
  reason: string;
};

type Review = {
  catalog: { package: string; version: string; integrity: string };
  policy: {
    mode: string;
    maxSkills: number;
    allowMaterialization: boolean;
    allowUpstreamCommandExecution: boolean;
  };
  approved: ReviewDecision[];
};

function readJson(path: string, label: string, errors: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(`No se pudo leer ${label}: ${reason}`);
    return undefined;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hasStackShape(value: unknown): value is Stack {
  if (!isRecord(value) || !isRecord(value.catalog)) return false;
  return Array.isArray(value.targets) && Array.isArray(value.skills);
}

function hasReviewShape(value: unknown): value is Review {
  if (!isRecord(value) || !isRecord(value.catalog) || !isRecord(value.policy)) return false;
  return Array.isArray(value.approved);
}

const sameSet = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && actual.every((item) => expected.includes(item));

export function validateAasGovernance(root = process.cwd()): string[] {
  const errors: string[] = [];
  const stackValue = readJson(resolve(root, ".agents/aas/aas-stack.json"), "el manifest AAS", errors);
  const reviewValue = readJson(
    resolve(root, ".agents/aas/reviewed-selection.json"),
    "la selección revisada AAS",
    errors,
  );
  if (!hasStackShape(stackValue)) errors.push("El manifest AAS no tiene la estructura mínima requerida.");
  if (!hasReviewShape(reviewValue)) errors.push("La selección revisada AAS no tiene la estructura mínima requerida.");
  if (!hasStackShape(stackValue) || !hasReviewShape(reviewValue)) return errors;

  const stack = stackValue;
  const review = reviewValue;
  const expectedIds = Object.keys(AAS_APPROVED_SKILLS);
  const ids = stack.skills.map((item) => item?.id).filter((id): id is string => typeof id === "string");
  const decisions = review.approved.filter((item): item is ReviewDecision => isRecord(item)) as ReviewDecision[];
  const approved = new Map(decisions.map((item) => [item.id, item]));

  if (stack.schemaVersion !== 2) errors.push("El manifest debe usar schemaVersion 2.");
  if (stack.catalog.package !== "agentic-awesome-skills") errors.push("El paquete AAS no es canónico.");
  if (stack.catalog.version !== AAS_VERSION || review.catalog.version !== AAS_VERSION)
    errors.push(`AAS debe permanecer fijado en ${AAS_VERSION}.`);
  if (stack.catalog.integrity !== AAS_INTEGRITY || review.catalog.integrity !== AAS_INTEGRITY)
    errors.push("El digest del catálogo AAS no coincide con el aprobado.");
  if (stack.catalog.package !== review.catalog.package)
    errors.push("Manifest y revisión usan paquetes distintos.");
  if (review.policy.maxSkills !== expectedIds.length)
    errors.push(`maxSkills debe ser exactamente ${expectedIds.length}.`);
  if (ids.length !== expectedIds.length || !sameSet(ids, expectedIds))
    errors.push("El manifest no coincide exactamente con la allowlist AAS aprobada.");
  if (new Set(ids).size !== ids.length) errors.push("La selección AAS contiene IDs duplicados.");
  if (review.policy.mode !== "reference-only") errors.push("AAS debe operar en modo reference-only.");
  if (review.policy.allowMaterialization || review.policy.allowUpstreamCommandExecution)
    errors.push("La política no puede autorizar materialización ni comandos upstream.");
  if (
    stack.targets.length !== 1 ||
    stack.targets[0]?.host !== "codex" ||
    stack.targets[0]?.scope !== "project"
  ) errors.push("El único target permitido es Codex con scope project.");
  if (decisions.length !== expectedIds.length || approved.size !== expectedIds.length)
    errors.push("La revisión debe contener exactamente ocho decisiones únicas.");

  for (const id of expectedIds) {
    const expected = AAS_APPROVED_SKILLS[id as keyof typeof AAS_APPROVED_SKILLS];
    const decision = approved.get(id);
    if (!decision) {
      errors.push(`Falta revisión local para ${id}.`);
      continue;
    }
    if (decision.disposition !== "APPROVED_REFERENCE")
      errors.push(`${id} no está aprobado exclusivamente como referencia.`);
    if (decision.risk !== expected.risk) errors.push(`El riesgo declarado para ${id} no coincide con la allowlist.`);
    if (!Array.isArray(decision.governedBy) || !sameSet(decision.governedBy, expected.governedBy))
      errors.push(`Los responsables locales de ${id} no coinciden con la allowlist.`);
    if (typeof decision.reason !== "string" || decision.reason.trim().length === 0)
      errors.push(`${id} requiere una razón de aprobación no vacía.`);
  }

  return errors;
}

export function runAasGovernance(root = process.cwd()): void {
  const errors = validateAasGovernance(root);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`AAS Core ${AAS_VERSION}: gobierno local válido (8 referencias, sin materialización).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runAasGovernance();
}
