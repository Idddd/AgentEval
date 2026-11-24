import { defineHandler } from "nitro";
import { demoGuardrailEvaluation } from "../../guardrail-evaluation";

export default defineHandler(event => demoGuardrailEvaluation(event.req));
