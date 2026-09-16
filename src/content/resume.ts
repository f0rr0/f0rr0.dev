import { githubAccounts } from "./site";

export interface LogoAsset {
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

export type ResumeRoleMarker = "hands-on" | "leadership";

export const resumeRoleMarkerLabels = {
  "hands-on": "Hands-on",
  leadership: "Leadership",
} satisfies Record<ResumeRoleMarker, string>;

export type ResumeCompanyStage =
  | "zero-to-one"
  | "early-stage"
  | "growth-stage"
  | "scale-up"
  | "late-stage";

export const resumeCompanyStageLabels = {
  "zero-to-one": "0 → 1",
  "early-stage": "Early-stage",
  "growth-stage": "Growth-stage",
  "scale-up": "Scale-up",
  "late-stage": "Late-stage",
} satisfies Record<ResumeCompanyStage, string>;

export interface ResumeRole {
  title: string;
  dates: string;
  leadershipScope?: string;
  location: string;
  markers?: ResumeRoleMarker[];
  summary?: string;
  bullets?: (ResumeBullet | string)[];
}

export interface ResumeExperience {
  company: string;
  url?: string;
  compactName?: string;
  displayName?: string;
  companyStage?: ResumeCompanyStage;
  logo: LogoAsset;
  pdfPageBreakBefore?: boolean;
  tagline: string;
  roles: ResumeRole[];
}

export interface ResumeLink {
  href: string;
  label: string;
}

export interface PublicReference extends ResumeLink {
  note: string;
}

interface DeepDiveSection {
  heading: string;
  bullets: string[];
}

interface DeepDive {
  title: string;
  sections: DeepDiveSection[];
}

const namefiLogo: LogoAsset = {
  alt: "Namefi logo",
  bulletImageClassName: "h-4 w-5",
  imageClassName: "h-5 w-7",
  src: "/resume/logos/namefi.png",
  tileClassName: "bg-[#0f1714]",
};

const yuppiesLogo: LogoAsset = {
  alt: "Yuppies Tech logo",
  bulletImageClassName: "h-3.5 w-5 translate-y-px",
  imageClassName: "h-4 w-6 translate-y-px",
  src: "/resume/logos/yuppies.png",
  tileClassName: "bg-[#171220]",
};

const airbusLogo: LogoAsset = {
  alt: "Airbus logo",
  bulletImageClassName: "h-2.5 w-6",
  src: "/resume/logos/airbus.png",
  tileClassName: "bg-[#17213a]",
};

const mitsubishiLogo: LogoAsset = {
  alt: "Mitsubishi logo",
  bulletImageClassName: "h-4 w-5 -translate-y-0.5",
  src: "/resume/logos/mitsubishi-mark.png",
  tileClassName: "bg-[#211816]",
};

const zebpayLogo: LogoAsset = {
  alt: "ZebPay logo",
  bulletImageClassName: "h-5 w-5",
  src: "/resume/logos/zebpay-mark.png",
  tileClassName: "bg-[#12202a]",
};

const textsLogo: LogoAsset = {
  alt: "Texts.com logo",
  bulletImageClassName: "h-5 w-5",
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
  src: "/resume/logos/memorang.png",
  tileClassName: "bg-white",
};

const kultLogo: LogoAsset = {
  alt: "Kult logo",
  imageClassName: "h-3.5 w-7",
  src: "/resume/logos/kult.png",
  tileClassName: "bg-[#211722]",
};

const yiluLogo: LogoAsset = {
  alt: "Yilu logo",
  imageClassName: "h-4 w-7",
  src: "/resume/logos/yilu.png",
  tileClassName: "bg-[#101827]",
};

const eightfitLogo: LogoAsset = {
  alt: "8fit logo",
  imageClassName: "h-5 w-7",
  src: "/resume/logos/8fit.png",
  tileClassName: "bg-[#102018]",
};

const housingLogo: LogoAsset = {
  alt: "Housing.com logo",
  imageClassName: "h-10 w-10",
  src: "/resume/logos/housing-mini.png",
  tileClassName: "bg-[#ffdf30]",
};

const bridgLogo: LogoAsset = {
  alt: "Bridg logo",
  imageClassName: "h-4 w-7 translate-y-px",
  src: "/resume/logos/bridg.png",
  tileClassName: "bg-[#211916]",
};

const uclaLogo: LogoAsset = {
  alt: "UCLA logo",
  imageClassName: "h-3.5 w-7",
  src: "/resume/logos/ucla.png",
  tileClassName: "bg-[#2774ae]",
};

const dpsLogo: LogoAsset = {
  alt: "Delhi Public School R. K. Puram logo",
  imageClassName: "h-9 w-7",
  src: "/resume/logos/dps-rk-puram.png",
  tileClassName: "bg-[#016b2f]",
};

const linkedInUsername = "f0rr0";
const githubProfiles = githubAccounts.map(({ login }) => ({
  network: "GitHub",
  username: login,
  url: `https://github.com/${login}`,
}));
const [githubProfile] = githubProfiles;
if (githubProfile === undefined) {
  throw new Error("Configure a public GitHub account in src/content/site.ts.");
}
export const primaryGitHubProfile = githubProfile;
export const socialProfiles = [
  ...githubProfiles,
  {
    network: "LinkedIn",
    username: linkedInUsername,
    url: `https://linkedin.com/in/${linkedInUsername}`,
  },
];

const person = {
  profiles: socialProfiles,
  avatarImage: "/resume/sid-jain-profile-avatar.png",
  email: "sid_26@outlook.com",
  image: "/resume/sid-jain-profile.png",
  location: "Based in Mumbai",
  address: { city: "Mumbai", region: "Maharashtra", countryCode: "IN" },
  name: "Sid Jain",
  role: "Senior Full-Stack Engineer",
  targetPositioning:
    "senior full-stack engineer, frontend-focused product engineer, and AI product engineer",
};

export const resumeData = {
  lastUpdated: "2026-09-06",
  person: {
    ...person,
    alternateNames: [
      ...new Set(socialProfiles.map(({ username }) => username)),
    ],
  },
  navItems: [
    { href: "/writing", label: "Writing" },
    { href: "/work", label: "Work" },
    { href: "/journey", label: "Journey" },
  ] satisfies ResumeLink[],
  links: [
    { href: `mailto:${person.email}`, label: person.email },
    ...socialProfiles
      .filter(
        (profile, index, profiles) =>
          profiles.findIndex((other) => other.network === profile.network) ===
          index
      )
      .map(({ url }) => ({ href: url, label: url.replace("https://", "") })),
  ] satisfies ResumeLink[],
  summary:
    "Senior full-stack engineer based in Mumbai with 10+ years in web and mobile product engineering, and production experience building AI applications.",
  skills: [
    "TypeScript",
    "React",
    "Node.js",
    "PostgreSQL",
    "Next.js",
    "Hono",
    "Redis",
    "AWS CDK",
    "React Native",
    "Vercel AI SDK",
    "Mastra",
    "LangGraph",
    "LangChain",
    "Temporal",
    "Trigger.dev",
    "Chromium",
    "CI/CD",
  ],
  experience: [
    {
      company: "Namefi",
      companyStage: "early-stage",
      tagline:
        "ICANN-accredited registrar building AI products for domain ownership and sales.",
      logo: namefiLogo,
      roles: [
        {
          title: "Senior Full Stack Engineer",
          dates: "Jan 2025 - Present",
          location: "Mumbai / Remote",
          markers: ["hands-on"],
          bullets: [
            "Built Namefi Outbound, an AI tool that finds potential domain buyers and their contact details, then drafts outreach messages. Reduced this work from days to about five minutes per domain.",
            "Led migration to a new monorepo with Next.js, Hono, and shared developer tooling. Built server-rendered and statically generated pages, Privy/wallet authentication, domain registration, checkout, and payment integrations.",
            "Replaced Airflow with Temporal for domain operations; built Temporal workflows for listing ingestion and Namefi Studio’s logo and video generation.",
            "Used traces and evals to reduce repeated buyer searches through progressive model escalation and shared evidence; reused completed model results on retry to avoid duplicate spend.",
            "Built an internal analytics agent with Vercel AI SDK tools for Google Analytics, Twitter Analytics, and PostHog; integrated Exa search. Developed AI usage metering.",
          ],
        },
      ],
    },
    {
      company: "Memorang",
      companyStage: "growth-stage",
      tagline:
        "AI-assisted educational content platform for structured curricula and assessments.",
      logo: memorangLogo,
      roles: [
        {
          title: "Lead Full Stack Engineer",
          dates: "Apr 2024 - Jan 2025",
          leadershipScope: "Led 2 engineers",
          location: "Mumbai / Remote",
          markers: ["hands-on", "leadership"],
          bullets: [
            "Built EdWrite’s CMS backend, TanStack Table data grid, and shared UI components with designers.",
            "Versioned content schemas so exam formats could evolve without breaking client apps or services; defined TOEFL schemas with ETS subject-matter experts.",
            "Shipped a media recommender using embeddings and pgvector similarity search, with LangChain self-querying to generate metadata filters from natural-language queries.",
            "Built AI-assisted question, audio, and image generation with expert review and publishing approval.",
            "Led two CMS engineers and a Flow-to-TypeScript migration using codemods and AI-assisted refactoring.",
          ],
        },
      ],
    },
    {
      company: "Yuppies Tech",
      displayName: "Product engineering engagements",
      tagline: "Client work through Yuppies Tech.",
      logo: yuppiesLogo,
      roles: [
        {
          title: "Self-employed",
          dates: "Jan 2021 - Apr 2024",
          location: "Mumbai / Remote",
          markers: ["hands-on", "leadership"],
          summary:
            "Full-stack and mobile engineering with client product teams and their CTOs or engineering leads.",
          bullets: [
            {
              label: "Veera Browser",
              logo: veeraLogo,
              text: "led a Chromium-based Android browser through Play Store launch, maintaining C++ and Java patches, upstream updates, and release tooling. Later established the iOS platform and release setup.",
            },
            {
              label: "Texts",
              logo: textsLogo,
              text: "shipped the Facebook Messenger integration in TypeScript and Electron; reverse-engineered Messenger’s undocumented interfaces and implemented MQTT transport, typed Thrift codecs, message synchronization, and media handling.",
            },
            {
              label: "ZebPay",
              logo: zebpayLogo,
              text: "modernized iOS and Android apps and release pipelines; shipped exchange and payment features, wallet integrations, and country-specific KYC.",
            },
            {
              label: "Mitsubishi Motors",
              logo: mitsubishiLogo,
              text: "built MiAR’s native iOS and iPadOS apps and React WebAR experience, optimizing 3D vehicle assets for mobile devices and building photo-contest tooling.",
            },
            {
              label: "Airbus Tripset",
              logo: airbusLogo,
              text: "built the React Native app and backend integrating Airbus and Amadeus APIs, travel guidance, itineraries, and notifications, with Milkinside as design partner.",
            },
          ],
        },
      ],
    },
    {
      company: "Kult",
      companyStage: "zero-to-one",
      tagline: "Consumer beauty and skincare commerce.",
      logo: kultLogo,
      roles: [
        {
          title: "Head of Mobile Engineering",
          dates: "Jan 2020 - Jan 2021",
          leadershipScope: "Led 10 engineers",
          location: "Mumbai",
          markers: ["hands-on", "leadership"],
          bullets: [
            "Led 10 mobile engineers building native Android and iOS apps in Kotlin and Swift, working with product and interaction designers.",
            "Designed backend-driven UI architecture for dynamic layouts and rich animations; built and optimized product-listing and product-detail screens.",
            "Defined API contracts with backend engineers and established mobile CI/CD, analytics, deep linking, and error monitoring.",
          ],
        },
      ],
    },
    {
      company: "Yilu",
      companyStage: "zero-to-one",
      tagline:
        "Smart travel platform built for Lufthansa Group with BCG Digital Ventures.",
      logo: yiluLogo,
      roles: [
        {
          title: "Founding Engineer",
          dates: "Nov 2018 - Dec 2019",
          leadershipScope: "Led a five-developer full-stack pod",
          location: "Berlin",
          markers: ["hands-on", "leadership"],
          bullets: [
            "Designed the native mobile architecture and release automation, built Terraform-managed AWS infrastructure, and shipped iOS and Android features for Eurowings.",
            "Joined as the first engineering hire; led a five-developer full-stack team and partnered with the CTO on hiring.",
          ],
        },
      ],
    },
    {
      company: "8fit",
      companyStage: "growth-stage",
      tagline: "Fitness and nutrition platform later acquired by Withings.",
      logo: eightfitLogo,
      roles: [
        {
          title: "Senior Software Engineer",
          dates: "Nov 2017 - Oct 2018",
          location: "Berlin",
          markers: ["hands-on"],
          bullets: [
            "Architected a hybrid Apple TV fitness app.",
            "Built cross-platform mobile features across JavaScript, Swift, Objective-C, Java, and Kotlin.",
          ],
        },
      ],
    },
    {
      company: "Housing",
      companyStage: "late-stage",
      tagline: "Indian real estate search and transaction platform.",
      logo: housingLogo,
      roles: [
        {
          title: "Software Development Engineer II",
          dates: "Oct 2016 - Oct 2017",
          location: "Mumbai",
          markers: ["hands-on"],
          bullets: [
            "Led Housing’s React Native app architecture, sharing JavaScript across iOS and Android.",
            "Designed its state management, reactive data flows, offline persistence, and component-driven UI. Also built automated testing and release systems covering diagnostics, signed builds, beta distribution, and over-the-air updates.",
            "Contributed to Housing.com's Progressive Web App for users on slow and inconsistent network connections.",
          ],
        },
      ],
    },
    {
      company: "Earlier Consulting and Startup Work",
      compactName: "Bridg",
      tagline: "Bridg, 1mg, HornOk, Volkno, Meriad, and self-employed work.",
      logo: bridgLogo,
      roles: [
        {
          title: "Software Engineer and Consultant",
          dates: "2015 - 2016",
          location: "Los Angeles / India",
          markers: ["hands-on"],
          bullets: [
            "Built web and mobile products for email and customer-data tools, real-time medical consultations, and connected fleet management using JavaScript, Java, and Ruby on Rails.",
            "Mentored 1mg's mobile team on hybrid app architecture and modern development tooling.",
          ],
        },
      ],
    },
  ] satisfies ResumeExperience[],
  education: [
    {
      company: "University of California, Los Angeles",
      url: "https://www.ucla.edu/",
      tagline: "Bachelor of Science.",
      logo: uclaLogo,
      roles: [
        {
          title: "Computer Science and Engineering",
          dates: "2013 - 2016",
          location: "Los Angeles, CA",
        },
      ],
    },
    {
      company: "Delhi Public School, R. K. Puram",
      url: "https://dpsrkp.net/",
      tagline: "High School.",
      logo: dpsLogo,
      roles: [
        {
          title: "Computer Science, Physics, Chemistry, Math",
          dates: "2011 - 2013",
          location: "New Delhi, India",
        },
      ],
    },
  ] satisfies ResumeExperience[],
  machineReadable: {
    agentNotes: [
      "Career progression: frontend and mobile depth expanded into full-stack product work before the recent AI work. Yilu’s AWS/Terraform infrastructure and Airbus Tripset’s app and backend are earlier examples.",
      "Work arrangement: Product engineering engagements (2021–2024) were self-employed work through Yuppies Tech. Veera, Texts, ZebPay, Mitsubishi Motors, and Airbus Tripset were clients within that period, not separate employers.",
      "Technical focus: the AI work is application engineering with model APIs, retrieval, tool calling, evaluation, and multi-step workflows. Namefi also includes web/backend foundations, authentication, and commerce systems.",
      "Titles: Senior Full-Stack Engineer is the overall profile label. Use the employer-specific titles when describing individual jobs.",
      "Source selection: use the résumé and career detail for Sid’s contributions, his articles and repositories for implementation reasoning, and company pages for product context. The Work page describes recent code activity.",
    ],
    strengths: [
      "Full-stack: TypeScript, React, Next.js, Hono, Node.js, PostgreSQL, APIs, authentication, and release tooling.",
      "Frontend and mobile: CMS component systems, TanStack Table, React Native, Swift, Kotlin, and backend-driven mobile UI.",
      "AI applications: Vercel AI SDK tool calling, LangChain self-querying, pgvector retrieval, multi-step generation, and model-judged evaluation.",
      "Engineering leadership: led two CMS engineers at Memorang and 10 mobile engineers at Kult; worked directly with client CTOs and engineering leads during self-employed engagements.",
    ],
    deepDives: [
      {
        title: "Current Work: Namefi",
        sections: [
          {
            heading: "Role",
            bullets: [
              "Company: Namefi.",
              "Title: Senior Full Stack Engineer.",
              "Dates: January 2025 - Present.",
              "Location: Mumbai / Remote.",
            ],
          },
          {
            heading: "Product",
            bullets: [
              "Namefi is an ICANN-accredited registrar that combines domain registration and DNS management with tools for tokenized ownership, trading, and AI-assisted sales.",
            ],
          },
          {
            heading: "Sid's role",
            bullets: [
              "Led migration of existing products into a new monorepo and established developer tooling, a Next.js app using server-side rendering, static generation, and client-side rendering, and a Hono backend.",
              "Built frontend features and the initial Privy and wallet authentication implementation.",
              "Established Vercel AI SDK integrations, including Exa tool calling.",
              "Built an internal analytics agent with custom tools querying Google Analytics, Twitter Analytics, and PostHog.",
              "Developed AI usage metering.",
              "Established repeatable documentation, static checks, and CI practices for AI-assisted development.",
            ],
          },
          {
            heading: "Namefi Outbound",
            bullets: [
              "Built Namefi Outbound to research potential domain buyers and prepare outreach, cutting buyer research from days to about five minutes per domain.",
              "Interviewed roughly 40–50 domain sellers about researching tens to hundreds of potential buyers per domain: identifying companies, assessing their ability to buy, finding contacts, and drafting outreach.",
              "Sid built model-judged evals for buyer fit, name and product similarity, and decision-maker contact quality, then validated outputs through seller reports covering hundreds of prospective buyers.",
              "Used traces and evals to reduce repeated buyer searches through progressive model escalation and shared evidence.",
              "Reused completed model results across retries to avoid duplicate spend.",
              "Its results remain transparent and editable so sellers retain control of the process.",
            ],
          },
          {
            heading: "Namefi Studio",
            bullets: [
              "Built Namefi Studio’s multi-step logo and video generation workflows, with support for posters, website mockups, and motion concepts.",
              "Its Temporal workflows separate brand strategy, concept development, generation, review, and asset delivery, with multiple approaches to producing video.",
              "Prompt constraints and manual side-by-side visual review assess domain and top-level-domain fidelity alongside overall output quality.",
              "It supports still and animated assets, prepared frames, thumbnails, generation metadata, and cloud delivery.",
            ],
          },
          {
            heading: "Namefi Feed",
            bullets: [
              "Built Namefi Feed’s listing-ingestion and AI-classification workflows, aggregating domains for sale from X, NamePros, DNForum, Namefi, and other public sources.",
              "Its Temporal-backed ingestion and AI-classification system extracts and standardizes domains, sellers, sources, prices, currencies, and other listing details while handling concurrent scans, retries, price verification, and auditable outcomes.",
              "Buyers can search the listings or follow them through RSS instead of monitoring many forums, marketplaces, and social feeds.",
            ],
          },
          {
            heading: "Core registrar and domain infrastructure",
            bullets: [
              "Built third-party registrar integrations and systems for domain registration, checkout, payments, and analytics.",
              "Replaced Airflow-backed orchestration with declarative, testable Temporal workflows, then expanded the pattern across stateful AI and operational workflows.",
            ],
          },
        ],
      },
      {
        title: "Memorang",
        sections: [
          {
            heading: "Role",
            bullets: [
              "Company: Memorang.",
              "Title: Lead Full Stack Engineer.",
              "Dates: April 2024 - January 2025.",
              "Location: Mumbai / Remote.",
            ],
          },
          {
            heading: "Context and role",
            bullets: [
              "EdWrite is a production CMS and content API for structured educational content and AI-assisted content creation.",
              "Sid built CMS backend services and UI, including a TanStack Table data grid and shared components developed with designers.",
              "Led two CMS engineers; planned scope and architecture with the CTO and weekly priorities with the CEO.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "Translated Cambridge and TOEFL curricula and assessment requirements into versioned schemas exposed through content APIs.",
              "Worked with TOEFL/ETS subject-matter experts on exam content schemas as part of his Memorang role.",
              "Modeled exam sections, question types, content groups, scoring, and adaptive practice as configurable structures.",
              "Built AI-assisted workflows for generating question sets with supporting audio and images, with subject-matter-expert review and publishing approval.",
              "Initial subject-matter-expert review calibrated model-based evals, while client subject-matter experts retained final publishing control.",
              "Built schema versioning so content and question formats could evolve without breaking existing client apps or backend services.",
              "Built adaptive practice flows that track scores, identify weak areas, and recommend personalized material.",
              "Shipped a media recommender inside the CMS using embeddings and pgvector similarity search. LangChain self-querying converted natural-language queries into a retrieval query and metadata filters.",
              "Led a Flow-to-TypeScript migration using codemods and AI-assisted refactoring.",
            ],
          },
        ],
      },
      {
        title: "Product engineering engagements (Yuppies Tech)",
        sections: [
          {
            heading: "Role",
            bullets: [
              "Contracting company: Yuppies Tech.",
              "Work arrangement: self-employed product engineering engagements.",
              "Dates: January 2021 - April 2024.",
              "Location: Mumbai / Remote.",
            ],
          },
          {
            heading: "Engineering scope",
            bullets: [
              "Sid worked directly with client product teams as a hands-on full-stack and mobile engineer, partnering with CTOs and engineering leads.",
              "He also hired and led engineers to support these engagements while continuing implementation work himself.",
              "Client engagements included Veera, Texts, ZebPay, Mitsubishi Motors, and Airbus Tripset.",
            ],
          },
        ],
      },
      {
        title: "Client engagement: Veera Browser",
        sections: [
          {
            heading: "Context and role",
            bullets: [
              "Veera is a Chromium-based browser focused on speed, privacy, ad blocking, and browsing rewards.",
              "Sid led the Android browser from initial development through its Play Store launch.",
              "He later established the iOS platform and release setup.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "Built and maintained the Android browser as a managed patch stack over upstream Chromium, incorporating selected privacy and security changes from Brave.",
              "Owned changes across the C++ and Java codebases, build configuration, and product assets.",
              "Established build and release processes, Play Store delivery, stability monitoring, QA coordination, and a regular update cadence.",
              "Built product features for onboarding, authentication, rewards, search, tab management, and a syndicated news feed.",
              "Separated app-layer UI iteration from full Chromium builds and used compiler caching, reusable artifacts, and architecture-specific build variants.",
            ],
          },
        ],
      },
      {
        title: "Client engagement: Texts",
        sections: [
          {
            heading: "Context and role",
            bullets: [
              "Texts was an all-in-one messaging client later acquired by Automattic in 2023.",
              "Sid built the production Facebook Messenger channel integration.",
              "He worked in its TypeScript and Electron codebase and collaborated directly with the founding product team.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "Reverse-engineered undocumented service interfaces to build a Messenger-compatible channel.",
              "Implemented MQTT transport, Facebook Thrift serialization, and typed encoding and decoding tools for TypeScript.",
              "Implemented encrypted payload handling, message synchronization, sending, and receiving.",
              "Implemented threads, groups, attachments, photos, videos, files, reactions, read receipts, typing indicators, and presence.",
              "Used Ghidra, Burp Suite, Frida, certificate unpinning, runtime inspection, and Facebook's white-hat program during protocol research.",
            ],
          },
        ],
      },
      {
        title: "Client engagement: ZebPay",
        sections: [
          {
            heading: "Context and role",
            bullets: [
              "ZebPay was one of India's largest crypto exchanges at the time of the engagement.",
              "Sid was the client-facing technical lead for iOS and Android modernization.",
              "He worked with ZebPay's Head of Product, Head of QA, and Head of Engineering.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "Modernized legacy iOS and Android codebases to restore release velocity and reduce instability.",
              "Removed App Store and Play Store submission blockers caused by outdated target versions and platform requirements.",
              "Built CI/CD and release pipelines that made releases more reliable.",
              "Shipped exchange and payment features, wallet SDK integrations, and support for new coin and token launches.",
              "Built over-the-counter workflows for high-net-worth traders and localized KYC processes.",
              "Implemented country-specific document handling, media capture, identity verification, integrations such as IDfy, and secure document access.",
            ],
          },
        ],
      },
      {
        title: "Client engagement: Mitsubishi Motors",
        sections: [
          {
            heading: "Context and role",
            bullets: [
              "Mitsubishi Motors Puerto Rico commissioned MiAR, a virtual dealership and Outlander augmented-reality campaign.",
              "Sid led MiAR’s technical implementation across native apps and WebAR.",
              "He coordinated with stakeholders in Puerto Rico and Japan.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "During COVID, Mitsubishi wanted customers to explore vehicles remotely as dealership visits declined.",
              "Built native iOS and iPadOS augmented-reality apps and a companion React-based WebAR experience.",
              "Optimized 3D vehicle models for delivery on mobile devices and the web.",
              "Implemented vehicle placement, interior views, interactive doors and trunks, feature inspection, and photo capture.",
              "Built contest-administration tooling for the Outlander AR photo campaign.",
              "Worked directly with a WebAR SDK vendor to resolve browser and device compatibility issues.",
              "Optimized the web experience for lower-end Android devices and mobile-browser constraints in the Puerto Rico market.",
            ],
          },
        ],
      },
      {
        title: "Client engagement: Airbus Tripset",
        sections: [
          {
            heading: "Context and role",
            bullets: [
              "Airbus Tripset was a public travel companion designed to help passengers navigate COVID-era travel restrictions and find airport guidance.",
              "Sid owned end-to-end technical delivery for Yuppies Tech and worked with Milkinside, the project's design and client-communication lead.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "Built the React Native app for iOS and Android.",
              "Built backend services that combined Airbus and Amadeus APIs, CMS-managed travel guidance, and other travel data.",
              "Included itinerary entry, flight and airport data, delay alerts, travel restrictions, airport guidance, and notifications.",
              "Designed the backend so the app did not depend directly on multiple third-party services.",
            ],
          },
        ],
      },
      {
        title: "Kult",
        sections: [
          {
            heading: "Role",
            bullets: [
              "Company: Kult.",
              "Title: Head of Mobile Engineering.",
              "Dates: January 2020 - January 2021.",
              "Location: Mumbai.",
            ],
          },
          {
            heading: "Mobile engineering scope",
            bullets: [
              "Kult is a consumer beauty and skincare commerce product.",
              "As Head of Mobile Engineering, Sid led 10 Android and iOS engineers and collaborated with product and interaction designers.",
              "He partnered with backend engineers to define scalable API contracts across both platforms.",
            ],
          },
          {
            heading: "Architecture and hands-on delivery",
            bullets: [
              "Set the architecture for native Kotlin/Android and Swift/iOS apps with backend-driven layouts and rich animations.",
              "Established CI/CD, release systems, environment configuration, analytics, deep linking, Bugsnag observability, and third-party SDK integrations for iOS and Android.",
              "Contributed directly to animation-heavy product-listing and product-detail experiences and resolved performance bottlenecks.",
            ],
          },
        ],
      },
    ] satisfies DeepDive[],
    publicReferences: [
      {
        href: "https://namefi.io/",
        label: "Namefi",
        note: "Domain registrar and AI tools for domain sellers.",
      },
      {
        href: "https://namefi.io/feed",
        label: "Namefi Feed",
        note: "Searchable domain listings aggregated from marketplaces, forums, and social feeds.",
      },
      {
        href: "https://namefi.io/r/en/blog/progressive-ai-buyer-discovery-method",
        label: "Progressive AI buyer discovery — Sid Jain at Namefi",
        note: "Sid’s technical account of progressive model escalation, evidence reuse, evaluation, and a single-domain cost benchmark.",
      },
      {
        href: "https://memorang.com/products/edwrite",
        label: "Memorang EdWrite",
        note: "CMS for structured educational content and AI-assisted authoring.",
      },
      {
        href: "https://www.airbus.com/en/newsroom/stories/2021-03-tripset-the-companion-app-that-helps-air-travellers-navigate-during-covid",
        label: "Airbus Tripset story",
        note: "Airbus’s account of the travel companion and its passenger workflows.",
      },
      {
        href: "https://www.airbus.com/en/newsroom/press-releases/2021-03-airbus-launches-tripset-companion-app-to-ease-passenger-travel",
        label: "Airbus Tripset press release",
        note: "Airbus’s announcement of Tripset’s launch.",
      },
      {
        href: "https://www.mitsubishimotors.pr/nosotros/noticias/mitsubishi-presenta-ganadores-photocontest-miar",
        label: "Mitsubishi Motors Puerto Rico MiAR Outlander Photo Contest",
        note: "Mitsubishi’s Outlander AR photo campaign using MiAR.",
      },
      {
        href: "https://texts.com/",
        label: "Texts",
        note: "The messaging product’s transition to Beeper.",
      },
      {
        href: "https://techcrunch.com/2023/10/24/wordpress-com-owner-buys-all-in-one-messaging-app-texts-com-for-50m/",
        label: "TechCrunch on Automattic acquiring Texts.com",
        note: "Coverage of Automattic’s acquisition of Texts.",
      },
      {
        href: "https://play.google.com/store/apps/details?id=com.veera.browser",
        label: "Veera Browser on Google Play",
        note: "Chromium-based Android browser.",
      },
      {
        href: "https://indianexpress.com/article/technology/tech-reviews/veera-browser-review-9170896/",
        label: "Indian Express Veera Browser review",
        note: "Review of Veera’s Android browsing experience.",
      },
      {
        href: "https://gildehealthcare.com/news/all/gilde-healthcare-portfolio-withings-acquires-leading-health-and-fitness-app-8fit/",
        label: "Withings acquisition of 8fit",
        note: "Announcement of Withings’s acquisition of the fitness and nutrition app.",
      },
      {
        href: primaryGitHubProfile.url,
        label: `GitHub profile: ${primaryGitHubProfile.username}`,
        note: "Source code and open-source projects.",
      },
    ] satisfies PublicReference[],
  },
  openSource: [
    {
      href: "https://namefi.io/r/en/blog/progressive-ai-buyer-discovery-method",
      label:
        "How We Cut AI Buyer Discovery Cost by 85%: Start Lean, Escalate With Evidence",
      note: "Progressive model escalation, evidence reuse, trace-driven evaluation, and a single-domain cost benchmark.",
    },
    {
      href: "https://github.com/f0rr0/thrift-compact-protocol",
      label: "thrift-compact-protocol",
      note: "TypeScript encoder and decoder for Thrift’s compact protocol.",
    },
    {
      href: "https://github.com/f0rr0/oliphaunt",
      label: "oliphaunt",
      note: "Embedded PostgreSQL tooling for applications and tests.",
    },
    {
      href: "https://github.com/f0rr0/react-native-rating",
      label: "react-native-rating",
      note: "Cross-platform React Native rating component built with Animated and the native driver.",
    },
    {
      href: "https://medium.com/engineering-housing/how-we-built-our-react-native-app-3380a33811ac",
      label: "How We Built Our React Native App",
      note: "Housing’s React Native architecture, performance work, testing, and automated mobile releases.",
    },
  ] satisfies PublicReference[],
  pdf: {
    title: `${person.name} Resume`,
  },
} as const;
