import { describe, expect, test } from "bun:test";

import {
  buildGitHubWorkUnitSummaryInput,
  digestGitHubWorkUnitMembership,
  digestGitHubWorkUnitOutcome,
  digestGitHubWorkUnitSummaryEvaluation,
  GITHUB_WORK_UNIT_SUMMARY_MAX_INPUT_TOKENS,
  GITHUB_WORK_UNIT_SUMMARY_MAX_PAYLOAD_BYTES,
  githubWorkUnitSummaryInputSchema,
  githubWorkUnitSummaryOutputSchema,
  validateGitHubWorkUnitSummaryOutput,
} from "../src/lib/github-work-unit-summary.ts";

const textPatch = (body) => ({ body, kind: "text" });

const changedFile = (
  filename = "src/session.ts",
  patch = "@@ -10 +20 @@ refreshSession\n-oldSession()\n+newSession()"
) => ({
  additions: 1,
  deletions: 1,
  filename,
  patch: textPatch(patch),
  previousFilename: null,
  status: "modified",
});

const diff = (files = [changedFile()]) => ({
  additions: files.reduce((total, file) => total + file.additions, 0),
  deletions: files.reduce((total, file) => total + file.deletions, 0),
  fileLedgerComplete: true,
  files,
  providerFileCapReached: false,
});

const members = (count = 2) => ({
  members: Array.from({ length: count }, (_, order) => ({
    logicalChangeKey: `logical-${String(order)}`,
    order,
  })),
  unitKey: "pr-42",
});

const candidate = (overrides = {}) => ({
  attributionMode: "tracked_authored_pr",
  kind: "pull_request",
  membership: members(),
  outcome: { diff: diff(), mode: "net" },
  repository: {
    description: "Public session management for the example product.",
    fullName: "example/product",
    homepageUrl: "https://example.com",
    topics: ["web", "sessions"],
  },
  ...overrides,
});

const objectKeys = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap(objectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return [...Object.keys(value), ...Object.values(value).flatMap(objectKeys)];
};

describe("GitHub work-unit summary evidence", () => {
  test("fingerprints representative semantic evaluation changes", () => {
    const membershipDigest = "a".repeat(64);
    const fileFactsDigest = "b".repeat(64);
    const evaluation = {
      attributionMode: "tracked_authored_pr",
      evidence: {
        fileFactsComplete: true,
        fileFactsDigest,
        mode: "net",
      },
      kind: "pull_request",
      membershipDigest,
      repository: candidate().repository,
    };
    const original = digestGitHubWorkUnitSummaryEvaluation(evaluation);
    const normalizedEquivalent = digestGitHubWorkUnitSummaryEvaluation({
      ...evaluation,
      repository: {
        ...evaluation.repository,
        description: ` ${evaluation.repository.description} `,
        fullName: ` ${evaluation.repository.fullName} `,
        topics: ["sessions", "web", "sessions"],
      },
    });

    expect(original).toMatch(/^[a-f0-9]{64}$/u);
    expect(normalizedEquivalent).toBe(original);
    expect(
      digestGitHubWorkUnitSummaryEvaluation({
        ...evaluation,
        evidence: {
          ...evaluation.evidence,
          fileFactsDigest: "c".repeat(64),
        },
      })
    ).not.toBe(original);
    expect(
      digestGitHubWorkUnitSummaryEvaluation({
        ...evaluation,
        membershipDigest: "d".repeat(64),
      })
    ).not.toBe(original);
    expect(
      digestGitHubWorkUnitSummaryEvaluation({
        ...evaluation,
        repository: {
          ...evaluation.repository,
          description: "A materially different repository.",
        },
      })
    ).not.toBe(original);
  });

  test("serializes an immutable, public-safe net-outcome request", async () => {
    const result = await buildGitHubWorkUnitSummaryInput(candidate());

    expect(result.eligible).toBe(true);
    if (!result.eligible) {
      return;
    }
    const parsed = JSON.parse(result.serializedInput);
    expect(parsed).toEqual(result.input);
    expect(parsed).toMatchObject({
      attributionMode: "tracked_authored_pr",
      evidence: {
        diff: {
          additions: 1,
          deletions: 1,
          files: [
            {
              additions: 1,
              deletions: 1,
              filename: "src/session.ts",
              patch: {
                kind: "text",
                lines: ["@@ refreshSession", "-oldSession()", "+newSession()"],
              },
              previousFilename: null,
              status: "modified",
            },
          ],
        },
        mode: "net",
      },
      kind: "pull_request",
      version: 1,
    });
    expect(
      objectKeys(parsed).filter((key) =>
        [
          "commit",
          "commitCount",
          "commits",
          "members",
          "message",
          "messages",
          "sha",
          "shas",
          "title",
        ].includes(key)
      )
    ).toEqual([]);
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(Object.isFrozen(result.input.evidence)).toBe(true);
    expect(result.inputBytes).toBeLessThanOrEqual(
      GITHUB_WORK_UNIT_SUMMARY_MAX_PAYLOAD_BYTES
    );
    expect(result.inputTokens).toBeLessThanOrEqual(
      GITHUB_WORK_UNIT_SUMMARY_MAX_INPUT_TOKENS
    );
    expect(githubWorkUnitSummaryInputSchema.safeParse(parsed).success).toBe(
      true
    );
  });

  test("accepts a tracked-authored PR composite when only owned changes are summarized", async () => {
    const result = await buildGitHubWorkUnitSummaryInput(
      candidate({ outcome: { changes: [diff()], mode: "composite" } })
    );

    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.input.evidence.mode).toBe("composite");
    }
  });

  test("keeps prose eligibility stable across an outcome-identical repartition", async () => {
    const nine = await buildGitHubWorkUnitSummaryInput(
      candidate({ membership: members(9) })
    );
    const five = await buildGitHubWorkUnitSummaryInput(
      candidate({ membership: members(5) })
    );

    expect(nine.eligible).toBe(true);
    expect(five.eligible).toBe(true);
    if (!nine.eligible || !five.eligible) {
      return;
    }
    expect(nine.membershipDigest).not.toBe(five.membershipDigest);
    expect(nine.outcomeDigest).toBe(five.outcomeDigest);
    expect(nine.serializedInput).toBe(five.serializedInput);
    expect(nine.summaryInputDigest).toBe(five.summaryInputDigest);
  });

  test("normalizes hunk coordinates but preserves composite boundaries and order", () => {
    const moved = digestGitHubWorkUnitOutcome({
      diff: diff([
        changedFile(
          "src/session.ts",
          "@@ -100 +200 @@ refreshSession\n-oldSession()\n+newSession()"
        ),
      ]),
      mode: "net",
    });
    const original = digestGitHubWorkUnitOutcome({
      diff: diff(),
      mode: "net",
    });
    expect(moved.ok).toBe(true);
    expect(original.ok).toBe(true);
    if (moved.ok && original.ok) {
      expect(moved.digest).toBe(original.digest);
    }

    const first = diff([changedFile("src/a.ts")]);
    const second = diff([
      changedFile("src/b.ts", "@@ -1 +1 @@ second\n-before()\n+after()"),
    ]);
    const forward = digestGitHubWorkUnitOutcome({
      changes: [first, second],
      mode: "composite",
    });
    const reverse = digestGitHubWorkUnitOutcome({
      changes: [second, first],
      mode: "composite",
    });
    expect(forward.ok).toBe(true);
    expect(reverse.ok).toBe(true);
    if (forward.ok && reverse.ok) {
      expect(forward.digest).not.toBe(reverse.digest);
    }
  });

  test("canonicalizes membership order and changes only for semantic membership", () => {
    const canonical = members();
    const permuted = {
      ...canonical,
      members: canonical.members.toReversed(),
    };
    expect(digestGitHubWorkUnitMembership(permuted)).toBe(
      digestGitHubWorkUnitMembership(canonical)
    );
    expect(
      digestGitHubWorkUnitMembership({
        ...canonical,
        members: canonical.members.slice(0, 1),
      })
    ).not.toBe(digestGitHubWorkUnitMembership(canonical));
    expect(() =>
      digestGitHubWorkUnitMembership({
        ...canonical,
        members: canonical.members.map((member) => ({
          ...member,
          logicalChangeKey: canonical.members[0].logicalChangeKey,
        })),
      })
    ).toThrow();
    expect(() =>
      digestGitHubWorkUnitMembership({
        ...canonical,
        members: canonical.members.map((member) => ({
          ...member,
          order: member.order + 1,
        })),
      })
    ).toThrow();
  });

  test("fails closed for incomplete or inconsistent outcome evidence", async () => {
    const cases = [
      [
        candidate({ attributionMode: "foreign_pr_contribution" }),
        "attribution_mode_mismatch",
      ],
      [
        candidate({ attributionMode: "unsupported" }),
        "attribution_mode_mismatch",
      ],
      [candidate({ kind: "unsupported" }), "attribution_mode_mismatch"],
      [
        candidate({ outcome: { diff: diff(), mode: "unsupported" } }),
        "attribution_mode_mismatch",
      ],
      [
        candidate({
          outcome: {
            diff: { ...diff(), providerFileCapReached: true },
            mode: "net",
          },
        }),
        "provider_file_cap",
      ],
      [
        candidate({
          outcome: {
            diff: { ...diff(), fileLedgerComplete: false },
            mode: "net",
          },
        }),
        "file_ledger_incomplete",
      ],
      [
        candidate({
          outcome: {
            diff: { ...diff(), fileLedgerComplete: "yes" },
            mode: "net",
          },
        }),
        "file_ledger_incomplete",
      ],
      [
        candidate({
          outcome: {
            diff: { ...diff(), providerFileCapReached: 0 },
            mode: "net",
          },
        }),
        "file_ledger_invalid",
      ],
      [
        candidate({
          outcome: {
            diff: diff([{ ...changedFile(), patch: { kind: "unavailable" } }]),
            mode: "net",
          },
        }),
        "patch_unavailable",
      ],
      [
        candidate({
          outcome: {
            diff: diff([{ ...changedFile(), patch: { kind: "binary" } }]),
            mode: "net",
          },
        }),
        "binary_evidence",
      ],
      [
        candidate({
          outcome: {
            diff: diff([
              {
                ...changedFile(),
                additions: 2,
              },
            ]),
            mode: "net",
          },
        }),
        "patch_counter_mismatch",
      ],
      [
        candidate({
          outcome: {
            diff: { ...diff(), additions: 2 },
            mode: "net",
          },
        }),
        "diff_counter_mismatch",
      ],
      [
        candidate({
          outcome: {
            diff: diff([{ ...changedFile(), status: "unsupported" }]),
            mode: "net",
          },
        }),
        "file_ledger_invalid",
      ],
      [
        candidate({
          outcome: {
            diff: diff([
              { ...changedFile(), patch: { body: 42, kind: "text" } },
            ]),
            mode: "net",
          },
        }),
        "file_ledger_invalid",
      ],
      [
        candidate({
          outcome: {
            diff: diff([{ ...changedFile(), patch: { kind: "unsupported" } }]),
            mode: "net",
          },
        }),
        "file_ledger_invalid",
      ],
    ];

    for (const [input, reason] of cases) {
      expect(await buildGitHubWorkUnitSummaryInput(input)).toEqual({
        eligible: false,
        reason,
      });
    }
  });

  test("rejects an invalid projection membership as a contract error", async () => {
    await expect(
      buildGitHubWorkUnitSummaryInput(
        candidate({ membership: { members: [], unitKey: "pr-42" } })
      )
    ).rejects.toThrow("membership");
  });

  test("enforces byte and token limits without lossy fallback", async () => {
    expect(GITHUB_WORK_UNIT_SUMMARY_MAX_INPUT_TOKENS).toBe(32_000);
    expect(GITHUB_WORK_UNIT_SUMMARY_MAX_PAYLOAD_BYTES).toBe(393_216);
    expect(
      await buildGitHubWorkUnitSummaryInput(candidate(), {
        maxPayloadBytes: 100,
      })
    ).toEqual({ eligible: false, reason: "payload_byte_limit" });
    expect(
      await buildGitHubWorkUnitSummaryInput(candidate(), {
        maxInputTokens: 1,
      })
    ).toEqual({ eligible: false, reason: "payload_token_limit" });
  });
});

describe("GitHub work-unit summary output", () => {
  test("requires the exact structured shape", () => {
    expect(
      githubWorkUnitSummaryOutputSchema.safeParse({ outcome: "Done." }).success
    ).toBe(true);
    expect(
      validateGitHubWorkUnitSummaryOutput({
        explanation: "extra",
        outcome: "Done.",
      })
    ).toEqual({ ok: false, reason: "invalid_shape" });
    expect(validateGitHubWorkUnitSummaryOutput("Done.")).toEqual({
      ok: false,
      reason: "invalid_shape",
    });
  });

  test("accepts a compact factual outcome and trims transport whitespace", () => {
    expect(
      validateGitHubWorkUnitSummaryOutput({
        outcome:
          "  Added session recovery across 3 public routes. Expired requests now return to sign-in.  ",
      })
    ).toEqual({
      ok: true,
      outcome:
        "Added session recovery across 3 public routes. Expired requests now return to sign-in.",
    });
  });

  test("rejects unsafe or malformed output deterministically", () => {
    const cases = [
      [{ outcome: "" }, "empty"],
      [{ outcome: "First line.\nSecond line." }, "control_character"],
      [{ outcome: "Unsafe \u202Etext." }, "bidi_character"],
      [{ outcome: "Broken \uD800 text." }, "invalid_unicode"],
      [{ outcome: "See https://example.com/details." }, "url"],
      [{ outcome: "Added <strong>recovery</strong>." }, "html"],
      [{ outcome: "Added **recovery**." }, "markdown"],
      [{ outcome: "Applied revision abcdef1." }, "sha"],
      [{ outcome: "word ".repeat(61) }, "overlength"],
      [{ outcome: "One. Two. Three." }, "too_many_sentences"],
      [{ outcome: "One. Two. Three" }, "too_many_sentences"],
    ];

    for (const [output, reason] of cases) {
      expect(validateGitHubWorkUnitSummaryOutput(output)).toEqual({
        ok: false,
        reason,
      });
    }
  });

  test("allows descriptive source language and domain numbers", () => {
    expect(
      validateGitHubWorkUnitSummaryOutput({
        outcome: "Added OAuth 2 recovery for React 19 clients.",
      })
    ).toEqual({
      ok: true,
      outcome: "Added OAuth 2 recovery for React 19 clients.",
    });
  });
});
