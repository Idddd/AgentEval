type FieldDoc = { description: string; "x-ui-usage": string };
export type FieldDocs = Record<string, FieldDoc>;
type SchemaNode = {
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  additionalProperties?: boolean | SchemaNode;
  oneOf?: SchemaNode[];
  anyOf?: SchemaNode[];
  allOf?: SchemaNode[];
};

export function field(description: string, ui: string): FieldDoc {
  return { description: `${description}\n\n**UI usage**\n\n${ui}`, "x-ui-usage": ui };
}

export function fields(ui: string, descriptions: Record<string, string>): FieldDocs {
  return Object.fromEntries(Object.entries(descriptions).map(([name, description]) => [name, field(description, ui)]));
}

export function under(parent: string, docs: FieldDocs): FieldDocs {
  return Object.fromEntries(Object.entries(docs).map(([name, doc]) => [`${parent}.${name}`, doc]));
}

/** Add annotations to a copy. Several DTOs share validation subtrees. */
export function withFieldDocs<T extends object>(schema: T, docs: FieldDocs): T {
  function visit(node: SchemaNode, path: string): SchemaNode {
    const copy = { ...node };
    if (node.properties) copy.properties = Object.fromEntries(Object.entries(node.properties).map(([name, value]) => {
      const key = path ? `${path}.${name}` : name;
      return [name, { ...visit(value, key), ...docs[key] }];
    }));
    if (node.items) copy.items = visit(node.items, path);
    if (typeof node.additionalProperties === "object") copy.additionalProperties = visit(node.additionalProperties, path);
    for (const key of ["oneOf", "anyOf", "allOf"] as const) {
      if (node[key]) copy[key] = node[key].map(value => visit(value, path));
    }
    return copy;
  }
  return visit(schema as SchemaNode, "") as T;
}

export const requestIdHeader = field("Server-generated diagnostic correlation ID. Matches error.requestId when present.", "Error banner and support logs. Copy this value when reporting a failed request.");
export const operationIdHeader = field("Stable OpenAPI operationId for the handled route.", "Integration diagnostics. Use it to look up the operation in the OpenAPI document.");
