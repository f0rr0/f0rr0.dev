import { describe, expect, test } from "bun:test";

import {
  buildCommitPublicSummaryModelInput,
  deriveCommitLanguages,
  formatPublicCommitSummaryMarkdown,
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
) => {
  const additions = files.reduce((total, item) => total + item.additions, 0);
  const deletions = files.reduce((total, item) => total + item.deletions, 0);
  return {
    committedAt: "2026-08-27T00:00:00.000Z",
    files,
    message,
    parents: ["parent"],
    sha: "sha",
    stats: { additions, deletions, total: additions + deletions },
  };
};

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

  test("consistently formats unmistakable code references", () => {
    expect(
      formatPublicCommitSummaryMarkdown(
        {
          headline: "record GET metadata with requestUrl for clarity",
          short:
            "Uses OutreachReviewTarget, atomic_fence_total, --dry-run, apt-get, refreshSession(), @scope/tool, and domain-traffic-surge while preserving `alreadyFormatted`, GitHub, and false positives.",
        },
        commit([file("templates/domain-traffic-surge.tsx", 1, 0)])
      )
    ).toEqual({
      headline: "Record `GET` metadata with `requestUrl`",
      short:
        "Uses `OutreachReviewTarget`, `atomic_fence_total`, `--dry-run`, `apt-get`, `refreshSession()`, `@scope/tool`, and `domain-traffic-surge` while preserving `alreadyFormatted`, GitHub, and false positives.",
    });
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

  test("derives languages and substantive LOC from GitHub file counters", () => {
    const files = [
      file("src/index.ts", 2, 1, "+patch text need not match counters"),
      file("src/view.tsx", 1, 0, null),
      file("worker.py", 1, 1, null),
      file("dist/bundle.js", 500, 500, "+generated"),
      file("pnpm-lock.yaml", 500, 500, "+lock"),
      file("public/hero.png", 300, 0, null),
    ];
    expect(substantiveCommitLoc(files)).toBe(6);
    expect(deriveCommitLanguages(files)).toEqual([
      { changedLines: 4, id: "typescript", label: "TypeScript" },
      { changedLines: 2, id: "python", label: "Python" },
    ]);
  });

  test("selects headline through 25 substantive lines and short above it", () => {
    const summaries = { headline: "Improve sessions", short: "One. More." };
    const small = [file("src/index.ts", 20, 5, null)];
    const large = [file("src/index.ts", 26, 0, "+one visible line")];
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
    expect(
      publicCommitSummaryValidationErrors(
        {
          headline: "Align Namefi typography",
          short: "Standardize service typography without changing content.",
        },
        source,
        { privateRepositoryFullName: "secret-org/namefi-service" }
      )
    ).toContain(
      "The public summary contains a private identity or customer name."
    );
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
