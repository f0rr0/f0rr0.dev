import {
  GitHubActivityLiveProvider,
  GitHubActivityStatus,
} from "@/components/github-activity-status";
import { GitHubTimelinePager } from "@/components/github-timeline-pager";
import { SiteSection } from "@/components/site-page";
import { primaryGitHubProfile } from "@/content/resume";
import { siteNavigation } from "@/content/site";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";

export function GitHubTimeline({
  initialPage,
  preview = false,
}: Readonly<{
  initialPage: PublicGitHubActivityPage | null;
  preview?: boolean;
}>) {
  if (initialPage === null) {
    return preview ? null : (
      <SiteSection
        className=""
        heading="h1"
        id="timeline"
        title={siteNavigation.work.title}
      >
        <p className="text-muted-foreground">
          Work activity is temporarily unavailable.{" "}
          <a className="site-text-link" href={primaryGitHubProfile.url}>
            View my work on GitHub
          </a>
          .
        </p>
      </SiteSection>
    );
  }
  const content = (
    <div className="grid gap-4">
      <GitHubTimelinePager
        initialPage={initialPage}
        preview={preview}
        now={new Date().toISOString()}
        key={`${initialPage.head.feedRevision}:${initialPage.orderingRevision}`}
      />
    </div>
  );
  return (
    <GitHubActivityLiveProvider
      feedRevision={initialPage.head.feedRevision}
      orderingRevision={initialPage.orderingRevision}
    >
      {preview ? (
        <SiteSection
          action={<GitHubActivityStatus initialHead={initialPage.head} />}
          href={siteNavigation.work.path}
          id="timeline"
          title={siteNavigation.work.title}
        >
          {content}
        </SiteSection>
      ) : (
        <section
          aria-labelledby="timeline-title"
          className="relative"
          id="timeline"
        >
          <h1 className="sr-only" id="timeline-title">
            {siteNavigation.work.title}
          </h1>
          <div className="absolute end-0 -top-11">
            <GitHubActivityStatus initialHead={initialPage.head} />
          </div>
          {content}
        </section>
      )}
    </GitHubActivityLiveProvider>
  );
}
