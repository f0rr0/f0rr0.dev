import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SiteActionLinkProps {
  children: ReactNode;
  className?: string;
  download?: boolean;
  href: string;
  icon?: ReactNode;
}

export function SiteActionLink({
  children,
  className,
  download = false,
  href,
  icon,
}: Readonly<SiteActionLinkProps>) {
  const content = (
    <>
      {icon}
      {children}
    </>
  );
  const classes = cn("site-action-link", className);

  return download ? (
    <a className={classes} download href={href}>
      {content}
    </a>
  ) : (
    <Link className={classes} href={href}>
      {content}
    </Link>
  );
}
