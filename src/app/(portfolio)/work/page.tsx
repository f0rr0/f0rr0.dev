import { GitHubTimeline } from "@/components/github-timeline";
import { SiteMain } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import { pages } from "@/content/pages";
import { getInitialGitHubActivity } from "@/lib/github-activity-feed";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getRequestDay } from "@/lib/server-time";

export const metadata = buildPageMetadata(pages.work);

export const revalidate = 300;

const WorkLogPage = async () => {
  const initialPage = await getInitialGitHubActivity();
  return (
    <SiteShell activeHref={pages.work.path}>
      <SiteMain>
        <GitHubTimeline initialPage={initialPage} now={getRequestDay()} />
      </SiteMain>
    </SiteShell>
  );
};

export default WorkLogPage;
