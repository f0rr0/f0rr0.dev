import { describe, expect, test } from "bun:test";

import {
  buildCommitPublicSummaryModelInput,
  deriveCommitLanguages,
  patchCommitLoc,
  patchFileLoc,
  parseCommitPublicSummary,
  PUBLIC_COMMIT_SUMMARY_HEADLINE_MAX_WORDS,
  PUBLIC_COMMIT_SUMMARY_MAX_INPUT_CHARACTERS,
  PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT,
  publicCommitSummaryDisplayMode,
  publicCommitSummaryValidationErrors,
  selectPublicCommitSummary,
  substantiveCommitLoc,
} from "../src/lib/github-activity-public-summary.ts";

const file = (filename, additions, deletions, patch = "+change") => ({
  additions,
  deletions,
  filename,
  patch,
  previousFilename: null,
  status: "modified",
});

const commit = (
  files,
  message = "fix(auth): refresh sessions\n\nHandle expiry."
) => ({
  committedAt: "2026-08-27T00:00:00.000Z",
  files,
  message,
  parents: ["parent"],
  sha: "sha",
});

describe("public commit summaries", () => {
  test("parses the two labelled values with an optional blank separator", () => {
    const parsed = parseCommitPublicSummary(
      "HEADLINE: Refine `refreshSession` handling\n\nSHORT: Refined `refreshSession` handling. Expired sessions now follow the existing fallback."
    );
    expect(parsed).toEqual({
      headline: "Refine `refreshSession` handling",
      short:
        "Refined `refreshSession` handling. Expired sessions now follow the existing fallback.",
    });
    expect(
      parseCommitPublicSummary(
        "HEADLINE: Refine `refreshSession` SHORT: Added coverage for `refreshSession`."
      )
    ).toEqual({
      headline: "Refine `refreshSession`",
      short: "Added coverage for `refreshSession`.",
    });
    expect(() =>
      parseCommitPublicSummary(
        "HEADLINE: Refine sessions\nExtra line.\nSHORT: Refined sessions."
      )
    ).toThrow("exactly one HEADLINE and one SHORT");
    expect(() =>
      parseCommitPublicSummary(
        "HEADLINE: Refine sessions\nSHORT: Refined sessions.\nHEADLINE: Improve fallback\nSHORT: Improved fallback."
      )
    ).toThrow("exactly one HEADLINE and one SHORT");
    expect(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT).toContain("inline Markdown");
    expect(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT).toContain("backticks");
    expect(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT).toContain(
      "three to nine words"
    );
  });

  test("builds the canonical full-diff input without repository identity", () => {
    const input = buildCommitPublicSummaryModelInput(
      commit([
        file("src/session.ts", 2, 1, "+refreshSession();"),
        file("tests/session.test.ts", 3, 0, "+expect(refresh).toWork();"),
      ])
    );
    expect(input).toContain("fix(auth): refresh sessions");
    expect(input).toContain("src/session.ts");
    expect(input).toContain("+refreshSession();");
    expect(input).toContain("tests/session.test.ts");
  });

  test("bounds exceptional commits while preserving broad evidence", () => {
    const files = Array.from({ length: 80 }, (_, index) =>
      file(
        `src/module-${index.toString().padStart(2, "0")}.ts`,
        3000,
        3000,
        `${`+const value${index} = true;\n`.repeat(6000)}-oldValue`
      )
    );
    const input = buildCommitPublicSummaryModelInput(
      commit(files, "Refactor the subsystem")
    );
    expect(input.length).toBeLessThanOrEqual(
      PUBLIC_COMMIT_SUMMARY_MAX_INPUT_CHARACTERS
    );
    expect(input).toContain("CHANGED FILE INVENTORY (bounded)");
    expect(input).toContain("REPRESENTATIVE SUBSTANTIVE PATCH EVIDENCE");
    expect(input).toContain("module-00.ts");
  });

  test("derives languages and substantive LOC from patch lines", () => {
    const files = [
      file("src/index.ts", 900, 900, "+one\n+two\n-old"),
      file("src/view.tsx", 900, 900, "+one"),
      file("worker.py", 900, 900, "+one\n-old"),
      file("dist/bundle.js", 1, 0, "+generated"),
      file("pnpm-lock.yaml", 1, 0, "+lock"),
      file("public/hero.png", 300, 0, null),
    ];
    expect(substantiveCommitLoc(files)).toBe(6);
    expect(deriveCommitLanguages(files)).toEqual([
      { changedLines: 4, id: "typescript", label: "TypeScript" },
      { changedLines: 2, id: "python", label: "Python" },
    ]);
  });

  test("counts additions and deletions from unified patches without headers", () => {
    expect(
      patchFileLoc(
        "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1,2 @@\n-old\n+new\n+extra\n context"
      )
    ).toEqual({ additions: 2, deletions: 1, total: 3 });
    expect(
      patchFileLoc("@@ -1 +1 @@\n--- old divider\n+++ new divider")
    ).toEqual({ additions: 1, deletions: 1, total: 2 });
    expect(
      patchCommitLoc([
        file("src/index.ts", 99, 99, "+one\n-two"),
        file("src/missing.ts", 5, 5, null),
        file("public/logo.png", 1, 1, null),
      ])
    ).toEqual({ additions: 1, complete: false, deletions: 1, total: 2 });
  });

  test("selects headline through 25 substantive lines and short above it", () => {
    const summaries = { headline: "Improve sessions", short: "One. More." };
    const small = [
      file(
        "src/index.ts",
        900,
        900,
        Array.from({ length: 25 }, () => "+x").join("\n")
      ),
    ];
    const large = [
      file(
        "src/index.ts",
        1,
        0,
        Array.from({ length: 26 }, () => "+x").join("\n")
      ),
    ];
    expect(publicCommitSummaryDisplayMode(small)).toBe("headline");
    expect(publicCommitSummaryDisplayMode(large)).toBe("short");
    expect(selectPublicCommitSummary(summaries, small)).toBe(
      "Improve sessions"
    );
    expect(selectPublicCommitSummary(summaries, large)).toBe("One. More.");
    expect(publicCommitSummaryDisplayMode(large, 30)).toBe("headline");
  });

  test("blocks concrete private disclosures but permits technical names", () => {
    const source = commit(
      [file("src/private/session.ts", 3, 2)],
      "fix: refresh sessions for OPS-431"
    );
    expect(
      publicCommitSummaryValidationErrors(
        {
          headline:
            "Updated src/private/session.ts for AcmeProject under OPS-431.",
          short:
            "Used https://staging.example.internal with token=secret-value.",
        },
        source,
        {
          customerTerms: ["AcmeProject"],
          privateUrlHosts: ["example.internal"],
        }
      )
    ).toEqual([
      "The public summary contains a private identity or customer name.",
      "The public summary contains an internal file path.",
      "The public summary contains a secret.",
      "The public summary contains a private URL.",
      "The public summary contains an internal issue identifier.",
    ]);
    expect(
      publicCommitSummaryValidationErrors(
        {
          headline: "Add session refresh through the Supabase API",
          short:
            "Added session refresh through the Supabase API. Vitest now covers expired sessions.",
        },
        source
      )
    ).toEqual([]);
  });

  test("flags a headline that exceeds its compact word budget", () => {
    const source = commit([file("src/index.ts", 3, 2)]);
    const tooLong = Array.from(
      { length: PUBLIC_COMMIT_SUMMARY_HEADLINE_MAX_WORDS + 1 },
      () => "word"
    ).join(" ");
    expect(
      publicCommitSummaryValidationErrors(
        { headline: tooLong, short: "A supported short summary." },
        source
      )
    ).toContain("The headline exceeds 9 words.");
  });
});
