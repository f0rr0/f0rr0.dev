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

export default async function TokensPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!tokenPreferences.enabled) {
    notFound();
  }
  const days = (await searchParams).days === "7" ? 7 : 30;
  const [stats, details] = await Promise.all([
    getPublicCodexStats(),
    getPublicTokenDetails(days),
  ]);
  return (
    <SiteShell activeHref="/tokens">
      <SiteMain>
        <TokenUsageDetails stats={stats} details={details} days={days} />
      </SiteMain>
    </SiteShell>
  );
}
