import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { GET } from "../src/app/resume/sid-jain-resume.pdf/route.ts";

test("the PDF route compiles the resume into a downloadable PDF", async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/pdf");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(1000);
});

test("Typst logo sizes support fractional values and subsequent classes", () => {
  const { typstPath } = createRequire(import.meta.url)("@flukxr/typst-cli");
  const [helpers] = readFileSync("career/typst/resume.typ", "utf-8").split(
    "#set document("
  );
  execFileSync(typstPath, ["compile", "--input", "resume={}", "-", "-"], {
    input: `${helpers}
#assert.eq(size-from-class("h-3.5 w-6", "h", 99pt), spacing(3.5))
#assert.eq(size-from-class("h-3.5 w-6", "w", 99pt), spacing(6))
#assert.eq(size-from-class("rounded-sm", "w", 99pt), 99pt)
`,
    stdio: ["pipe", "ignore", "pipe"],
  });
});
