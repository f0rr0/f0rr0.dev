import {
  GitHubActivityLiveProvider,
  GitHubActivityStatus,
} from "@/components/github-activity-status";
import { GitHubTimelinePager } from "@/components/github-timeline-pager";
import { SiteSection } from "@/components/site-page";
import { primaryGitHubProfile } from "@/content/resume";
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
      <SiteSection heading="h1" id="timeline" title="Work">
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
  return (
    <GitHubActivityLiveProvider
      feedRevision={initialPage.head.feedRevision}
      orderingRevision={initialPage.orderingRevision}
    >
      <SiteSection
        action={<GitHubActivityStatus initialHead={initialPage.head} />}
        className={preview ? "home-section mt-12 [scroll-margin-top:2rem]" : ""}
        heading={preview ? "h2" : "h1"}
        headingClassName={preview ? undefined : "sr-only"}
        href={preview ? "/work" : undefined}
        id="timeline"
        title="Work"
      >
        <div className="grid gap-4">
          <GitHubTimelinePager
            initialPage={initialPage}
            preview={preview}
            now={new Date().toISOString()}
            key={`${initialPage.head.feedRevision}:${initialPage.orderingRevision}`}
          />
        </div>
      </SiteSection>
    </GitHubActivityLiveProvider>
  );
}
