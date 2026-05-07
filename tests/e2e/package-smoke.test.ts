import { exec as execCommand } from "node:child_process";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execCommand);

describe("npm package smoke test", () => {
  it("packs, installs, and exposes a working mcpw binary", async () => {
    const temp = await mkdtemp(join(tmpdir(), "mcpw-package-"));
    let tarball = "";

    try {
      const { stdout: packStdout } = await exec("npm pack --silent", { cwd: process.cwd() });
      tarball = join(process.cwd(), packStdout.trim().split(/\r?\n/).at(-1) ?? "");
      const { stdout: dryRunJson } = await exec("npm pack --dry-run --json --ignore-scripts", { cwd: process.cwd() });
      const contents = JSON.parse(dryRunJson)[0].files.map((file: { path: string }) => file.path).join("\n");

      expect(contents).toContain("dist/cli.js");
      expect(contents).not.toContain("dist/tests/");
      expect(contents).not.toContain("src/cli.ts");
      expect(contents).not.toContain("coverage/");

      await exec("npm init -y", { cwd: temp });
      await exec(`npm install "${tarball}"`, { cwd: temp });
      const { stdout } = await exec("npx mcpw --version", { cwd: temp });

      expect(stdout.trim()).toBe("0.1.0");
    } finally {
      if (tarball) await unlink(tarball).catch(() => undefined);
      await rm(temp, { recursive: true, force: true });
    }
  }, 120000);
});
