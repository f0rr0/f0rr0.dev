import { Download } from "lucide-react";

import { Journey } from "@/components/journey";
import { JsonLd } from "@/components/json-ld";
import { SiteMain } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import { pages } from "@/content/pages";
import { resumeData } from "@/content/resume";
import { siteNavigation } from "@/content/site";
import { buildPageMetadata } from "@/lib/page-metadata";
import { resumePdfUrl } from "@/lib/site";
import { buildProfilePageJsonLd } from "@/lib/structured-data";

export const metadata = buildPageMetadata(pages.journey);

const { education, experience, skills } = resumeData;
const profileJsonLd = buildProfilePageJsonLd();

export default function JourneyPage() {
  return (
    <>
      <JsonLd data={profileJsonLd} />
      <SiteShell activeHref={pages.journey.path}>
        <SiteMain>
          <h1 className="sr-only">{siteNavigation.journey.title}</h1>
          <Journey
            experience={experience}
            education={education}
            skills={skills}
            action={
              <a
                key="resume"
                className="site-text-link inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-normal text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
                href={resumePdfUrl}
                download
                aria-label="Résumé (PDF)"
              >
                <Download
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                  strokeWidth={1.5}
                />
                Résumé
              </a>
            }
          />
        </SiteMain>
      </SiteShell>
    </>
  );
}
