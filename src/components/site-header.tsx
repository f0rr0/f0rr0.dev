import Image from "next/image";
import Link from "next/link";

import ThemeToggle from "@/components/ThemeToggle";
import { resumeData } from "@/content/resume";
import { FACE_MOTION_AVATAR_SRC } from "@/lib/face-motion";

import { SiteMobileMenu } from "./site-mobile-menu";

interface SiteHeaderProps {
  activeHref?: "/blog" | "/resume";
  currentPath?: "/" | "/blog" | "/resume";
}

export function SiteHeader({
  activeHref,
  currentPath = activeHref ?? "/",
}: Readonly<SiteHeaderProps>): React.ReactNode {
  return (
    <header className="bg-background font-ui text-foreground print:hidden">
      <div className="site-container py-6">
        <nav
          aria-label="Primary navigation"
          className="flex items-center justify-between"
        >
          <Link
            href="/"
            prefetch={false}
            aria-label={`${resumeData.person.name} home`}
            aria-current={currentPath === "/" ? "page" : undefined}
            className="group flex items-center gap-3"
          >
            <Image
              src={FACE_MOTION_AVATAR_SRC}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-2 ring-border transition-shadow group-hover:ring-primary"
              height={40}
              width={40}
            />
            <span className="hidden text-lg font-bold sm:block">
              {resumeData.person.name}
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ul className="hidden items-center gap-1 md:flex">
              {resumeData.navItems.map((item) => {
                const isActive = item.href === activeHref;
                const isCurrent = item.href === currentPath;
                const className = `site-nav-link ${
                  isActive ? "site-nav-link-active" : ""
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
                        prefetch={false}
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
            <ThemeToggle />
            <SiteMobileMenu
              activeHref={activeHref}
              currentPath={currentPath}
              navItems={resumeData.navItems}
            />
          </div>
        </nav>
      </div>
    </header>
  );
}
