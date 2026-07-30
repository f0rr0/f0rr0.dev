import { Menu } from "lucide-react";
import Link from "next/link";

import type { ResumeNavItem } from "@/content/resume";

export function SiteMobileMenu({
  activeHref,
  currentPath,
  navItems,
}: Readonly<{
  activeHref: "/blog" | "/resume";
  currentPath: "/" | "/blog" | "/resume";
  navItems: readonly ResumeNavItem[];
}>) {
  return (
    <details className="relative md:hidden">
      <summary
        aria-label="Navigation menu"
        className="site-icon-button list-none cursor-pointer"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </summary>
      <ul className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl bg-popover p-2 text-popover-foreground shadow-site-floating ring-1 ring-border">
        {navItems.map((item) => {
          const isActive = item.href === activeHref;
          const isCurrent = item.href === currentPath;
          const className = `site-mobile-nav-link ${
            isActive ? "site-mobile-nav-link-active" : ""
          }`;

          return (
            <li key={item.href}>
              {item.external === true ? (
                <a
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={className}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={className}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
