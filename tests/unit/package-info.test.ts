import { describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import { packageName, runtimeVersion } from "../../src/packageInfo.js";

describe("package identity", () => {
  it("matches runtime package metadata", () => {
    expect(packageName).toBe(pkg.name);
    expect(runtimeVersion).toBe(pkg.version);
    expect(pkg.license).toBe("MIT");
  });
});
