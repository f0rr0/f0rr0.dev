import "server-only";
import { unstable_cache } from "next/cache";

import type { GitHubProfile } from "@/lib/github-profile-core";
import type { TimelineEdition } from "@/lib/timeline-core";
import { createFallbackTimelineEdition } from "@/lib/timeline-fallback";
import { readPublishedTimelineEdition } from "@/lib/timeline-store";

const readCachedPublishedEdition = unstable_cache(
  async () => {
    try {
      return await readPublishedTimelineEdition();
    } catch {
      return null;
    }
  },
  ["published-timeline-edition-v2"],
  { revalidate: 900, tags: ["timeline-edition"] }
);

export const getPublishedTimelineEdition = async () =>
  await readCachedPublishedEdition();

export const resolveTimelineEdition = (
  github: GitHubProfile,
  published: TimelineEdition | null,
  now = new Date()
): TimelineEdition | null => {
  const allowedPublicRepositories = new Set(
    github.status === "available"
      ? github.projects.map((project) => project.url.toLocaleLowerCase("en-US"))
      : []
  );
  // Published links already crossed the event-ingestion and edition-validator
  // boundaries. The daily full public-event reconciliation withdraws an
  // edition if a previously visible GitHub object disappears.
  if (published !== null) {
    return published;
  }

  return createFallbackTimelineEdition(
    github.activity,
    allowedPublicRepositories,
    now
  );
};
