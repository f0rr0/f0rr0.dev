import { Rss } from "lucide-react";

import { CopyEmailButton } from "@/components/copy-email-button";
import {
  primaryGitHubProfile,
  resumeData,
  socialProfiles,
} from "@/content/resume";
import { publicUrl } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-container mx-auto w-full max-w-192 px-4 sm:px-8 lg:px-12 pb-8 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-4">
        <nav
          aria-label="Contact and feed"
          className="flex flex-wrap items-center gap-x-6 gap-y-2"
        >
          <CopyEmailButton email={resumeData.person.email} />
          {socialProfiles
            .filter(
              (profile) =>
                profile.network !== "GitHub" ||
                profile.url === primaryGitHubProfile.url
            )
            .map((profile) => (
              <a
                className="site-text-link inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
                href={profile.url}
                key={profile.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* Brand marks from thesvg.org, served locally. */}
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 bg-current mask-contain mask-center mask-no-repeat"
                  style={{
                    maskImage: `url(/brands/${profile.network.toLowerCase()}.svg)`,
                  }}
                />
                {profile.network}
              </a>
            ))}
          <a
            className="site-text-link inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
            href={publicUrl("/rss.xml")}
            type="application/rss+xml"
            rel="alternate"
          >
            <Rss aria-hidden="true" className="size-4 shrink-0" />
            RSS
          </a>
        </nav>
      </div>
    </footer>
  );
}
