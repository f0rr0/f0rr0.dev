import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";

// Rebuild the loaded date range after publication; cursors are whole-day boundaries.
export const refreshGitHubActivityPages = async (
  initialPage: PublicGitHubActivityPage,
  oldestDay: string | undefined,
  readPage: (cursor: string) => Promise<PublicGitHubActivityPage>
) => {
  const pages: PublicGitHubActivityPage[] = [];
  let cursor = initialPage.nextCursor;
  let lastDay = initialPage.days.at(-1)?.day;
  const visited = new Set<string>();
  if (oldestDay === undefined) {
    return { pages, cursor };
  }
  while (cursor !== null && (lastDay === undefined || lastDay > oldestDay)) {
    if (visited.has(cursor)) {
      throw new Error("The activity cursor did not advance.");
    }
    visited.add(cursor);
    const page = await readPage(cursor);
    pages.push(page);
    cursor = page.nextCursor;
    lastDay = page.days.at(-1)?.day ?? lastDay;
  }
  return { pages, cursor };
};
