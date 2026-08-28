import { describe, expect, test } from "bun:test";

import {
  buildCommitPublicSummaryModelInput,
  deriveCommitLanguages,
  formatPublicCommitSummaryMarkdown,
  parseCommitPublicSummary,
  PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT,
  publicCommitSummaryDisplayMode,
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

const repositoryContext = {
  avatarUrl: "https://avatars.githubusercontent.com/u/123?v=4",
  description: "A session service for the example product.",
  directlyOwned: false,
  fullName: "example-org/example-product",
  homepageUrl: "https://example.com/product",
  ownerLogin: "example-org",
  ownerType: "Organization",
  private: true,
  topics: ["sessions", "web"],
};

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
  test("parses the requested shape and preserves every other nonempty response", () => {
    const parsed = parseCommitPublicSummary(
      "HEADLINE: Refine `refreshSession` handling\n\nSHORT: Refined `refreshSession` handling. Expired sessions now follow the existing fallback."
    );
    expect(parsed).toEqual({
      headline: "Refine `refreshSession` handling",
      short:
        "Refined `refreshSession` handling. Expired sessions now follow the existing fallback.",
    });
    const malformed =
      "Here is the result:\nHEADLINE: Refine sessions\nSHORT: Refined sessions.\nExtra detail the model chose to include.";
    expect(parseCommitPublicSummary(malformed)).toEqual({
      headline: malformed,
      short: malformed,
    });
    const multilineShort =
      "HEADLINE: Refine sessions\nSHORT: Refined sessions.\nExtra detail the model chose to include.";
    expect(parseCommitPublicSummary(multilineShort)).toEqual({
      headline: "Refine sessions",
      short: "Refined sessions.\nExtra detail the model chose to include.",
    });
    const unlabelled = "Refined sessions without using the requested labels.";
    expect(parseCommitPublicSummary(unlabelled)).toEqual({
      headline: unlabelled,
      short: unlabelled,
    });
    const surrounded = " \nUnlabelled response with surrounding whitespace.\n ";
    expect(parseCommitPublicSummary(surrounded)).toEqual({
      headline: surrounded,
      short: surrounded,
    });
    expect(() => parseCommitPublicSummary(" \n\t ")).toThrow(
      "empty public summary"
    );
    expect(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT).toContain("inline Markdown");
    expect(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT).toContain("backticks");
    expect(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT).toContain(
      "compact action headline"
    );
  });

  test("consistently formats unmistakable code references", () => {
    expect(
      formatPublicCommitSummaryMarkdown(
        {
          headline: "record GET metadata with requestUrl for clarity",
          short:
            "Uses OutreachReviewTarget, atomic_fence_total, --dry-run, apt-get, refreshSession(), @scope/tool, domain-traffic-surge, and setup-native-build-tools.sh while preserving `alreadyFormatted`, GitHub, and false positives.",
        },
        commit([
          file("templates/domain-traffic-surge.tsx", 1, 0),
          file("scripts/setup-native-build-tools.sh", 1, 0),
        ])
      )
    ).toEqual({
      headline: "Record `GET` metadata with `requestUrl` for clarity",
      short:
        "Uses `OutreachReviewTarget`, `atomic_fence_total`, `--dry-run`, `apt-get`, `refreshSession()`, `@scope/tool`, `domain-traffic-surge`, and `setup-native-build-tools.sh` while preserving `alreadyFormatted`, GitHub, and false positives.",
    });
  });

  test("never rejects summary text when optional path formatting is too large", () => {
    const summary = {
      headline: "keep every returned word",
      short: "Keep every returned word even when formatting cannot run.",
    };
    const files = Array.from({ length: 3000 }, (_, index) =>
      file(
        `src/${index}-${"very-long-hyphenated-path-term-".repeat(8)}.ts`,
        1,
        0
      )
    );
    const formatted = formatPublicCommitSummaryMarkdown(summary, commit(files));
    expect(formatted.headline).toContain("every returned word");
    expect(formatted.short).toBe(summary.short);
  });

  test("builds the canonical full-diff input with complete repository context", () => {
    const input = buildCommitPublicSummaryModelInput(
      commit([
        file("src/session.ts", 2, 1, "+refreshSession();"),
        file("tests/session.test.ts", 3, 0, "+expect(refresh).toWork();"),
      ]),
      repositoryContext
    );
    expect(input).toContain(
      '"avatarUrl": "https://avatars.githubusercontent.com/u/123?v=4"'
    );
    expect(input).toContain('"fullName": "example-org/example-product"');
    expect(input).toContain('"ownerLogin": "example-org"');
    expect(input).toContain('"private": true');
    expect(input).toContain('"directlyOwned": false');
    expect(input).toContain(
      '"description": "A session service for the example product."'
    );
    expect(input).toContain('"homepageUrl": "https://example.com/product"');
    expect(input).toContain('"topics": [');
    expect(input).toContain('"sessions"');
    expect(input).toContain('"web"');
    expect(input).toContain("fix(auth): refresh sessions");
    expect(input).toContain("src/session.ts");
    expect(input).toContain("+refreshSession();");
    expect(input).toContain("tests/session.test.ts");
  });

  test("does not clip long repository, message, filename, or patch evidence", () => {
    const descriptionTail = "DESCRIPTION_TAIL";
    const messageTail = "MESSAGE_TAIL";
    const firstPatchTail = "FIRST_PATCH_TAIL";
    const lastPatchTail = "LAST_PATCH_TAIL";
    const context = {
      ...repositoryContext,
      description: `${"repository context ".repeat(200)}${descriptionTail}`,
    };
    const files = [
      file(
        `src/${"deep-directory/".repeat(100)}first-module.ts`,
        3000,
        3000,
        `${"+const first = true;\n".repeat(10_000)}${firstPatchTail}`
      ),
      file(
        "src/last-module.ts",
        3000,
        3000,
        `${"-const last = false;\n".repeat(10_000)}${lastPatchTail}`
      ),
    ];
    const input = buildCommitPublicSummaryModelInput(
      commit(files, `${"Detailed intent. ".repeat(500)}${messageTail}`),
      context
    );
    expect(input).toContain(descriptionTail);
    expect(input).toContain(messageTail);
    expect(input).toContain(firstPatchTail);
    expect(input).toContain(lastPatchTail);
    expect(input).toContain("deep-directory/".repeat(100));
    expect(input).not.toContain("excerpt truncated");
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
});
