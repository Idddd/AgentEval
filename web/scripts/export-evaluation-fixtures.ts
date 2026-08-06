import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluationFixtures } from "../apps/control/src/features/evaluations/fixtures";
import { validateEvaluationState } from "../apps/control/src/features/evaluations/fixture-validation";

const errors = validateEvaluationState(evaluationFixtures);
if (errors.length) {
  throw new Error(`fixtures invalid: ${errors.join("; ")}`);
}
const scriptDir = dirname(fileURLToPath(import.meta.url));
const out = resolve(scriptDir, "../../src/api/demo_fixtures.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(evaluationFixtures, null, 2) + "\n", "utf8");
console.log(`wrote ${out}`);
