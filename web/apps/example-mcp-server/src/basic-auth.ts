import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const exampleMcpUsername = process.env.BASIC_AUTH_USERNAME?.trim() || "Username";
export const exampleMcpPassword = process.env.BASIC_AUTH_PASSWORD?.trim() || "Password";

export function basicAuthorizationValue(
  username = exampleMcpUsername,
  password = exampleMcpPassword,
): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

export function isBasicAuthorized(
  authorization: string | undefined,
  expected = basicAuthorizationValue(),
): boolean {
  if (!authorization) return false;
  const actualBuffer = Buffer.from(authorization, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export const requireBasicAuthentication: RequestHandler = (request, response, next) => {
  const authorization = request.header("authorization");
  if (isBasicAuthorized(authorization)) {
    next();
    return;
  }
  console.warn("Rejected Example MCP request with invalid Basic authentication.", {
    authorizationLength: authorization?.length ?? 0,
    authorizationScheme: authorization?.split(" ", 1)[0] ?? "missing",
  });
  response
    .status(401)
    .set("WWW-Authenticate", 'Basic realm="TaskLattice Example MCP", charset="UTF-8"')
    .json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Basic authentication is required." },
      id: null,
    });
};
