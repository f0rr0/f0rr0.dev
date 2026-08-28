import { describe, expect, test } from "bun:test";

import {
  buildCommitPublicSummaryModelInput,
  countCommitPublicSummaryRequestTokens,
} from "../src/lib/github-activity-public-summary-input.ts";
import {
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
    providerFileCapReached: false,
    sha: "sha",
    stats: { additions, deletions, total: additions + deletions },
  };
};

const largePatch = (label) =>
  `@@ -1,360 +1,360 @@ ${label}Feature()\n context for ${label}\n${Array.from(
    { length: 360 },
    (_, index) =>
      `+${label}_${index === 359 ? "END" : String(index).padStart(3, "0")}`
  ).join("\n")}\n trailing context for ${label}`;

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

  test("builds the canonical full-diff input with complete repository context", async () => {
    const input = await buildCommitPublicSummaryModelInput(
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
    expect(input).toContain("COMPLETE GITHUB-RETURNED CHANGED FILE INDEX");
    expect(input).toContain("GITHUB-RETURNED CHANGED FILES AND PATCH EVIDENCE");
    expect(input).toContain("GITHUB-RETURNED PATCH");
    expect(input).not.toContain("providerFileCapReached");
    expect(input.indexOf("tests/session.test.ts")).toBeLessThan(
      input.lastIndexOf("src/session.ts")
    );
  });

  test("does not clip long repository, message, filename, or patch evidence", async () => {
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
    const input = await buildCommitPublicSummaryModelInput(
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

  test("switches to lossless changed-line compaction only above the token budget", async () => {
    const contextTail = "CONTEXT_TAIL_SHOULD_BE_OMITTED";
    const changedTail = "+CHANGED_TAIL_MUST_REMAIN";
    const context = `${" unchanged context for the function\n".repeat(900)} ${contextTail}\n`;
    const patch = `@@ -1,900 +1,21 @@ buildProductFeed()\n${context}+firstChange\n${Array.from({ length: 18 }, (_, index) => `+change_${index}`).join("\n")}\n${changedTail}`;
    const source = commit([file("src/feed.ts", 21, 0, patch)]);
    const full = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext
    );
    const fullTokens = await countCommitPublicSummaryRequestTokens(full);

    expect(
      await buildCommitPublicSummaryModelInput(source, repositoryContext, {
        maxRequestInputTokens: fullTokens,
      })
    ).toBe(full);

    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: fullTokens - 1 }
    );
    expect(compacted).toContain("LARGE COMMIT COMPACTION MANIFEST");
    expect(compacted).toContain(
      "all GitHub-returned changed lines and patch metadata"
    );
    expect(compacted).toContain(changedTail);
    expect(compacted).not.toContain(contextTail);
    expect(
      await countCommitPublicSummaryRequestTokens(compacted)
    ).toBeLessThanOrEqual(fullTokens - 1);
  });

  test("samples oversized patches fairly, deduplicates them, and keeps the complete ledger", async () => {
    const productPatch = largePatch("PRODUCT");
    const files = [
      file("src/product.ts", 360, 0, productPatch),
      file("src/product-copy.ts", 360, 0, productPatch),
      file("tests/product.test.ts", 360, 0, largePatch("SUPPORTING")),
      file("dist/generated.min.js", 360, 0, largePatch("GENERATED")),
      file("assets/unavailable.bin", 1, 0, null),
    ];
    const source = commit(files, "feat: expand the product capability");
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 2600 }
    );
    const permuted = await buildCommitPublicSummaryModelInput(
      commit(files.toReversed(), "feat: expand the product capability"),
      repositoryContext,
      { maxRequestInputTokens: 2600 }
    );

    expect(compacted).toBe(permuted);
    expect(
      await countCommitPublicSummaryRequestTokens(compacted)
    ).toBeLessThanOrEqual(2600);
    for (const changedFile of files) {
      expect(compacted).toContain(changedFile.filename);
    }
    expect(compacted).toContain('"patchAvailable":false');
    expect(compacted).toContain('"uniqueReturned": 3');
    expect(compacted).toMatch(/files: F\d{4}, F\d{4}/u);
    expect(compacted).toContain("PRODUCT_000");
    expect(compacted).toContain("SUPPORTING_000");
    expect(compacted).toContain("GENERATED_000");
    expect(compacted).not.toContain("trailing context for PRODUCT");
    expect(compacted).toContain("token-weighted 6:2:1");
  });

  test("an oversized early sample cannot suppress later product evidence", async () => {
    const oversizedGeneratedPatch = `@@ -0,0 +1 @@ generatedBundle()\n+${"x".repeat(30_000)}`;
    const productSignal = "+PRODUCT_SIGNAL_MUST_SURVIVE";
    const source = commit(
      [
        file("dist/generated.min.js", 1, 0, oversizedGeneratedPatch),
        file(
          "src/product.ts",
          1,
          0,
          `@@ -0,0 +1 @@ addProductCapability()\n${productSignal}`
        ),
      ],
      "feat: add the product capability"
    );
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 2000 }
    );

    expect(
      await countCommitPublicSummaryRequestTokens(compacted)
    ).toBeLessThanOrEqual(2000);
    expect(compacted).toContain("token-weighted 6:2:1");
    expect(compacted).toContain(productSignal);
    expect(compacted).toContain('"partiallyCompacted": 1');
    expect(compacted).toMatch(/\[\d+ UTF-8 bytes omitted from this line\]/u);
  });

  test("does not count pre-hunk diff headers as changed lines", async () => {
    const contextTail = "PRE_HUNK_CONTEXT_TAIL";
    const patch = `diff --git a/src/feed.ts b/src/feed.ts
index 1111111..2222222 100644
--- a/src/feed.ts
+++ b/src/feed.ts
@@ -1,2 +1,2 @@ buildFeed()
-oldFilter
+newFilter
${` unchanged context\n`.repeat(900)} ${contextTail}`;
    const source = commit([file("src/feed.ts", 1, 1, patch)]);
    const full = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext
    );
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      {
        maxRequestInputTokens:
          (await countCommitPublicSummaryRequestTokens(full)) - 1,
      }
    );

    expect(compacted).toContain("LARGE COMMIT COMPACTION MANIFEST");
    expect(compacted).toContain(
      '"uniquePatchChangedLines": {\n    "available": 2'
    );
    expect(compacted).toContain("-oldFilter");
    expect(compacted).toContain("+newFilter");
    expect(compacted).not.toContain(contextTail);
  });

  test("renders sampled chunks in source order with explicit changed-line gaps", async () => {
    const changedLines = Array.from(
      { length: 360 },
      (_, index) =>
        `+ORDER_${String(index).padStart(3, "0")}_${"detail ".repeat(4)}`
    );
    const source = commit([
      file(
        "src/order.ts",
        changedLines.length,
        0,
        `@@ -0,0 +1,360 @@ preserveSourceOrder()\n${changedLines.join("\n")}`
      ),
    ]);
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 2400 }
    );
    const start = compacted.indexOf("ORDER_000");
    const middle = compacted.indexOf("ORDER_162");
    const end = compacted.indexOf("ORDER_342");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(middle).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(middle);
    expect(compacted).toMatch(
      /(?:gap|omitted)[^\n]*changed lines|changed lines[^\n]*(?:gap|omitted)/iu
    );
  });

  test("keeps both sides of a large replacement in its breadth sample", async () => {
    const removed = Array.from(
      { length: 180 },
      (_, index) => `-OLD_VALUE_${String(index).padStart(3, "0")}`
    );
    const added = Array.from(
      { length: 180 },
      (_, index) => `+NEW_VALUE_${String(index).padStart(3, "0")}`
    );
    const source = commit([
      file(
        "src/replacement.ts",
        added.length,
        removed.length,
        `@@ -1,180 +1,180 @@ replaceValues()\n${[...removed, ...added].join("\n")}`
      ),
    ]);
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 1500 }
    );

    expect(compacted).toContain("token-weighted 6:2:1");
    expect(compacted).toContain("-OLD_VALUE_000");
    expect(compacted).toContain("+NEW_VALUE_000");
    expect(compacted.indexOf("-OLD_VALUE_000")).toBeLessThan(
      compacted.indexOf("+NEW_VALUE_000")
    );
  });

  test("never emits a one-sided residual sample for an unbalanced replacement", async () => {
    const added = Array.from(
      { length: 60 },
      (_, index) => `+NEW_VALUE_${String(index).padStart(2, "0")}`
    );
    const source = commit([
      file(
        "src/unbalanced.ts",
        added.length,
        1,
        `@@ -1 +1,60 @@ replaceGeneratedValue()\n-${"old".repeat(10_000)}\n${added.join("\n")}`
      ),
    ]);
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 1800 }
    );

    expect(compacted).toContain("+NEW_VALUE_");
    expect(compacted).toContain("-old");
    expect(compacted).toContain("UTF-8 bytes omitted from this line");
  });

  test("marks wholly omitted hunks and their context", async () => {
    const hunks = Array.from({ length: 5 }, (_, hunkIndex) => {
      const additions = Array.from(
        { length: 100 },
        (_, lineIndex) =>
          `+HUNK_${hunkIndex}_${String(lineIndex).padStart(3, "0")}`
      );
      return `@@ -${hunkIndex + 1} +${hunkIndex * 100 + 1},100 @@ hunk${hunkIndex}()\n context\n${additions.join("\n")}`;
    });
    const source = commit([file("src/hunks.ts", 500, 0, hunks.join("\n"))]);
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 1700 }
    );

    expect(compacted).toMatch(
      /\[OMITTED \d+ HUNKS WITH \d+ CHANGED LINES AND \d+ UNCHANGED CONTEXT LINES\]/u
    );
  });

  test("reports byte-compacted patch metadata lines", async () => {
    const source = commit([
      file(
        "src/binary.patch",
        0,
        0,
        `GIT binary patch\nliteral 100000\n${"encoded".repeat(10_000)}`
      ),
    ]);
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 1700 }
    );

    expect(compacted).toContain('"uniquePatchMetadataLines": {');
    expect(compacted).toContain('"partiallyCompacted": 1');
    expect(compacted).toContain("UTF-8 bytes omitted from this line");
  });

  test("raw-compacts a giant single-line patch before exact tokenization", async () => {
    const giantLine = "x".repeat(4_100_000);
    const source = commit([
      file(
        "dist/bundle.min.js",
        1,
        0,
        `@@ -0,0 +1 @@ generatedBundle()\n+${giantLine}`
      ),
    ]);
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 2500 }
    );

    expect(compacted).toContain("LOCAL RAW PATCH COMPACTION");
    expect(compacted).toContain("OVERSIZED RAW PATCH HEAD/TAIL EVIDENCE");
    expect(compacted).toContain('"locallyRawCompacted": 1');
    expect(compacted).toContain(
      '"patchCounterComparisonUnavailableDueToLocalRawCompaction": 1'
    );
    expect(compacted).not.toContain('"patchCounterMismatch": 1');
    expect(
      await countCommitPublicSummaryRequestTokens(compacted)
    ).toBeLessThanOrEqual(2500);
  });

  test("does not exact-tokenize a large unbroken patch below the global byte guard", async () => {
    const source = commit([
      file(
        "src/binary.patch",
        0,
        0,
        `GIT binary patch\nliteral 280000\n${"encoded".repeat(40_000)}`
      ),
    ]);
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext
    );

    expect(compacted).toContain("LARGE COMMIT COMPACTION MANIFEST");
    expect(compacted).toContain("UTF-8 bytes omitted from this line");
    expect(
      await countCommitPublicSummaryRequestTokens(compacted)
    ).toBeLessThanOrEqual(240_000);
  });

  test("keeps an unbroken line whole when UTF-8 bytes already prove it fits", async () => {
    const tail = "UNBROKEN_BYTE_PROVEN_TAIL";
    const input = await buildCommitPublicSummaryModelInput(
      commit([
        file(
          "src/generated.ts",
          1,
          0,
          `@@ -0,0 +1 @@ generatedValue()\n+${"x".repeat(70_000)}${tail}`
        ),
      ]),
      repositoryContext
    );

    expect(input).not.toContain("LARGE COMMIT COMPACTION MANIFEST");
    expect(input).toContain(tail);
  });

  test("keeps a large ordinary multiline patch whole when its tokens fit", async () => {
    const patch = `@@ -0,0 +1,35000 @@ generatedValues()\n${"+encoded\n".repeat(35_000)}+MULTILINE_TAIL`;
    const input = await buildCommitPublicSummaryModelInput(
      commit([file("src/values.ts", 35_001, 0, patch)]),
      repositoryContext
    );

    expect(input).not.toContain("LARGE COMMIT COMPACTION MANIFEST");
    expect(input).toContain("+MULTILINE_TAIL");
    expect(
      await countCommitPublicSummaryRequestTokens(input)
    ).toBeLessThanOrEqual(240_000);
  });

  test("bounds semantic parsing across extremely line-dense patches", async () => {
    const densePatch = `@@ -0,0 +1,100010 @@ denseGeneratedFile()\n${"+x\n".repeat(100_010)}`;
    const compacted = await buildCommitPublicSummaryModelInput(
      commit([file("dist/dense.js", 100_010, 0, densePatch)]),
      repositoryContext,
      { maxRequestInputTokens: 2500 }
    );

    expect(compacted).toContain("LOCAL RAW PATCH COMPACTION");
    expect(compacted).toContain('"originalLines": 100012');
    expect(compacted).toContain('"uniquePatches": 1');
    expect(compacted).toContain("UTF-8 bytes omitted from this patch");
    expect(compacted).not.toContain("bytes omitted from this line");
    expect(
      await countCommitPublicSummaryRequestTokens(compacted)
    ).toBeLessThanOrEqual(2500);
  });

  test("uses stable non-locale filename ordering", async () => {
    const files = [
      file("src/á.ts", 1, 0, "+COMBINING_FORM"),
      file("src/á.ts", 1, 0, "+COMPOSED_FORM"),
    ];
    const forward = await buildCommitPublicSummaryModelInput(
      commit(files),
      repositoryContext
    );
    const reversed = await buildCommitPublicSummaryModelInput(
      commit(files.toReversed()),
      repositoryContext
    );

    expect(forward).toBe(reversed);
  });

  test("hard-fits pathological metadata with an explicit marker", async () => {
    const source = commit(
      [file("src/index.ts", 1, 0, "+change")],
      `feat: ${Array.from({ length: 4000 }, (_, index) => `intent_${index}`).join(" ")}`
    );
    const compacted = await buildCommitPublicSummaryModelInput(
      source,
      repositoryContext,
      { maxRequestInputTokens: 512 }
    );
    expect(compacted).toContain("EXTREME METADATA COMPACTION");
    expect(compacted).toContain('"stats"');
    expect(compacted).toContain('"totalReturned":1');
    expect(
      await countCommitPublicSummaryRequestTokens(compacted)
    ).toBeLessThanOrEqual(512);
  });

  test("byte-bounds a pathological commit message before extreme tokenization", async () => {
    const compacted = await buildCommitPublicSummaryModelInput(
      commit([], "encoded".repeat(40_000)),
      repositoryContext,
      { maxRequestInputTokens: 512 }
    );

    expect(compacted).toContain("EXTREME METADATA COMPACTION");
    expect(compacted).toMatch(/"messageUtf8BytesOmitted":26\d{4,}/u);
    expect(
      await countCommitPublicSummaryRequestTokens(compacted)
    ).toBeLessThanOrEqual(512);
  });

  test("treats tokenizer special-token text as ordinary commit evidence", async () => {
    const input = await buildCommitPublicSummaryModelInput(
      commit([file("src/index.ts", 1, 0, "+const marker = '<|endoftext|>';")]),
      repositoryContext
    );
    expect(input).toContain("<|endoftext|>");
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
