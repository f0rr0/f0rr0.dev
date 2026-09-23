import { notFound } from "next/navigation";

import { SiteMain } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import { TokenUsageDetails } from "@/components/token-details";
import { pages } from "@/content/pages";
import { tokenPreferences } from "@/content/tokens";
import {
  getPublicCodexStats,
  getPublicTokenDetails,
} from "@/lib/codex/public-stats";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata = buildPageMetadata(pages.tokens);

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  if (!tokenPreferences.enabled) {
    notFound();
  }
  const [stats, details, weekDetails, historyDetails] = await Promise.all([
    getPublicCodexStats(),
    getPublicTokenDetails(30),
    getPublicTokenDetails(7),
    tokenPreferences.historyDays > 30
      ? getPublicTokenDetails(tokenPreferences.historyDays)
      : null,
  ]);
  return (
    <SiteShell activeHref={pages.tokens.path}>
      <SiteMain>
        <TokenUsageDetails
          stats={stats}
          details={details}
          weekDetails={weekDetails}
          historyDetails={historyDetails}
        />
      </SiteMain>
    </SiteShell>
  );
}
