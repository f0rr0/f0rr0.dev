import Link from "next/link";

import { PortraitFace } from "@/components/portrait-face";
import ThemeToggle from "@/components/ThemeToggle";
import { resumeData } from "@/content/resume";
import { tokenPreferences } from "@/content/tokens";

import { SiteMobileMenu } from "./site-mobile-menu";

export interface SiteHeaderProps {
  activeHref?: "/writing" | "/journey" | "/work" | "/tokens";
  currentPath?: "/" | "/writing" | "/journey" | "/work" | "/tokens";
}

export function SiteHeader({
  activeHref,
  currentPath = activeHref ?? "/",
}: Readonly<SiteHeaderProps>): React.ReactNode {
  const navigation = resumeData.navItems
    .filter((item) => item.href !== "/tokens" || tokenPreferences.enabled)
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
      <div className="site-container mx-auto w-full max-w-192 px-4 sm:px-8 lg:px-12 py-6">
        <nav
          aria-label="Primary navigation"
          className="flex items-center justify-between"
        >
          <Link
            href="/"
            prefetch={false}
            aria-label={`${resumeData.person.name} home`}
            aria-current={currentPath === "/" ? "page" : undefined}
            className="group flex min-h-11 items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <PortraitFace className="size-12" />
            <span className="font-serif text-2xl font-normal">
              {resumeData.person.name}
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ul className="hidden items-center gap-1 md:flex">{navigation}</ul>
            <ThemeToggle />
            <SiteMobileMenu>{navigation}</SiteMobileMenu>
          </div>
        </nav>
      </div>
    </header>
  );
}
