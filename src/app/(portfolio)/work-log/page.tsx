import type { Metadata } from "next";

import { GitHubTimeline } from "@/components/github-timeline";
import { SiteShell } from "@/components/site-shell";
import { getInitialGitHubActivity } from "@/lib/github-activity-feed";
import { publicUrl, siteConfig } from "@/lib/site";

const description =
  "A day-by-day record of what Sid Jain is building, fixing, and shipping.";

export const metadata: Metadata = {
  alternates: { canonical: "/work-log" },
  description,
  openGraph: {
    description,
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: "Sid Jain Work Log",
    type: "website",
    url: publicUrl("/work-log"),
  },
  title: "Work Log",
  twitter: {
    card: "summary",
    description,
    title: "Sid Jain Work Log",
  },
};

export const dynamic = "force-dynamic";

export default async function WorkLogPage() {
  const activity = await getInitialGitHubActivity();

  return (
    <SiteShell currentPath="/work-log" includeFooter>
      <main className="site-container pb-20 pt-8 sm:pb-24 sm:pt-12">
        <GitHubTimeline initialPage={activity} />
      </main>
    </SiteShell>
  );
}
