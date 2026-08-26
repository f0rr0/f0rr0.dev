const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const REPOSITORY_NAME_PATTERN = /^[a-z\d._-]{1,100}$/i;

type JsonObject = Record<string, unknown>;

export interface GitHubProject {
  description: string | null;
  forks: number | null;
  language: string | null;
  name: string;
  stars: number | null;
  topics: string[];
  updatedAt: string | null;
  url: string;
}

export interface GitHubProfile {
  fetchedAt: string | null;
  login: string;
  profileUrl: string;
  projects: GitHubProject[];
  status: "available" | "unavailable";
}

const fallbackProjects = [
  {
    description:
      "Rust library for running embedded PostgreSQL inside applications and tests.",
    forks: null,
    language: "Rust",
    name: "oliphaunt",
    stars: null,
    topics: ["postgresql", "rust", "testing"],
    updatedAt: null,
  },
  {
    description:
      "Cross-platform React Native rating component built with Animated and the native driver.",
    forks: null,
    language: "JavaScript",
    name: "react-native-rating",
    stars: null,
    topics: ["react-native", "animation", "component"],
    updatedAt: null,
  },
] as const;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizedText = (value: unknown, maximumLength: number) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, maximumLength);
};

const nonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const normalizeDateTime = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeTopics = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value.flatMap((topic) => {
        const normalized = normalizedText(topic, 50)?.toLowerCase();
        return normalized !== undefined &&
          normalized !== null &&
          /^[a-z\d][a-z\d-]*$/.test(normalized)
          ? [normalized]
          : [];
      })
    ),
  ].slice(0, 5);
};

const projectFrom = (value: unknown, login: string): GitHubProject | null => {
  if (
    !isObject(value) ||
    value.private !== false ||
    value.fork !== false ||
    !isObject(value.owner)
  ) {
    return null;
  }

  const owner = normalizedText(value.owner.login, 39);
  const name = normalizedText(value.name, 100);
  const stars = nonNegativeInteger(value.stargazers_count);
  const forks = nonNegativeInteger(value.forks_count);
  if (
    owner === null ||
    owner.toLowerCase() !== login.toLowerCase() ||
    !GITHUB_LOGIN_PATTERN.test(owner) ||
    name === null ||
    !REPOSITORY_NAME_PATTERN.test(name) ||
    stars === null ||
    forks === null ||
    value.html_url !== `https://github.com/${login}/${name}`
  ) {
    return null;
  }

  return {
    description: normalizedText(value.description, 240),
    forks,
    language: normalizedText(value.language, 50),
    name,
    stars,
    topics: normalizeTopics(value.topics),
    updatedAt: normalizeDateTime(value.updated_at),
    url: `https://github.com/${login}/${name}`,
  };
};

export const parseGitHubRepositoriesResponse = (
  value: unknown,
  login: string
) => {
  if (!Array.isArray(value) || !GITHUB_LOGIN_PATTERN.test(login)) {
    return null;
  }
  return value
    .flatMap((item) => {
      const project = projectFrom(item, login);
      return project === null ? [] : [project];
    })
    .toSorted(
      (left, right) =>
        (right.stars ?? 0) - (left.stars ?? 0) ||
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
    )
    .slice(0, 100);
};

export const createUnavailableGitHubProfile = (
  login: string
): GitHubProfile => ({
  fetchedAt: null,
  login,
  profileUrl: `https://github.com/${login}`,
  projects: fallbackProjects.map((project) => ({
    ...project,
    topics: [...project.topics],
    url: `https://github.com/${login}/${project.name}`,
  })),
  status: "unavailable",
});
