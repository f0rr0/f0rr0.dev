# Sid Jain - Work History Reconstruction

Generated on 2026-06-26.

## Scope

This document reconstructs Sid Jain's recent work across GitHub, attached resumes, public sources, and user-supplied project context. It is source material for a resume aimed at AI product engineer / AI lead, staff full-stack engineer, and founding engineer roles.

The core positioning is:

> AI product engineer and staff-level full-stack builder who takes ambiguous products from zero to production, combines hands-on implementation with client/founder-facing technical leadership, and has unusual depth across AI workflows, TypeScript product systems, mobile, browser/platform work, release infrastructure, and domain/DNS systems.

## Inputs Used

- Attached `resume.pdf` and `Resume-Sid-Jain-2.pdf`.
- Public profile signals for `linkedin.com/in/f0rr0`.
- Authenticated GitHub access for both `f0rr0` and `yuppiestechdev`.
- Public GitHub profile and public repositories for `f0rr0`.
- Private repository inspection for recent Namefi/D3ServeLabs and Yuppies Tech work.
- Public sources for Airbus Tripset, Mitsubishi Motors Puerto Rico MiAR, Texts.com, Veera Browser, Memorang, Namefi, and the Housing Engineering React Native article.
- User interview notes captured in this thread.

## Evidence Boundaries

- GitHub counts are from repositories accessible to authenticated accounts on 2026-06-25/26.
- Commit counts use default-branch commit attribution for `f0rr0` and `yuppiestechdev` since 2021-01-01. This is conservative and can miss squash merges, non-default branch work, unlinked commit emails, and work outside GitHub.
- Private repository evidence is used only to support public-safe summaries. Resume language should avoid unreleased internal names and code details.
- Low-star or unreleased open-source experiments are intentionally excluded from the resume unless directly relevant to a specific role. Meaningful public work can be kept as selected signals.
- TaxNodes is intentionally omitted from the resume per user preference.

## Quantitative GitHub Summary

- Accessible repositories across both authenticated accounts: 294.
- Non-fork repositories pushed since 2021-01-01: 146.
- Repositories with attributed default-branch commits since 2021-01-01: 66.
- Attributed default-branch commits since 2021-01-01: 2,767.

Recent non-fork repositories by owner:

| Owner             | Repos |
| ----------------- | ----: |
| d3servelabs       |    83 |
| f0rr0             |    41 |
| yuppiestech       |    16 |
| Ruchika1001       |     2 |
| yuppiestechdev    |     2 |
| lakshyaag12       |     1 |
| saurabhkhandelwal |     1 |

Attributed commits by owner since 2021-01-01:

| Owner          | Commits |
| -------------- | ------: |
| d3servelabs    |   1,754 |
| f0rr0          |     825 |
| yuppiestech    |     161 |
| Ruchika1001    |      21 |
| yuppiestechdev |       6 |

Attributed commits by primary repository language since 2021-01-01:

| Language                       | Commits |
| ------------------------------ | ------: |
| TypeScript                     |   2,421 |
| HTML / MDX-heavy content repos |     104 |
| Objective-C                    |      86 |
| Swift                          |      55 |
| Rust                           |      41 |
| CSS                            |      13 |
| Shell                          |      11 |
| Kotlin                         |       9 |
| JavaScript                     |       8 |
| Java                           |       5 |
| Python                         |       3 |
| Ruby                           |       1 |

GitHub contribution collections also show substantial private/restricted contribution volume: `f0rr0` had 2,223 calendar contributions in 2025 and 1,568 in 2026 through Jun 25, while `yuppiestechdev` had 719 calendar contributions in 2022.

## Recent High-Signal Work

### Namefi / D3ServeLabs - Senior Full-Stack Engineer / AI Lead, Dec 2024 - Present

Namefi should be presented as a separate current role, not only as a Yuppies Tech client project. The strongest story is that Sid is leading AI product engineering while also owning deep full-stack registrar/DNS infrastructure.

Evidence:

- 83 recent non-fork repositories under `d3servelabs`.
- 1,754 attributed commits under `d3servelabs` since 2021-01-01.
- Largest attributable repos include `namefi-astra` and `labs-leadgenai`, both private TypeScript systems.
- Public Namefi surfaces include Outbound, Feed, and Brand Studio.
- Private code inspection confirms substantial product and workflow systems around registrar operations, DNS management, marketplace/feed ingestion, AI lead generation, logo/brand generation, animation generation, analytics/MCP tooling, and Temporal workflows.

High-value workstreams:

1. **Namefi Outbound**
   - Customer-facing product for domain sellers.
   - Built from customer interviews with large domain portfolio owners.
   - Replaces manual workflows that took days to weeks for a few domains: selecting sellable domains, analyzing trends, researching buyer fit, maintaining spreadsheets/CRM notes, finding key personnel, buying external contact data, and drafting outreach.
   - Product automates domain quality framing, buyer hypotheses, web research, lead scoring, contact discovery, and editable outreach drafts.
   - Resume-safe impact: "reduced domain sales research and outreach prep from days/weeks to minutes."

2. **Namefi Brand Studio**
   - Customer-facing AI branding product that turns a bare domain into buyer-ready logo, poster, and motion concepts.
   - Current main-branch code shows a stateful, multi-stage AI system rather than a simple image prompt.
   - Logo workflow: strategist pass, typed logo concept parsing, constrained image generation, S3/CloudFront asset delivery, model/token metadata.
   - Logo controls include logo type, style, text treatment, typography, foreground/background treatments, exact domain/TLD rendering constraints, and strong negative constraints against wrong TLDs, slogans, mockups, and watermarks.
   - Animation workflow supports cinematic, looped, and sheet-guided modes, each with strategy generation, motion presets/intensity, prepared frames/safe margins, video generation, thumbnails, and optional animation sheets.
   - Resume-safe value: "multi-stage AI branding system that turns domains into buyer-ready visual assets for landers, outreach, and marketplace presentation."

3. **Namefi Feed**
   - Customer-facing discovery layer for domain buyers.
   - User supplied scale: roughly 4,000-5,000 indexed listings.
   - Aggregates secondary-market domain sale activity from channels such as X, NamePros, DNForum, and marketplaces.
   - Code confirms source ingestion, listing extraction, seller/source tracking, price/currency handling, public APIs/RSS, admin workflows, digest workflows, and AI-assisted listing logos.
   - Resume-safe value: "MLS-style domain-sale discovery layer."

4. **Core registrar, DNS, and workflow infrastructure**
   - Full-stack work across registrar integrations, domain registration/renewal, DNS records, DNSSEC, nameserver management, ENS/.eth support, payments, checkout, and backend workflow orchestration.
   - Led migration of stateful long-running processing from Airflow-style DAGs to Temporal workflows and reused the workflow platform for AI and operational systems.
   - This provides staff-level credibility beyond AI demos: Sid can ship real infrastructure and AI products inside the same production system.

5. **AI engineering operating model**
   - Built more than features: helped define the company's AI development thesis and made the repo more agent-ready through documentation, reusable skills/README patterns, codified design and engineering principles, static checks, CI, and end-to-end guardrails.
   - Useful in interviews; resume should mention only if space allows.

Resume translation:

- "Senior Full-Stack Engineer / AI Lead for Namefi, leading AI product engineering across Outbound, Brand Studio, and Feed while building core registrar/DNS/workflow infrastructure."
- "Built Namefi Outbound, reducing domain sales research and outreach prep from days/weeks to minutes by automating buyer-fit hypotheses, web research, lead scoring, contact discovery, and editable outreach drafts."
- "Built Brand Studio, a multi-stage AI branding system with strategist/concept passes, typed design taxonomies, exact domain/TLD rendering constraints, asset delivery, and cinematic/looped/sheet-guided animation workflows."
- "Built Namefi Feed, an MLS-style discovery layer indexing roughly 4,000-5,000 public secondary-market domain listings into searchable/RSS surfaces with seller/source/price extraction."
- "Built core registrar and DNS systems across registrar integrations, DNS/DNSSEC, nameservers, ENS/.eth, renewals, payments, checkout, and Temporal workflows."

### Yuppies Tech - Founder / Technical Lead, 2021 - Present

Yuppies Tech is a technical consulting company founded by Sid. The resume should frame it as a founder-led product engineering consultancy where Sid personally operated as the technical owner or technical lead for client projects, rather than listing generic technologies.

Recommended framing:

> Founded and led Yuppies Tech, a product engineering consultancy; served as client-facing technical partner and hands-on technical lead for enterprise and startup clients across travel, automotive, crypto, messaging, browsers, and AI education.

#### Airbus Tripset

Public source: Airbus Tripset was announced in March 2021 as an iOS/Android companion app to help air travelers navigate COVID-era travel restrictions, airport guidance, and trip information.

User context:

- Worked with Milkinside, which owned design and client communications.
- Sid/Yuppies was the technical partner and Sid was the only person on the technical implementation side.
- Built the React Native iOS/Android app and backend aggregation layer.
- Integrated Airbus and Amadeus APIs, CMS-driven COVID/travel guidance, backend data fetching, and itinerary-related notifications.
- Main challenge: emergency COVID timeline, global airport/flight coverage, reliable data sources, and shipping quickly for a public travel product.

Resume translation:

- "Solo technical partner to Milkinside for Airbus Tripset, a public iOS/Android COVID travel companion; built the React Native app and backend aggregation layer over Airbus/Amadeus APIs, CMS-driven travel guidance, and itinerary notifications."

#### Mitsubishi Motors Puerto Rico / MMSC MiAR

Public source: Mitsubishi Motors Puerto Rico promoted MiAR and the Outlander Photo Contest.

User context:

- Client was Mitsubishi Motors Puerto Rico/MMSC, with coordination across Puerto Rico stakeholders and Mitsubishi's Japanese team.
- Business problem: COVID reduced dealership footfall, so Mitsubishi needed customers to experience new vehicles from home.
- Product: AR virtual dealership / MiAR experience plus Outlander photo contest.
- Sid owned technical discovery/feasibility, client-facing technical conversations, AR architecture, native iOS/iPadOS AR work, React/WebAR experience, 3D model optimization, releases/deployments, and coordination with the WebAR SDK vendor.
- Managed two additional engineers: one backend, one frontend.
- Important constraints: low-end Android/browser compatibility in Puerto Rico, optimized 3D assets, bilingual support in English and PT-BR Portuguese, and polished design implementation.

Resume translation:

- "Tech lead for Mitsubishi Motors Puerto Rico's MiAR virtual dealership and Outlander AR campaign; led a 3-person team building native iOS/iPadOS and WebAR experiences with optimized 3D vehicles, cross-browser/low-end Android support, bilingual content, and contest/admin workflows."

#### ZebPay

User context:

- ZebPay was one of India's largest crypto exchanges at the time.
- Legacy iOS/Android apps had technical debt, instability, low target OS/App Store submission blockers, and slow release velocity.
- Sid served as client-facing technical lead for both mobile apps and worked with ZebPay's Head of Product, Head of QA, and Head of Engineering.
- Yuppies team size was about 10 engineers, split across Android and iOS.
- Work included app modernization, app-store blocker cleanup, CI/CD and release pipeline, stability work, exchange features, coin/token launch support, payments, wallet SDK integrations, and OTC/international KYC workflows.
- Release cadence improved from monthly/bi-monthly to weekly during stabilization, later settling around twice monthly depending on feature scope.
- KYC/OTC work included country-specific document workflows, video/facial recognition, document/audio/video ingestion, and third-party KYC integrations such as IDfy.

GitHub evidence:

- 11 accessible ZebPay-related repos under `yuppiestech`, including iOS, Android, KYC client, KYC admin, KYC backend, comm service, mailers, web revamp, design system, and multiplatform repos.
- 131 all-time attributed commits in 2022 across ZebPay repos, led by `zebpay-ios`.

Resume translation:

- "Technical lead for a 10-person embedded Yuppies team modernizing iOS/Android apps and release infrastructure for one of India's largest crypto exchanges; moved stabilization releases from monthly/bi-monthly to weekly and shipped exchange, payments, wallet SDK, international KYC, and OTC workflows."

#### Texts.com

Public source: Texts.com was acquired by Automattic in 2023.

User context:

- Built the Facebook Messenger channel integration for Texts.com, an all-in-one messaging client.
- User requested softer public wording; use "protocol-compatible Messenger channel over undocumented/private messaging infrastructure."
- Work involved a TypeScript/Electron product and an end-to-end Messenger-compatible client.
- Deep technical work included analyzing Messenger Android, MQTT and Facebook Thrift protocol behavior, encrypted payload handling, typed Thrift encode/decode tooling, sync, sends, groups, rich attachments, reactions, read receipts, typing indicators, and presence.
- Tools used during research included Ghidra, Burp Suite, Frida, certificate unpinning, runtime method inspection, and Facebook's white-hat program.
- Worked directly with Kishan/founding team. Messenger was a must-have channel used by paying users.

Resume translation:

- "Built Texts.com's production Facebook Messenger channel over undocumented/private messaging infrastructure, implementing protocol-compatible MQTT/Facebook Thrift handling, encrypted payload support, and feature-parity messaging across sync, groups, attachments, reactions, read receipts, typing, and presence."

#### Veera Browser

Public source: Veera is a browser app positioned around privacy, speed, rewards, and an Indian/global browser audience.

User context:

- Built the Android Chromium-based browser from zero to Play Store, later helped repeat the platform/release story for iOS.
- Worked directly with the CTO/head of engineering, design, product, marketing, founders, and QA.
- Yuppies team: Sid plus one engineer on Android app-level features.
- Owned Chromium/Brave patch-stack architecture, build/release tooling, Play Store releases, stability/monitoring, QA coordination, security/privacy update management, app-level product features, design-system consistency, and design QA.
- Maintained vanilla Chromium plus patches across C++, Java, build systems, assets, Brave security patches, onboarding, feed, rewards, search, tab system, login/signup, and product flows.
- Major build-system result: full clean builds previously took 4-6 hours; after ccache/sccache, debug/release lanes, architecture-specific variants, and developer workflow changes, app-facing UI iteration became near-instant and clean release builds dropped to roughly 2 hours.

Resume translation:

- "Led Veera's Android Chromium browser from zero to Play Store, owning Chromium/Brave patch management, build/release tooling, Play Store delivery, rewards/feed/onboarding/search/tabs, privacy/security updates, and later iOS platform setup."
- "Reduced browser build iteration from 4-6 hour full builds to near-instant app-layer iteration and roughly 2-hour clean release builds through caching, debug/release lanes, and architecture-specific build variants."

#### Memorang

Public source: Memorang positions itself around AI education, tutoring, adaptive learning, and content generation.

User context:

- Joined as an individual embedded engineer, later became Head of CMS.
- Worked directly with CTO Red and CEO Yermi.
- Later managed two CMS team members and coordinated with services, frontend, and app teams.
- Backend work included an AI media recommendation system using metadata embeddings and vector similarity search across product media.
- Modernized a large JS/Flow monorepo, roughly half a million lines and hundreds of apps/packages, toward TypeScript, Bun, and Biome using codemods.
- Led AI-native CMS work for Cambridge/TOEFL learning products.
- Built schema-first content modeling for TOEFL-style exams, dynamic question/component types, schema versioning, AI generation of questions and companion media, practice scoring, weak-spot tracking, and adaptive practice material.

Resume translation:

- "Head of CMS for Memorang's AI education platform; led schema-first AI CMS work for Cambridge/TOEFL content, including dynamic question/component types, schema versioning, AI-generated questions/media, adaptive practice, and scoring workflows."
- "Built an AI media recommendation system with embeddings/vector search and helped modernize a roughly 500k LOC JS/Flow monorepo toward TypeScript/Bun/Biome."

## Earlier Experience From Attached Resumes

### Kult App - Vice President of Tech, Jan 2020 - Dec 2020

- Built product and technology foundation for a consumer beauty/skincare shopping app.
- Owned early architecture across AWS, Elixir, Swift, and Kotlin.
- Good resume compression: one bullet under earlier experience unless applying to consumer commerce/mobile roles.

### Yilu - Founding Engineer, Nov 2018 - Dec 2019

- Lufthansa Group company incubated with BCG Digital Ventures Berlin.
- Helped hire initial technical team, laid down mobile architecture, built CI/CD/release infrastructure, shipped Eurowings iOS/Android work, and managed AWS public web infrastructure with Terraform.
- Strong founding-engineer signal; keep compressed but visible.

### 8fit - Senior Technical Architect, Nov 2017 - Oct 2018

- Architected hybrid Apple TV app that reached #1 Health & Fitness in Germany and 30+ countries and #7 in the US.
- Keep as one strong metric bullet.

### Housing.com - Team Lead, Oct 2016 - Oct 2017

- Led cross-platform mobile architecture and team transition to React Native.
- Built in-house release/CI/CD.
- Published public Housing Engineering article on React Native architecture and release pipeline.
- Strong mobile/platform signal; keep compressed.

### Earlier Consulting and Startup Work, 2015 - 2016

- Bridg: WYSIWYG email creation app for customer data platform.
- 1mg: cross-platform iOS/Android real-time doctor consultation apps and team mentoring.
- HornOk: founding engineer for IoT heavy-vehicle fleet management systems.
- Self-employed startup consulting in Los Angeles while at UCLA.
- Resume compression: one bullet only.

## Selected Public Work

Use only meaningful public work:

| Project                     | Signal                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `f0rr0/oliphaunt`           | Rust project for embedded Postgres inside apps/tests; 82 stars, 8 forks as of 2026-06-25.         |
| `f0rr0/react-native-rating` | React Native component; 91 stars, 7 forks. Strong mobile/React Native signal.                     |
| Housing Engineering article | Public architecture write-up with concrete React Native architecture and release tooling details. |

Do not feature low-star recent experiments, forks, or unreleased projects as headline achievements.

## Resume Strategy

The resume should not lead with generic technology lists. It should lead with product and execution leverage:

- Current Namefi role: AI product engineering plus core registrar/DNS/workflow systems.
- Yuppies Tech: founder-led technical consulting with named client project outcomes.
- Earlier experience: compressed into credibility signals, not equal weight.
- Open source: selected only where it has meaningful traction or supports a target role.

Recommended headline:

> Senior Full-Stack Engineer / AI Lead

Recommended summary:

> AI product engineer, staff-level full-stack builder, and founder/operator who has shipped AI-native products, domain/registrar infrastructure, Chromium browser work, native mobile apps, and enterprise client products from zero to production. Founded Yuppies Tech and led delivery for Airbus, Mitsubishi Motors Puerto Rico, ZebPay, Texts.com, Veera Browser, and Memorang. At Namefi, leads AI product engineering across Outbound, Brand Studio, and Feed while building core registrar/DNS/workflow systems.

## Sources

- LinkedIn: https://linkedin.com/in/f0rr0
- GitHub profile: https://github.com/f0rr0
- GitHub profile: https://github.com/yuppiestechdev
- Airbus Tripset: https://www.airbus.com/en/newsroom/stories/2021-03-tripset-the-companion-app-that-helps-air-travellers-navigate-during-covid
- Mitsubishi Motors Puerto Rico MiAR / photo contest: https://www.mitsubishimotors.pr/nosotros/noticias/mitsubishi-presenta-ganadores-photocontest-miar
- Texts.com acquisition: https://techcrunch.com/2023/10/24/wordpress-com-owner-buys-all-in-one-messaging-app-texts-com-for-50m/
- Veera Browser Play Store listing: https://play.google.com/store/apps/details?id=com.veera.browser
- Namefi: https://namefi.io/
- Namefi Brand Studio: https://namefi.io/features/brand-studio
- Namefi Feed: https://namefi.io/features/feed
- Namefi Outbound: https://namefi.io/features/outbound
- Memorang: https://memorang.com/
- Housing Engineering article: https://medium.com/engineering-housing/how-we-built-our-react-native-app-3380a33811ac
- Attached PDFs:
  - `/home/sid/.codex/attachments/185e30c5-af6a-46e8-bd3b-357552cf9016/resume.pdf`
  - `/home/sid/.codex/attachments/185e30c5-af6a-46e8-bd3b-357552cf9016/Resume-Sid-Jain-2.pdf`
