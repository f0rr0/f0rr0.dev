import type { Metadata } from "next";
import { JetBrains_Mono, Literata, Source_Sans_3 } from "next/font/google";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { resumeData, resumeRoleMarkerLabels } from "@/content/resume";
import type {
  LogoAsset,
  ResumeExperience,
  ResumeRole,
  ResumeRoleMarker,
} from "@/content/resume";
import { buildAskAgentLinks } from "@/lib/resume";
import { publicUrl, siteConfig } from "@/lib/site";
import { buildProfilePageJsonLd } from "@/lib/structured-data";

import {
  ResumeAskAgents,
  ResumeMobileMenu,
  ResumePrintButton,
  ResumeThemeToggle,
} from "./resume-controls";

const resumeDescription = siteConfig.description;

const literata = Literata({
  subsets: ["latin"],
  variable: "--resume-font-heading",
  weight: ["400", "700"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--resume-font-body",
  weight: ["400", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--resume-font-mono",
  weight: ["400"],
});

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
    title: "Sid Jain Resume",
    type: "profile",
    url: publicUrl("/resume"),
  },
  title: "Resume",
  twitter: {
    card: "summary",
    description: resumeDescription,
    images: [resumeData.person.image],
    title: "Sid Jain Resume",
  },
};

const { education, experience, links, navItems, summary } = resumeData;
const askAgents = buildAskAgentLinks();
const profileJsonLd = buildProfilePageJsonLd();

const mutedText = "text-[#78716c] dark:text-[#a8a29e]";
const accentText =
  "text-[#b45309] transition-colors hover:text-[#92400e] dark:text-[#d97706] dark:hover:text-[#f59e0b]";
const roleMarkerDetails = {
  "hands-on": {
    className:
      "border-[#e4c184] bg-[#f9ebd2] text-[#835018] dark:border-[#6a4b24] dark:bg-[#2b2319] dark:text-[#e8ae58]",
    description: "Hands-on engineering",
  },
  leadership: {
    className:
      "border-[#d6c7cf] bg-[#f0eaee] text-[#66505f] dark:border-[#5b4b55] dark:bg-[#282328] dark:text-[#d8becd]",
    description: "People and engineering leadership",
  },
} satisfies Record<
  ResumeRoleMarker,
  { className: string; description: string }
>;

interface ResumePageContentProps {
  includeProfileJsonLd?: boolean;
  showSiteNav?: boolean;
}

function CompanyLogo({
  logo,
}: Readonly<{
  logo: LogoAsset;
}>) {
  return (
    <div
      className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-[#e7e5e4] dark:ring-[#3a3836] ${logo.tileClassName}`}
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
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-[#e7e5e4] dark:ring-[#3a3836] ${logo.tileClassName}`}
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
    <h2 className="font-[family-name:var(--resume-font-heading)] text-xl font-bold text-[#292524] dark:text-[#e7e5e4]">
      {children}
    </h2>
  );
}

function RoleMarkers({ role }: Readonly<{ role: ResumeRole }>) {
  if (role.markers === undefined || role.markers.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
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
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium leading-5 text-[#292524] dark:text-[#e7e5e4]">
            {role.title}
          </span>
          <RoleMarkers role={role} />
        </div>
        <span className={`text-xs ${mutedText}`}>
          {role.location} <span aria-hidden="true">·</span> {role.dates}
        </span>
      </div>
      {role.summary === undefined ? null : (
        <p className={`mt-2 text-sm ${mutedText}`}>{role.summary}</p>
      )}
      {role.bullets !== undefined && role.bullets.length > 0 ? (
        <ul className={`mt-2 space-y-0.5 text-sm leading-[1.625] ${mutedText}`}>
          {role.bullets.map((bullet) => {
            const isTextBullet = typeof bullet === "string";
            const text = isTextBullet ? bullet : bullet.text;
            const label = isTextBullet ? undefined : bullet.label;
            const logo = isTextBullet ? undefined : bullet.logo;

            return logo === undefined ? (
              <li
                key={text}
                className="relative pl-4 before:absolute before:left-0 before:text-[#b45309] before:content-['·'] dark:before:text-[#d97706]"
              >
                {text}
              </li>
            ) : (
              <li className="flex gap-2.5" key={text}>
                <BulletLogo logo={logo} />
                <span>
                  {label === undefined ? null : (
                    <>
                      <span className="font-medium text-[#292524] dark:text-[#e7e5e4]">
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
  return (
    <div className="mt-6">
      <div className="flex items-start gap-4">
        <CompanyLogo logo={item.logo} />
        <div className="min-w-0 flex-1">
          <h3 className="font-[family-name:var(--resume-font-heading)] font-bold text-[#292524] dark:text-[#e7e5e4]">
            {item.company}
          </h3>
          <p className={`mt-1 text-xs italic ${mutedText}`}>{item.tagline}</p>
          {item.roles.map((role) => (
            <RoleBlock key={`${item.company}-${role.title}`} role={role} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="print:hidden">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 lg:px-12">
        <nav className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <img
              src={resumeData.person.image}
              alt="Sid Jain"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-[#e7e5e4] transition-shadow group-hover:ring-[#b45309] dark:ring-[#3a3836] dark:group-hover:ring-[#d97706]"
            />
            <span className="hidden font-[family-name:var(--resume-font-heading)] text-lg font-bold sm:block">
              Sid Jain
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ul className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    target={item.external === true ? "_blank" : undefined}
                    rel={
                      item.external === true ? "noopener noreferrer" : undefined
                    }
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      item.active === true
                        ? "text-[#b45309] dark:text-[#d97706]"
                        : "text-[#78716c] hover:text-[#292524] dark:text-[#a8a29e] dark:hover:text-[#e7e5e4]"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ResumeThemeToggle />
            <ResumeMobileMenu navItems={navItems} />
          </div>
        </nav>
      </div>
    </header>
  );
}

export function ResumePageContent({
  includeProfileJsonLd = true,
  showSiteNav = true,
}: Readonly<ResumePageContentProps> = {}) {
  return (
    <div
      className={`${literata.variable} ${sourceSans.variable} ${jetBrainsMono.variable} min-h-screen bg-[#faf9f6] text-[#292524] antialiased dark:bg-[#1a1918] dark:text-[#e7e5e4]`}
    >
      {includeProfileJsonLd ? <JsonLd data={profileJsonLd} /> : null}
      <div className="font-[family-name:var(--resume-font-body)]">
        {showSiteNav ? <Header /> : null}
        <main className="mx-auto max-w-5xl px-4 pb-20 pt-16 sm:px-8 sm:pt-24 lg:px-12 print:pt-8">
          <header className="max-w-5xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                <img
                  src={resumeData.person.image}
                  alt=""
                  aria-hidden="true"
                  className="h-16 w-16 shrink-0 rounded-full border-2 border-white object-cover shadow-sm ring-1 ring-[#e7e5e4] sm:h-20 sm:w-20 dark:ring-[#3a3836]"
                />
                <h1 className="font-[family-name:var(--resume-font-heading)] text-4xl font-bold text-[#292524] sm:text-5xl dark:text-[#e7e5e4]">
                  Sid Jain
                </h1>
              </div>
              <ResumePrintButton />
            </div>
          </header>

          <div className="mt-8 max-w-4xl sm:mt-10 print:mt-8">
            <section>
              <p className={`text-sm leading-relaxed ${mutedText}`}>
                {summary}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
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
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ResumePage() {
  return <ResumePageContent />;
}
