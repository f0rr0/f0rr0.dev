const DAY_IN_MILLISECONDS = 86_400_000;
const CONTRIBUTION_WINDOW_DAYS = 365;
const MAX_PROJECTS = 100;
const MAX_ACTIVITY_WINDOW_DAYS = 400;
const MAX_CONTRIBUTION_HTML_LENGTH = 2_000_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const REPOSITORY_NAME_PATTERN = /^[a-z\d._-]{1,100}$/i;
const LANGUAGE_COLOR_PATTERN = /^#[\da-f]{6}$/i;

type JsonObject = Record<string, unknown>;

export type GitHubActivityLevel = 0 | 1 | 2 | 3 | 4;
export type GitHubDataStatus = "available" | "unavailable";

export interface GitHubContributionWindow {
  from: string;
  to: string;
}

export interface GitHubActivityWeek {
  contributionCount: number;
  level: GitHubActivityLevel;
  weekStart: string;
}

export interface GitHubContributionDay {
  contributionCount: number;
  day: string;
}

export interface AvailableGitHubActivity {
  activeDays: number;
  from: string;
  restrictedContributions: number | null;
  status: "available";
  to: string;
  totalContributions: number;
  weeks: GitHubActivityWeek[];
}

export interface UnavailableGitHubActivity {
  activeDays: null;
  from: string;
  restrictedContributions: null;
  status: "unavailable";
  to: string;
  totalContributions: null;
  weeks: [];
}

export type GitHubActivity =
  | AvailableGitHubActivity
  | UnavailableGitHubActivity;

export interface GitHubProject {
  description: string | null;
  forks: number | null;
  language: string | null;
  languageColor: string | null;
  name: string;
  stars: number | null;
  topics: string[];
  updatedAt: string | null;
  url: string;
}

export interface GitHubProfile {
  activity: GitHubActivity;
  fetchedAt: string | null;
  login: string;
  profileUrl: string;
  projects: GitHubProject[];
  status: GitHubDataStatus;
}

export interface ParseGitHubProfileOptions {
  fetchedAt: string;
  login: string;
  window: GitHubContributionWindow;
}

export interface GitHubFallbackOptions {
  login: string;
  window: GitHubContributionWindow;
}

const curatedProjectFallback = [
  {
    description:
      "Rust library for running embedded PostgreSQL inside applications and tests.",
    forks: null,
    language: "Rust",
    languageColor: "#dea584",
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
    languageColor: "#f1e05a",
    name: "react-native-rating",
    stars: null,
    topics: ["react-native", "animation", "component"],
    updatedAt: null,
  },
] as const;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asNonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const normalizeDate = (value: unknown) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : value;
};

const normalizeDateTime = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const dateOnly = (value: string) =>
  normalizeDateTime(value)?.slice(0, 10) ?? null;

const normalizeOptionalText = (value: unknown, maximumLength: number) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replaceAll(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, maximumLength);
};

const normalizeLogin = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return GITHUB_LOGIN_PATTERN.test(normalized) ? normalized : null;
};

const normalizeRepositoryName = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return REPOSITORY_NAME_PATTERN.test(normalized) &&
    normalized !== "." &&
    normalized !== ".."
    ? normalized
    : null;
};

const isExpectedRepositoryUrl = (
  value: unknown,
  login: string,
  name: string
) => {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);

    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.search === "" &&
      url.hash === "" &&
      segments.length === 2 &&
      segments[0]?.toLowerCase() === login.toLowerCase() &&
      segments[1]?.toLowerCase() === name.toLowerCase()
    );
  } catch {
    return false;
  }
};

const normalizeTopics = (value: unknown) => {
  if (!isObject(value) || !Array.isArray(value.nodes)) {
    return [];
  }

  const topics = new Set<string>();

  for (const node of value.nodes) {
    if (!isObject(node) || !isObject(node.topic)) {
      continue;
    }

    const topic = normalizeOptionalText(node.topic.name, 50)?.toLowerCase();
    if (
      topic !== undefined &&
      topic !== null &&
      /^[a-z\d][a-z\d-]*$/.test(topic)
    ) {
      topics.add(topic);
    }

    if (topics.size === 5) {
      break;
    }
  }

  return [...topics];
};

const normalizeTopicNames = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const topics = new Set<string>();

  for (const rawTopic of value) {
    const topic = normalizeOptionalText(rawTopic, 50)?.toLowerCase();
    if (
      topic !== undefined &&
      topic !== null &&
      /^[a-z\d][a-z\d-]*$/.test(topic)
    ) {
      topics.add(topic);
    }

    if (topics.size === 5) {
      break;
    }
  }

  return [...topics];
};

const normalizeLanguage = (value: unknown) => {
  if (!isObject(value)) {
    return { color: null, name: null };
  }

  const name = normalizeOptionalText(value.name, 50);
  const color =
    typeof value.color === "string" && LANGUAGE_COLOR_PATTERN.test(value.color)
      ? value.color.toLowerCase()
      : null;

  return { color, name };
};

const normalizeProject = (
  value: unknown,
  expectedLogin: string
): GitHubProject | null => {
  if (
    !isObject(value) ||
    value.isPrivate !== false ||
    value.isFork !== false ||
    !isObject(value.owner)
  ) {
    return null;
  }

  const ownerLogin = normalizeLogin(value.owner.login);
  const name = normalizeRepositoryName(value.name);
  const stars = asNonNegativeInteger(value.stargazerCount);
  const forks = asNonNegativeInteger(value.forkCount);

  if (
    ownerLogin === null ||
    ownerLogin.toLowerCase() !== expectedLogin.toLowerCase() ||
    name === null ||
    stars === null ||
    forks === null ||
    !isExpectedRepositoryUrl(value.url, expectedLogin, name)
  ) {
    return null;
  }

  const language = normalizeLanguage(value.primaryLanguage);

  return {
    description: normalizeOptionalText(value.description, 240),
    forks,
    language: language.name,
    languageColor: language.color,
    name,
    stars,
    topics: normalizeTopics(value.repositoryTopics),
    updatedAt: normalizeDateTime(value.updatedAt),
    url: `https://github.com/${expectedLogin}/${name}`,
  };
};

const normalizeRestProject = (
  value: unknown,
  expectedLogin: string
): GitHubProject | null => {
  if (
    !isObject(value) ||
    value.private !== false ||
    value.fork !== false ||
    !isObject(value.owner)
  ) {
    return null;
  }

  const ownerLogin = normalizeLogin(value.owner.login);
  const name = normalizeRepositoryName(value.name);
  const stars = asNonNegativeInteger(value.stargazers_count);
  const forks = asNonNegativeInteger(value.forks_count);

  if (
    ownerLogin === null ||
    ownerLogin.toLowerCase() !== expectedLogin.toLowerCase() ||
    name === null ||
    stars === null ||
    forks === null ||
    !isExpectedRepositoryUrl(value.html_url, expectedLogin, name)
  ) {
    return null;
  }

  return {
    description: normalizeOptionalText(value.description, 240),
    forks,
    language: normalizeOptionalText(value.language, 50),
    languageColor: null,
    name,
    stars,
    topics: normalizeTopicNames(value.topics),
    updatedAt: normalizeDateTime(value.updated_at),
    url: `https://github.com/${expectedLogin}/${name}`,
  };
};

const sortAndLimitProjects = (projects: GitHubProject[]) =>
  projects
    .toSorted(
      (left, right) =>
        (right.stars ?? 0) - (left.stars ?? 0) ||
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
    )
    .slice(0, MAX_PROJECTS);

const activityLevel = (
  contributionCount: number,
  maximumContributionCount: number
): GitHubActivityLevel => {
  if (contributionCount === 0 || maximumContributionCount === 0) {
    return 0;
  }

  return Math.min(
    4,
    Math.max(1, Math.ceil((contributionCount / maximumContributionCount) * 4))
  ) as GitHubActivityLevel;
};

const buildActivityWeeks = (weeklyCounts: Map<string, number>) => {
  const maximumContributionCount = Math.max(0, ...weeklyCounts.values());

  return [...weeklyCounts]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, contributionCount]) => ({
      contributionCount,
      level: activityLevel(contributionCount, maximumContributionCount),
      weekStart,
    }));
};

const normalizeWeeks = (
  value: unknown,
  from: string,
  to: string
): { activeDays: number; weeks: GitHubActivityWeek[] } | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const activeDates = new Set<string>();
  const seenDates = new Set<string>();
  const weeklyCounts = new Map<string, number>();

  for (const rawWeek of value) {
    if (!isObject(rawWeek) || !Array.isArray(rawWeek.contributionDays)) {
      return null;
    }

    const weekStart = normalizeDate(rawWeek.firstDay);
    if (weekStart === null) {
      return null;
    }

    let contributionCount = weeklyCounts.get(weekStart) ?? 0;

    for (const rawDay of rawWeek.contributionDays) {
      if (!isObject(rawDay)) {
        return null;
      }

      const date = normalizeDate(rawDay.date);
      const count = asNonNegativeInteger(rawDay.contributionCount);

      if (date === null || count === null) {
        return null;
      }

      if (date < from || date > to || seenDates.has(date)) {
        continue;
      }

      seenDates.add(date);
      contributionCount += count;

      if (count > 0) {
        activeDates.add(date);
      }
    }

    weeklyCounts.set(weekStart, contributionCount);
  }

  return {
    activeDays: activeDates.size,
    weeks: buildActivityWeeks(weeklyCounts),
  };
};

const readHtmlAttributes = (source: string) => {
  const attributes = new Map<string, string>();
  const attributePattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  for (const match of source.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3];
    if (name !== undefined && value !== undefined) {
      attributes.set(name, value);
    }
  }

  return attributes;
};

const contributionCountFromTooltip = (source: string) => {
  const text = source
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/&nbsp;/gi, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

  if (/^No contributions?\b/i.test(text)) {
    return 0;
  }

  const count = /^([\d,]+)\s+contributions?\b/i.exec(text)?.[1];
  return count === undefined
    ? null
    : asNonNegativeInteger(Number(count.replaceAll(",", "")));
};

const readTooltipCounts = (html: string) => {
  const counts = new Map<string, number>();
  const tooltipPattern = /<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/gi;

  for (const match of html.matchAll(tooltipPattern)) {
    const attributes = readHtmlAttributes(match[1] ?? "");
    const target = attributes.get("for");
    if (target?.startsWith("contribution-day-component-") !== true) {
      continue;
    }

    const count = contributionCountFromTooltip(match[2] ?? "");
    if (
      count === null ||
      (counts.has(target) && counts.get(target) !== count)
    ) {
      return null;
    }

    counts.set(target, count);
  }

  return counts;
};

const parseContributionCalendarDocument = (html: string) => {
  if (html.length === 0 || html.length > MAX_CONTRIBUTION_HTML_LENGTH) {
    return null;
  }

  const tooltipCounts = readTooltipCounts(html);
  if (tooltipCounts === null) {
    return null;
  }

  const days = new Map<string, number>();
  const dayCellPattern = /<td\b([^>]*)>/gi;

  for (const match of html.matchAll(dayCellPattern)) {
    const attributes = readHtmlAttributes(match[1] ?? "");
    const classes = attributes.get("class")?.split(/\s+/) ?? [];
    if (!classes.includes("ContributionCalendar-day")) {
      continue;
    }

    const date = normalizeDate(attributes.get("data-date"));
    const target = attributes.get("id");
    const count = target === undefined ? undefined : tooltipCounts.get(target);

    if (
      date === null ||
      count === undefined ||
      (days.has(date) && days.get(date) !== count)
    ) {
      return null;
    }

    days.set(date, count);
  }

  return days.size === 0 ? null : days;
};

const startOfContributionWeek = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - value.getUTCDay());
  return value.toISOString().slice(0, 10);
};

const summarizeContributionDays = (
  days: Map<string, number>,
  from: string,
  to: string
): AvailableGitHubActivity | null => {
  const fromTime = new Date(`${from}T00:00:00.000Z`).getTime();
  const toTime = new Date(`${to}T00:00:00.000Z`).getTime();
  const dayCount = Math.floor((toTime - fromTime) / DAY_IN_MILLISECONDS) + 1;

  if (dayCount < 1 || dayCount > MAX_ACTIVITY_WINDOW_DAYS) {
    return null;
  }

  let activeDays = 0;
  let totalContributions = 0;
  const weeklyCounts = new Map<string, number>();

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date(fromTime + offset * DAY_IN_MILLISECONDS)
      .toISOString()
      .slice(0, 10);
    const count = days.get(date);
    if (count === undefined) {
      return null;
    }

    totalContributions += count;
    if (!Number.isSafeInteger(totalContributions)) {
      return null;
    }
    if (count > 0) {
      activeDays += 1;
    }

    const weekStart = startOfContributionWeek(date);
    weeklyCounts.set(weekStart, (weeklyCounts.get(weekStart) ?? 0) + count);
  }

  return {
    activeDays,
    from,
    restrictedContributions: null,
    status: "available",
    to,
    totalContributions,
    weeks: buildActivityWeeks(weeklyCounts),
  };
};

const mergeContributionDays = (
  target: Map<string, number>,
  source: Map<string, number>
) => {
  for (const [date, count] of source) {
    if (target.has(date) && target.get(date) !== count) {
      return false;
    }
    target.set(date, count);
  }

  return true;
};

const readGraphQlUser = (value: unknown) => {
  if (!isObject(value)) {
    return null;
  }
  if (Array.isArray(value.errors) && value.errors.length > 0) {
    return null;
  }
  if (!isObject(value.data) || !isObject(value.data.user)) {
    return null;
  }

  return value.data.user;
};

const isGitHubProfileUser = (user: JsonObject, expectedLogin: string) => {
  const returnedLogin = normalizeLogin(user.login);

  return (
    returnedLogin !== null &&
    returnedLogin.toLowerCase() === expectedLogin.toLowerCase() &&
    isObject(user.contributionsCollection) &&
    isObject(user.contributionsCollection.contributionCalendar) &&
    isObject(user.repositories) &&
    Array.isArray(user.repositories.nodes)
  );
};

export const createGitHubContributionWindow = (
  now = new Date()
): GitHubContributionWindow => {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError(
      "A valid date is required for the GitHub activity window."
    );
  }

  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      (CONTRIBUTION_WINDOW_DAYS - 1) * DAY_IN_MILLISECONDS
  );

  return { from: from.toISOString(), to: now.toISOString() };
};

export const parseGitHubContributionCalendarDays = (
  htmlDocuments: readonly string[],
  window: GitHubContributionWindow
): GitHubContributionDay[] | null => {
  const from = dateOnly(window.from);
  const to = dateOnly(window.to);

  if (
    from === null ||
    to === null ||
    from > to ||
    !Array.isArray(htmlDocuments) ||
    htmlDocuments.length === 0
  ) {
    return null;
  }

  const days = new Map<string, number>();

  for (const html of htmlDocuments) {
    if (typeof html !== "string") {
      return null;
    }

    const parsedDays = parseContributionCalendarDocument(html);
    if (parsedDays === null || !mergeContributionDays(days, parsedDays)) {
      return null;
    }
  }

  if (summarizeContributionDays(days, from, to) === null) {
    return null;
  }

  return [...days]
    .filter(([day]) => day >= from && day <= to)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([day, contributionCount]) => ({ contributionCount, day }));
};

export const parseGitHubContributionCalendarHtml = (
  htmlDocuments: readonly string[],
  window: GitHubContributionWindow
): AvailableGitHubActivity | null => {
  const contributionDays = parseGitHubContributionCalendarDays(
    htmlDocuments,
    window
  );
  if (contributionDays === null) {
    return null;
  }

  return summarizeContributionDays(
    new Map(
      contributionDays.map(({ contributionCount, day }) => [
        day,
        contributionCount,
      ])
    ),
    dateOnly(window.from) ?? "",
    dateOnly(window.to) ?? ""
  );
};

export const parseGitHubRepositoriesResponse = (
  value: unknown,
  login: string
): GitHubProject[] | null => {
  const expectedLogin = normalizeLogin(login);
  if (expectedLogin === null || !Array.isArray(value)) {
    return null;
  }

  const projects = value
    .map((project) => normalizeRestProject(project, expectedLogin))
    .filter((project): project is GitHubProject => project !== null);

  return projects.length === 0 ? null : sortAndLimitProjects(projects);
};

export const createUnavailableGitHubProfile = ({
  login,
  window,
}: GitHubFallbackOptions): GitHubProfile => {
  const normalizedLogin = normalizeLogin(login) ?? "f0rr0";
  const from = dateOnly(window.from) ?? "";
  const to = dateOnly(window.to) ?? "";

  return {
    activity: {
      activeDays: null,
      from,
      restrictedContributions: null,
      status: "unavailable",
      to,
      totalContributions: null,
      weeks: [],
    },
    fetchedAt: null,
    login: normalizedLogin,
    profileUrl: `https://github.com/${normalizedLogin}`,
    projects: curatedProjectFallback.map((project) => ({
      ...project,
      topics: [...project.topics],
      url: `https://github.com/${normalizedLogin}/${project.name}`,
    })),
    status: "unavailable",
  };
};

export const parseGitHubProfileResponse = (
  value: unknown,
  { fetchedAt, login, window }: ParseGitHubProfileOptions
): GitHubProfile | null => {
  const expectedLogin = normalizeLogin(login);
  const normalizedFetchedAt = normalizeDateTime(fetchedAt);
  const from = dateOnly(window.from);
  const to = dateOnly(window.to);
  const user = readGraphQlUser(value);

  if (
    expectedLogin === null ||
    normalizedFetchedAt === null ||
    from === null ||
    to === null ||
    from > to ||
    user === null ||
    !isGitHubProfileUser(user, expectedLogin)
  ) {
    return null;
  }

  const collection = user.contributionsCollection as JsonObject;
  const calendar = collection.contributionCalendar as JsonObject;
  const totalContributions = asNonNegativeInteger(calendar.totalContributions);
  const restrictedContributions = asNonNegativeInteger(
    collection.restrictedContributionsCount
  );
  const normalizedWeeks = normalizeWeeks(calendar.weeks, from, to);
  const normalizedTotal = normalizedWeeks?.weeks.reduce(
    (total, week) => total + week.contributionCount,
    0
  );

  if (
    totalContributions === null ||
    restrictedContributions === null ||
    restrictedContributions > totalContributions ||
    normalizedWeeks === null ||
    normalizedTotal !== totalContributions
  ) {
    return null;
  }

  const repositories = user.repositories as JsonObject;
  const projects = (repositories.nodes as unknown[])
    .map((project) => normalizeProject(project, expectedLogin))
    .filter((project): project is GitHubProject => project !== null);

  return {
    activity: {
      activeDays: normalizedWeeks.activeDays,
      from,
      restrictedContributions,
      status: "available",
      to,
      totalContributions,
      weeks: normalizedWeeks.weeks,
    },
    fetchedAt: normalizedFetchedAt,
    login: expectedLogin,
    profileUrl: `https://github.com/${expectedLogin}`,
    projects: sortAndLimitProjects(projects),
    status: "available",
  };
};
