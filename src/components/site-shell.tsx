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

export function SiteShell({
  activeHref,
  askAiContext,
  children,
  currentPath = activeHref ?? "/",
}: Readonly<SiteShellProps>) {
  return (
    <div className="flex min-h-screen flex-col pb-[env(safe-area-inset-bottom)] print:pb-0 bg-background font-sans text-foreground antialiased">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-background focus:p-3 focus:outline-2 focus:outline-ring"
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
}
