import Ajv2020 from "ajv/dist/2020";
import type { ValidateFunction } from "ajv";
import { createOpenApi } from "../openapi";

const spec = createOpenApi() as any;
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
const validators = new Map<string, ValidateFunction>();
export function assertOpenApiSchema(name: string, value: unknown) {
  let validate = validators.get(name);
  if (!validate) {
    if (!spec.components.schemas[name]) throw new Error(`Unknown schema ${name}`);
    validate = ajv.compile({ ...spec.components.schemas[name], components: spec.components });
    validators.set(name, validate);
  }
  // Model methods contain undefined properties omitted by Response.json.
  if (!validate(JSON.parse(JSON.stringify(value)))) throw new Error(`${name}: ${JSON.stringify(validate.errors)}`);
}
export async function assertOpenApiResponse(request: Request, response: Response) {
  const path = new URL(request.url).pathname;
  const template = Object.keys(spec.paths).find(template => new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(path));
  const operation = spec.paths[template ?? path]?.[request.method.toLowerCase()];
  if (!operation) throw new Error(`Undocumented operation ${request.method} ${path}`);
  const expected = operation.responses[response.status] ?? operation.responses.default;
  const media = response.headers.get("content-type")?.split(";")[0];
  const schema = expected?.content?.[media ?? ""]?.schema;
  if (!schema) throw new Error(`Undocumented response ${response.status} ${media} for ${path}`);
  const value = media === "application/json" ? await response.clone().json() : await response.clone().text();
  const key = `${request.method}:${template ?? path}:${response.status}:${media}`;
  let validate = validators.get(key);
  if (!validate) { validate = ajv.compile({ ...schema, components: spec.components }); validators.set(key, validate); }
  if (!validate(value)) throw new Error(`${key}: ${JSON.stringify(validate.errors)}`);
}
