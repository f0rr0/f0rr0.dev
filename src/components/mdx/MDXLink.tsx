import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

type MDXLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export default function MDXLink({ href, children, ...rest }: MDXLinkProps) {
  if (href === undefined || href === "" || href.startsWith("#")) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }

  if (href.startsWith("/")) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
      {children}
    </a>
  );
}
