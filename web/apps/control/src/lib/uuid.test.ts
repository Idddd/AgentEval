import { afterEach, describe, expect, it, vi } from "vitest";

import { createUuid } from "./uuid";

describe("createUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when the secure-context API is available", () => {
    const value = "6bba98e2-52db-42b9-8308-018fdf4f4898";
    const randomUUID = vi.fn(() => value);
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn(),
      randomUUID,
    });

    expect(createUuid()).toBe(value);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("generates an RFC 4122 version 4 UUID when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index));
        return bytes;
      }),
    });

    expect(createUuid()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("fails explicitly when no cryptographic random source exists", () => {
    vi.stubGlobal("crypto", undefined);

    expect(() => createUuid()).toThrow(
      "Secure random number generation is unavailable.",
    );
  });
});
