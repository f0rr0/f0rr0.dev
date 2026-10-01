import { afterEach, expect, spyOn, test } from "bun:test";

import * as nextCache from "next/cache";
import * as nextServer from "next/server";

import { POST as syncTokens } from "../src/app/api/cron/codex-stats/route";
import { POST as summarizeWork } from "../src/app/api/cron/github-summary/route";
import { POST as syncWork } from "../src/app/api/cron/github-worker/route";
import * as tokenViews from "../src/lib/codex/public-stats";
import * as tokenSync from "../src/lib/codex/sync";
import * as workViews from "../src/lib/github-activity-feed";
import * as workWorker from "../src/lib/github-activity-worker";
import * as summaryWorker from "../src/lib/github-work-unit-summary-worker";
import { env } from "./helpers";

const secret = "test-cron-secret-with-at-least-32-characters";
const originalSecret = env.CRON_SECRET;

afterEach(() => {
  env.CRON_SECRET = originalSecret;
});

const request = (path: string) =>
  new Request(`https://example.com/api/cron/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });

test("cron authentication rejects missing, wrong and unconfigured secrets before doing work", async () => {
  const unexpected = new Error("An unauthenticated request reached a worker");
  const sync = spyOn(tokenSync, "syncCodexAccounts").mockRejectedValue(
    unexpected
  );
  const worker = spyOn(workWorker, "runGitHubActivityWorker").mockRejectedValue(
    unexpected
  );
  const summary = spyOn(
    summaryWorker,
    "runGitHubWorkUnitSummaryWorker"
  ).mockRejectedValue(unexpected);
  try {
    for (const [configured, authorization] of [
      [secret, undefined],
      [secret, `Bearer wrong-${secret}`],
      [secret, `bearer ${secret}`],
      [undefined, `Bearer ${secret}`],
      ["short", "Bearer short"],
    ]) {
      env.CRON_SECRET = configured;
      for (const handler of [syncTokens, syncWork, summarizeWork]) {
        const response = await handler(
          new Request("https://example.com/api/cron/test", {
            method: "POST",
            headers: authorization === undefined ? {} : { authorization },
          })
        );
        expect(response.status).toBe(401);
      }
    }
    expect(sync).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
  } finally {
    sync.mockRestore();
    worker.mockRestore();
    summary.mockRestore();
  }
});

test("Codex publication warms only after a successful sync changes data", async () => {
  env.CRON_SECRET = secret;
  const sync = spyOn(tokenSync, "syncCodexAccounts");
  const invalidate = spyOn(nextCache, "revalidatePath").mockImplementation(
    () => {}
  );
  const after = spyOn(nextServer, "after").mockImplementation(() => {});
  const warm = spyOn(tokenViews, "getPublicCodexStats").mockResolvedValue(null);
  try {
    sync.mockResolvedValue({ updated: 0 });
    expect((await syncTokens(request("codex-stats"))).status).toBe(200);
    expect(invalidate).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();

    sync.mockRejectedValue(new Error("private upstream details"));
    const failure = await syncTokens(request("codex-stats"));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ ok: false, error: "Error" });
    expect(invalidate).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();

    sync.mockResolvedValue({ updated: 1 });
    expect((await syncTokens(request("codex-stats"))).status).toBe(200);
    expect(invalidate.mock.calls).toEqual([["/"], ["/tokens"]]);
    expect(after).toHaveBeenCalledTimes(1);
    expect(warm).not.toHaveBeenCalled();
    const [[warmAfterResponse]] = after.mock.calls;
    expect(typeof warmAfterResponse).toBe("function");
    if (typeof warmAfterResponse === "function") {
      await warmAfterResponse();
    }
    expect(warm).toHaveBeenCalledTimes(1);
  } finally {
    sync.mockRestore();
    invalidate.mockRestore();
    after.mockRestore();
    warm.mockRestore();
  }
});

test("GitHub rejects invalid requests and warms only a changed public feed", async () => {
  env.CRON_SECRET = secret;
  const stage = {
    claimed: 0,
    completed: 0,
    deferred: 0,
    failed: 0,
    unavailable: 0,
  };
  const result: workWorker.GitHubActivityWorkerResult = {
    commits: stage,
    deadlineReached: false,
    observations: stage,
    projection: null,
    pullRequests: stage,
    pullRequestDiscovery: stage,
    pullRequestSignals: stage,
    refs: stage,
  };
  const worker = spyOn(workWorker, "runGitHubActivityWorker").mockResolvedValue(
    result
  );
  const invalidate = spyOn(nextCache, "revalidatePath").mockImplementation(
    () => {}
  );
  const after = spyOn(nextServer, "after").mockImplementation(() => {});
  const warm = spyOn(workViews, "getInitialGitHubActivity").mockResolvedValue(
    null
  );
  try {
    expect((await syncWork(request("github-worker?batch=bad"))).status).toBe(
      400
    );
    expect(worker).not.toHaveBeenCalled();
    worker.mockRejectedValueOnce(new Error("private upstream details"));
    const failure = await syncWork(request("github-worker"));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ ok: false, error: "Error" });
    expect(invalidate).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect((await syncWork(request("github-worker"))).status).toBe(200);
    expect(invalidate).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();

    result.projection = {
      changed: true,
      deletedUnits: 0,
      exclusionReasonCounts: {
        merged_pr_landing: 0,
        canonical_branch_unknown: 0,
        head_generation_incomplete: 0,
        no_current_owner: 0,
        pull_request_coverage_incomplete: 0,
        repository_visibility_unknown: 0,
      },
      feedRevisionChanged: false,
      insertedUnits: 0,
      orderingRevisionChanged: true,
      summaryAttemptsQueued: 0,
      summaryEvaluationsPending: 0,
      summaryEvaluationsSettled: 0,
      summaryInputsFailed: 0,
      summaryInputsSet: 0,
      updatedUnits: 1,
    };
    expect((await syncWork(request("github-worker"))).status).toBe(200);
    expect(invalidate).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();

    result.projection.feedRevisionChanged = true;
    expect((await syncWork(request("github-worker?batch=2"))).status).toBe(200);
    expect(worker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        includeProjection: true,
        commitLimit: 2,
        refLimit: 1,
      })
    );
    expect(invalidate.mock.calls).toEqual([["/"], ["/work"]]);
    expect(after).toHaveBeenCalledTimes(1);
    expect(warm).not.toHaveBeenCalled();
    const [[warmAfterResponse]] = after.mock.calls;
    expect(typeof warmAfterResponse).toBe("function");
    if (typeof warmAfterResponse === "function") {
      await warmAfterResponse();
    }
    expect(warm).toHaveBeenCalledTimes(1);
  } finally {
    worker.mockRestore();
    invalidate.mockRestore();
    after.mockRestore();
    warm.mockRestore();
  }
});
