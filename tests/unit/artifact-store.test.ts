import { describe, expect, it } from "vitest";
import { InMemoryArtifactStore } from "../../src/artifacts/artifactStore.js";

describe("artifact store", () => {
  it("stores large values by reference", async () => {
    const store = new InMemoryArtifactStore();
    const ref = await store.put("TestFailure[]", [{ name: "fails" }], "untrusted");

    expect(ref.id).toMatch(/^art_/);
    expect(ref.type).toBe("TestFailure[]");
    expect(ref.trust).toBe("untrusted");
    await expect(store.get(ref.id)).resolves.toEqual([{ name: "fails" }]);
  });

  it("returns compact metadata without loading value", async () => {
    const store = new InMemoryArtifactStore();
    const ref = await store.put("Log[]", Array.from({ length: 500 }, (_, i) => ({ i })), "artifact");
    const meta = store.metadata(ref.id);

    expect(meta?.id).toBe(ref.id);
    expect(meta?.type).toBe("Log[]");
    expect(meta?.sizeBytes).toBeGreaterThan(100);
  });
});
