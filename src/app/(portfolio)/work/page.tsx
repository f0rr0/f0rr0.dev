import { GitHubTimeline } from "@/components/github-timeline";
import { SiteMain } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import { pages } from "@/content/pages";
import { getInitialGitHubActivity } from "@/lib/github-activity-feed";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata = buildPageMetadata(pages.work);

export const dynamic = "force-dynamic";

export default async function WorkLogPage() {
  const initialPage = await getInitialGitHubActivity();
  return (
    <SiteShell activeHref={pages.work.path}>
      <SiteMain>
        <GitHubTimeline initialPage={initialPage} />
      </SiteMain>
    </SiteShell>
  );
}
