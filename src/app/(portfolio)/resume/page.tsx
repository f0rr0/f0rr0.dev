import type { Metadata } from "next";
import { JetBrains_Mono, Literata, Source_Sans_3 } from "next/font/google";
import Link from "next/link";

import {
  ResumeMobileMenu,
  ResumePrintButton,
  ResumeThemeToggle,
} from "./resume-controls";

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
  description:
    "Sid Jain resume: Senior Full-Stack Engineer / AI Lead, founder of Yuppies Tech, and AI product engineer at Namefi.",
  title: "Resume",
};

const navItems = [
  { href: "/blog", label: "Blog" },
  { href: "/resume", label: "Resume", active: true },
  { href: "https://github.com/f0rr0", label: "GitHub", external: true },
];

const links = [
  { href: "mailto:sid_26@outlook.com", label: "sid_26@outlook.com" },
  { href: "https://linkedin.com/in/f0rr0", label: "linkedin.com/in/f0rr0" },
  { href: "https://github.com/f0rr0", label: "github.com/f0rr0" },
];

interface LogoAsset {
  alt: string;
  bulletImageClassName?: string;
  imageClassName?: string;
  src: string;
  tileClassName: string;
}

interface ResumeBullet {
  label?: string;
  logo?: LogoAsset;
  text: string;
}

interface Role {
  title: string;
  dates: string;
  location: string;
  summary?: string;
  bullets?: (ResumeBullet | string)[];
}

interface Experience {
  company: string;
  logo: LogoAsset;
  tagline: string;
  roles: Role[];
}

const proof = [
  "Current AI lead for Namefi, with three shipped customer-facing AI products across outbound domain sales, listing discovery, and brand generation.",
  "Founded Yuppies Tech and personally led public enterprise delivery for Airbus Tripset and Mitsubishi Motors Puerto Rico MiAR during COVID-era timelines.",
  "Built Texts.com's production Facebook Messenger channel for an all-in-one messaging product later acquired by Automattic.",
  "Recent GitHub audit showed 2,700+ attributed default-branch commits across 66 accessible repositories since 2021.",
];

const namefiLogo: LogoAsset = {
  alt: "Namefi logo",
  bulletImageClassName: "h-4 w-5",
  imageClassName: "h-5 w-7",
  src: "/resume/logos/namefi.svg",
  tileClassName: "bg-[#0f1714]",
};

const yuppiesLogo: LogoAsset = {
  alt: "Yuppies Tech logo",
  bulletImageClassName: "h-3.5 w-5 translate-y-px",
  imageClassName: "h-4 w-6 translate-y-px",
  src: "/resume/logos/yuppies.svg",
  tileClassName: "bg-[#171220]",
};

const airbusLogo: LogoAsset = {
  alt: "Airbus logo",
  bulletImageClassName: "h-2.5 w-6",
  src: "/resume/logos/airbus.svg",
  tileClassName: "bg-[#17213a]",
};

const mitsubishiLogo: LogoAsset = {
  alt: "Mitsubishi logo",
  bulletImageClassName: "h-4 w-5 -translate-y-0.5",
  src: "/resume/logos/mitsubishi-mark.svg",
  tileClassName: "bg-[#211816]",
};

const zebpayLogo: LogoAsset = {
  alt: "ZebPay logo",
  bulletImageClassName: "h-5 w-5",
  src: "/resume/logos/zebpay-mark.svg",
  tileClassName: "bg-[#12202a]",
};

const textsLogo: LogoAsset = {
  alt: "Texts.com logo",
  bulletImageClassName: "h-7 w-7",
  src: "/resume/logos/texts-icon.png",
  tileClassName: "bg-[#f3f6ff]",
};

const veeraLogo: LogoAsset = {
  alt: "Veera logo",
  bulletImageClassName: "h-4 w-4 translate-y-px",
  src: "/resume/logos/veera.png",
  tileClassName: "bg-[#111111]",
};

const memorangLogo: LogoAsset = {
  alt: "Memorang logo",
  bulletImageClassName: "h-4 w-4 rounded-sm",
  src: "/resume/logos/memorang.svg",
  tileClassName: "bg-white",
};

const experience: Experience[] = [
  {
    company: "Namefi",
    tagline:
      "Domain registrar and marketplace infrastructure with AI-native products for domain owners.",
    logo: namefiLogo,
    roles: [
      {
        title: "Senior Full-Stack Engineer / AI Lead",
        dates: "Dec 2024 - Present",
        location: "Remote",
        bullets: [
          "Lead AI product engineering across Outbound, Brand Studio, and Feed while building core registrar, DNS, payment, checkout, and workflow infrastructure.",
          "Built Namefi Outbound, reducing domain sales research and outreach prep from days/weeks to minutes by automating buyer-fit hypotheses, web research, lead scoring, contact discovery, and editable outreach drafts.",
          "Built Brand Studio, a multi-stage AI branding system that turns domains into buyer-ready logo, poster, and motion concepts with strategist/concept passes, exact domain/TLD rendering constraints, and cinematic animation workflows.",
          "Built Namefi Feed, an MLS-style discovery layer indexing roughly 4,000-5,000 public secondary-market domain listings from X, NamePros, DNForum, and marketplaces into searchable/RSS surfaces.",
          "Built registrar and domain systems across registrar integrations, DNS/DNSSEC, nameservers, ENS/.eth, renewals, payments, checkout, and Temporal-backed long-running workflows.",
        ],
      },
    ],
  },
  {
    company: "Yuppies Tech",
    tagline:
      "Founder-led product engineering consultancy for high-ambiguity client work.",
    logo: yuppiesLogo,
    roles: [
      {
        title: "Founder / Technical Lead",
        dates: "Jan 2021 - Present",
        location: "Mumbai / Remote",
        summary:
          "Founded and led a product engineering consultancy; served as client-facing technical partner and hands-on technical lead across travel, automotive, crypto, messaging, browsers, and AI education.",
        bullets: [
          {
            label: "Memorang",
            logo: memorangLogo,
            text: "Head of CMS for an AI education platform, leading schema-first AI CMS work for Cambridge/TOEFL content, AI-generated questions/media, adaptive practice, scoring workflows, and a JS/Flow to TypeScript/Bun/Biome modernization.",
          },
          {
            label: "Veera Browser",
            logo: veeraLogo,
            text: "led Android Chromium browser delivery from zero to Play Store, owning Chromium/Brave patch management, build/release tooling, rewards/feed/onboarding/search/tabs, privacy/security updates, and later iOS platform setup.",
          },
          {
            label: "Texts.com",
            logo: textsLogo,
            text: "built the production Facebook Messenger channel over undocumented messaging infrastructure, implementing protocol-compatible MQTT/Facebook Thrift handling, encrypted payload support, and feature-parity messaging across sync, groups, attachments, reactions, read receipts, typing, and presence.",
          },
          {
            label: "ZebPay",
            logo: zebpayLogo,
            text: "technical lead for a 10-person embedded team modernizing iOS/Android apps and release infrastructure for one of India's largest crypto exchanges, moving stabilization releases from monthly/bi-monthly to weekly.",
          },
          {
            label: "Mitsubishi Motors",
            logo: mitsubishiLogo,
            text: "tech lead for MiAR virtual dealership and Outlander AR campaign, leading a 3-person team across native iOS/iPadOS, WebAR, optimized 3D vehicles, low-end Android support, bilingual content, and contest/admin workflows.",
          },
          {
            label: "Airbus Tripset",
            logo: airbusLogo,
            text: "solo technical partner to Milkinside for Airbus's public iOS/Android COVID travel companion, building the React Native app and backend aggregation layer over Airbus/Amadeus APIs, CMS-driven travel guidance, and itinerary notifications.",
          },
        ],
      },
    ],
  },
  {
    company: "Kult App",
    tagline: "Consumer beauty and skincare commerce.",
    logo: {
      alt: "Kult logo",
      imageClassName: "h-3.5 w-7",
      src: "/resume/logos/kult.svg",
      tileClassName: "bg-[#211722]",
    },
    roles: [
      {
        title: "Vice President of Tech",
        dates: "Jan 2020 - Dec 2020",
        location: "Mumbai",
        bullets: [
          "Built the first product and technical foundation for a consumer beauty/skincare shopping app from the ground up across AWS, Elixir, Swift, and Kotlin.",
        ],
      },
    ],
  },
  {
    company: "Yilu, Lufthansa Group / BCG Digital Ventures",
    tagline: "Smart travel platform for Lufthansa Group.",
    logo: {
      alt: "Yilu logo",
      imageClassName: "h-4 w-7",
      src: "/resume/logos/yilu.svg",
      tileClassName: "bg-[#101827]",
    },
    roles: [
      {
        title: "Founding Engineer",
        dates: "Nov 2018 - Dec 2019",
        location: "Berlin",
        bullets: [
          "Built native mobile architecture, CI/CD and release automation, Terraform-backed AWS web infrastructure, and iOS/Android features for Eurowings.",
          "Helped hire and structure the initial engineering team through job descriptions, technical tasks, interviews, and Scrum Master responsibilities.",
        ],
      },
    ],
  },
  {
    company: "8fit",
    tagline: "Fitness and nutrition platform, now part of Withings.",
    logo: {
      alt: "8fit logo",
      imageClassName: "h-5 w-7",
      src: "/resume/logos/8fit.svg",
      tileClassName: "bg-[#102018]",
    },
    roles: [
      {
        title: "Senior Technical Architect",
        dates: "Nov 2017 - Oct 2018",
        location: "Berlin",
        bullets: [
          "Architected a hybrid Apple TV fitness app that reached #1 Health & Fitness in Germany and 30+ countries and #7 in the US.",
          "Built cross-platform mobile features across JavaScript, Swift, Objective-C, Java, and Kotlin.",
        ],
      },
    ],
  },
  {
    company: "Housing.com",
    tagline: "Indian real estate search and transaction platform.",
    logo: {
      alt: "Housing.com logo",
      imageClassName: "h-10 w-10",
      src: "/resume/logos/housing-mini.png",
      tileClassName: "bg-[#ffdf30]",
    },
    roles: [
      {
        title: "Team Lead",
        dates: "Oct 2016 - Oct 2017",
        location: "Mumbai",
        bullets: [
          "Led cross-platform mobile architecture and the team transition to React Native, built in-house release/CI/CD systems, and contributed to Housing.com's PWA.",
          "Published the Housing Engineering article 'How We Built Our React Native App' covering architecture, release automation, testing, performance, and team migration.",
        ],
      },
    ],
  },
  {
    company: "Earlier Consulting and Startup Work",
    tagline: "Bridg, 1mg, HornOk, Volkno, Meriad, and self-employed work.",
    logo: {
      alt: "Bridg logo",
      imageClassName: "h-4 w-7 translate-y-px",
      src: "/resume/logos/bridg.svg",
      tileClassName: "bg-[#211916]",
    },
    roles: [
      {
        title: "Software Engineer / Consultant",
        dates: "2015 - 2016",
        location: "Los Angeles / India",
        bullets: [
          "Built startup web/mobile systems across customer-data email tooling, real-time doctor consultation, IoT fleet management, and JavaScript/Java/Ruby on Rails product engineering while studying Computer Science at UCLA.",
        ],
      },
    ],
  },
];

const education = [
  {
    company: "University of California, Los Angeles",
    tagline: "BS, Computer Science and Engineering.",
    logo: {
      alt: "UCLA logo",
      imageClassName: "h-3.5 w-7",
      src: "/resume/logos/ucla.svg",
      tileClassName: "bg-[#2774ae]",
    },
    roles: [
      {
        title: "Computer Science and Engineering",
        dates: "2013 - 2016",
        location: "Los Angeles, CA",
      },
    ],
  },
];

const mutedText = "text-[#78716c] dark:text-[#a8a29e]";
const accentText =
  "text-[#b45309] transition-colors hover:text-[#92400e] dark:text-[#d97706] dark:hover:text-[#f59e0b]";

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

function RoleBlock({ role }: Readonly<{ role: Role }>) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-sm font-medium text-[#292524] dark:text-[#e7e5e4]">
          {role.title}
        </span>
        <span className={`text-xs ${mutedText}`}>
          {role.location} <span aria-hidden="true">·</span> {role.dates}
        </span>
      </div>
      {role.summary === undefined ? null : (
        <p className={`mt-2 text-sm ${mutedText}`}>{role.summary}</p>
      )}
      {role.bullets !== undefined && role.bullets.length > 0 ? (
        <ul className={`mt-2 space-y-1 text-sm ${mutedText}`}>
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

function ExperienceItem({ item }: Readonly<{ item: Experience }>) {
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
              src="https://github.com/f0rr0.png"
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
            <ResumeMobileMenu />
          </div>
        </nav>
      </div>
    </header>
  );
}

export default function ResumePage() {
  return (
    <div
      className={`${literata.variable} ${sourceSans.variable} ${jetBrainsMono.variable} min-h-screen bg-[#faf9f6] text-[#292524] antialiased dark:bg-[#1a1918] dark:text-[#e7e5e4]`}
    >
      <div className="font-[family-name:var(--resume-font-body)]">
        <Header />
        <main className="mx-auto max-w-5xl px-4 pb-20 pt-16 sm:px-8 sm:pt-24 lg:px-12 print:pt-8">
          <header className="max-w-5xl">
            <div className="flex items-center justify-between gap-4">
              <h1 className="font-[family-name:var(--resume-font-heading)] text-4xl font-bold text-[#292524] sm:text-5xl dark:text-[#e7e5e4]">
                Sid Jain
              </h1>
              <ResumePrintButton />
            </div>
          </header>

          <div className="mt-16 max-w-4xl sm:mt-20 print:mt-8">
            <section>
              <p className={`text-sm leading-relaxed ${mutedText}`}>
                Senior Full-Stack Engineer / AI Lead building AI-native products
                and hard production systems from zero to launch. Founded Yuppies
                Tech and personally led technical delivery for Airbus Tripset,
                Mitsubishi Motors Puerto Rico MiAR, ZebPay, Texts.com, Veera
                Browser, and Memorang. Currently leads Namefi AI product
                engineering across Outbound, Brand Studio, and Feed while
                building core registrar, DNS, payments, and workflow
                infrastructure.
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
              <SectionTitle>Selected Proof</SectionTitle>
              <ul className={`mt-4 space-y-4 text-sm italic ${mutedText}`}>
                {proof.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
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
          </div>
        </main>
      </div>
    </div>
  );
}
