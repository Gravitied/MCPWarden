import { describe, expect, it } from "vitest";
import { runtimeVersion } from "../../src/index.js";

describe("scaffold", () => {
  it("exports the runtime version", () => {
    expect(runtimeVersion).toBe("0.1.0");
  });
});
