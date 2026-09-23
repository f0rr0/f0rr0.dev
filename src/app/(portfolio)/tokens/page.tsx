import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteMain } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import { TokenUsageDetails } from "@/components/token-details";
import { tokenPreferences } from "@/content/tokens";
import {
  getPublicCodexStats,
  getPublicTokenDetails,
} from "@/lib/codex/public-stats";
import { publicUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: tokenPreferences.title,
  description: tokenPreferences.introduction,
  alternates: { canonical: "/tokens" },
  openGraph: {
    title: `${siteConfig.name} — ${tokenPreferences.title}`,
    description: tokenPreferences.introduction,
    url: publicUrl("/tokens"),
    images: [siteConfig.author.image],
  },
  robots: tokenPreferences.enabled
    ? undefined
    : { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  if (!tokenPreferences.enabled) {
    notFound();
  }
  const [stats, details, weekDetails] = await Promise.all([
    getPublicCodexStats(),
    getPublicTokenDetails(30),
    getPublicTokenDetails(7),
  ]);
  return (
    <SiteShell activeHref="/tokens">
      <SiteMain>
        <TokenUsageDetails
          stats={stats}
          details={details}
          weekDetails={weekDetails}
        />
      </SiteMain>
    </SiteShell>
  );
}
