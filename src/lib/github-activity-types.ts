export interface PublicGitHubActivityLanguage {
  changedLines: number;
  iconUrl: string | null;
  id: string;
  label: string;
}

export interface PublicGitHubActivityItem {
  additions: number;
  avatarUrl: string | null;
  changedFiles: number;
  committedAt: string;
  deletions: number;
  headline: string;
  id: string;
  languages: readonly PublicGitHubActivityLanguage[];
  providerFileCapReached: boolean;
  repositoryLabel: string | null;
  summary: string;
  summaryKind: "headline" | "short";
  url: string | null;
}

export interface PublicGitHubActivityPage {
  items: readonly PublicGitHubActivityItem[];
  nextCursor: string | null;
}
