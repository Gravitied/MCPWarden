import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type RunRecord = {
  runId: string;
  workflow: string;
  ok: boolean;
  createdAt: string;
  metrics?: unknown;
  trace?: unknown;
  outputs?: unknown;
  error?: string;
};

export class FileRunStore {
  constructor(private readonly path: string) {}

  async append(record: RunRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const records: RunRecord[] = await this.list().catch(() => []);
    records.push(record);
    await writeFile(this.path, `${records.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  }

  async list(): Promise<RunRecord[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as RunRecord);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }

  async get(runId: string): Promise<RunRecord> {
    const record = (await this.list()).find((item) => item.runId === runId);
    if (!record) throw new Error(`unknown run: ${runId}`);
    return record;
  }
}
