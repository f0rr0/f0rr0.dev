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
  logo: LogoAsset;
  pdfPageBreakBefore?: boolean;
  tagline: string;
  roles: ResumeRole[];
}

export interface ResumeLink {
  href: string;
  label: string;
}

export interface ResumeNavItem extends ResumeLink {
  active?: boolean;
  external?: boolean;
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

export const resumeData = {
  lastUpdated: "2026-07-28",
  person: {
    alternateNames: ["f0rr0", "yuppiestechdev"],
    avatarImage: "/resume/sid-jain-profile-avatar.png",
    email: "sid_26@outlook.com",
    image: "/resume/sid-jain-profile.png",
    location: "Mumbai, India / Remote",
    name: "Sid Jain",
    role: "Applied AI Lead and Senior Full-Stack Engineer",
    targetPositioning:
      "hands-on VP of Engineering, Applied AI Lead, solutions architect, staff full-stack engineer, and founding engineer",
  },
  navItems: [
    { href: "/blog", label: "Blog" },
    { active: true, href: "/resume", label: "Resume" },
    { external: true, href: "https://github.com/f0rr0", label: "GitHub" },
  ] satisfies ResumeNavItem[],
  links: [
    { href: "mailto:sid_26@outlook.com", label: "sid_26@outlook.com" },
    { href: "https://linkedin.com/in/f0rr0", label: "linkedin.com/in/f0rr0" },
    { href: "https://github.com/f0rr0", label: "github.com/f0rr0" },
  ] satisfies ResumeLink[],
  summary:
    "Applied AI Lead and hands-on engineering leader who turns loosely defined customer needs into production systems. Leads customer discovery, technical strategy, teams, architecture, and delivery while remaining directly involved in AI workflow design, evaluation, prototyping, and full-stack implementation across marketplaces, browsers, mobile apps, and infrastructure-heavy products.",
  experience: [
    {
      company: "Namefi",
      tagline:
        "ICANN-accredited registrar building AI products for domain ownership and sales.",
      logo: namefiLogo,
      roles: [
        {
          title: "Lead Applied AI Engineer",
          dates: "Jan 2025 - Present",
          location: "San Francisco Bay Area / Remote",
          markers: ["hands-on"],
          bullets: [
            "Interviewed owners of large domain portfolios and built Namefi Outbound to streamline buyer research, lead scoring, contact discovery, and outreach drafting, reducing sales preparation from days to minutes.",
            "Designed Brand Studio, a multi-stage AI system that creates logos, posters, and motion concepts for domains. It separates strategy, concept generation, and animation while preserving the exact domain name, including its top-level domain.",
            "Built Namefi Feed, which aggregates and structures roughly 4,000 to 5,000 public domain listings from X, forums, and marketplaces, making them searchable on the web and through RSS feeds.",
            "Built production registrar systems for third-party integrations, registration, renewals, payments, checkout, and analytics. Added DNS record and DNSSEC management, nameserver controls, ENS and .eth support, and long-running Temporal workflows.",
          ],
        },
      ],
    },
    {
      company: "Memorang",
      tagline:
        "AI-assisted educational content platform for structured curricula and assessments.",
      logo: memorangLogo,
      roles: [
        {
          title: "Lead Product Engineer, AI Content Platform",
          dates: "Apr 2024 - Jan 2025",
          leadershipScope: "Managed 3 developers",
          location: "San Francisco Bay Area / Remote",
          markers: ["hands-on", "leadership"],
          bullets: [
            "Built EdWrite, a graph-based headless CMS that represents Cambridge and TOEFL curricula and assessment requirements in versioned schemas exposed through content APIs.",
            "Designed human-in-the-loop workflows that let subject-matter experts generate, review, and manage complete question sets with supporting audio and images. Also built adaptive practice and scoring, plus semantic recommendations for related media.",
            "Managed a three-developer CMS team and owned its roadmap, coordinating with backend, frontend, and mobile teams while working directly with the CTO and CEO.",
            "Led the gradual migration of a large Flow-typed JavaScript monorepo to TypeScript, introducing Bun, Biome, codemods, and AI-assisted refactoring.",
          ],
        },
      ],
    },
    {
      company: "Yuppies Tech",
      tagline: "Product engineering consultancy for complex client products.",
      logo: yuppiesLogo,
      roles: [
        {
          title: "Founder & Technical Director",
          dates: "Jan 2021 - Apr 2024",
          leadershipScope: "Led a 15-engineer team",
          location: "Mumbai / Remote",
          markers: ["hands-on", "leadership"],
          summary:
            "Founded and grew Yuppies Tech to 15 engineers while remaining the client-facing technical lead. Turned unclear requirements into architecture, delivery plans, and production releases.",
          bullets: [
            {
              label: "Veera Browser",
              logo: veeraLogo,
              text: "led a Chromium-based Android browser from initial architecture through Play Store launch, owning upstream patch management, release tooling, product features, and privacy updates. Later established the iOS platform and release setup.",
            },
            {
              label: "Texts",
              logo: textsLogo,
              text: "built a production Facebook Messenger integration by reverse-engineering undocumented protocols, then implemented encrypted messaging, synchronization, groups, attachments, reactions, read receipts, typing indicators, and presence.",
            },
            {
              label: "ZebPay",
              logo: zebpayLogo,
              text: "led modernization of ZebPay's iOS and Android apps, release infrastructure, exchange and payment features, and international KYC. During stabilization, increased the release cadence from every two weeks to weekly.",
            },
            {
              label: "Mitsubishi Motors",
              logo: mitsubishiLogo,
              text: "led MiAR, a remote dealership experience delivered through native iOS and iPadOS apps plus WebAR. Shipped optimized 3D vehicle models, support for lower-end Android devices, bilingual content, and contest-administration tooling.",
            },
            {
              label: "Airbus Tripset",
              logo: airbusLogo,
              text: "owned end-to-end technical delivery of Airbus Tripset, a public iOS and Android travel companion launched during COVID. Built the React Native app and backend services that combined Airbus and Amadeus APIs, CMS-managed travel guidance, itinerary data, and notifications.",
            },
          ],
        },
      ],
    },
    {
      company: "Kult",
      tagline: "Consumer beauty and skincare commerce.",
      logo: kultLogo,
      roles: [
        {
          title: "Vice President of Engineering",
          dates: "Jan 2020 - Jan 2021",
          leadershipScope: "Led a 10-engineer team",
          location: "Mumbai",
          markers: ["hands-on", "leadership"],
          bullets: [
            "Led a 10-engineer team and owned Kult's zero-to-one product and engineering strategy, covering an AWS-hosted Elixir backend and native iOS and Android apps.",
            "Architected both apps and contributed directly in Swift and Kotlin while establishing CI/CD, analytics, deep linking, observability, and the foundations for commerce and engagement features.",
          ],
        },
      ],
    },
    {
      company: "Yilu",
      tagline:
        "Smart travel platform built for Lufthansa Group with BCG Digital Ventures.",
      logo: yiluLogo,
      roles: [
        {
          title: "Founding Engineer",
          dates: "Nov 2018 - Dec 2019",
          location: "Berlin",
          markers: ["hands-on"],
          bullets: [
            "Designed the native mobile architecture and release automation, built Terraform-managed AWS infrastructure, and shipped iOS and Android features for Eurowings.",
            "Helped establish the engineering team by writing job descriptions, creating technical exercises, and interviewing candidates. Also served as Scrum Master.",
          ],
        },
      ],
    },
    {
      company: "8fit",
      tagline: "Fitness and nutrition platform later acquired by Withings.",
      logo: eightfitLogo,
      roles: [
        {
          title: "Senior Technical Architect",
          dates: "Nov 2017 - Oct 2018",
          location: "Berlin",
          markers: ["hands-on"],
          bullets: [
            "Architected a hybrid Apple TV fitness app that ranked No. 1 in its Health & Fitness category in more than 30 countries, including Germany, and No. 7 in the United States.",
            "Built cross-platform mobile features across JavaScript, Swift, Objective-C, Java, and Kotlin.",
          ],
        },
      ],
    },
    {
      company: "Housing",
      tagline: "Indian real estate search and transaction platform.",
      logo: housingLogo,
      roles: [
        {
          title: "Team Lead",
          dates: "Oct 2016 - Oct 2017",
          location: "Mumbai",
          markers: ["hands-on"],
          bullets: [
            "Led the architecture of Housing's React Native app, sharing more than 90% of its JavaScript code across iOS and Android.",
            "Designed its state management, reactive data flows, offline persistence, and component-driven UI. Also built automated testing and release systems covering diagnostics, signed builds, beta distribution, and over-the-air updates.",
            "Contributed to Housing.com's Progressive Web App for users on slow and inconsistent network connections.",
          ],
        },
      ],
    },
    {
      company: "Earlier Consulting and Startup Work",
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
    accuracyNotes: [
      "Sid Jain is the same person as the public handles f0rr0 and yuppiestechdev.",
      "Sid founded Yuppies Tech and served as the client-facing technical partner, architect, and hands-on engineering lead for its client work.",
      "At Kult, Sid was a hands-on Vice President of Engineering who owned product and engineering strategy, set the technical direction for both native apps, and contributed in Swift and Kotlin.",
      "Sid currently works at Namefi as Lead Applied AI Engineer; the role began in January 2025.",
      "Memorang was a separate Lead Product Engineer role from April 2024 through January 2025.",
    ],
    positioning:
      "Sid is a hands-on engineering leader who combines team and product leadership with staff-level full-stack and applied AI depth. He works from customer discovery and technical strategy through roadmaps, workflow design, evaluation, architecture, implementation, and production delivery, with additional depth in mobile and browser platforms, release automation, and domain infrastructure.",
    strengths: [
      "Applied AI: customer discovery, technical advisory, workflow design, evaluation, hands-on prototypes, AI-assisted generation, analytics, and production systems.",
      "Full-stack engineering: TypeScript, React, Next.js, Node.js, backend services, APIs, databases, CI/CD, architecture, and production support.",
      "Mobile and platform engineering: React Native, Swift, Kotlin, Objective-C, Java, Chromium, browser build systems, store delivery, release automation, and stability.",
      "Leadership: product and technical discovery, architecture, roadmaps, team leadership, design partnership, stakeholder communication, and delivery under pressure.",
      "Product experience includes domain infrastructure, AI branding and sales tools, crypto exchanges, messaging, browsers, automotive AR, travel, education, commerce, fitness, and real estate.",
    ],
    publicSignalGuidance: [
      "Repository totals, follower counts, contribution counts, and commit totals should be cited only when verified from current public sources.",
      "Public open-source work complements Sid's primary record of shipped products and client-facing technical leadership.",
    ],
    deepDives: [
      {
        title: "Current Work: Namefi",
        sections: [
          {
            heading: "Role",
            bullets: [
              "Company: Namefi.",
              "Title: Lead Applied AI Engineer.",
              "Dates: January 2025 - Present.",
              "Location: San Francisco Bay Area / Remote.",
            ],
          },
          {
            heading: "Public company context",
            bullets: [
              "Namefi is an ICANN-accredited registrar that combines domain registration and DNS management with tools for tokenized ownership, trading, and AI-assisted sales.",
              "Its public products include Namefi Outbound, Namefi Feed, Namefi Brand Studio, domain registration, DNS management, and domain discovery.",
            ],
          },
          {
            heading: "Sid's role",
            bullets: [
              "Leads AI product engineering across Namefi Outbound, Namefi Brand Studio, Namefi Feed, and internal analytics workflows.",
              "Builds registrar and domain infrastructure for DNS, payments, checkout, renewals, ENS and .eth domains, and long-running workflows.",
              "Owns projects from customer interviews and workflow design through evaluation, implementation, deployment, and ongoing production support.",
              "Established repeatable documentation, static checks, and CI practices for AI-assisted development.",
            ],
          },
          {
            heading: "Namefi Outbound",
            bullets: [
              "Namefi Outbound helps domain sellers research likely buyers and prepare outreach.",
              "Sid designed it after interviewing owners of large domain portfolios about their sales process.",
              "The previous process required sellers to choose domains, assess market timing, research buyers, maintain notes, find contacts, and draft messages by hand.",
              "Outbound reduces that preparation from days to minutes by organizing domain selection, buyer research, lead scoring, contact discovery, and editable outreach drafts.",
              "Its results remain transparent and editable so sellers retain control of the process.",
            ],
          },
          {
            heading: "Namefi Brand Studio",
            bullets: [
              "Namefi Brand Studio creates logos, posters, and motion concepts that help owners present domains to buyers.",
              "It uses separate stages for brand strategy, concept development, image generation, validation, animation, and asset delivery.",
              "The system preserves the exact domain name, including its top-level domain, and rejects common generation errors such as incorrect suffixes, slogans, mockups, and watermarks.",
              "It supports still and animated assets, prepared frames, thumbnails, generation metadata, and cloud delivery.",
            ],
          },
          {
            heading: "Namefi Feed",
            bullets: [
              "Namefi Feed collects roughly 4,000 to 5,000 public domain listings from X, NamePros, DNForum, marketplaces, and other public sources.",
              "It extracts and standardizes domains, sellers, sources, prices, currencies, and other listing details.",
              "Buyers can search the listings or follow them through RSS instead of monitoring many forums, marketplaces, and social feeds.",
            ],
          },
          {
            heading: "Core registrar and domain infrastructure",
            bullets: [
              "Built third-party registrar integrations and systems for domain registration, renewal, checkout, payments, DNS records, DNSSEC, nameserver management, and ENS and .eth support.",
              "Led the migration from Airflow-style DAGs to Temporal for stateful, long-running processes, then applied Temporal to AI and operational workflows.",
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
              "Title: Lead Product Engineer, AI Content Platform.",
              "Dates: April 2024 - January 2025.",
              "Location: San Francisco Bay Area / Remote.",
            ],
          },
          {
            heading: "Context and role",
            bullets: [
              "EdWrite is a graph-based headless CMS for structured educational content and AI-assisted content production.",
              "Sid led product engineering for EdWrite, managed three developers, worked directly with the CTO and CEO, and coordinated with backend, frontend, and mobile teams.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "Translated Cambridge and TOEFL curricula and assessment requirements into versioned schemas exposed through content APIs.",
              "Modeled exam sections, question types, content groups, scoring, and adaptive practice as configurable structures.",
              "Designed human-in-the-loop workflows for subject-matter experts to generate, review, and manage complete question sets with supporting audio and images.",
              "Built schema versioning so content and question formats could evolve without breaking existing client apps or backend services.",
              "Built adaptive practice flows that track scores, identify weak areas, and recommend personalized material.",
              "Built recommendations for supporting media using metadata embeddings and vector similarity search across products.",
              "Led the gradual migration of a large Flow-typed JavaScript monorepo to TypeScript, introducing Bun, Biome, codemods, and AI-assisted refactoring.",
            ],
          },
        ],
      },
      {
        title: "Yuppies Tech",
        sections: [
          {
            heading: "Role",
            bullets: [
              "Company: Yuppies Tech.",
              "Title: Founder & Technical Director.",
              "Dates: January 2021 - April 2024.",
              "Location: Mumbai / Remote.",
            ],
          },
          {
            heading: "Company context",
            bullets: [
              "Yuppies Tech is a product engineering consultancy founded by Sid.",
              "Sid grew and led a 15-engineer team while remaining directly involved in architecture and implementation.",
              "As the client-facing technical partner, he led technical discovery, architecture, feasibility, and delivery in collaboration with design and product teams.",
            ],
          },
          {
            heading: "General value",
            bullets: [
              "Led enterprise and startup engagements across travel, automotive, crypto, messaging, and browsers.",
              "Turned unclear business and product requirements into practical architectures, delivery plans, and production releases.",
              "Led delivery on compressed COVID-era timelines while navigating App Store and Play Store requirements, browser and device compatibility issues, and legacy-code modernization.",
              "Worked directly with founders, executives, product and engineering leaders, designers, marketers, and QA teams.",
              "Used design systems and design reviews to keep implementation aligned with product design.",
            ],
          },
        ],
      },
      {
        title: "Yuppies Client Work: Veera Browser",
        sections: [
          {
            heading: "Context and role",
            bullets: [
              "Veera is a Chromium-based browser focused on speed, privacy, ad blocking, and browsing rewards.",
              "Sid led the Android browser from initial development through its Play Store launch.",
              "He later established the iOS platform and release setup.",
              "He worked directly with engineering leadership, founders, product, design, marketing, and QA.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "Built and maintained the Android browser as a managed patch stack over upstream Chromium, incorporating selected privacy and security changes from Brave.",
              "Owned changes across the C++ and Java codebases, build configuration, and product assets.",
              "Established build and release processes, Play Store delivery, stability monitoring, QA coordination, and a regular update cadence.",
              "Built product features for onboarding, authentication, rewards, search, tab management, and a syndicated news feed.",
              "Enabled near-instant app-layer UI iteration that otherwise required four-to-six-hour full builds.",
              "Reduced clean release builds to roughly two hours with compiler caching, reusable build artifacts, separate build lanes, and architecture-specific variants.",
            ],
          },
        ],
      },
      {
        title: "Yuppies Client Work: Texts",
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
              "The integration shipped as a production channel in Texts.",
            ],
          },
        ],
      },
      {
        title: "Yuppies Client Work: ZebPay",
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
              "During stabilization, increased the release cadence from every two weeks to weekly.",
            ],
          },
        ],
      },
      {
        title: "Yuppies Client Work: Mitsubishi Motors",
        sections: [
          {
            heading: "Context and role",
            bullets: [
              "Mitsubishi Motors Puerto Rico commissioned MiAR, a virtual dealership and Outlander augmented-reality campaign.",
              "Sid was the client-facing technical lead and owned discovery, feasibility, architecture, implementation planning, and release delivery.",
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
              "Supported bilingual content in English and Brazilian Portuguese.",
              "Worked directly with a WebAR SDK vendor to resolve browser and device compatibility issues.",
              "Optimized the web experience for lower-end Android devices and mobile-browser constraints in the Puerto Rico market.",
            ],
          },
        ],
      },
      {
        title: "Yuppies Client Work: Airbus Tripset",
        sections: [
          {
            heading: "Context and role",
            bullets: [
              "Airbus Tripset was a public travel companion designed to help passengers navigate COVID-era travel restrictions and find airport guidance.",
              "Sid owned end-to-end technical delivery for Yuppies Tech and worked with Milkinside, the project's design and client-communication lead.",
              "He delivered the mobile app, backend services, integrations, and releases.",
            ],
          },
          {
            heading: "Major work and impact",
            bullets: [
              "Built the React Native app for iOS and Android.",
              "Built backend services that combined Airbus and Amadeus APIs, CMS-managed travel guidance, and other travel data.",
              "Included itinerary entry, flight and airport data, delay alerts, travel restrictions, airport guidance, and notifications.",
              "Designed the backend so the app did not depend directly on multiple third-party services.",
              "Delivered the public travel product globally on a compressed COVID-era timeline.",
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
              "Title: Vice President of Engineering.",
              "Dates: January 2020 - January 2021.",
              "Location: Mumbai.",
            ],
          },
          {
            heading: "VP Engineering scope",
            bullets: [
              "Kult is a consumer beauty and skincare commerce product.",
              "As Vice President of Engineering, Sid owned the zero-to-one product and engineering strategy for its AWS-hosted Elixir backend and native iOS and Android apps.",
              "He led a 10-engineer team across backend and mobile development.",
              "He translated the product vision into a technical roadmap, system architecture, and platform investments, then coordinated delivery.",
              "He set the technical direction for both mobile apps while contributing directly in Swift and Kotlin.",
            ],
          },
          {
            heading: "Architecture and hands-on delivery",
            bullets: [
              "Architected both native apps, defining their project structure, shared product patterns, and platform conventions.",
              "Established CI/CD, release systems, environment configuration, analytics, deep linking, Bugsnag observability, and third-party SDK integrations for iOS and Android.",
              "Implemented app features across catalog discovery and filtering, product details, accounts, theming, Kult Kafe, and stories.",
            ],
          },
        ],
      },
    ] satisfies DeepDive[],
    roleFit: {
      strongFit: [
        "Hands-on VP of Engineering or Head of Engineering roles that combine team leadership, technical strategy, and direct architectural involvement.",
        "Applied AI leadership and solutions architecture roles that combine customer discovery, evaluation, prototyping, and production deployment.",
        "AI product engineering roles focused on reliable production workflows.",
        "Staff-level full-stack roles spanning frontend, backend, infrastructure, CI/CD, and product architecture.",
        "Founding engineering roles that require product partnership, customer discovery, architecture, and hands-on implementation.",
        "Teams integrating AI into regulated, operational, or infrastructure-heavy products.",
      ],
      inaccurateAs: [],
    },
    publicReferences: [
      {
        href: "https://namefi.io/",
        label: "Namefi",
        note: "Current company and public product.",
      },
      {
        href: "https://namefi.io/feed",
        label: "Namefi Feed",
        note: "Public domain-listing discovery product.",
      },
      {
        href: "https://memorang.com/products/edwrite",
        label: "Memorang EdWrite",
        note: "Graph-based headless CMS for educational content.",
      },
      {
        href: "https://www.airbus.com/en/newsroom/stories/2021-03-tripset-the-companion-app-that-helps-air-travellers-navigate-during-covid",
        label: "Airbus Tripset story",
        note: "Public Airbus story about Tripset.",
      },
      {
        href: "https://www.airbus.com/en/newsroom/press-releases/2021-03-airbus-launches-tripset-companion-app-to-ease-passenger-travel",
        label: "Airbus Tripset press release",
        note: "Public Airbus press release about Tripset.",
      },
      {
        href: "https://www.mitsubishimotors.pr/nosotros/noticias/mitsubishi-presenta-ganadores-photocontest-miar",
        label: "Mitsubishi Motors Puerto Rico MiAR Outlander Photo Contest",
        note: "Public Mitsubishi Motors Puerto Rico page about the MiAR Outlander Photo Contest.",
      },
      {
        href: "https://texts.com/",
        label: "Texts",
        note: "Public page describing the transition from Texts to Beeper.",
      },
      {
        href: "https://techcrunch.com/2023/10/24/wordpress-com-owner-buys-all-in-one-messaging-app-texts-com-for-50m/",
        label: "TechCrunch on Automattic acquiring Texts.com",
        note: "Public acquisition context.",
      },
      {
        href: "https://play.google.com/store/apps/details?id=com.veera.browser",
        label: "Veera Browser on Google Play",
        note: "Public Android app listing.",
      },
      {
        href: "https://indianexpress.com/article/technology/tech-reviews/veera-browser-review-9170896/",
        label: "Indian Express Veera Browser review",
        note: "Public product context for Veera Browser.",
      },
      {
        href: "https://gildehealthcare.com/news/all/gilde-healthcare-portfolio-withings-acquires-leading-health-and-fitness-app-8fit/",
        label: "Withings acquisition of 8fit",
        note: "Public announcement of Withings acquiring 8fit.",
      },
      {
        href: "https://github.com/f0rr0",
        label: "GitHub profile: f0rr0",
        note: "Public code and open-source profile.",
      },
    ] satisfies PublicReference[],
  },
  openSource: [
    {
      href: "https://github.com/f0rr0/oliphaunt",
      label: "oliphaunt",
      note: "Rust library for running embedded PostgreSQL inside applications and tests.",
    },
    {
      href: "https://github.com/f0rr0/react-native-rating",
      label: "react-native-rating",
      note: "Cross-platform React Native rating component built with Animated and the native driver.",
    },
    {
      href: "https://medium.com/engineering-housing/how-we-built-our-react-native-app-3380a33811ac",
      label: "How We Built Our React Native App",
      note: "Primary-source account of Housing's shared React Native architecture, performance work, testing stack, and automated mobile release pipeline.",
    },
  ] satisfies PublicReference[],
  pdf: {
    generatedTypstPath: "career/generated/sid-jain-resume-dark.typ",
    outputPath: "public/resume/sid-jain-resume.pdf",
    title: "Sid Jain Resume",
  },
} as const;
