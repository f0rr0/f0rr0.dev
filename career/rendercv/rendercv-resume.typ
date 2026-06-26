// Import the rendercv function and all the refactored components
#import "@preview/rendercv:0.3.0": *

// Apply the rendercv template with custom configuration
#show: rendercv.with(
  name: "Sid Jain",
  title: "Sid Jain - CV",
  footer: context { [#emph[Sid Jain -- #str(here().page())\/#str(counter(page).final().first())]] },
  top-note: [ #emph[Last updated in June 2026] ],
  locale-catalog-language: "en",
  text-direction: ltr,
  page-size: "us-letter",
  page-top-margin: 0.55in,
  page-bottom-margin: 0.55in,
  page-left-margin: 0.60in,
  page-right-margin: 0.60in,
  page-show-footer: true,
  page-show-top-note: false,
  colors-body: rgb(18, 22, 28),
  colors-name: rgb(0, 86, 80),
  colors-headline: rgb(0, 86, 80),
  colors-connections: rgb(48, 59, 70),
  colors-section-titles: rgb(0, 86, 80),
  colors-links: rgb(0, 86, 80),
  colors-footer: rgb(110, 118, 128),
  colors-top-note: rgb(110, 118, 128),
  typography-line-spacing: 0.56em,
  typography-alignment: "left",
  typography-date-and-location-column-alignment: right,
  typography-font-family-body: "Source Sans 3",
  typography-font-family-name: "Source Sans 3",
  typography-font-family-headline: "Source Sans 3",
  typography-font-family-connections: "Source Sans 3",
  typography-font-family-section-titles: "Source Sans 3",
  typography-font-size-body: 10.10pt,
  typography-font-size-name: 30pt,
  typography-font-size-headline: 10pt,
  typography-font-size-connections: 9.2pt,
  typography-font-size-section-titles: 1.25em,
  typography-small-caps-name: false,
  typography-small-caps-headline: false,
  typography-small-caps-connections: false,
  typography-small-caps-section-titles: false,
  typography-bold-name: true,
  typography-bold-headline: false,
  typography-bold-connections: false,
  typography-bold-section-titles: true,
  links-underline: false,
  links-show-external-link-icon: false,
  header-alignment: left,
  header-photo-width: 3.5cm,
  header-space-below-name: 0.28cm,
  header-space-below-headline: 0.30cm,
  header-space-below-connections: 0.34cm,
  header-connections-hyperlink: true,
  header-connections-show-icons: false,
  header-connections-display-urls-instead-of-usernames: true,
  header-connections-separator: "|",
  header-connections-space-between-connections: 0.36cm,
  section-titles-type: "with_full_line",
  section-titles-line-thickness: 0.6pt,
  section-titles-space-above: 0.44cm,
  section-titles-space-below: 0.20cm,
  sections-allow-page-break: false,
  sections-space-between-text-based-entries: 0.28em,
  sections-space-between-regular-entries: 1.15em,
  entries-date-and-location-width: 3.65cm,
  entries-side-space: 0cm,
  entries-space-between-columns: 0.18cm,
  entries-allow-page-break: false,
  entries-short-second-row: false,
  entries-degree-width: 1cm,
  entries-summary-space-left: 0cm,
  entries-summary-space-above: 0.04cm,
  entries-highlights-bullet:  "•" ,
  entries-highlights-nested-bullet:  "•" ,
  entries-highlights-space-left: 0cm,
  entries-highlights-space-above: 0.04cm,
  entries-highlights-space-between-items: 0.04cm,
  entries-highlights-space-between-bullet-and-text: 0.38em,
  date: datetime(
    year: 2026,
    month: 6,
    day: 26,
  ),
)


= Sid Jain

  #headline([Senior Full-Stack Engineer \/ AI Lead])

#connections(
  [Mumbai, India \/ Remote],
  [#link("mailto:sid_26@outlook.com", icon: false, if-underline: false, if-color: false)[sid\_26\@outlook.com]],
  [#link("https://linkedin.com/in/f0rr0", icon: false, if-underline: false, if-color: false)[linkedin.com\/in\/f0rr0]],
  [#link("https://github.com/f0rr0", icon: false, if-underline: false, if-color: false)[github.com\/f0rr0]],
)


== Summary

Senior engineer and technical founder with 10+ years across AI products, mobile\/platform engineering, developer tooling, and high-stakes client delivery. Founded Yuppies Tech and led technical execution for Airbus, Mitsubishi Motors Puerto Rico, ZebPay, Texts.com, Veera Browser, and Memorang; now leading AI product engineering at Namefi.

== Skills

#strong[AI product:] Agentic workflows, AI-native UX, prompt\/workflow design, generation systems, research agents, analytics copilots

#strong[Full-stack:] TypeScript, React\/Next.js, Node.js, APIs, Postgres, backend services, Temporal, CI\/CD, product architecture

#strong[Mobile\/platform:] React Native, Swift, Kotlin, Objective-C, Java, Chromium, release automation, App Store\/Play Store delivery

#strong[Leadership:] Founder-level ownership, client-facing discovery, technical roadmap execution, team leadership, design partnership

== Experience

#regular-entry(
  [
    #strong[Namefi \/ D3ServeLabs] -- Remote

  ],
  [
    Dec 2024 – present

  ],
  main-column-second-row: [
    #emph[Senior Full-Stack Engineer \/ AI Lead]

    - Lead AI product engineering across Outbound, Brand Studio, and Feed while contributing core registrar, DNS, payment, checkout, and workflow infrastructure.

    - Built registrar and domain infrastructure across registrar integrations, DNS\/DNSSEC, nameservers, ENS\/.eth, renewals, payments, and Temporal-backed long-running workflows.

    - Built internal AI\/product analytics surfaces across product usage, search, social, and funnel data, enabling product managers to ask natural-language questions over operating metrics.

  ],
)

#regular-entry(
  [
    #strong[Yuppies Tech] -- Mumbai \/ Remote

  ],
  [
    Jan 2021 – present

  ],
  main-column-second-row: [
    #emph[Founder \/ Technical Lead]

    #summary[Product engineering consultancy founded and led by Sid; client-facing technical partner and hands-on technical lead across travel, automotive, crypto, messaging, browsers, and AI education.]

    - #strong[Airbus Tripset:] solo technical partner to Milkinside for Airbus's public iOS\/Android COVID travel companion; built the React Native app and backend aggregation layer over Airbus\/Amadeus APIs, CMS-driven travel guidance, and itinerary notifications.

    - #strong[Mitsubishi Motors Puerto Rico \/ MMSC:] tech lead for MiAR virtual dealership and Outlander AR campaign; led native iOS\/iPadOS and WebAR delivery with optimized 3D vehicles, low-end Android\/browser support, bilingual content, and contest\/admin workflows.

    - #strong[ZebPay:] technical lead for a 10-person embedded team modernizing iOS\/Android apps and release infrastructure for one of India's largest crypto exchanges; shipped exchange, payments, wallet SDK, international KYC, and OTC workflows.

    - #strong[Texts.com:] built the production Facebook Messenger channel over undocumented\/private messaging infrastructure, implementing protocol-compatible MQTT\/Facebook Thrift handling, encrypted payload support, and feature-parity messaging.

    - #strong[Veera Browser:] led Android Chromium browser delivery from zero to Play Store, owning Chromium\/Brave patch management, build\/release tooling, rewards\/feed\/onboarding\/search\/tabs, privacy\/security updates, and later iOS platform setup.

    - #strong[Memorang:] Head of CMS for an AI education platform; led schema-first AI CMS work for Cambridge\/TOEFL content, dynamic question\/component types, schema versioning, AI-generated questions\/media, adaptive practice, and scoring workflows.

  ],
)

== Earlier Experience

#regular-entry(
  [
    #strong[Kult App] -- Mumbai

  ],
  [
    Jan 2020 – Dec 2020

  ],
  main-column-second-row: [
    #emph[Vice President of Tech]

    - Built the first product and technical foundation for a consumer beauty\/skincare shopping app from the ground up across AWS, Elixir, Swift, and Kotlin.

  ],
)

#regular-entry(
  [
    #strong[Yilu, Lufthansa Group \/ BCG Digital Ventures] -- Berlin

  ],
  [
    Nov 2018 – Dec 2019

  ],
  main-column-second-row: [
    #emph[Founding Engineer]

    - Built native mobile architecture, CI\/CD and release automation, Terraform-backed AWS web infrastructure, iOS\/Android features for Eurowings, and helped hire the initial team.

  ],
)

#regular-entry(
  [
    #strong[8fit, now part of Withings] -- Berlin

  ],
  [
    Nov 2017 – Oct 2018

  ],
  main-column-second-row: [
    #emph[Senior Technical Architect]

    - Architected a hybrid Apple TV fitness app that reached \#1 Health & Fitness in Germany and 30+ countries and \#7 in the US; built cross-platform mobile features.

  ],
)

#regular-entry(
  [
    #strong[Housing.com] -- Mumbai

  ],
  [
    Oct 2016 – Oct 2017

  ],
  main-column-second-row: [
    #emph[Team Lead]

    - Led cross-platform mobile architecture and team transition to React Native, built in-house release\/CI\/CD systems, contributed to Housing.com's PWA, and published the Housing Engineering article \"How We Built Our React Native App.\"

  ],
)

#regular-entry(
  [
    #strong[Bridg, 1mg, HornOk, Volkno, Meriad, self-employed] -- Los Angeles \/ India

  ],
  [
    2015 - 2016

  ],
  main-column-second-row: [
    #emph[Earlier Consulting and Startup Work]

    - Built startup web\/mobile systems across customer-data email tooling, real-time doctor consultation, IoT fleet management, and JavaScript\/Java\/Ruby on Rails product engineering while studying Computer Science at UCLA.

  ],
)

== Public Work

  #regular-entry(
  [
    #strong[oliphaunt]

  ],
  [
  ],
  main-column-second-row: [
    #summary[Rust project for embedded Postgres inside apps\/tests; 82 stars and 8 forks as of 2026-06-25.]

  ],
)

  #regular-entry(
  [
    #strong[react-native-rating]

  ],
  [
  ],
  main-column-second-row: [
    #summary[Cross-platform React Native rating component built with Animated and the native driver; 91 stars and 7 forks.]

  ],
)

  #regular-entry(
  [
    #strong[How We Built Our React Native App]

  ],
  [
  ],
  main-column-second-row: [
    #summary[Public Housing Engineering article covering React Native architecture, release automation, testing, performance, and team migration.]

  ],
)

== Education

#education-entry(
  [
    #strong[University of California, Los Angeles]

  ],
  [
    2013 – 2016

  ],
  main-column-second-row: [
    #emph[BS in Computer Science and Engineering]

  ],
)
