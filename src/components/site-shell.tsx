import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

interface SiteShellProps {
  activeHref?: "/blog" | "/resume";
  children: ReactNode;
  currentPath?: "/" | "/blog" | "/resume" | "/work-log";
  includeFooter?: boolean;
}

export function SiteShell({
  activeHref,
  children,
  currentPath = activeHref ?? "/",
  includeFooter = false,
}: Readonly<SiteShellProps>) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <SiteHeader activeHref={activeHref} currentPath={currentPath} />
      {children}
      {includeFooter ? <SiteFooter /> : null}
    </div>
  );
}
