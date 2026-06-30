#let accent = rgb("#0f766e")
#let ink = rgb("#171717")
#let muted = rgb("#52525b")
#let rule = rgb("#d4d4d8")

#set document(
  title: "Sid Jain - Resume",
  author: "Sid Jain",
)

#set page(
  paper: "us-letter",
  margin: (top: 0.42in, bottom: 0.45in, left: 0.50in, right: 0.50in),
)

#set text(
  font: "Liberation Sans",
  size: 9.75pt,
  fill: ink,
  lang: "en",
)

#set smartquote(enabled: false)

#set par(
  leading: 0.43em,
  spacing: 0.43em,
  justify: false,
)

#set list(
  indent: 0.18in,
  body-indent: 0.11in,
  spacing: 0.18em,
)

#show link: set text(fill: accent)

#let section(title) = {
  v(0.62em)
  text(size: 8.4pt, weight: "bold", tracking: 0.07em, fill: accent)[#title]
  v(0.08em)
  line(length: 100%, stroke: (paint: rule, thickness: 0.45pt))
  v(0.25em)
}

#let role(title, org, dates, location, body) = {
  v(0.40em)
  block(breakable: false)[
    #grid(
      columns: (1fr, auto),
      gutter: 0.55em,
      text(size: 10.1pt, weight: "bold")[#title],
      align(right)[#text(size: 8.8pt, fill: muted, weight: "bold")[#dates]],
    )
    #text(size: 8.8pt, fill: muted, weight: "bold")[#org#if location != "" [ | #location]]
  ]
  v(0.10em)
  body
}

#let compact-role(title, org, dates, location, body) = {
  v(0.34em)
  block(breakable: false)[
    #grid(
      columns: (1fr, auto),
      gutter: 0.55em,
      text(size: 9.7pt, weight: "bold")[#title],
      align(right)[#text(size: 8.6pt, fill: muted, weight: "bold")[#dates]],
    )
    #text(size: 8.6pt, fill: muted, weight: "bold")[#org#if location != "" [ | #location]]
  ]
  v(0.08em)
  body
}

#align(center)[
  #text(size: 23pt, weight: "bold")[Sid Jain] \
  #text(size: 10.2pt, fill: accent, weight: "bold")[Senior AI Product Engineer / Staff Full-Stack Engineer] \
  #text(size: 8.8pt, fill: muted)[
    Mumbai, India / Remote |
    #link("mailto:sid_26@outlook.com")[sid\_26\@outlook.com] |
    #link("https://linkedin.com/in/f0rr0")[linkedin.com/in/f0rr0] |
    #link("https://github.com/f0rr0")[github.com/f0rr0]
  ]
]

#section("SUMMARY")

Senior Full-Stack Engineer / AI Lead who ships AI-native products and hard production systems from zero to launch. Founded Yuppies Tech and led technical delivery for Airbus, Mitsubishi Motors Puerto Rico, ZebPay, Texts.com, Veera Browser, and Memorang. Currently leading AI product engineering at Namefi across Outbound, Brand Studio, and Feed while building core registrar, DNS, and workflow infrastructure.

#section("SELECTED IMPACT")

- Built *Namefi Outbound*, reducing domain sales research and outreach prep from days/weeks to minutes by automating buyer-fit hypotheses, web research, lead scoring, contact discovery, and editable outreach drafts.
- Built *Brand Studio*, a multi-stage AI branding system that turns domains into buyer-ready logo, poster, and motion concepts with strategist/concept passes, typed design taxonomies, exact domain/TLD rendering constraints, and cinematic/looped/sheet-guided animation workflows.
- Built *Namefi Feed*, an MLS-style discovery layer indexing roughly 4,000-5,000 public secondary-market domain listings from X, NamePros, DNForum, and marketplaces into searchable/RSS surfaces.
- Led a 10-person embedded Yuppies team modernizing ZebPay's iOS/Android apps and release infrastructure, moving stabilization releases from monthly/bi-monthly to weekly.

#section("CORE STRENGTHS")

*AI product engineering:* agentic workflows, AI-native UX, prompt/workflow design, model-backed generation, research and analytics tools. \
*Staff full-stack execution:* TypeScript, React/Next.js, Node.js, APIs, Postgres, backend services, product architecture, CI/CD. \
*Platform and mobile depth:* React Native, Swift, Kotlin, Objective-C, Java, Chromium, release automation, App Store/Play Store delivery. \
*Founder/leadership range:* client-facing technical discovery, technical leadership, roadmap execution, team management, design partnership.

#section("EXPERIENCE")

#role(
  "Senior Full-Stack Engineer / AI Lead",
  "Namefi / D3ServeLabs",
  "Dec 2024 - Present",
  "Remote",
)[
  - Built registrar and domain infrastructure across registrar integrations, DNS/DNSSEC, nameservers, ENS/.eth, renewals, payments, and Temporal-backed long-running workflows.
  - Built internal AI/product analytics surfaces across product usage, search, social, and funnel data, enabling product managers to ask natural-language questions over operating metrics.
]

#role(
  "Founder / Technical Lead",
  "Yuppies Tech",
  "Jan 2021 - Present",
  "Mumbai / Remote",
)[
  - Founded and led a product engineering consultancy; served as client-facing technical partner and hands-on technical lead for enterprise and startup clients across travel, automotive, crypto, messaging, browsers, and AI education.
  - *Airbus Tripset:* solo technical partner to Milkinside for Airbus's public iOS/Android COVID travel companion; built the React Native app and backend aggregation layer over Airbus/Amadeus APIs, CMS-driven travel guidance, and itinerary notifications.
  - *Mitsubishi Motors Puerto Rico / MMSC:* tech lead for MiAR virtual dealership and Outlander AR campaign; led a 3-person team building native iOS/iPadOS and WebAR experiences with optimized 3D vehicles, cross-browser/low-end Android support, bilingual content, and contest/admin workflows.
  - *ZebPay:* technical lead for a 10-person embedded team modernizing iOS/Android apps and release infrastructure for one of India's largest crypto exchanges; shipped exchange, payments, wallet SDK, international KYC, and OTC workflows.
  - *Texts.com:* built the production Facebook Messenger channel over undocumented/private messaging infrastructure, implementing protocol-compatible MQTT/Facebook Thrift handling, encrypted payload support, and feature-parity messaging across sync, groups, attachments, reactions, read receipts, typing, and presence.
  - *Veera Browser:* led Android Chromium browser delivery from zero to Play Store, owning Chromium/Brave patch management, build/release tooling, Play Store delivery, rewards/feed/onboarding/search/tabs, privacy/security updates, and later iOS platform setup.
  - *Memorang:* Head of CMS for an AI education platform; led schema-first AI CMS work for Cambridge/TOEFL content, dynamic question/component types, schema versioning, AI-generated questions/media, adaptive practice, scoring workflows, and a JS/Flow to TypeScript/Bun/Biome modernization.
]

#compact-role(
  "Vice President of Tech",
  "Kult App",
  "Jan 2020 - Dec 2020",
  "Mumbai",
)[
  - Built the first product and technical foundation for a consumer beauty/skincare shopping app from the ground up across AWS, Elixir, Swift, and Kotlin.
]

#compact-role(
  "Founding Engineer",
  "Yilu, Lufthansa Group / BCG Digital Ventures",
  "Nov 2018 - Dec 2019",
  "Berlin",
)[
  - Founding engineer for a Lufthansa Group / BCG DV smart travel platform; built native mobile architecture, CI/CD and release automation, Terraform-backed AWS web infrastructure, iOS/Android features for Eurowings, and helped hire the initial team.
]

#compact-role(
  "Senior Technical Architect",
  "8fit, now part of Withings",
  "Nov 2017 - Oct 2018",
  "Berlin",
)[
  - Architected a hybrid Apple TV fitness app that reached \#1 Health & Fitness in Germany and 30+ countries and \#7 in the US; built cross-platform mobile features across JavaScript, Swift, Objective-C, Java, and Kotlin.
]

#compact-role(
  "Team Lead",
  "Housing.com",
  "Oct 2016 - Oct 2017",
  "Mumbai",
)[
  - Led cross-platform mobile architecture and team transition to React Native, built in-house release/CI/CD systems, contributed to Housing.com's PWA, and published the Housing Engineering article "How We Built Our React Native App."
]

#compact-role(
  "Earlier Consulting and Startup Work",
  "Bridg, 1mg, HornOk, Volkno, Meriad, self-employed",
  "2015 - 2016",
  "Los Angeles / India",
)[
  - Built startup web/mobile systems across customer-data email tooling, real-time doctor consultation, IoT fleet management, and JavaScript/Java/Ruby on Rails product engineering while studying Computer Science at UCLA.
]

#section("SELECTED OPEN SOURCE AND PUBLIC WORK")

- *oliphaunt:* Rust project for embedded Postgres inside apps/tests; 82 stars and 8 forks as of 2026-06-25.
- *react-native-rating:* cross-platform React Native rating component built with Animated and the native driver; 91 stars and 7 forks.
- *How We Built Our React Native App:* public Housing Engineering article covering React Native architecture, release automation, testing, performance, and team migration.

#section("EDUCATION")

*University of California, Los Angeles* - BS, Computer Science and Engineering, 2013 - 2016
