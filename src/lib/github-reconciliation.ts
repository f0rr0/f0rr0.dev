import {
  fetchGitHub,
  GitHubResponseError,
  githubApiUrl,
  nextGitHubPage,
} from "@/lib/github-api";
import {
  commitShaFrom,
  pullRequestFromGitHub,
  repositoryFactsFrom,
  repositoryFrom,
} from "@/lib/github-commits-core";
import type {
  GitHubEvent,
  GitHubRepositoryFacts,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import {
  persistGitHubRepositoryBackfill,
  persistGitHubRepositoryRefs,
} from "@/lib/github-commits-store";
import type {
  GitHubBackfillWindow,
  GitHubRepositoryRefSnapshot,
} from "@/lib/github-commits-store";

const GITHUB_PAGE_SIZE = 100;
const GITHUB_REQUEST_CONCURRENCY = 4;
const MAXIMUM_BACKFILL_OBSERVATIONS = 5000;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compareStrings = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const mapWithConcurrency = async <Input, Output>(
  values: readonly Input[],
  mapper: (value: Input) => Promise<Output>
) => {
  const outputs: Output[] = [];
  for (
    let offset = 0;
    offset < values.length;
    offset += GITHUB_REQUEST_CONCURRENCY
  ) {
    outputs.push(
      ...(await Promise.all(
        values.slice(offset, offset + GITHUB_REQUEST_CONCURRENCY).map(mapper)
      ))
    );
  }
  return outputs;
};

const repositoryApiPath = (repository: string, suffix: string) => {
  const [owner, name, ...rest] = repository.split("/");
  if (owner === undefined || name === undefined || rest.length > 0) {
    throw new TypeError("GitHub returned an invalid repository name.");
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`;
};

const fetchJson = async (url: URL, token: string) => {
  const response = await fetchGitHub(url, { token });
  return { payload: (await response.json()) as unknown, response };
};

const fetchPaginatedArray = async (initialUrl: URL, token: string) => {
  const values: unknown[] = [];
  const visited = new Set<string>();
  let url: URL | null = initialUrl;
  while (url !== null) {
    if (visited.has(url.href)) {
      throw new TypeError("GitHub returned cyclic pagination links.");
    }
    visited.add(url.href);
    const result = await fetchJson(url, token);
    if (!Array.isArray(result.payload)) {
      throw new TypeError("GitHub returned an invalid paginated response.");
    }
    values.push(...result.payload);
    url = nextGitHubPage(result.response);
  }
  return values;
};

export const collectAccessibleGitHubRepositories = async (
  token: string,
  repositoryId: string | null = null
) => {
  if (repositoryId !== null) {
    const { payload } = await fetchJson(
      githubApiUrl(`/repositories/${encodeURIComponent(repositoryId)}`),
      token
    );
    const facts = repositoryFactsFrom(payload);
    if (facts === null) {
      throw new TypeError("GitHub returned an invalid repository response.");
    }
    return [facts];
  }
  const url = githubApiUrl("/user/repos");
  url.searchParams.set("affiliation", "owner,collaborator,organization_member");
  url.searchParams.set("direction", "asc");
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));
  url.searchParams.set("sort", "full_name");
  url.searchParams.set("visibility", "all");
  const values = await fetchPaginatedArray(url, token);
  const repositories = new Map<string, GitHubRepositoryFacts>();
  for (const value of values) {
    const repository = repositoryFactsFrom(value);
    if (repository === null) {
      throw new TypeError("GitHub returned an invalid repository response.");
    }
    const existing = repositories.get(repository.id);
    if (existing !== undefined && existing.fullName !== repository.fullName) {
      throw new TypeError("GitHub returned conflicting repository identities.");
    }
    repositories.set(repository.id, repository);
  }
  return [...repositories.values()].toSorted((left, right) =>
    compareStrings(left.fullName, right.fullName)
  );
};

interface GitHubRefObject {
  sha: string;
  type: "blob" | "commit" | "tag" | "tree";
}

const containsControlCharacter = (value: string) => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
};

const refObjectFrom = (value: unknown): GitHubRefObject | null => {
  if (!isObject(value)) {
    return null;
  }
  const { sha: rawSha, type } = value;
  const sha = commitShaFrom(rawSha);
  return sha !== null &&
    (type === "blob" || type === "commit" || type === "tag" || type === "tree")
    ? { sha, type }
    : null;
};

const refFrom = (value: unknown, kind: GitHubRepositoryRefSnapshot["kind"]) => {
  if (!isObject(value) || typeof value.ref !== "string") {
    throw new TypeError("GitHub returned an invalid Git reference.");
  }
  const prefix = kind === "head" ? "refs/heads/" : "refs/tags/";
  const refName = value.ref;
  const object = refObjectFrom(value.object);
  if (
    object === null ||
    !refName.startsWith(prefix) ||
    refName.length <= prefix.length ||
    refName.length > 1024 ||
    containsControlCharacter(refName) ||
    (kind === "head" && object.type !== "commit")
  ) {
    throw new TypeError("GitHub returned an invalid Git reference.");
  }
  return { kind, object, refName };
};

const peelTagToCommit = async (
  repository: GitHubRepositoryFacts,
  initial: GitHubRefObject,
  token: string
) => {
  const visited = new Set<string>();
  let object = initial;
  while (object.type === "tag") {
    if (visited.has(object.sha)) {
      throw new TypeError("GitHub returned a cyclic annotated tag.");
    }
    visited.add(object.sha);
    const { payload } = await fetchJson(
      githubApiUrl(
        repositoryApiPath(
          repository.fullName,
          `/git/tags/${encodeURIComponent(object.sha)}`
        )
      ),
      token
    );
    if (!isObject(payload)) {
      throw new TypeError("GitHub returned an invalid annotated tag.");
    }
    const target = refObjectFrom(payload.object);
    if (target === null) {
      throw new TypeError("GitHub returned an invalid annotated tag target.");
    }
    object = target;
  }
  return object.type === "commit" ? object.sha : null;
};

const collectMatchingRefs = async (
  repository: GitHubRepositoryFacts,
  kind: GitHubRepositoryRefSnapshot["kind"],
  token: string
) => {
  const namespace = kind === "head" ? "heads" : "tags";
  const url = githubApiUrl(
    repositoryApiPath(repository.fullName, `/git/matching-refs/${namespace}/`)
  );
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));
  let values: readonly unknown[];
  try {
    values = await fetchPaginatedArray(url, token);
  } catch (error) {
    if (error instanceof GitHubResponseError && error.status === 409) {
      return [];
    }
    throw error;
  }

  const refs: GitHubRepositoryRefSnapshot[] = [];
  for (const value of values) {
    const ref = refFrom(value, kind);
    const headSha = await peelTagToCommit(repository, ref.object, token);
    if (headSha !== null) {
      refs.push({ headSha, kind, refName: ref.refName });
    }
  }
  return refs;
};

export const collectGitHubRepositoryRefs = async (
  repository: GitHubRepositoryFacts,
  token: string
): Promise<readonly GitHubRepositoryRefSnapshot[] | null> => {
  try {
    const heads = await collectMatchingRefs(repository, "head", token);
    const tags = await collectMatchingRefs(repository, "tag", token);
    const refs = new Map<string, GitHubRepositoryRefSnapshot>();
    for (const ref of [...heads, ...tags]) {
      const existing = refs.get(ref.refName);
      if (
        existing !== undefined &&
        (existing.headSha !== ref.headSha || existing.kind !== ref.kind)
      ) {
        throw new TypeError("GitHub returned conflicting Git references.");
      }
      refs.set(ref.refName, ref);
    }
    return [...refs.values()].toSorted((left, right) =>
      compareStrings(left.refName, right.refName)
    );
  } catch (error) {
    if (error instanceof GitHubResponseError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

export const hydrateSparseGitHubPullRequestEvents = async (
  events: readonly GitHubEvent[],
  token: string
): Promise<readonly GitHubEvent[]> =>
  await mapWithConcurrency(events, async (event) => {
    const signal = event.pullRequestSignal;
    if (signal === undefined) {
      return event;
    }
    let payload: unknown;
    try {
      ({ payload } = await fetchJson(
        githubApiUrl(
          repositoryApiPath(
            signal.repository.fullName,
            `/pulls/${signal.number}`
          )
        ),
        token
      ));
    } catch (error) {
      if (error instanceof GitHubResponseError && error.status === 404) {
        return event;
      }
      throw error;
    }
    const base =
      isObject(payload) && isObject(payload.base) ? payload.base : null;
    const currentRepository = base === null ? null : repositoryFrom(base.repo);
    const pullRequest =
      currentRepository?.id === signal.repository.id
        ? pullRequestFromGitHub(payload, currentRepository, signal.action)
        : null;
    if (
      pullRequest === null ||
      pullRequest.number !== signal.number ||
      pullRequest.repository.id !== signal.repository.id
    ) {
      throw new TypeError("GitHub returned an invalid pull request response.");
    }
    return {
      id: event.id,
      issue: event.issue,
      occurredAt: event.occurredAt,
      pullRequest,
      push: event.push,
    };
  });

export interface GitHubRefReconciliationResult {
  knownCommits: number;
  pushes: number;
  refs: number;
  repositories: number;
}

export interface GitHubHistoryBackfillResult {
  duplicates: number;
  observations: number;
  refs: number;
  repositories: number;
}

export const queueAccessibleGitHubHistoryBackfill = async (input: {
  account: TrackedGitHubAccount;
  repositoryId: string | null;
  token: string;
  windows: readonly GitHubBackfillWindow[];
}): Promise<GitHubHistoryBackfillResult> => {
  const repositories = await collectAccessibleGitHubRepositories(
    input.token,
    input.repositoryId
  );
  const collected = await mapWithConcurrency(
    repositories,
    async (repository) => ({
      refs: await collectGitHubRepositoryRefs(repository, input.token),
      repository,
    })
  );
  const accessible = collected.flatMap(({ refs, repository }) =>
    refs === null ? [] : [{ refs, repository }]
  );
  let observationCount = 0;
  for (const { refs } of accessible) {
    observationCount +=
      new Set(refs.map(({ headSha }) => headSha)).size * input.windows.length;
  }
  if (observationCount > MAXIMUM_BACKFILL_OBSERVATIONS) {
    throw new RangeError(
      "The GitHub backfill would create too many durable observations."
    );
  }

  const persisted = await mapWithConcurrency(
    accessible,
    async ({ refs, repository }) =>
      await persistGitHubRepositoryBackfill({
        account: input.account,
        observedAt: new Date(),
        refs,
        repository,
        windows: input.windows,
      })
  );
  const result: GitHubHistoryBackfillResult = {
    duplicates: 0,
    observations: 0,
    refs: 0,
    repositories: 0,
  };
  for (const repository of persisted) {
    result.duplicates += repository.duplicates;
    result.observations += repository.observations;
    result.refs += repository.refs;
    result.repositories += 1;
  }
  return result;
};

export const reconcileAccessibleGitHubRepositoryRefs = async (
  account: TrackedGitHubAccount,
  token: string
): Promise<GitHubRefReconciliationResult> => {
  const repositories = await collectAccessibleGitHubRepositories(token);
  const result: GitHubRefReconciliationResult = {
    knownCommits: 0,
    pushes: 0,
    refs: 0,
    repositories: 0,
  };

  const reconciled = await mapWithConcurrency(
    repositories,
    async (repository) => {
      const observedAt = new Date();
      const refs = await collectGitHubRepositoryRefs(repository, token);
      return refs === null
        ? null
        : await persistGitHubRepositoryRefs({
            account,
            observedAt,
            refs,
            repository,
          });
    }
  );
  for (const repository of reconciled) {
    if (repository === null) {
      continue;
    }
    result.knownCommits += repository.knownCommits;
    result.pushes += repository.pushes;
    result.refs += repository.refs;
    result.repositories += 1;
  }
  return result;
};
