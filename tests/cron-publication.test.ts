import { afterEach, expect, spyOn, test } from "bun:test";

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

test("Codex checks publication after every successful sync, including zero updated accounts", async () => {
  env.CRON_SECRET = secret;
  const sync = spyOn(tokenSync, "syncCodexAccounts");
  const publish = spyOn(tokenViews, "publishCodexStats").mockResolvedValue();
  try {
    sync.mockResolvedValue({ updated: 0 });
    expect((await syncTokens(request("codex-stats"))).status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(1);

    sync.mockRejectedValue(new Error("private upstream details"));
    const failure = await syncTokens(request("codex-stats"));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ ok: false, error: "Error" });
    expect(publish).toHaveBeenCalledTimes(1);

    sync.mockResolvedValue({ updated: 1 });
    expect((await syncTokens(request("codex-stats"))).status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(2);
  } finally {
    sync.mockRestore();
    publish.mockRestore();
  }
});

test("GitHub workers check publication even without a projection or a new summary claim", async () => {
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
  const summary = spyOn(
    summaryWorker,
    "runGitHubWorkUnitSummaryWorker"
  ).mockResolvedValue(stage);
  const publish = spyOn(workViews, "publishGitHubActivity").mockResolvedValue();
  try {
    expect((await syncWork(request("github-worker?batch=bad"))).status).toBe(
      400
    );
    expect(worker).not.toHaveBeenCalled();
    worker.mockRejectedValueOnce(new Error("private upstream details"));
    const failure = await syncWork(request("github-worker"));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ ok: false, error: "Error" });
    expect(publish).not.toHaveBeenCalled();
    expect((await syncWork(request("github-worker"))).status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(1);
    expect((await syncWork(request("github-worker?batch=2"))).status).toBe(200);
    expect(worker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        includeProjection: true,
        commitLimit: 2,
        refLimit: 1,
      })
    );
    expect(publish).toHaveBeenCalledTimes(2);
    expect((await summarizeWork(request("github-summary"))).status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(3);
  } finally {
    worker.mockRestore();
    summary.mockRestore();
    publish.mockRestore();
  }
});
