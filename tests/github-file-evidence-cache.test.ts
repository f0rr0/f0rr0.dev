import { expect, mock, test } from "bun:test";
import { rejects } from "node:assert/strict";

import { readGitHubFileEvidence } from "../src/lib/github-file-evidence-cache";
import type { GitHubFileEvidenceHeader } from "../src/lib/github-file-evidence-cache";
import { installRuntimeCache } from "./helpers";

const header = (id: string, group = id): GitHubFileEvidenceHeader => ({
  id,
  group,
  digest: "a".repeat(64),
  present: true,
});
const parse = (value: unknown) => {
  if (!Array.isArray(value)) {
    throw new TypeError("Invalid evidence");
  }
  return value;
};

test("unchanged evidence is reused; additions, replacements and removed members invalidate only their group", async () => {
  const cache = installRuntimeCache();
  const source = new Map<string, unknown[]>([
    ["1/a", [["a.ts", 1, 0]]],
    ["1/b", []],
    ["2/a", [["fork.ts", 5, 1]]],
  ]);
  const read = mock(
    async (ids: readonly string[]) =>
      new Map(ids.map((id) => [id, source.get(id)]))
  );
  const headers = [
    header("1/a", "1:a"),
    header("1/b", "1:b"),
    header("2/a", "2:a"),
  ];
  try {
    const initial = await readGitHubFileEvidence("stats", headers, read, parse);
    expect(initial).toEqual(source);
    expect(
      await readGitHubFileEvidence("stats", headers.toReversed(), read, parse)
    ).toEqual(initial);
    expect(read).toHaveBeenCalledTimes(1);
    source.set("1/a2", [["new.ts", 2, 0]]);
    const added = [...headers, header("1/a2", "1:a")];
    expect(await readGitHubFileEvidence("stats", added, read, parse)).toEqual(
      source
    );
    expect(read.mock.calls[1]?.[0].toSorted()).toEqual(["1/a", "1/a2"]);
    source.set("1/b", [["updated.ts", 8, 0]]);
    const replaced = added.map((item) =>
      item.id === "1/b" ? { ...item, digest: "b".repeat(64) } : item
    );
    expect(
      (await readGitHubFileEvidence("stats", replaced, read, parse)).get("1/b")
    ).toEqual(source.get("1/b"));
    expect(read.mock.calls[2]).toEqual([["1/b"]]);
    const removed = replaced.filter((item) => item.id !== "1/a");
    const afterRemoval = await readGitHubFileEvidence(
      "stats",
      removed,
      read,
      parse
    );
    expect(afterRemoval.has("1/a")).toBe(false);
    expect(read.mock.calls[3]).toEqual([["1/a2"]]);
    expect(afterRemoval.get("2/a")).toEqual([["fork.ts", 5, 1]]);
  } finally {
    cache.restore();
  }
});

test("pruning and absent evidence cannot reuse old patches; empty arrays remain valid", async () => {
  const cache = installRuntimeCache();
  let facts: unknown[] = [{ filename: "a.ts", patch: "+original" }];
  const read = mock(async () => new Map([["1/a", facts]]));
  const full = {
    ...header("1/a"),
    digest: JSON.stringify(["a".repeat(64), null]),
  };
  try {
    expect(
      (await readGitHubFileEvidence("commit", [full], read, parse)).get("1/a")
    ).toEqual(facts);
    facts = [{ filename: "a.ts", patch: null }];
    const pruned = {
      ...full,
      digest: JSON.stringify(["a".repeat(64), "2026-10-02T00:00:00Z"]),
    };
    expect(
      (await readGitHubFileEvidence("commit", [pruned], read, parse)).get("1/a")
    ).toEqual(facts);
    expect(read).toHaveBeenCalledTimes(2);
    expect(
      (
        await readGitHubFileEvidence(
          "commit",
          [{ ...pruned, present: false }],
          read,
          parse
        )
      ).get("1/a")
    ).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
    facts = [];
    const restored = { ...full, digest: "c".repeat(64) };
    expect(
      (await readGitHubFileEvidence("commit", [restored], read, parse)).get(
        "1/a"
      )
    ).toEqual([]);
    expect(read).toHaveBeenCalledTimes(3);
  } finally {
    cache.restore();
  }
});

test("unknown digests and malformed cache entries fall through, while missing DB evidence fails closed", async () => {
  const cache = installRuntimeCache();
  const read = mock(
    async () => new Map<string, unknown[]>([["PR/1", ["valid"]]])
  );
  try {
    const unknown = { ...header("PR/1"), digest: null };
    for (let index = 0; index < 2; index++) {
      expect(
        (
          await readGitHubFileEvidence("pull-request", [unknown], read, parse)
        ).get("PR/1")
      ).toEqual(["valid"]);
    }
    expect(cache.set).not.toHaveBeenCalled();
    await readGitHubFileEvidence("pull-request", [header("PR/1")], read, parse);
    for (const key of cache.values.keys()) {
      cache.values.set(key, "broken gzip");
    }
    expect(
      (
        await readGitHubFileEvidence(
          "pull-request",
          [header("PR/1")],
          read,
          parse
        )
      ).get("PR/1")
    ).toEqual(["valid"]);
    expect(read).toHaveBeenCalledTimes(4);
    cache.values.clear();
    read.mockResolvedValue(new Map());
    await rejects(
      readGitHubFileEvidence("pull-request", [header("PR/1")], read, parse),
      /Missing GitHub file evidence/u
    );
    expect(cache.values.size).toBe(0);
  } finally {
    cache.restore();
  }
});
