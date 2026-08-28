export interface PublicGitHubActivityLanguage {
  changedLines: number;
  iconUrl: string | null;
  id: string;
  label: string;
}

export interface PublicGitHubActivityRepository {
  avatarUrl: string | null;
  label: string | null;
  url: string | null;
}

export interface PublicGitHubActivityCommit {
  additions: number;
  changedFiles: number;
  committedAt: string;
  deletions: number;
  headline: string;
  id: string;
  languages: readonly PublicGitHubActivityLanguage[];
  providerFileCapReached: boolean;
  summary: string | null;
}

export interface PublicGitHubStandaloneCommitActivity {
  commit: PublicGitHubActivityCommit;
  id: string;
  kind: "commit";
  occurredAt: string;
  repository: PublicGitHubActivityRepository;
}

export interface PublicGitHubPullRequestCommitActivity {
  commits: readonly PublicGitHubActivityCommit[];
  id: string;
  kind: "pull-request-commits";
  occurredAt: string;
  repository: PublicGitHubActivityRepository;
  title: string;
}

export interface PublicGitHubPullRequestMergedActivity {
  id: string;
  kind: "pull-request-merged";
  occurredAt: string;
  repository: PublicGitHubActivityRepository;
  title: string;
}

export interface PublicGitHubIssueOpenedActivity {
  id: string;
  kind: "issue-opened";
  occurredAt: string;
  repository: PublicGitHubActivityRepository;
  title: string;
}

export type PublicGitHubActivityItem =
  | PublicGitHubIssueOpenedActivity
  | PublicGitHubPullRequestCommitActivity
  | PublicGitHubPullRequestMergedActivity
  | PublicGitHubStandaloneCommitActivity;

export interface PublicGitHubActivityDayTotals {
  additions: number;
  deletions: number;
  issuesOpened: number;
  pullRequestsMerged: number;
  repositories: number;
}

export interface PublicGitHubActivityDay {
  day: string;
  items: readonly PublicGitHubActivityItem[];
  totals: PublicGitHubActivityDayTotals;
}

export interface PublicGitHubActivityPage {
  days: readonly PublicGitHubActivityDay[];
  nextCursor: string | null;
  snapshotAt: string;
}
