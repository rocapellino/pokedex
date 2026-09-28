import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { AAS_INTEGRITY, AAS_VERSION, validateAasGovernance } from "../scripts/aas-governance.js";

function withFixture(
  mutate: (stack: Record<string, any>, review: Record<string, any>, root: string) => void,
): string[] {
  const root = join(tmpdir(), `pokedex-aas-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const directory = join(root, ".agents", "aas");
  mkdirSync(directory, { recursive: true });
  cpSync(".agents/aas/aas-stack.json", join(directory, "aas-stack.json"));
  cpSync(".agents/aas/reviewed-selection.json", join(directory, "reviewed-selection.json"));
  const stackPath = join(directory, "aas-stack.json");
  const reviewPath = join(directory, "reviewed-selection.json");
  const stack = JSON.parse(readFileSync(stackPath, "utf8")) as Record<string, any>;
  const review = JSON.parse(readFileSync(reviewPath, "utf8")) as Record<string, any>;
  try {
    mutate(stack, review, root);
    if (readFileSync(stackPath, "utf8").trim() !== "{")
      writeFileSync(stackPath, `${JSON.stringify(stack)}\n`);
    writeFileSync(reviewPath, `${JSON.stringify(review)}\n`);
    return validateAasGovernance(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("la selección AAS cumple el contrato local", () => {
  assert.deepEqual(validateAasGovernance(), []);
});

test("AAS está fijado por versión y digest", () => {
  assert.equal(AAS_VERSION, "18.6.0");
  assert.equal(AAS_INTEGRITY, "sha256-03db2fa823981728151843f4f278982b518c8e1e27d980e173218cb1f82025c0");
});

test("rechaza sustituir coordinadamente una skill en manifest y revisión", () => {
  const errors = withFixture((stack, review) => {
    stack.skills[0].id = "architecture-review";
    review.approved[0].id = "architecture-review";
  });
  assert.ok(errors.some((error) => error.includes("allowlist")));
});

test("rechaza riesgo, responsables y razón divergentes", () => {
  const errors = withFixture((_stack, review) => {
    review.approved[0].risk = "safe";
    review.approved[0].governedBy = ["repo-lifecycle"];
    review.approved[0].reason = " ";
  });
  assert.ok(errors.some((error) => error.includes("riesgo declarado")));
  assert.ok(errors.some((error) => error.includes("responsables locales")));
  assert.ok(errors.some((error) => error.includes("razón de aprobación")));
});

test("rechaza una novena skill y metadata ausente", () => {
  const errors = withFixture((stack, review) => {
    stack.skills.push({ id: "architecture-review" });
    review.policy.maxSkills = 9;
    delete stack.schemaVersion;
  });
  assert.ok(errors.some((error) => error.includes("schemaVersion")));
  assert.ok(errors.some((error) => error.includes("maxSkills")));
  assert.ok(errors.some((error) => error.includes("allowlist")));
});

test("reporta JSON inválido como error gobernado", () => {
  const errors = withFixture((_stack, _review, root) => {
    writeFileSync(join(root, ".agents", "aas", "aas-stack.json"), "{");
  });
  assert.ok(errors.some((error) => error.includes("No se pudo leer el manifest AAS")));
  assert.ok(errors.some((error) => error.includes("estructura mínima")));
});

test("los scripts no exponen apply, recover ni install", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  const aasScripts = Object.entries(pkg.scripts).filter(([name]) => name.startsWith("aas:"));
  assert.ok(aasScripts.length > 0);
  for (const [name, command] of aasScripts) {
    assert.doesNotMatch(command, /\b(?:apply|recover|install)\b/, `${name} habilita una operación prohibida`);
  }
});

test("la configuración MCP del editor permanece fuera del alcance", () => {
  const mcp = readFileSync(".vscode/mcp.json", "utf8");
  assert.doesNotMatch(mcp, /agentic-awesome-skills|\baas\b/i);
});
