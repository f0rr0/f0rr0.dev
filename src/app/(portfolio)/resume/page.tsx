import type { Metadata } from "next";

import { FaceMotionPortrait } from "@/components/face-motion-portrait";
import { JsonLd } from "@/components/json-ld";
import { SitePage } from "@/components/site-page";
import { SiteShell } from "@/components/site-shell";
import {
  formatResumeLocation,
  resumeCompanyStageLabels,
  resumeData,
  resumeRoleMarkerLabels,
} from "@/content/resume";
import type {
  LogoAsset,
  ResumeExperience,
  ResumeRole,
  ResumeRoleMarker,
} from "@/content/resume";
import { buildAskAgentLinks } from "@/lib/resume";
import { publicUrl, siteConfig } from "@/lib/site";
import { buildProfilePageJsonLd } from "@/lib/structured-data";

import { ResumeAskAgents, ResumeDownloadButton } from "./resume-controls";

const resumeDescription = siteConfig.description;

export const metadata: Metadata = {
  alternates: {
    canonical: "/resume",
  },
  description: resumeDescription,
  openGraph: {
    description: resumeDescription,
    images: [resumeData.person.image],
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: "Sid Jain Résumé",
    type: "profile",
    url: publicUrl("/resume"),
  },
  title: "Résumé",
  twitter: {
    card: "summary",
    description: resumeDescription,
    images: [resumeData.person.image],
    title: "Sid Jain Résumé",
  },
};

const { education, experience, links, person, summary } = resumeData;
const askAgents = buildAskAgentLinks();
const profileJsonLd = buildProfilePageJsonLd();

const mutedText = "text-muted-foreground";
const resumeBodyText = `text-sm font-normal leading-[1.625] lg:text-base ${mutedText}`;
const accentText =
  "text-primary transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const roleMarkerDetails = {
  "hands-on": {
    className:
      "border-hands-on-border bg-hands-on-background text-hands-on-foreground",
    description: "Hands-on engineering",
  },
  leadership: {
    className:
      "border-leadership-border bg-leadership-background text-leadership-foreground",
    description: "People and engineering leadership",
  },
} satisfies Record<
  ResumeRoleMarker,
  { className: string; description: string }
>;

interface ResumePageContentProps {
  currentPath?: "/" | "/resume";
  includeProfileJsonLd?: boolean;
}

function CompanyLogo({
  logo,
}: Readonly<{
  logo: LogoAsset;
}>) {
  return (
    <div
      className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-border ${logo.tileClassName}`}
      aria-hidden="true"
    >
      <img
        alt=""
        className={`object-contain ${logo.imageClassName ?? "h-5 w-7"}`}
        src={logo.src}
      />
    </div>
  );
}

function BulletLogo({
  logo,
}: Readonly<{
  logo: LogoAsset;
}>) {
  return (
    <span
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border ${logo.tileClassName}`}
      aria-hidden="true"
      title={logo.alt}
    >
      <img
        alt=""
        className={`object-contain ${
          logo.bulletImageClassName ?? logo.imageClassName ?? "h-4 w-5"
        }`}
        src={logo.src}
      />
    </span>
  );
}

function SectionTitle({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <h2 className="font-serif text-xl font-bold text-foreground">{children}</h2>
  );
}

function RoleMarkers({ role }: Readonly<{ role: ResumeRole }>) {
  if (role.markers === undefined || role.markers.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex -translate-y-px flex-wrap items-center gap-1">
      {role.markers.map((marker) => {
        const details = roleMarkerDetails[marker];
        const description =
          marker === "leadership" && role.leadershipScope !== undefined
            ? `${details.description}: ${role.leadershipScope}`
            : details.description;

        return (
          <span
            className={`inline-flex h-5 items-center rounded-full border px-2 text-[0.625rem] font-semibold leading-none tracking-[0.01em] ${details.className}`}
            key={marker}
            title={description}
          >
            <span aria-hidden="true">{resumeRoleMarkerLabels[marker]}</span>
            <span className="sr-only">{description}</span>
          </span>
        );
      })}
    </span>
  );
}

function RoleBlock({ role }: Readonly<{ role: ResumeRole }>) {
  return (
    <div className="mt-4 sm:mt-3">
      <div className="flex flex-col items-start sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium leading-5 text-foreground lg:text-base lg:leading-6">
            {role.title}
          </span>
          <RoleMarkers role={role} />
        </div>
        <span className={`mt-1 text-xs sm:mt-0 ${mutedText}`}>
          {role.location} <span aria-hidden="true">·</span> {role.dates}
        </span>
      </div>
      {role.summary === undefined ? null : (
        <p className={`mt-2 text-sm lg:text-base ${mutedText}`}>
          {role.summary}
        </p>
      )}
      {role.bullets !== undefined && role.bullets.length > 0 ? (
        <ul className={`mt-2 space-y-0.5 ${resumeBodyText}`}>
          {role.bullets.map((bullet) => {
            const isTextBullet = typeof bullet === "string";
            const text = isTextBullet ? bullet : bullet.text;
            const label = isTextBullet ? undefined : bullet.label;
            const logo = isTextBullet ? undefined : bullet.logo;

            return logo === undefined ? (
              <li
                key={text}
                className="relative pl-4 before:absolute before:left-0 before:text-primary before:content-['·']"
              >
                {text}
              </li>
            ) : (
              <li className="flex gap-2.5" key={text}>
                <BulletLogo logo={logo} />
                <span>
                  {label === undefined ? null : (
                    <>
                      <span className="font-medium text-foreground">
                        {label}
                      </span>
                      {": "}
                    </>
                  )}
                  {text}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function ExperienceItem({ item }: Readonly<{ item: ResumeExperience }>) {
  const companyStage =
    item.companyStage === undefined
      ? undefined
      : resumeCompanyStageLabels[item.companyStage];

  return (
    <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 sm:flex sm:gap-4">
      <CompanyLogo logo={item.logo} />
      <div className="contents sm:block sm:min-w-0 sm:flex-1">
        <div className="col-start-2 min-w-0 sm:contents">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-serif font-bold text-foreground">
              {item.company}
            </h3>
            {companyStage === undefined ? null : (
              <span
                aria-label={`Company stage during this role: ${companyStage}`}
                className="inline-flex h-5 translate-y-px items-center rounded-full border border-border bg-muted/40 px-2 text-[0.625rem] font-semibold leading-none tracking-[0.01em] text-muted-foreground"
                title={`Company stage during this role: ${companyStage}`}
              >
                {companyStage}
              </span>
            )}
          </div>
          <p className={`mt-1 text-xs italic ${mutedText}`}>{item.tagline}</p>
        </div>
        <div className="col-span-2 min-w-0 sm:contents">
          {item.roles.map((role) => (
            <RoleBlock key={`${item.company}-${role.title}`} role={role} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResumePageContent({
  currentPath = "/resume",
  includeProfileJsonLd = true,
}: Readonly<ResumePageContentProps> = {}) {
  return (
    <>
      {includeProfileJsonLd ? <JsonLd data={profileJsonLd} /> : null}
      <SiteShell activeHref="/resume" currentPath={currentPath}>
        <SitePage title="Résumé" action={<ResumeDownloadButton />}>
          <section className="grid items-start gap-8 print:block lg:grid-cols-[minmax(0,1fr)_120px] lg:gap-10">
            <div className="order-2 min-w-0 print:block lg:order-1 lg:pt-2">
              <p className={resumeBodyText}>{summary}</p>
              <p className={`mt-3 ${resumeBodyText}`}>
                {formatResumeLocation(person)}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm lg:text-base">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className={accentText}
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      link.href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
            <FaceMotionPortrait className="order-1 lg:order-2" eager />
          </section>

          <section className="mt-8">
            <SectionTitle>Experience</SectionTitle>
            <div className="mt-4">
              {experience.map((item) => (
                <ExperienceItem key={item.company} item={item} />
              ))}
            </div>
          </section>

          <section className="mt-8">
            <SectionTitle>Education</SectionTitle>
            <div className="mt-4">
              {education.map((item) => (
                <ExperienceItem key={item.company} item={item} />
              ))}
            </div>
          </section>

          <ResumeAskAgents actions={askAgents.actions} />
        </SitePage>
      </SiteShell>
    </>
  );
}

export default function ResumePage() {
  return <ResumePageContent />;
}
