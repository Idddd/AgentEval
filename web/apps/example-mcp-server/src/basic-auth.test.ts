import { describe, expect, it } from "vitest";
import {
  basicAuthorizationValue,
  isBasicAuthorized,
} from "./basic-auth.js";

describe("Example MCP Basic authentication", () => {
  it("accepts the fixed Username and Password credentials", () => {
    const expected = basicAuthorizationValue("Username", "Password");
    expect(expected).toBe("Basic VXNlcm5hbWU6UGFzc3dvcmQ=");
    expect(isBasicAuthorized("Basic VXNlcm5hbWU6UGFzc3dvcmQ=", expected)).toBe(true);
  });

  it("rejects missing, malformed, and incorrect credentials", () => {
    const expected = basicAuthorizationValue("Username", "Password");
    expect(isBasicAuthorized(undefined, expected)).toBe(false);
    expect(isBasicAuthorized("Bearer VXNlcm5hbWU6UGFzc3dvcmQ=", expected)).toBe(false);
    expect(isBasicAuthorized(basicAuthorizationValue("Username", "wrong"), expected)).toBe(false);
  });
});
