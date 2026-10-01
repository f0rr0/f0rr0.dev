import { expect, spyOn, test } from "bun:test";

import { getInitialGitHubActivity } from "../src/lib/github-activity-feed";
import * as store from "../src/lib/github-activity-store";
import type { PublicGitHubActivityPage } from "../src/lib/github-activity-types";
import { readRuntimeCache } from "../src/lib/runtime-cache";
import { installRuntimeCache } from "./helpers";

const page: PublicGitHubActivityPage = {
  days: [
    {
      day: "2026-10-01",
      repositories: [
        {
          repository: {
            key: "1",
            label: "example/repo",
            url: "https://github.com/example/repo",
            avatarUrl: null,
          },
          items: [
            {
              id: "issue:1",
              kind: "issue",
              activityAt: "2026-10-01T12:00:00Z",
              title: "Work",
              destination: {
                label: "Issue",
                url: "https://github.com/example/repo/issues/1",
              },
            },
          ],
        },
      ],
    },
  ],
  head: {
    feedRevision: "10",
    lastPublishedAt: null,
    revision: "9007199254740992",
    summarizing: false,
  },
  nextCursor: null,
  orderingRevision: "4",
};

const maskedDays = page.days.map((day) => ({
  ...day,
  repositories: day.repositories.map((group) => ({
    repository: { ...group.repository, label: "Private", url: null },
    items: group.items.map((item) => ({ ...item, destination: null })),
  })),
}));

test("cron and page readers share content while status, ordering and visibility revisions stay fresh", async () => {
  const cache = installRuntimeCache();
  const head = spyOn(store, "readPublicGitHubActivityHead").mockResolvedValue({
    etag: "head",
    head: page.head,
    orderingRevision: page.orderingRevision,
  });
  const body = spyOn(store, "readPublicGitHubActivityPage").mockResolvedValue(
    page
  );
  try {
    expect(await getInitialGitHubActivity()).toEqual(page);
    expect(await getInitialGitHubActivity()).toEqual(page);
    expect(body).toHaveBeenCalledTimes(1);
    const status = {
      ...page.head,
      revision: "9007199254740993",
      summarizing: true,
    };
    head.mockResolvedValue({
      etag: "status",
      head: status,
      orderingRevision: "4",
    });
    expect(await getInitialGitHubActivity()).toEqual({ ...page, head: status });
    expect(body).toHaveBeenCalledTimes(1);
    const masked = {
      ...page,
      days: maskedDays,
      head: { ...status, feedRevision: "11", revision: "9007199254740994" },
      orderingRevision: "5",
    };
    // Ordering changes independently, and a visibility publication changes the feed.
    for (const next of [
      { ...page, head: status, orderingRevision: "5" },
      masked,
    ]) {
      head.mockResolvedValue({
        etag: "next",
        head: next.head,
        orderingRevision: next.orderingRevision,
      });
      body.mockResolvedValue(next);
      expect(await getInitialGitHubActivity()).toEqual(next);
      expect(await getInitialGitHubActivity()).toEqual(next);
    }
    expect(body).toHaveBeenCalledTimes(3);
    head.mockRejectedValue(new Error("Database offline"));
    expect(await getInitialGitHubActivity()).toEqual(masked);
    expect(body).toHaveBeenCalledTimes(3);
  } finally {
    head.mockRestore();
    body.mockRestore();
    cache.restore();
  }
});

test("publication races cache the body's actual revision and never replace its newer head", async () => {
  const cache = installRuntimeCache();
  const head = spyOn(store, "readPublicGitHubActivityHead").mockResolvedValue({
    etag: "old",
    head: page.head,
    orderingRevision: "4",
  });
  const newer = {
    ...page,
    head: { ...page.head, feedRevision: "11", revision: "9007199254740993" },
    orderingRevision: "5",
  };
  const body = spyOn(store, "readPublicGitHubActivityPage").mockResolvedValue(
    newer
  );
  try {
    expect(await getInitialGitHubActivity()).toEqual(newer);
    expect(
      await readRuntimeCache<PublicGitHubActivityPage>(
        JSON.stringify(["public-github-activity-v3", "10", "4"])
      )
    ).toBeNull();
    expect(
      await readRuntimeCache<PublicGitHubActivityPage>(
        JSON.stringify(["public-github-activity-v3", "11", "5"])
      )
    ).toEqual(newer);
    head.mockResolvedValue({
      etag: "new",
      head: newer.head,
      orderingRevision: "5",
    });
    expect(await getInitialGitHubActivity()).toEqual(newer);
    expect(body).toHaveBeenCalledTimes(1);
  } finally {
    head.mockRestore();
    body.mockRestore();
    cache.restore();
  }
});

for (const warm of [false, true]) {
  test(`a slow head uses ${warm ? "a warm outage snapshot" : "one shared cold body read"}`, async () => {
    const cache = installRuntimeCache();
    const head = spyOn(store, "readPublicGitHubActivityHead").mockResolvedValue(
      { etag: "head", head: page.head, orderingRevision: "4" }
    );
    const body = spyOn(store, "readPublicGitHubActivityPage").mockResolvedValue(
      page
    );
    const release =
      Promise.withResolvers<
        Awaited<ReturnType<typeof store.readPublicGitHubActivityHead>>
      >();
    let pending: Promise<PublicGitHubActivityPage | null> | undefined;
    try {
      if (warm) {
        await getInitialGitHubActivity();
      }
      head.mockReturnValue(release.promise);
      pending = getInitialGitHubActivity();
      await Bun.sleep(1100);
      if (warm) {
        expect(await pending).toEqual(page);
        expect(body).toHaveBeenCalledTimes(1);
      } else {
        expect(body).not.toHaveBeenCalled();
      }
      release.resolve({ etag: "head", head: page.head, orderingRevision: "4" });
      expect(await pending).toEqual(page);
      expect(body).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve({ etag: "head", head: page.head, orderingRevision: "4" });
      await pending;
      head.mockRestore();
      body.mockRestore();
      cache.restore();
    }
  });
}

test("cold metadata failure can recover through one page read; total failure returns null", async () => {
  const cache = installRuntimeCache();
  const head = spyOn(store, "readPublicGitHubActivityHead").mockRejectedValue(
    new Error("Head missing")
  );
  const body = spyOn(store, "readPublicGitHubActivityPage").mockResolvedValue(
    page
  );
  try {
    expect(await getInitialGitHubActivity()).toEqual(page);
    cache.values.clear();
    body.mockRejectedValue(new Error("Page missing"));
    expect(await getInitialGitHubActivity()).toBeNull();
    expect(body).toHaveBeenCalledTimes(2);
  } finally {
    head.mockRestore();
    body.mockRestore();
    cache.restore();
  }
});

test("fallback and versioned cache checks overlap instead of delaying navigation", async () => {
  const cache = installRuntimeCache();
  const head = spyOn(store, "readPublicGitHubActivityHead").mockResolvedValue({
    etag: "head",
    head: page.head,
    orderingRevision: "4",
  });
  const body = spyOn(store, "readPublicGitHubActivityPage").mockResolvedValue(
    page
  );
  const both = Promise.withResolvers<string>();
  const release = Promise.withResolvers<null>();
  let pending: ReturnType<typeof getInitialGitHubActivity> | undefined;
  try {
    await getInitialGitHubActivity();
    let started = 0;
    cache.get.mockImplementation(async (key) => {
      started++;
      if (started === 2) {
        both.resolve("overlapping");
      }
      await release.promise;
      return cache.values.get(key) ?? null;
    });
    pending = getInitialGitHubActivity();
    expect(
      await Promise.race([both.promise, Bun.sleep(200).then(() => "blocked")])
    ).toBe("overlapping");
    release.resolve(null);
    expect(await pending).toEqual(page);
    expect(body).toHaveBeenCalledTimes(1);
  } finally {
    release.resolve(null);
    await pending;
    head.mockRestore();
    body.mockRestore();
    cache.restore();
  }
});

test("cache outages do not hide a healthy database page", async () => {
  const cache = installRuntimeCache();
  const head = spyOn(store, "readPublicGitHubActivityHead").mockResolvedValue({
    etag: "head",
    head: page.head,
    orderingRevision: "4",
  });
  const body = spyOn(store, "readPublicGitHubActivityPage").mockResolvedValue(
    page
  );
  try {
    cache.get.mockRejectedValue(new Error("Cache offline"));
    cache.set.mockRejectedValue(new Error("Cache offline"));
    expect(await getInitialGitHubActivity()).toEqual(page);
    expect(body).toHaveBeenCalledTimes(1);
  } finally {
    head.mockRestore();
    body.mockRestore();
    cache.restore();
  }
});

test("slow optional cache writes cannot replace a freshly masked page with its old public fallback", async () => {
  const cache = installRuntimeCache();
  const head = spyOn(store, "readPublicGitHubActivityHead").mockResolvedValue({
    etag: "head",
    head: page.head,
    orderingRevision: page.orderingRevision,
  });
  const body = spyOn(store, "readPublicGitHubActivityPage").mockResolvedValue(
    page
  );
  const release = Promise.withResolvers<null>();
  try {
    await getInitialGitHubActivity();
    const masked = {
      ...page,
      days: maskedDays,
      head: { ...page.head, feedRevision: "11", revision: "9007199254740993" },
    };
    head.mockImplementation(async () => {
      await Bun.sleep(700);
      return {
        etag: "private",
        head: masked.head,
        orderingRevision: masked.orderingRevision,
      };
    });
    body.mockResolvedValue(masked);
    cache.set.mockImplementation(async (key, value) => {
      await release.promise;
      cache.values.set(key, value);
    });
    expect(await getInitialGitHubActivity()).toEqual(masked);
    expect(body).toHaveBeenCalledTimes(2);
  } finally {
    release.resolve(null);
    await Bun.sleep(20);
    head.mockRestore();
    body.mockRestore();
    cache.restore();
  }
});
