import Link from "next/link";

import { PortraitFace } from "@/components/portrait-face";
import ThemeToggle from "@/components/ThemeToggle";
import { resumeData } from "@/content/resume";
import { siteNavigation } from "@/content/site";
import { tokenPreferences } from "@/content/tokens";

import { SiteMobileMenu } from "./site-mobile-menu";

type PagePath = (typeof siteNavigation)[keyof typeof siteNavigation]["path"];

export interface SiteHeaderProps {
  activeHref?: PagePath;
  currentPath?: "/" | PagePath;
}

export function SiteHeader({
  activeHref,
  currentPath = activeHref ?? "/",
}: Readonly<SiteHeaderProps>): React.ReactNode {
  const navigation = resumeData.navItems
    .filter(
      (item) =>
        item.href !== siteNavigation.tokens.path || tokenPreferences.enabled
    )
    .map((item) => {
      const props = {
        "aria-current":
          item.href === currentPath ? ("page" as const) : undefined,
        className: `site-nav-link inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${item.href === activeHref ? "site-nav-link-active text-primary underline" : ""}`,
        href: item.href,
      };
      return (
        <li key={item.href}>
          <Link {...props} prefetch={false}>
            {item.label}
          </Link>
        </li>
      );
    });
  return (
    <header className="bg-background font-sans text-foreground print:hidden">
      <div className="site-container py-6">
        <nav
          aria-label="Primary navigation"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <Link
            href="/"
            prefetch={false}
            aria-label={`${resumeData.person.name} home`}
            aria-current={currentPath === "/" ? "page" : undefined}
            className="group flex min-h-11 min-w-0 max-w-full items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <PortraitFace className="size-12" />
            <span className="font-serif text-2xl font-normal">
              {resumeData.person.name}
            </span>
          </Link>
          <div className="ms-auto flex items-center gap-1">
            <ul className="hidden items-center gap-1 md:flex">{navigation}</ul>
            <ThemeToggle />
            <SiteMobileMenu>{navigation}</SiteMobileMenu>
          </div>
        </nav>
      </div>
    </header>
  );
}
