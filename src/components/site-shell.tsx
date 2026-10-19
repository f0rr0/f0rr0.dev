import type { ReactNode } from "react";

import { AskAiWidget } from "@/components/ask-ai-widget";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { SiteHeaderProps } from "@/components/site-header";
import type { AskAiPageContext } from "@/lib/ask-ai";
import { buildAskAboutMePrompt } from "@/lib/resume";

interface SiteShellProps extends SiteHeaderProps {
  children: ReactNode;
  askAiContext?: AskAiPageContext;
}

export const SiteShell = ({
  activeHref,
  askAiContext,
  children,
  currentPath = activeHref ?? "/",
}: Readonly<SiteShellProps>) => (
  <div className="bg-background text-foreground flex min-h-screen flex-col pb-[env(safe-area-inset-bottom)] font-sans antialiased print:pb-0">
    <a
      className="focus:bg-background focus:outline-ring sr-only focus:not-sr-only focus:fixed focus:inset-s-4 focus:top-4 focus:z-50 focus:rounded-sm focus:p-3 focus:outline-2"
      href="#main-content"
    >
      Skip to content
    </a>
    <SiteHeader activeHref={activeHref} currentPath={currentPath} />
    {children}
    <SiteFooter>
      <AskAiWidget
        key={askAiContext?.prompt ?? "profile"}
        profilePrompt={buildAskAboutMePrompt()}
        pageContext={askAiContext}
      />
    </SiteFooter>
  </div>
);
