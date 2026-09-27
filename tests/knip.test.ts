import { expect, test } from "bun:test";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("Knip catches code kept alive only by tests without dropping build or maintenance callers", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "knip-regression-"));
  try {
    await copyFile(path.join(root, "knip.ts"), path.join(directory, "knip.ts"));
    await symlink(
      path.join(root, "node_modules"),
      path.join(directory, "node_modules")
    );
    const files = {
      "package.json": JSON.stringify({
        name: "knip-regression",
        private: true,
        type: "module",
        dependencies: { next: "16.3.4", zod: "4.4.3" },
        scripts: { test: "bun test ./tests" },
      }),
      "src/app/page.tsx":
        'import { live } from "../shared"; export default function Page() { return live; }',
      "src/shared.ts":
        "export const live = 1; export const onlyUsedByTest = 2; export const unreferencedExport = 3;",
      "src/test-only.ts": "export const testOnly = 1;",
      "src/orphan.ts": "export const orphan = 1;",
      "tests/fixture.test.ts":
        'import { onlyUsedByTest } from "../src/shared"; import { testOnly } from "../src/test-only"; void onlyUsedByTest; void testOnly;',
      "scripts/maintain.ts":
        'import { maintenance } from "../src/maintenance"; void maintenance;',
      "src/maintenance.ts": "export const maintenance = 1;",
      "next.config.ts":
        'import plugin from "./src/build-plugin.mjs"; export default { plugin };',
      "src/build-plugin.mjs": "export default function plugin() {}",
      ".github/workflows/maintenance.yml":
        "name: maintenance\non: workflow_dispatch\njobs:\n  run:\n    runs-on: ubuntu-latest\n    steps:\n      - run: bun scripts/maintain.ts\n",
    };
    await Promise.all(
      Object.entries(files).map(async ([file, contents]) => {
        const target = path.join(directory, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, contents);
      })
    );

    for (const production of [false, true]) {
      const child = Bun.spawn(
        [
          process.execPath,
          path.join(root, "node_modules/knip/bin/knip.js"),
          "--include",
          "files,exports,dependencies",
          "--reporter",
          "json",
          ...(production ? ["--production"] : []),
        ],
        { cwd: directory, stdout: "pipe", stderr: "pipe" }
      );
      const [code, output, errors] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code, errors).toBe(1);
      expect(output).toContain("src/orphan.ts");
      expect(output).toContain("unreferencedExport");
      expect(output).toContain('"zod"');
      for (const symbol of ["onlyUsedByTest", "src/test-only.ts"]) {
        expect(
          output.includes(symbol),
          `${production ? "production" : "default"}: ${symbol}`
        ).toBe(production);
      }
      expect(output).not.toContain("src/maintenance.ts");
      expect(output).not.toContain("src/build-plugin.mjs");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
