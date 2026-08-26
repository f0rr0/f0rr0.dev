import "server-only";
import { unstable_cache } from "next/cache";

import { isDatabaseConfigured } from "@/db/client";
import { readRecentGitHubCommits } from "@/lib/github-commits-store";

const readCachedCommits = unstable_cache(
  async () => {
    if (!isDatabaseConfigured()) {
      return [];
    }
    try {
      return await readRecentGitHubCommits();
    } catch {
      return [];
    }
  },
  ["recent-github-commits-v1"],
  { revalidate: 900, tags: ["github-commits"] }
);

export const getRecentGitHubCommits = async () => await readCachedCommits();
