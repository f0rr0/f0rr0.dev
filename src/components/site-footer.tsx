import Link from "next/link";

import { resumeData } from "@/content/resume";

const footerLinks = [
  { href: "https://github.com/f0rr0", label: "GitHub", external: true },
  { href: "https://linkedin.com/in/f0rr0", label: "LinkedIn", external: true },
  {
    href: `mailto:${resumeData.person.email}`,
    label: "Email",
    external: false,
  },
  { href: "/resume", label: "Résumé", external: false },
  { href: "/rss.xml", label: "RSS", external: false },
] as const;

export function SiteFooter(): React.ReactNode {
  return (
    <footer className="site-container font-ui print:hidden">
      <div className="flex flex-col gap-6 border-t border-border py-8 text-sm text-muted-foreground sm:flex-row sm:items-end sm:justify-between sm:py-10">
        <div>
          <p className="font-semibold text-foreground">
            {resumeData.person.name}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed sm:text-sm">
            Applied AI engineer building useful, durable systems from Mumbai.
          </p>
        </div>
        <div className="sm:text-right">
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end">
              {footerLinks.map((item) => (
                <li key={item.label}>
                  {item.href.startsWith("/") ? (
                    <Link
                      className="rounded-sm transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      href={item.href}
                      prefetch={false}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <a
                      className="rounded-sm transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      href={item.href}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      target={item.external ? "_blank" : undefined}
                    >
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <p className="mt-3 text-xs">
            © {new Date().getUTCFullYear()} Sid Jain
          </p>
        </div>
      </div>
    </footer>
  );
}
