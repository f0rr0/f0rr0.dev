import { readRuntimeCache, writeRuntimeCache } from "@/lib/runtime-cache";

export interface GitHubFileEvidenceHeader {
  digest: string | null;
  group: string;
  id: string;
  present: boolean;
}

export const readGitHubFileEvidence = async <T>(
  kind: "stats" | "commit" | "pull-request",
  headers: readonly GitHubFileEvidenceHeader[],
  read: (ids: readonly string[]) => Promise<ReadonlyMap<string, unknown>>,
  parse: (value: unknown) => T
): Promise<ReadonlyMap<string, T | null>> => {
  const result = new Map<string, T | null>();
  const groups = Map.groupBy(headers, (header) => header.group);
  const misses: { key: string | null; headers: GitHubFileEvidenceHeader[] }[] =
    [];
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const manifest = group
        .map(({ digest, id, present }) => [id, digest, present])
        .toSorted((left, right) =>
          String(left[0]).localeCompare(String(right[0]))
        );
      const key = group.some(
        (header) => header.present && header.digest === null
      )
        ? null
        : JSON.stringify(["github-file-evidence-v1", kind, manifest]);
      const cached = key === null ? null : await readRuntimeCache<unknown>(key);
      try {
        if (!Array.isArray(cached) || cached.length !== group.length) {
          throw new Error("Missing cached file evidence");
        }
        const values = new Map<string, T | null>();
        for (const entry of cached) {
          if (
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            typeof entry[0] !== "string"
          ) {
            throw new Error("Invalid cached file evidence");
          }
          values.set(entry[0], entry[1] === null ? null : parse(entry[1]));
        }
        for (const header of group) {
          if (
            !values.has(header.id) ||
            (values.get(header.id) !== null) !== header.present
          ) {
            throw new Error("Cached file evidence does not match its manifest");
          }
        }
        for (const [id, value] of values) {
          result.set(id, value);
        }
      } catch {
        misses.push({ key, headers: group });
      }
    })
  );
  const missingHeaders = misses.flatMap((group) => group.headers);
  const ids = missingHeaders
    .filter((header) => header.present)
    .map((header) => header.id);
  const rows = ids.length === 0 ? new Map() : await read(ids);
  for (const header of missingHeaders) {
    if (
      header.present &&
      (!rows.has(header.id) || rows.get(header.id) === null)
    ) {
      throw new Error(`Missing GitHub file evidence: ${header.id}`);
    }
    result.set(header.id, header.present ? parse(rows.get(header.id)) : null);
  }
  await Promise.all(
    misses.map(async ({ key, headers: group }) => {
      if (key !== null) {
        // Cache raw values, so the same validator runs on cache hits and DB reads.
        await writeRuntimeCache(
          key,
          group.map(({ id }) => [id, rows.get(id) ?? null]),
          7 * 86_400
        );
      }
    })
  );
  return result;
};
