#set document(
  title: "Sid Jain Resume",
  author: "Sid Jain",
  keywords: ("AI product engineer", "AI lead", "staff full-stack engineer", "founding engineer", "TypeScript", "React Native", "Chromium", "DNS"),
)
#set page(
  paper: "us-legal",
  margin: 0.29in,
  fill: rgb("#1a1918"),
)
#set text(font: "Source Sans 3", size: 10.5pt, fill: rgb("#a8a29e"), lang: "en")
#set par(leading: 0.625em, justify: false)

#let background = rgb("#1a1918")
#let strong = rgb("#e7e5e4")
#let muted = rgb("#a8a29e")
#let accent = rgb("#d97706")
#let rule-color = rgb("#3a3836")
#let t(s, fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal") = text(font: font, fill: fill, size: size, weight: weight, style: style, s)
#let logo-tile(path, fill: background, size: 30pt, image-width: 21pt, image-height: 15pt, dy: 0pt) = rect(
  width: size,
  height: size,
  radius: size / 2,
  fill: fill,
  stroke: 0.75pt + rule-color,
)[#align(center + horizon)[#move(dy: dy)[#image(path, width: image-width, height: image-height, fit: "contain")]]]
#let profile-photo(path, size: 36pt) = image(path, width: size, height: size, fit: "contain")

#align(left)[
#grid(
  columns: (36pt, auto, 1fr),
  gutter: 12pt,
  align: top,
  [#profile-photo("/public/resume/sid-jain-profile-avatar.png")],
  [#box(height: 36pt)[#align(left + horizon)[#t("Sid Jain", fill: strong, font: "Literata", size: 36pt, weight: "bold", style: "normal")]]],
  [#align(right)[#box(height: 36pt)[#align(right + horizon)[#box(height: 28pt)[#grid(
      columns: (auto,),
      rows: (1fr, 1fr, 1fr),
      align: right + horizon,
      [#link("mailto:sid_26@outlook.com")[#t("sid_26@outlook.com", fill: accent, font: "Source Sans 3", size: 7.5pt, weight: "medium", style: "normal")]],
[#link("https://linkedin.com/in/f0rr0")[#t("linkedin.com/in/f0rr0", fill: accent, font: "Source Sans 3", size: 7.5pt, weight: "medium", style: "normal")]],
[#link("https://github.com/f0rr0")[#t("github.com/f0rr0", fill: accent, font: "Source Sans 3", size: 7.5pt, weight: "medium", style: "normal")]]
    )]]]]],
)
  #v(3pt)
  #block[
  #set par(leading: 0.625em)
  #t("Applied AI Lead and senior full-stack engineer who turns ambiguous customer problems into production AI systems. Blends customer discovery, technical advisory, evaluation and workflow design, hands-on prototyping, and production architecture across AI, marketplace, browser, mobile, and infrastructure-heavy products.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")
]


#block(breakable: false)[

#v(12pt)
#t("Experience", fill: strong, font: "Literata", size: 15pt, weight: "bold", style: "normal")
#v(9pt)


#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/namefi.svg", fill: rgb("#0f1714"), size: 30pt, image-width: 21pt, image-height: 15pt, dy: 0pt)]],
  [
    #t("Namefi", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("AI-powered registrar for tokenized domains and domainer workflows.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Applied AI Lead", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("San Francisco Bay Area / Remote · Jan 2025 - Present", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(2.25pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Led customer discovery with large domain owners and turned manual sales workflows into Namefi Outbound: AI-assisted buyer hypotheses, web research, lead scoring, contact discovery, and editable outreach, reducing prep from days to minutes.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Designed Brand Studio as a multi-stage AI workflow that turns domains into buyer-ready logos, posters, and motion concepts with strategist/concept passes, exact domain/TLD constraints, and animation workflows.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built Namefi Feed, an AI-enriched listing intelligence layer that normalizes roughly 4,000-5,000 public domain listings from X, NamePros, DNForum, and marketplaces into searchable/RSS surfaces.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built production registrar and domain systems across registrar integrations, DNS/DNSSEC, nameservers, ENS/.eth, renewals, payments, checkout, analytics, and Temporal-backed long-running workflows.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)

  ],
)
]

]
#v(18pt)

#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/memorang.svg", fill: rgb("#ffffff"), size: 30pt, image-width: 21pt, image-height: 15pt, dy: 0pt)]],
  [
    #t("Memorang", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("AI education platform for adaptive practice, tutoring, assessment, and curriculum tooling.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Head of CMS", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("San Francisco Bay Area / Remote · Apr 2024 - Jan 2025", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(2.25pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Translated Cambridge/TOEFL requirements into a schema-first AI CMS for generated questions/media, adaptive practice, scoring workflows, and content operations.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built AI generation and recommendation workflows across full question sets, companion audio/image media, embedding-based media similarity, and schema-versioned content delivery.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Modernized a large JS/Flow monorepo toward TypeScript, Bun, and Biome using AI-agentic refactor workflows, codemods, and tooling while coordinating CMS roadmap with backend, frontend, app teams, CTO, and CEO.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)

  ],
)
]

#v(18pt)

#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/yuppies.svg", fill: rgb("#171220"), size: 30pt, image-width: 21pt, image-height: 12pt, dy: 0.75pt)]],
  [
    #t("Yuppies Tech", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("Founder-led product engineering consultancy for high-ambiguity client work.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Founder / Technical Lead", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Mumbai / Remote · Jan 2021 - Apr 2024", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)
#v(2.25pt)
#t("Founded and led a product engineering consultancy as client-facing technical partner, translating ambiguous requirements into architecture, delivery plans, and shipped systems.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")
#v(2.25pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: -0.5pt)[#logo-tile("/public/resume/logos/veera.png", fill: rgb("#111111"), size: 21pt, image-width: 15pt, image-height: 12pt, dy: 0.75pt)]],
  [#t("Veera Browser: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("led Android Chromium browser delivery from zero to Play Store, owning Chromium/Brave patch management, build/release tooling, rewards/feed/onboarding/search/tabs, privacy/security updates, and later iOS platform setup.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: -0.5pt)[#logo-tile("/public/resume/logos/texts-icon.png", fill: rgb("#f3f6ff"), size: 21pt, image-width: 15pt, image-height: 15pt, dy: 0pt)]],
  [#t("Texts: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("built production Messenger channel by reverse-engineering undocumented infrastructure and implementing MQTT/Facebook Thrift, encrypted payloads, sync, groups, attachments, reactions, receipts, typing, and presence.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: -0.5pt)[#logo-tile("/public/resume/logos/zebpay-mark.svg", fill: rgb("#12202a"), size: 21pt, image-width: 15pt, image-height: 15pt, dy: 0pt)]],
  [#t("ZebPay: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("client-facing technical lead for a 10-person team modernizing iOS/Android apps, release infrastructure, exchange features, payment flows, and international KYC; moved stabilization releases from monthly/bi-monthly to weekly.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: -0.5pt)[#logo-tile("/public/resume/logos/mitsubishi-mark.svg", fill: rgb("#211816"), size: 21pt, image-width: 15pt, image-height: 12pt, dy: -1.5pt)]],
  [#t("Mitsubishi Motors: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("client-facing technical lead for MiAR, turning remote dealership goals into native iOS/iPadOS and WebAR with optimized 3D vehicles, low-end Android support, bilingual content, and contest/admin workflows.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: -0.5pt)[#logo-tile("/public/resume/logos/airbus.svg", fill: rgb("#17213a"), size: 21pt, image-width: 15pt, image-height: 6pt, dy: 0pt)]],
  [#t("Airbus Tripset: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("solo technical partner to Milkinside for Airbus's public iOS/Android COVID travel companion, translating urgent traveler guidance needs into app/backend layers over Airbus/Amadeus APIs, CMS rules, and itinerary notifications.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)

  ],
)
]

#v(18pt)

#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/kult.svg", fill: rgb("#211722"), size: 30pt, image-width: 21pt, image-height: 9pt, dy: 0pt)]],
  [
    #t("Kult", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("Consumer beauty and skincare commerce.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Vice President of Tech", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Mumbai · Jan 2020 - Dec 2021", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(2.25pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built the first product and technical foundation for a consumer beauty/skincare shopping app from the ground up across AWS, Elixir, Swift, and Kotlin.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)

  ],
)
]

#v(18pt)

#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/yilu.svg", fill: rgb("#101827"), size: 30pt, image-width: 21pt, image-height: 12pt, dy: 0pt)]],
  [
    #t("Yilu, Lufthansa Group / BCG Digital Ventures", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("Smart travel platform for Lufthansa Group.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Founding Engineer", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Berlin · Nov 2018 - Dec 2019", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(2.25pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built native mobile architecture, CI/CD and release automation, Terraform-backed AWS web infrastructure, and iOS/Android features for Eurowings.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Helped hire and structure the initial engineering team through job descriptions, technical tasks, interviews, and Scrum Master responsibilities.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)

  ],
)
]

#v(18pt)

#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/8fit.svg", fill: rgb("#102018"), size: 30pt, image-width: 21pt, image-height: 15pt, dy: 0pt)]],
  [
    #t("8fit by Withings", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("Fitness and nutrition platform, now part of Withings.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Senior Technical Architect", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Berlin · Nov 2017 - Oct 2018", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(2.25pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Architected a hybrid Apple TV fitness app that reached #1 Health & Fitness in Germany and 30+ countries and #7 in the US.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built cross-platform mobile features across JavaScript, Swift, Objective-C, Java, and Kotlin.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)

  ],
)
]

#v(18pt)

#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/housing-mini.png", fill: rgb("#ffdf30"), size: 30pt, image-width: 21pt, image-height: 30pt, dy: 0pt)]],
  [
    #t("Housing", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("Indian real estate search and transaction platform.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Team Lead", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Mumbai · Oct 2016 - Oct 2017", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(2.25pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Led cross-platform mobile architecture and the team transition to React Native, built in-house release/CI/CD systems, and contributed to Housing.com's PWA.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Published the Housing Engineering article 'How We Built Our React Native App' covering architecture, release automation, testing, performance, and team migration.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)

  ],
)
]

#v(18pt)

#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/bridg.svg", fill: rgb("#211916"), size: 30pt, image-width: 21pt, image-height: 12pt, dy: 0.75pt)]],
  [
    #t("Earlier Consulting and Startup Work", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("Bridg, 1mg, HornOk, Volkno, Meriad, and self-employed work.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Software Engineer / Consultant", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Los Angeles / India · 2015 - 2016", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(2.25pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built startup web/mobile systems across customer-data email tooling, real-time doctor consultation, IoT fleet management, and JavaScript/Java/Ruby on Rails product engineering while studying Computer Science at UCLA.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)

  ],
)
]




#block(breakable: false)[

#v(24pt)
#t("Education", fill: strong, font: "Literata", size: 15pt, weight: "bold", style: "normal")
#v(9pt)


#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#move(dy: -0.75pt)[#logo-tile("/public/resume/logos/ucla.svg", fill: rgb("#2774ae"), size: 30pt, image-width: 21pt, image-height: 9pt, dy: 0pt)]],
  [
    #t("University of California, Los Angeles", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(-6pt)
    #t("BS, Computer Science and Engineering.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")

#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Computer Science and Engineering", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Los Angeles, CA · 2013 - 2016", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)



  ],
)
]

]


]
