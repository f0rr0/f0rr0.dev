import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SiteMainProps {
  children: ReactNode;
  className?: string;
}

export function SiteMain({ children, className }: Readonly<SiteMainProps>) {
  return (
    <main
      className={cn("site-container pb-20 pt-8 sm:pt-12 print:pt-8", className)}
    >
      {children}
    </main>
  );
}

interface SitePageProps {
  action?: ReactNode;
  children: ReactNode;
  title: ReactNode;
}

export function SitePage({ action, children, title }: Readonly<SitePageProps>) {
  return (
    <SiteMain>
      <header className="max-w-4xl">
        <div className="flex items-end justify-between gap-4">
          <h1 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
            {title}
          </h1>
          {action}
        </div>
      </header>
      <div className="mt-8 max-w-4xl print:mt-8">{children}</div>
    </SiteMain>
  );
}
