import {
  fetchGitHub,
  GitHubResponseError,
  githubApiUrl,
  nextGitHubPage,
} from "@/lib/github-api";
import { commitShaFrom, repositoryFactsFrom } from "@/lib/github-commits-core";
import type { GitHubRepositoryFacts } from "@/lib/github-commits-core";
import type { GitHubRepositoryRefSnapshot } from "@/lib/github-commits-store";

const GITHUB_PAGE_SIZE = 100;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compareStrings = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const repositoryApiPath = (repository: string, suffix: string) => {
  const [owner, name, ...rest] = repository.split("/");
  if (owner === undefined || name === undefined || rest.length > 0) {
    throw new TypeError("GitHub returned an invalid repository name.");
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`;
};

const fetchJson = async (
  url: URL,
  token: string,
  options: { deadlineAt?: number } = {}
) => {
  const response = await fetchGitHub(url, {
    deadlineAt: options.deadlineAt,
    token,
  });
  return { payload: (await response.json()) as unknown, response };
};

const fetchPaginatedArray = async (
  initialUrl: URL,
  token: string,
  options: { deadlineAt?: number } = {}
) => {
  const values: unknown[] = [];
  const visited = new Set<string>();
  let url: URL | null = initialUrl;
  while (url !== null) {
    if (visited.has(url.href)) {
      throw new TypeError("GitHub returned cyclic pagination links.");
    }
    visited.add(url.href);
    const result = await fetchJson(url, token, options);
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
  repositoryId: string | null = null,
  options: { deadlineAt?: number; pushedSinceAt?: Date } = {}
) => {
  if (
    options.pushedSinceAt !== undefined &&
    Number.isNaN(options.pushedSinceAt.getTime())
  ) {
    throw new RangeError("The GitHub repository activity cutoff is invalid.");
  }
  if (repositoryId !== null) {
    const { payload } = await fetchJson(
      githubApiUrl(`/repositories/${encodeURIComponent(repositoryId)}`),
      token,
      options
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
  const values = await fetchPaginatedArray(url, token, options);
  const repositories = new Map<string, GitHubRepositoryFacts>();
  for (const value of values) {
    if (options.pushedSinceAt !== undefined) {
      const pushedAt = isObject(value) ? value.pushed_at : undefined;
      if (pushedAt === null) {
        continue;
      }
      const pushedDate =
        typeof pushedAt === "string"
          ? new Date(pushedAt)
          : new Date(Number.NaN);
      if (Number.isNaN(pushedDate.getTime())) {
        throw new TypeError("GitHub returned an invalid repository push date.");
      }
      if (pushedDate < options.pushedSinceAt) {
        continue;
      }
    }
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

const containsControlCharacter = (value: string) => {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
};

const refFromListValue = (
  value: unknown,
  kind: GitHubRepositoryRefSnapshot["kind"]
) => {
  const commit =
    isObject(value) && isObject(value.commit) ? value.commit : null;
  const headSha = commitShaFrom(commit?.sha);
  const name =
    isObject(value) && typeof value.name === "string" ? value.name : null;
  const prefix = kind === "head" ? "refs/heads/" : "refs/tags/";
  if (
    headSha === null ||
    name === null ||
    name.length === 0 ||
    name.length > 1000 ||
    containsControlCharacter(name)
  ) {
    throw new TypeError("GitHub returned an invalid Git reference.");
  }
  return { headSha, kind, refName: `${prefix}${name}` };
};

const nextRepositoryRefPage = (response: Response, currentPage: number) => {
  const next = nextGitHubPage(response);
  if (next === null) {
    return null;
  }
  const page = next.searchParams.get("page");
  const perPage = next.searchParams.get("per_page");
  if (
    page !== String(currentPage + 1) ||
    perPage !== String(GITHUB_PAGE_SIZE)
  ) {
    throw new TypeError("GitHub returned invalid reference pagination.");
  }
  return currentPage + 1;
};

export interface GitHubRepositoryRefPage {
  nextPage: number | null;
  refs: readonly GitHubRepositoryRefSnapshot[];
}

export const collectGitHubRepositoryRefPage = async (
  repository: GitHubRepositoryFacts,
  kind: GitHubRepositoryRefSnapshot["kind"],
  token: string,
  input: {
    deadlineAt?: number;
    page: number;
  }
): Promise<GitHubRepositoryRefPage | null> => {
  if (!Number.isSafeInteger(input.page) || input.page < 1) {
    throw new RangeError("The GitHub reference page is invalid.");
  }
  const endpoint = kind === "head" ? "branches" : "tags";
  const url = githubApiUrl(
    repositoryApiPath(repository.fullName, `/${endpoint}`)
  );
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));
  url.searchParams.set("page", String(input.page));

  let response: Response;
  try {
    response = await fetchGitHub(url, {
      deadlineAt: input.deadlineAt,
      token,
    });
  } catch (error) {
    if (error instanceof GitHubResponseError && error.status === 409) {
      return { nextPage: null, refs: [] };
    }
    if (error instanceof GitHubResponseError && error.status === 404) {
      return null;
    }
    throw error;
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new TypeError("GitHub returned an invalid reference page.");
  }
  const refs = new Map<string, GitHubRepositoryRefSnapshot>();
  for (const value of payload) {
    const ref = refFromListValue(value, kind);
    const existing = refs.get(ref.refName);
    if (existing !== undefined && existing.headSha !== ref.headSha) {
      throw new TypeError("GitHub returned conflicting Git references.");
    }
    refs.set(ref.refName, ref);
  }
  return {
    nextPage: nextRepositoryRefPage(response, input.page),
    refs: [...refs.values()].toSorted((left, right) =>
      compareStrings(left.refName, right.refName)
    ),
  };
};

export const collectGitHubRepositoryRefs = async (
  repository: GitHubRepositoryFacts,
  token: string,
  options: { deadlineAt?: number } = {}
): Promise<readonly GitHubRepositoryRefSnapshot[] | null> => {
  const refs = new Map<string, GitHubRepositoryRefSnapshot>();
  for (const kind of ["head", "tag"] as const) {
    let page = 1;
    while (true) {
      const collected = await collectGitHubRepositoryRefPage(
        repository,
        kind,
        token,
        { deadlineAt: options.deadlineAt, page }
      );
      if (collected === null) {
        return null;
      }
      for (const ref of collected.refs) {
        const existing = refs.get(ref.refName);
        if (
          existing !== undefined &&
          (existing.headSha !== ref.headSha || existing.kind !== ref.kind)
        ) {
          throw new TypeError("GitHub returned conflicting Git references.");
        }
        refs.set(ref.refName, ref);
      }
      if (collected.nextPage === null) {
        break;
      }
      page = collected.nextPage;
    }
  }
  return [...refs.values()].toSorted((left, right) =>
    compareStrings(left.refName, right.refName)
  );
};
