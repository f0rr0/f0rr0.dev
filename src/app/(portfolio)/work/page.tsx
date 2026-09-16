import type { Metadata } from "next";

import { GitHubTimeline } from "@/components/github-timeline";
import { SiteMain } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import { getInitialGitHubActivity } from "@/lib/github-activity-feed";
import { publicUrl, siteConfig } from "@/lib/site";

const description = `A day-by-day record of what ${siteConfig.name} is building, fixing, and shipping.`;

export const metadata: Metadata = {
  alternates: { canonical: "/work" },
  description,
  openGraph: {
    description,
    images: [siteConfig.author.image],
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: `${siteConfig.name} Work`,
    type: "website",
    url: publicUrl("/work"),
  },
  title: "Work",
  twitter: {
    card: "summary",
    description,
    images: [siteConfig.author.image],
    title: `${siteConfig.name} Work`,
  },
};

export const dynamic = "force-dynamic";

export default async function WorkLogPage() {
  const initialPage = await getInitialGitHubActivity();
  return (
    <SiteShell activeHref="/work">
      <SiteMain>
        <GitHubTimeline initialPage={initialPage} />
      </SiteMain>
    </SiteShell>
  );
}
