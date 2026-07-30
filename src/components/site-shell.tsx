import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

interface SiteShellProps {
  activeHref: "/blog" | "/resume";
  children: ReactNode;
  currentPath?: "/" | "/blog" | "/resume";
}

export function SiteShell({
  activeHref,
  children,
  currentPath = activeHref,
}: Readonly<SiteShellProps>) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <SiteHeader activeHref={activeHref} currentPath={currentPath} />
      {children}
    </div>
  );
}
