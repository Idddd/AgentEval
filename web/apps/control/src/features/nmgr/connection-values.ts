export type ConnectionValue = {
  source: string;
  status: "missing" | "empty" | "unreadable" | "invalid" | "loaded";
  preview: string;
  code?: string;
  path?: string;
  length?: number;
  trimmed?: boolean;
};
export type ConnectionValuePair = {
  effective: ConnectionValue;
  deployment: ConnectionValue;
  overridden: boolean;
};
export type ConnectionValues = Record<string, ConnectionValuePair>;
