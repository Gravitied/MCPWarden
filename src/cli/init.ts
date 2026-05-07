import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type InitResultItem = { name: string; path: string };
export type InitResult = { created: InitResultItem[]; skipped: InitResultItem[] };

const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");

const files = [
  { name: "mcpw.config.json", template: "mcpw.config.json" },
  { name: "mcpw.overrides.json", template: "mcpw.overrides.json" },
  { name: "example.workflow.json", template: "example.workflow.json" }
];

export async function initializeProject(input: { cwd?: string } = {}): Promise<InitResult> {
  const cwd = resolve(input.cwd ?? process.cwd());
  await mkdir(cwd, { recursive: true });
  const result: InitResult = { created: [], skipped: [] };

  for (const file of files) {
    const target = join(cwd, file.name);
    try {
      await copyFile(join(templateDir, file.template), target, 1);
      result.created.push({ name: file.name, path: target });
    } catch (error) {
      if (isAlreadyExists(error)) {
        result.skipped.push({ name: file.name, path: target });
        continue;
      }
      throw error;
    }
  }

  return result;
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
