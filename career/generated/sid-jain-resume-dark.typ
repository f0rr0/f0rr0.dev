#set document(
  title: "Sid Jain Resume",
  author: "Sid Jain",
  keywords: ("AI product engineer", "AI lead", "staff full-stack engineer", "founding engineer", "TypeScript", "React Native", "Chromium", "DNS"),
)
#set page(
  paper: "us-letter",
  margin: (x: 0.58in, top: 0.42in, bottom: 0.42in),
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
  stroke: 0.5pt + rule-color,
)[#align(center + horizon)[#move(dy: dy)[#image(path, width: image-width, height: image-height, fit: "contain")]]]

#align(left)[
  #t("Sid Jain", fill: strong, font: "Literata", size: 36pt, weight: "bold", style: "normal")
  #v(-18pt)
  #block[
  #set par(leading: 0.9em)
  #t("Senior Full-Stack Engineer / AI Lead building AI-native products and hard production systems from zero to launch. Founded Yuppies Tech and personally led technical delivery for Airbus Tripset, Mitsubishi Motors Puerto Rico MiAR, ZebPay, Texts.com, Veera Browser, and Memorang. Currently leads Namefi AI product engineering across Outbound, Brand Studio, and Feed while building core registrar, DNS, payments, and workflow infrastructure.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")
]
  #v(12pt)
  #link("mailto:sid_26@outlook.com")[#t("sid_26@outlook.com", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")] #h(12pt)
#link("https://linkedin.com/in/f0rr0")[#t("linkedin.com/in/f0rr0", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")] #h(12pt)
#link("https://github.com/f0rr0")[#t("github.com/f0rr0", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")]

  
#block(breakable: false)[
  
#v(12pt)
#t("Experience", fill: strong, font: "Literata", size: 15pt, weight: "bold", style: "normal")
#v(10.5pt)

  
#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#logo-tile("/public/resume/logos/namefi.svg", fill: rgb("#0f1714"), size: 30pt, image-width: 21pt, image-height: 15pt, dy: 0pt)],
  [
    #t("Namefi", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(3pt)
    #t("Domain registrar and marketplace infrastructure with AI-native products for domain owners.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")
    
#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Senior Full-Stack Engineer / AI Lead", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Remote · Dec 2024 - Present", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(6pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built Namefi Outbound, reducing domain sales research and outreach prep from days/weeks to minutes by automating buyer-fit hypotheses, web research, lead scoring, contact discovery, and editable outreach drafts.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built Brand Studio, a multi-stage AI branding system that turns domains into buyer-ready logo, poster, and motion concepts with strategist/concept passes, exact domain/TLD rendering constraints, and cinematic animation workflows.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built Namefi Feed, an MLS-style discovery layer indexing roughly 4,000-5,000 public secondary-market domain listings from X, NamePros, DNForum, and marketplaces into searchable/RSS surfaces.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (6pt, 1fr),
  gutter: 6pt,
  align: top,
  [#t("·", fill: accent, font: "Source Sans 3", size: 10.5pt, weight: "bold", style: "normal")],
  [#t("Built registrar and domain systems across registrar integrations, DNS/DNSSEC, nameservers, ENS/.eth, renewals, payments, checkout, and Temporal-backed long-running workflows.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
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
  [#logo-tile("/public/resume/logos/yuppies.svg", fill: rgb("#171220"), size: 30pt, image-width: 21pt, image-height: 12pt, dy: 0.75pt)],
  [
    #t("Yuppies Tech", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(3pt)
    #t("Founder-led product engineering consultancy for high-ambiguity client work.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")
    
#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Founder / Technical Lead", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Mumbai / Remote · Jan 2021 - Present", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)
#v(6pt)
#t("Founded and led a product engineering consultancy; served as client-facing technical partner and hands-on technical lead across travel, automotive, crypto, messaging, browsers, and AI education.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")
#v(6pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: 1.5pt)[#logo-tile("/public/resume/logos/memorang.svg", fill: rgb("#ffffff"), size: 21pt, image-width: 15pt, image-height: 12pt, dy: 0pt)]],
  [#t("Memorang: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("Head of CMS for an AI education platform, leading schema-first AI CMS work for Cambridge/TOEFL content, AI-generated questions/media, adaptive practice, scoring workflows, and a JS/Flow to TypeScript/Bun/Biome modernization.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: 1.5pt)[#logo-tile("/public/resume/logos/veera.png", fill: rgb("#111111"), size: 21pt, image-width: 15pt, image-height: 12pt, dy: 0.75pt)]],
  [#t("Veera Browser: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("led Android Chromium browser delivery from zero to Play Store, owning Chromium/Brave patch management, build/release tooling, rewards/feed/onboarding/search/tabs, privacy/security updates, and later iOS platform setup.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: 1.5pt)[#logo-tile("/public/resume/logos/texts-icon.png", fill: rgb("#f3f6ff"), size: 21pt, image-width: 15pt, image-height: 15pt, dy: 0pt)]],
  [#t("Texts.com: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("built the production Facebook Messenger channel over undocumented messaging infrastructure, implementing protocol-compatible MQTT/Facebook Thrift handling, encrypted payload support, and feature-parity messaging across sync, groups, attachments, reactions, read receipts, typing, and presence.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: 1.5pt)[#logo-tile("/public/resume/logos/zebpay-mark.svg", fill: rgb("#12202a"), size: 21pt, image-width: 15pt, image-height: 15pt, dy: 0pt)]],
  [#t("ZebPay: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("technical lead for a 10-person embedded team modernizing iOS/Android apps and release infrastructure for one of India's largest crypto exchanges, moving stabilization releases from monthly/bi-monthly to weekly.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: 1.5pt)[#logo-tile("/public/resume/logos/mitsubishi-mark.svg", fill: rgb("#211816"), size: 21pt, image-width: 15pt, image-height: 12pt, dy: -1.5pt)]],
  [#t("Mitsubishi Motors: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("tech lead for MiAR virtual dealership and Outlander AR campaign, leading a 3-person team across native iOS/iPadOS, WebAR, optimized 3D vehicles, low-end Android support, bilingual content, and contest/admin workflows.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
)
#v(1.5pt)

#grid(
  columns: (21pt, 1fr),
  gutter: 7.5pt,
  align: top,
  [#move(dy: 1.5pt)[#logo-tile("/public/resume/logos/airbus.svg", fill: rgb("#17213a"), size: 21pt, image-width: 15pt, image-height: 6pt, dy: 0pt)]],
  [#t("Airbus Tripset: ", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")#t("solo technical partner to Milkinside for Airbus's public iOS/Android COVID travel companion, building the React Native app and backend aggregation layer over Airbus/Amadeus APIs, CMS-driven travel guidance, and itinerary notifications.", fill: muted, font: "Source Sans 3", size: 10.5pt, weight: "regular", style: "normal")],
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
  [#logo-tile("/public/resume/logos/kult.svg", fill: rgb("#211722"), size: 30pt, image-width: 21pt, image-height: 9pt, dy: 0pt)],
  [
    #t("Kult App", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(3pt)
    #t("Consumer beauty and skincare commerce.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")
    
#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Vice President of Tech", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Mumbai · Jan 2020 - Dec 2020", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(6pt)

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
  [#logo-tile("/public/resume/logos/yilu.svg", fill: rgb("#101827"), size: 30pt, image-width: 21pt, image-height: 12pt, dy: 0pt)],
  [
    #t("Yilu, Lufthansa Group / BCG Digital Ventures", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(3pt)
    #t("Smart travel platform for Lufthansa Group.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")
    
#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Founding Engineer", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Berlin · Nov 2018 - Dec 2019", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(6pt)

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
  [#logo-tile("/public/resume/logos/8fit.svg", fill: rgb("#102018"), size: 30pt, image-width: 21pt, image-height: 15pt, dy: 0pt)],
  [
    #t("8fit", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(3pt)
    #t("Fitness and nutrition platform, now part of Withings.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")
    
#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Senior Technical Architect", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Berlin · Nov 2017 - Oct 2018", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(6pt)

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
  [#logo-tile("/public/resume/logos/housing-mini.png", fill: rgb("#ffdf30"), size: 30pt, image-width: 21pt, image-height: 30pt, dy: 0pt)],
  [
    #t("Housing.com", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(3pt)
    #t("Indian real estate search and transaction platform.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")
    
#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Team Lead", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Mumbai · Oct 2016 - Oct 2017", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(6pt)

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
  [#logo-tile("/public/resume/logos/bridg.svg", fill: rgb("#211916"), size: 30pt, image-width: 21pt, image-height: 12pt, dy: 0.75pt)],
  [
    #t("Earlier Consulting and Startup Work", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(3pt)
    #t("Bridg, 1mg, HornOk, Volkno, Meriad, and self-employed work.", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "italic")
    
#v(3pt)
#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  [#t("Software Engineer / Consultant", fill: strong, font: "Source Sans 3", size: 10.5pt, weight: "medium", style: "normal")],
  [#t("Los Angeles / India · 2015 - 2016", fill: muted, font: "Source Sans 3", size: 9pt, weight: "regular", style: "normal")],
)

#v(6pt)

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
  
#v(21pt)
#t("Education", fill: strong, font: "Literata", size: 15pt, weight: "bold", style: "normal")
#v(10.5pt)

  
#block(breakable: false)[
#grid(
  columns: (30pt, 1fr),
  gutter: 12pt,
  align: top,
  [#logo-tile("/public/resume/logos/ucla.svg", fill: rgb("#2774ae"), size: 30pt, image-width: 21pt, image-height: 9pt, dy: 0pt)],
  [
    #t("University of California, Los Angeles", fill: strong, font: "Literata", size: 12pt, weight: "bold", style: "normal")
    #v(3pt)
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
