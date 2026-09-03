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
  additions: number;
  dateRange: PublicGitHubActivityDateRange | null;
  deletions: number;
  languages: readonly string[] | null;
  ownedCommitCount: number;
  uniqueFileCount: number;
}

export interface PublicGitHubWorkUnitActivity {
  destination: PublicGitHubActivityDestination | null;
  facts: PublicGitHubWorkUnitFacts;
  id: string;
  kind: PublicGitHubWorkUnitKind;
  headline: string | null;
  summary: string | null;
}

export interface PublicGitHubIssueOpenedActivity {
  destination: PublicGitHubActivityDestination | null;
  id: string;
  kind: "issue-opened";
  title: string;
}

export type PublicGitHubActivityItem =
  | PublicGitHubIssueOpenedActivity
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
