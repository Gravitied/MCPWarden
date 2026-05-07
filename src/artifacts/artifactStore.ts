import type { TrustLabel } from "../trust/trust.js";

export type ArtifactRef = {
  id: string;
  type: string;
  trust: TrustLabel;
  sizeBytes: number;
};

export class InMemoryArtifactStore {
  private readonly values = new Map<string, unknown>();
  private readonly refs = new Map<string, ArtifactRef>();
  private counter = 0;

  async put(type: string, value: unknown, trust: TrustLabel): Promise<ArtifactRef> {
    const id = `art_${++this.counter}`;
    const sizeBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    const ref = { id, type, trust, sizeBytes };
    this.values.set(id, value);
    this.refs.set(id, ref);
    return ref;
  }

  async get(id: string): Promise<unknown> {
    if (!this.values.has(id)) throw new Error(`unknown artifact: ${id}`);
    return this.values.get(id);
  }

  metadata(id: string): ArtifactRef | undefined {
    return this.refs.get(id);
  }
}
