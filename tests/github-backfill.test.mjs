import { describe, expect, test } from "bun:test";

import {
  githubBackfillRequestFrom,
  githubBackfillRequestSeriesFrom,
  splitGitHubBackfillRequest,
} from "../src/lib/github-backfill-core.ts";

const now = new Date("2026-08-29T15:00:00.000Z");

describe("GitHub history backfill requests", () => {
  test("normalizes inclusive UTC dates into bounded 31-day windows", () => {
    const request = githubBackfillRequestFrom(
      {
        account: "all",
        endDate: "2026-08-29",
        repositoryId: "123456789",
        startDate: "2026-07-01",
      },
      now
    );

    expect(request).toMatchObject({
      accounts: ["f0rr0", "yuppiestechdev"],
      endDate: "2026-08-29",
      repositoryId: "123456789",
      startDate: "2026-07-01",
    });
    expect(request?.windows).toEqual([
      {
        sinceAt: new Date("2026-07-01T00:00:00.000Z"),
        untilAt: new Date("2026-07-31T23:59:59.999Z"),
      },
      {
        sinceAt: new Date("2026-08-01T00:00:00.000Z"),
        untilAt: new Date("2026-08-29T23:59:59.999Z"),
      },
    ]);
  });

  test("accepts one account and an unfiltered repository set", () => {
    expect(
      githubBackfillRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-08-29",
          repositoryId: "",
          startDate: "2026-08-29",
        },
        now
      )
    ).toMatchObject({ accounts: ["f0rr0"], repositoryId: null });
  });

  test("splits an arbitrary inclusive range into bounded requests", () => {
    const requests = githubBackfillRequestSeriesFrom(
      {
        account: "f0rr0",
        endDate: "2025-01-01",
        repositoryId: "",
        startDate: "2024-01-01",
      },
      now
    );

    expect(
      requests?.map(({ endDate, startDate }) => ({ endDate, startDate }))
    ).toEqual([
      { endDate: "2024-12-31", startDate: "2024-01-01" },
      { endDate: "2025-01-01", startDate: "2025-01-01" },
    ]);
  });

  test("bisects a bounded request without gaps or overlap", () => {
    const request = githubBackfillRequestFrom(
      {
        account: "f0rr0",
        endDate: "2026-08-04",
        repositoryId: "123456789",
        startDate: "2026-08-01",
      },
      now
    );

    expect(request).not.toBeNull();
    expect(
      request === null
        ? null
        : splitGitHubBackfillRequest(request)?.map(
            ({ endDate, startDate }) => ({ endDate, startDate })
          )
    ).toEqual([
      { endDate: "2026-08-02", startDate: "2026-08-01" },
      { endDate: "2026-08-04", startDate: "2026-08-03" },
    ]);
  });

  test("rejects malformed, future, reversed, and oversized ranges", () => {
    const requests = [
      { endDate: "2026-08-29", startDate: "2026-08-30" },
      { endDate: "2026-08-30", startDate: "2026-08-29" },
      { endDate: "2026-08-29", startDate: "2025-08-28" },
      { endDate: "2026-02-30", startDate: "2026-02-01" },
    ];
    for (const request of requests) {
      expect(
        githubBackfillRequestFrom(
          {
            account: "f0rr0",
            repositoryId: "",
            ...request,
          },
          now
        )
      ).toBeNull();
    }
  });

  test("rejects unknown accounts and unsafe repository selectors", () => {
    expect(
      githubBackfillRequestFrom(
        {
          account: "octocat",
          endDate: "2026-08-29",
          repositoryId: "123",
          startDate: "2026-08-01",
        },
        now
      )
    ).toBeNull();
    expect(
      githubBackfillRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-08-29",
          repositoryId: "private/repository",
          startDate: "2026-08-01",
        },
        now
      )
    ).toBeNull();
  });
});
