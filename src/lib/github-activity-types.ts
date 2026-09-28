export type PublicGitHubWorkUnitKind =
  | "branch"
  | "canonical-day"
  | "pull-request";

export interface PublicGitHubActivityDestination {
  label: string;
  url: string;
}

export interface PublicGitHubActivityRepository {
  avatarUrl: string | null;
  key: string;
  label: string | null;
  url: string | null;
}

export interface PublicGitHubActivityDateRange {
  end: string;
  start: string;
}

export interface PublicGitHubWorkUnitFacts {
  additions: number | null;
  dateRange: PublicGitHubActivityDateRange | null;
  deletions: number | null;
  languages: readonly string[] | null;
  ownedCommitCount: number;
  uniqueFileCount: number;
}

export interface GitHubPullRequestDisplay {
  title: string;
  status: "open" | "draft" | "merged" | "closed";
  // Null for a contribution to someone else's PR or incomplete evidence.
  diff: { additions: number; deletions: number; files: number } | null;
}

export type GitHubIssueStatus = "open" | "completed" | "not-planned" | "closed";

export interface PublicGitHubWorkUnitActivity {
  activityAt: string;
  destination: PublicGitHubActivityDestination | null;
  facts: PublicGitHubWorkUnitFacts;
  id: string;
  kind: PublicGitHubWorkUnitKind;
  headline: string | null;
  pullRequest?: GitHubPullRequestDisplay | null;
  summarizing: boolean;
  summary: string | null;
}

export interface PublicGitHubIssueActivity {
  activityAt: string;
  destination: PublicGitHubActivityDestination | null;
  id: string;
  kind: "issue";
  title: string;
  status?: GitHubIssueStatus;
}

export type PublicGitHubActivityItem =
  | PublicGitHubIssueActivity
  | PublicGitHubWorkUnitActivity;

export interface PublicGitHubActivityRepositoryGroup {
  items: readonly PublicGitHubActivityItem[];
  repository: PublicGitHubActivityRepository;
}

export interface PublicGitHubActivityDay {
  day: string;
  repositories: readonly PublicGitHubActivityRepositoryGroup[];
}

export interface PublicActivityHead {
  feedRevision: string;
  lastPublishedAt: string | null;
  revision: string;
  summarizing: boolean;
}

export interface PublicGitHubActivityPage {
  days: readonly PublicGitHubActivityDay[];
  head: PublicActivityHead;
  nextCursor: string | null;
  orderingRevision: string;
}
