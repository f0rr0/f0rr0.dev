import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { InfoLabel } from "@/components/info-label";
import { cn } from "@/lib/utils";

interface SiteMainProps {
  children: ReactNode;
  className?: string;
}

export const SiteMain = ({ children, className }: Readonly<SiteMainProps>) => (
  <main
    className={cn("site-container flex-1 pt-8 pb-12", className)}
    id="main-content"
  >
    {children}
  </main>
);

export const SiteSection = ({
  action,
  children,
  className = "mt-12 scroll-mt-8",
  heading: Heading = "h2",
  description,
  href,
  linkLabel,
  id,
  title,
}: Readonly<{
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  heading?: "h1" | "h2";
  description?: string;
  href?: string;
  linkLabel?: string;
  id: string;
  title: string;
}>) => {
  const external = /^https?:\/\//u.test(href ?? "");
  const LinkIcon = external ? ArrowUpRight : ArrowRight;
  return (
    <section aria-labelledby={`${id}-title`} className={className} id={id}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Heading
          className={cn(
            "text-foreground font-serif font-normal",
            Heading === "h1" ? "text-2xl" : "text-xl"
          )}
          id={`${id}-title`}
        >
          {description === undefined ? (
            title
          ) : (
            <InfoLabel label={title} description={description} />
          )}
        </Heading>
        <div className="flex h-8 shrink-0 items-center justify-end gap-4">
          {action}
          {href === undefined ? null : (
            <Link
              className="text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer noopener" : undefined}
            >
              {linkLabel ?? `All ${title.toLowerCase()}`}
              <LinkIcon aria-hidden="true" className="size-3.5" />
              {external ? (
                <span className="sr-only"> (opens in a new tab)</span>
              ) : null}
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
};
