#set document(
  title: "Sid Jain Resume",
  author: "Sid Jain",
  keywords: (
    "AI product engineer",
    "Applied AI lead",
    "staff full-stack engineer",
    "founding engineer",
    "TypeScript",
    "React Native",
    "Chromium",
    "DNS",
  ),
)
#set page(
  paper: "us-legal",
  margin: 0.58in,
  fill: rgb("#1a1918"),
)
#set text(font: "Source Sans 3", size: 10pt, fill: rgb("#a8a29e"), lang: "en")
#set par(leading: 0.625em, justify: false)

#let background = rgb("#1a1918")
#let strong = rgb("#e7e5e4")
#let muted = rgb("#a8a29e")
#let accent = rgb("#d97706")
#let rule-color = rgb("#3a3836")
#let t(
  s,
  fill: muted,
  font: "Source Sans 3",
  size: 10pt,
  weight: "regular",
  style: "normal",
  kerning: true,
) = text(
  font: font,
  fill: fill,
  size: size,
  weight: weight,
  style: style,
  kerning: kerning,
  s,
)
#let logo-tile(
  path,
  fill: background,
  size: 30pt,
  image-width: 21pt,
  image-height: 15pt,
  dy: 0pt,
) = rect(
  width: size,
  height: size,
  radius: size / 2,
  fill: fill,
  stroke: 0.75pt + rule-color,
)[#align(center + horizon)[#move(dy: dy)[#image(
  path,
  width: image-width,
  height: image-height,
  fit: "contain",
)]]]
#let profile-photo(path, size: 36pt) = image(
  path,
  width: size,
  height: size,
  fit: "contain",
)

#align(left)[
  #grid(
    columns: (36pt, auto, 1fr),
    gutter: 12pt,
    align: top,
    [#profile-photo("/public/resume/sid-jain-profile-avatar.png")],
    [#box(height: 36pt)[#align(left + horizon)[#t(
      "Sid Jain ",
      fill: strong,
      font: "Literata",
      size: 36pt,
      weight: "bold",
      style: "normal",
    )]]],
    [#align(right)[#box(height: 36pt)[#align(right + horizon)[#box(
      height: 32pt,
    )[
      #set par(leading: 0.422em)
      #align(right)[
        #link("mailto:sid_26@outlook.com")[#t(
          " sid_26@outlook.com",
          fill: accent,
          font: "Source Sans 3",
          size: 7.5pt,
          weight: "medium",
          style: "normal",
        )]
        #linebreak()
        #link("https://linkedin.com/in/f0rr0")[#t(
          "linkedin.com/in/f0rr0",
          fill: accent,
          font: "Source Sans 3",
          size: 7.5pt,
          weight: "medium",
          style: "normal",
        )]
        #linebreak()
        #link("https://github.com/f0rr0")[#t(
          "github.com/f0rr0",
          fill: accent,
          font: "Source Sans 3",
          size: 7.5pt,
          weight: "medium",
          style: "normal",
        )]
      ]
    ]]]]],
  )
  #v(3pt)
  #block[
    #set par(leading: 0.625em)
    #t(
      "Software engineer and technical leader with 10+ years building and operating production applications, platforms, and infrastructure. Leads Applied AI at Namefi, taking customer workflows from discovery and system design through evaluation, implementation, and support; previously built human-in-the-loop AI content systems at Memorang. Founded a 15-engineer consultancy and shipped browser, messaging, payments, travel, mobile, and cloud systems.",
      fill: muted,
      font: "Source Sans 3",
      size: 10pt,
      weight: "regular",
      style: "normal",
    )
  ]
  #v(3pt)
  #block[
    #set par(leading: 0.625em)
    #t(
      "Based in Mumbai • Available for India/APAC travel",
      fill: muted,
      font: "Source Sans 3",
      size: 10pt,
      weight: "regular",
      style: "normal",
    )
  ]


  #block(breakable: false)[

    #v(6pt)
    #t(
      "Experience",
      fill: strong,
      font: "Literata",
      size: 15pt,
      weight: "bold",
      style: "normal",
    )
    #v(9pt)


    #block(breakable: false)[
      #grid(
        columns: (30pt, 1fr),
        gutter: 12pt,
        align: top,
        [#move(dy: -0.75pt)[#logo-tile(
          "/public/resume/logos/namefi.png",
          fill: rgb("#0f1714"),
          size: 30pt,
          image-width: 21pt,
          image-height: 15pt,
          dy: 0pt,
        )]],
        [
          #grid(
            columns: (auto, auto),
            gutter: 5pt,
            align: horizon,
            [#t(
              "Namefi",
              fill: strong,
              font: "Literata",
              size: 12pt,
              weight: "bold",
              style: "normal",
              kerning: false,
            )],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#242220"),
              stroke: 0.75pt + rgb("#57534e"),
            )[#t(
              "Early-stage",
              fill: rgb("#c7c2bd"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
          )
          #v(-3.75pt)
          #t(
            "ICANN-accredited registrar building AI products for domain ownership and sales.",
            fill: muted,
            font: "Source Sans 3",
            size: 9pt,
            weight: "regular",
            style: "italic",
          )

          #v(3pt)
          #grid(
            columns: (1fr, auto),
            gutter: 12pt,
            [#grid(
              columns: (auto, auto),
              gutter: 4pt,
              align: horizon,
              [#t(
                "Senior Full Stack Engineer",
                fill: strong,
                font: "Source Sans 3",
                size: 10pt,
                weight: "medium",
                style: "normal",
              )],
              [#box(
                inset: (x: 4pt, y: 3pt),
                radius: 8pt,
                fill: rgb("#2d2418"),
                stroke: 0.75pt + rgb("#9a6a2b"),
              )[#t(
                "Hands-on",
                fill: rgb("#f0b85f"),
                font: "Source Sans 3",
                size: 7.5pt,
                weight: "medium",
                style: "normal",
              )]],
            )],
            [#t(
              "Mumbai / Remote · Jan 2025 - Present",
              fill: muted,
              font: "Source Sans 3",
              size: 8.25pt,
              weight: "regular",
              style: "normal",
            )],
          )

          #v(2.25pt)

          #grid(
            columns: (6pt, 1fr),
            gutter: 6pt,
            align: top,
            [#t(
              "·",
              fill: accent,
              font: "Source Sans 3",
              size: 10pt,
              weight: "bold",
              style: "normal",
            )],
            [#t(
              "Built Namefi Outbound from customer discovery through production, cutting buyer research from days to about five minutes per domain: 50-70 ranked leads with fit rationales, decision-maker contacts, and tailored drafts.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
          )
          #v(1.5pt)

          #grid(
            columns: (6pt, 1fr),
            gutter: 6pt,
            align: top,
            [#t(
              "·",
              fill: accent,
              font: "Source Sans 3",
              size: 10pt,
              weight: "bold",
              style: "normal",
            )],
            [#t(
              "Built model-judged evals for buyer fit, name and product similarity, and decision-maker contacts; validated outputs through seller reports covering hundreds of prospective buyers.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
          )
          #v(1.5pt)

          #grid(
            columns: (6pt, 1fr),
            gutter: 6pt,
            align: top,
            [#t(
              "·",
              fill: accent,
              font: "Source Sans 3",
              size: 10pt,
              weight: "bold",
              style: "normal",
            )],
            [#t(
              "Built and operated Namefi Studio, a Temporal pipeline for logos, posters, website mockups, and motion; separated strategy from generation and used prompt constraints plus visual review for domain/TLD fidelity.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
          )
          #v(1.5pt)

          #grid(
            columns: (6pt, 1fr),
            gutter: 6pt,
            align: top,
            [#t(
              "·",
              fill: accent,
              font: "Source Sans 3",
              size: 10pt,
              weight: "bold",
              style: "normal",
            )],
            [#t(
              "Built and operated Namefi Feed, a Temporal ingestion and AI-classification system serving nearly 8,000 active listings, with reliable concurrent ingestion, retries, price verification, and auditable decisions.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
          )
          #v(1.5pt)

          #grid(
            columns: (6pt, 1fr),
            gutter: 6pt,
            align: top,
            [#t(
              "·",
              fill: accent,
              font: "Source Sans 3",
              size: 10pt,
              weight: "bold",
              style: "normal",
            )],
            [#t(
              "Built registrar and commerce systems across integrations, registration, checkout, payments, and analytics; replaced Airflow with testable Temporal workflows, simplifying recovery and making orchestration failures rare.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
          )

        ],
      )
    ]

  ]
  #v(9pt)

  #block(breakable: false)[
    #grid(
      columns: (30pt, 1fr),
      gutter: 12pt,
      align: top,
      [#move(dy: -0.75pt)[#logo-tile(
        "/public/resume/logos/memorang.png",
        fill: rgb("#ffffff"),
        size: 30pt,
        image-width: 21pt,
        image-height: 15pt,
        dy: 0pt,
      )]],
      [
        #grid(
          columns: (auto, auto),
          gutter: 5pt,
          align: horizon,
          [#t(
            "Memorang",
            fill: strong,
            font: "Literata",
            size: 12pt,
            weight: "bold",
            style: "normal",
            kerning: false,
          )],
          [#box(
            inset: (x: 4pt, y: 3pt),
            radius: 8pt,
            fill: rgb("#242220"),
            stroke: 0.75pt + rgb("#57534e"),
          )[#t(
            "Growth-stage",
            fill: rgb("#c7c2bd"),
            font: "Source Sans 3",
            size: 7.5pt,
            weight: "medium",
            style: "normal",
          )]],
        )
        #v(-3.75pt)
        #t(
          "AI-assisted educational content platform for structured curricula and assessments.",
          fill: muted,
          font: "Source Sans 3",
          size: 9pt,
          weight: "regular",
          style: "italic",
        )

        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 12pt,
          [#grid(
            columns: (auto, auto, auto),
            gutter: 4pt,
            align: horizon,
            [#t(
              "Lead Full Stack Engineer",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2d2418"),
              stroke: 0.75pt + rgb("#9a6a2b"),
            )[#t(
              "Hands-on",
              fill: rgb("#f0b85f"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2a2429"),
              stroke: 0.75pt + rgb("#7a6171"),
            )[#t(
              "Leadership",
              fill: rgb("#e3bfd7"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
          )],
          [#t(
            "Mumbai / Remote · Apr 2024 - Jan 2025",
            fill: muted,
            font: "Source Sans 3",
            size: 8.25pt,
            weight: "regular",
            style: "normal",
          )],
        )

        #v(2.25pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Built and shipped EdWrite, a graph-based CMS and content API managing tens of thousands of Cambridge and TOEFL questions, with adaptive practice, scoring, and semantic media recommendations.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Built human-in-the-loop generation for question sets, audio, and images, cutting content cycles from months to days; SME review calibrated model-based evals, while client SMEs controlled publishing.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Led a three-developer CMS team and roadmap across backend, frontend, and mobile, working directly with the CTO and CEO.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Led an AI-assisted Flow-to-TypeScript migration across hundreds of thousands of lines; cut compilation to single-digit minutes, accelerated CI and merges, and enabled safer refactors with fewer runtime errors.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )

      ],
    )
  ]

  #v(9pt)

  #block(breakable: false)[
    #grid(
      columns: (30pt, 1fr),
      gutter: 12pt,
      align: top,
      [#move(dy: -0.75pt)[#logo-tile(
        "/public/resume/logos/yuppies.png",
        fill: rgb("#171220"),
        size: 30pt,
        image-width: 21pt,
        image-height: 12pt,
        dy: 0.75pt,
      )]],
      [
        #grid(
          columns: (auto, auto),
          gutter: 5pt,
          align: horizon,
          [#t(
            "Yuppies Tech",
            fill: strong,
            font: "Literata",
            size: 12pt,
            weight: "bold",
            style: "normal",
            kerning: false,
          )],
          [#box(
            inset: (x: 4pt, y: 3pt),
            radius: 8pt,
            fill: rgb("#242220"),
            stroke: 0.75pt + rgb("#57534e"),
          )[#t(
            "0 → 1",
            fill: rgb("#c7c2bd"),
            font: "Source Sans 3",
            size: 7.5pt,
            weight: "medium",
            style: "normal",
          )]],
        )
        #v(-3.75pt)
        #t(
          "Product engineering consultancy for complex client products.",
          fill: muted,
          font: "Source Sans 3",
          size: 9pt,
          weight: "regular",
          style: "italic",
        )

        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 12pt,
          [#grid(
            columns: (auto, auto, auto),
            gutter: 4pt,
            align: horizon,
            [#t(
              "Founder & Technical Director",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2d2418"),
              stroke: 0.75pt + rgb("#9a6a2b"),
            )[#t(
              "Hands-on",
              fill: rgb("#f0b85f"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2a2429"),
              stroke: 0.75pt + rgb("#7a6171"),
            )[#t(
              "Leadership",
              fill: rgb("#e3bfd7"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
          )],
          [#t(
            "Mumbai / Remote · Jan 2021 - Apr 2024",
            fill: muted,
            font: "Source Sans 3",
            size: 8.25pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(2.25pt)
        #t(
          "Founded and grew Yuppies Tech to 15 engineers while remaining the client-facing technical lead. Turned unclear requirements into architecture, delivery plans, and production releases. Selected engagements:",
          fill: muted,
          font: "Source Sans 3",
          size: 10pt,
          weight: "regular",
          style: "normal",
        )
        #v(2.25pt)

        #grid(
          columns: (21pt, 1fr),
          gutter: 7.5pt,
          align: top,
          [#move(dy: -0.5pt)[#logo-tile(
            "/public/resume/logos/veera.png",
            fill: rgb("#111111"),
            size: 21pt,
            image-width: 15pt,
            image-height: 12pt,
            dy: 0.75pt,
          )]],
          [#t(
              "Veera Browser: ",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )#t(
              "led a Chromium-based Android browser from initial architecture through Play Store launch, owning upstream patch management, release tooling, product features, and privacy updates. Later established the iOS platform and release setup.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
        )
        #v(1.5pt)

        #grid(
          columns: (21pt, 1fr),
          gutter: 7.5pt,
          align: top,
          [#move(dy: -0.5pt)[#logo-tile(
            "/public/resume/logos/texts-icon.png",
            fill: rgb("#f3f6ff"),
            size: 21pt,
            image-width: 15pt,
            image-height: 15pt,
            dy: 0pt,
          )]],
          [#t(
              "Texts: ",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )#t(
              "built a production Facebook Messenger integration by reverse-engineering undocumented protocols, then implemented encrypted messaging, synchronization, groups, attachments, reactions, read receipts, typing indicators, and presence.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
        )
        #v(1.5pt)

        #grid(
          columns: (21pt, 1fr),
          gutter: 7.5pt,
          align: top,
          [#move(dy: -0.5pt)[#logo-tile(
            "/public/resume/logos/zebpay-mark.png",
            fill: rgb("#12202a"),
            size: 21pt,
            image-width: 15pt,
            image-height: 15pt,
            dy: 0pt,
          )]],
          [#t(
              "ZebPay: ",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )#t(
              "led modernization of ZebPay's iOS and Android apps, release infrastructure, exchange and payment features, and international KYC. During stabilization, increased the release cadence from monthly to weekly.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
        )
        #v(1.5pt)

        #grid(
          columns: (21pt, 1fr),
          gutter: 7.5pt,
          align: top,
          [#move(dy: -0.5pt)[#logo-tile(
            "/public/resume/logos/mitsubishi-mark.png",
            fill: rgb("#211816"),
            size: 21pt,
            image-width: 15pt,
            image-height: 12pt,
            dy: -1.5pt,
          )]],
          [#t(
              "Mitsubishi Motors: ",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )#t(
              "led MiAR, a remote dealership experience delivered through native iOS and iPadOS apps plus WebAR. Shipped optimized 3D vehicle models, support for lower-end Android devices, bilingual content, and contest-administration tooling.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
        )
        #v(1.5pt)

        #grid(
          columns: (21pt, 1fr),
          gutter: 7.5pt,
          align: top,
          [#move(dy: -0.5pt)[#logo-tile(
            "/public/resume/logos/airbus.png",
            fill: rgb("#17213a"),
            size: 21pt,
            image-width: 15pt,
            image-height: 6pt,
            dy: 0pt,
          )]],
          [#t(
              "Airbus Tripset: ",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )#t(
              "owned end-to-end technical delivery of Airbus Tripset, a public iOS and Android travel companion launched during COVID. Built the React Native app and backend services that combined Airbus and Amadeus APIs, CMS-managed travel guidance, itinerary data, and notifications.",
              fill: muted,
              font: "Source Sans 3",
              size: 10pt,
              weight: "regular",
              style: "normal",
            )],
        )

      ],
    )
  ]

  #v(9pt)

  #block(breakable: false)[
    #grid(
      columns: (30pt, 1fr),
      gutter: 12pt,
      align: top,
      [#move(dy: -0.75pt)[#logo-tile(
        "/public/resume/logos/kult.png",
        fill: rgb("#211722"),
        size: 30pt,
        image-width: 21pt,
        image-height: 9pt,
        dy: 0pt,
      )]],
      [
        #grid(
          columns: (auto, auto),
          gutter: 5pt,
          align: horizon,
          [#t(
            "Kult",
            fill: strong,
            font: "Literata",
            size: 12pt,
            weight: "bold",
            style: "normal",
            kerning: false,
          )],
          [#box(
            inset: (x: 4pt, y: 3pt),
            radius: 8pt,
            fill: rgb("#242220"),
            stroke: 0.75pt + rgb("#57534e"),
          )[#t(
            "0 → 1",
            fill: rgb("#c7c2bd"),
            font: "Source Sans 3",
            size: 7.5pt,
            weight: "medium",
            style: "normal",
          )]],
        )
        #v(-3.75pt)
        #t(
          "Consumer beauty and skincare commerce.",
          fill: muted,
          font: "Source Sans 3",
          size: 9pt,
          weight: "regular",
          style: "italic",
        )

        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 12pt,
          [#grid(
            columns: (auto, auto, auto),
            gutter: 4pt,
            align: horizon,
            [#t(
              "Vice President of Engineering",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2d2418"),
              stroke: 0.75pt + rgb("#9a6a2b"),
            )[#t(
              "Hands-on",
              fill: rgb("#f0b85f"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2a2429"),
              stroke: 0.75pt + rgb("#7a6171"),
            )[#t(
              "Leadership",
              fill: rgb("#e3bfd7"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
          )],
          [#t(
            "Mumbai · Jan 2020 - Jan 2021",
            fill: muted,
            font: "Source Sans 3",
            size: 8.25pt,
            weight: "regular",
            style: "normal",
          )],
        )

        #v(2.25pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Led a 10-engineer team and owned Kult's zero-to-one product and engineering strategy, covering an AWS-hosted Elixir backend and native iOS and Android apps.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Architected both apps and contributed directly in Swift and Kotlin while establishing CI/CD, analytics, deep linking, observability, and the foundations for commerce and engagement features.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )

      ],
    )
  ]

  #v(9pt)

  #block(breakable: false)[
    #grid(
      columns: (30pt, 1fr),
      gutter: 12pt,
      align: top,
      [#move(dy: -0.75pt)[#logo-tile(
        "/public/resume/logos/yilu.png",
        fill: rgb("#101827"),
        size: 30pt,
        image-width: 21pt,
        image-height: 12pt,
        dy: 0pt,
      )]],
      [
        #grid(
          columns: (auto, auto),
          gutter: 5pt,
          align: horizon,
          [#t(
            "Yilu",
            fill: strong,
            font: "Literata",
            size: 12pt,
            weight: "bold",
            style: "normal",
            kerning: false,
          )],
          [#box(
            inset: (x: 4pt, y: 3pt),
            radius: 8pt,
            fill: rgb("#242220"),
            stroke: 0.75pt + rgb("#57534e"),
          )[#t(
            "0 → 1",
            fill: rgb("#c7c2bd"),
            font: "Source Sans 3",
            size: 7.5pt,
            weight: "medium",
            style: "normal",
          )]],
        )
        #v(-3.75pt)
        #t(
          "Smart travel platform built for Lufthansa Group with BCG Digital Ventures.",
          fill: muted,
          font: "Source Sans 3",
          size: 9pt,
          weight: "regular",
          style: "italic",
        )

        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 12pt,
          [#grid(
            columns: (auto, auto, auto),
            gutter: 4pt,
            align: horizon,
            [#t(
              "Founding Engineer",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2d2418"),
              stroke: 0.75pt + rgb("#9a6a2b"),
            )[#t(
              "Hands-on",
              fill: rgb("#f0b85f"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2a2429"),
              stroke: 0.75pt + rgb("#7a6171"),
            )[#t(
              "Leadership",
              fill: rgb("#e3bfd7"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
          )],
          [#t(
            "Berlin · Nov 2018 - Dec 2019",
            fill: muted,
            font: "Source Sans 3",
            size: 8.25pt,
            weight: "regular",
            style: "normal",
          )],
        )

        #v(2.25pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Designed the native mobile architecture and release automation, built Terraform-managed AWS infrastructure, and shipped iOS and Android features for Eurowings.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "As the first engineering hire, led a five-developer full-stack pod with a product manager and designer; partnered with the CTO on key hires and served as Scrum Master for early sprints, establishing the team's delivery cadence.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )

      ],
    )
  ]

  #v(9pt)

  #block(breakable: false)[
    #grid(
      columns: (30pt, 1fr),
      gutter: 12pt,
      align: top,
      [#move(dy: -0.75pt)[#logo-tile(
        "/public/resume/logos/8fit.png",
        fill: rgb("#102018"),
        size: 30pt,
        image-width: 21pt,
        image-height: 15pt,
        dy: 0pt,
      )]],
      [
        #grid(
          columns: (auto, auto),
          gutter: 5pt,
          align: horizon,
          [#t(
            "8fit",
            fill: strong,
            font: "Literata",
            size: 12pt,
            weight: "bold",
            style: "normal",
            kerning: false,
          )],
          [#box(
            inset: (x: 4pt, y: 3pt),
            radius: 8pt,
            fill: rgb("#242220"),
            stroke: 0.75pt + rgb("#57534e"),
          )[#t(
            "Growth-stage",
            fill: rgb("#c7c2bd"),
            font: "Source Sans 3",
            size: 7.5pt,
            weight: "medium",
            style: "normal",
          )]],
        )
        #v(-3.75pt)
        #t(
          "Fitness and nutrition platform later acquired by Withings.",
          fill: muted,
          font: "Source Sans 3",
          size: 9pt,
          weight: "regular",
          style: "italic",
        )

        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 12pt,
          [#grid(
            columns: (auto, auto),
            gutter: 4pt,
            align: horizon,
            [#t(
              "Senior Technical Architect",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2d2418"),
              stroke: 0.75pt + rgb("#9a6a2b"),
            )[#t(
              "Hands-on",
              fill: rgb("#f0b85f"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
          )],
          [#t(
            "Berlin · Nov 2017 - Oct 2018",
            fill: muted,
            font: "Source Sans 3",
            size: 8.25pt,
            weight: "regular",
            style: "normal",
          )],
        )

        #v(2.25pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Architected a hybrid Apple TV fitness app that ranked No. 1 in its Health & Fitness category in more than 30 countries, including Germany, and No. 7 in the United States.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Built cross-platform mobile features across JavaScript, Swift, Objective-C, Java, and Kotlin.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )

      ],
    )
  ]

  #v(9pt)

  #block(breakable: false)[
    #grid(
      columns: (30pt, 1fr),
      gutter: 12pt,
      align: top,
      [#move(dy: -0.75pt)[#logo-tile(
        "/public/resume/logos/housing-mini.png",
        fill: rgb("#ffdf30"),
        size: 30pt,
        image-width: 21pt,
        image-height: 30pt,
        dy: 0pt,
      )]],
      [
        #grid(
          columns: (auto, auto),
          gutter: 5pt,
          align: horizon,
          [#t(
            "Housing",
            fill: strong,
            font: "Literata",
            size: 12pt,
            weight: "bold",
            style: "normal",
            kerning: false,
          )],
          [#box(
            inset: (x: 4pt, y: 3pt),
            radius: 8pt,
            fill: rgb("#242220"),
            stroke: 0.75pt + rgb("#57534e"),
          )[#t(
            "Late-stage",
            fill: rgb("#c7c2bd"),
            font: "Source Sans 3",
            size: 7.5pt,
            weight: "medium",
            style: "normal",
          )]],
        )
        #v(-3.75pt)
        #t(
          "Indian real estate search and transaction platform.",
          fill: muted,
          font: "Source Sans 3",
          size: 9pt,
          weight: "regular",
          style: "italic",
        )

        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 12pt,
          [#grid(
            columns: (auto, auto),
            gutter: 4pt,
            align: horizon,
            [#t(
              "Team Lead",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2d2418"),
              stroke: 0.75pt + rgb("#9a6a2b"),
            )[#t(
              "Hands-on",
              fill: rgb("#f0b85f"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
          )],
          [#t(
            "Mumbai · Oct 2016 - Oct 2017",
            fill: muted,
            font: "Source Sans 3",
            size: 8.25pt,
            weight: "regular",
            style: "normal",
          )],
        )

        #v(2.25pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Led the architecture of Housing's React Native app, sharing more than 90% of its JavaScript code across iOS and Android.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Designed its state management, reactive data flows, offline persistence, and component-driven UI. Also built automated testing and release systems covering diagnostics, signed builds, beta distribution, and over-the-air updates.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Contributed to Housing.com's Progressive Web App for users on slow and inconsistent network connections.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )

      ],
    )
  ]

  #v(9pt)

  #block(breakable: false)[
    #grid(
      columns: (30pt, 1fr),
      gutter: 12pt,
      align: top,
      [#move(dy: -0.75pt)[#logo-tile(
        "/public/resume/logos/bridg.png",
        fill: rgb("#211916"),
        size: 30pt,
        image-width: 21pt,
        image-height: 12pt,
        dy: 0.75pt,
      )]],
      [
        #grid(
          columns: auto,
          gutter: 5pt,
          align: horizon,
          [#t(
            "Earlier Consulting and Startup Work",
            fill: strong,
            font: "Literata",
            size: 12pt,
            weight: "bold",
            style: "normal",
            kerning: false,
          )],
        )
        #v(-3.75pt)
        #t(
          "Bridg, 1mg, HornOk, Volkno, Meriad, and self-employed work.",
          fill: muted,
          font: "Source Sans 3",
          size: 9pt,
          weight: "regular",
          style: "italic",
        )

        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 12pt,
          [#grid(
            columns: (auto, auto),
            gutter: 4pt,
            align: horizon,
            [#t(
              "Software Engineer and Consultant",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )],
            [#box(
              inset: (x: 4pt, y: 3pt),
              radius: 8pt,
              fill: rgb("#2d2418"),
              stroke: 0.75pt + rgb("#9a6a2b"),
            )[#t(
              "Hands-on",
              fill: rgb("#f0b85f"),
              font: "Source Sans 3",
              size: 7.5pt,
              weight: "medium",
              style: "normal",
            )]],
          )],
          [#t(
            "Los Angeles / India · 2015 - 2016",
            fill: muted,
            font: "Source Sans 3",
            size: 8.25pt,
            weight: "regular",
            style: "normal",
          )],
        )

        #v(2.25pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Built web and mobile products for email and customer-data tools, real-time medical consultations, and connected fleet management using JavaScript, Java, and Ruby on Rails.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )
        #v(1.5pt)

        #grid(
          columns: (6pt, 1fr),
          gutter: 6pt,
          align: top,
          [#t(
            "·",
            fill: accent,
            font: "Source Sans 3",
            size: 10pt,
            weight: "bold",
            style: "normal",
          )],
          [#t(
            "Mentored 1mg's mobile team on hybrid app architecture and modern development tooling.",
            fill: muted,
            font: "Source Sans 3",
            size: 10pt,
            weight: "regular",
            style: "normal",
          )],
        )

      ],
    )
  ]




  #block(breakable: false)[

    #v(24pt)
    #t(
      "Education",
      fill: strong,
      font: "Literata",
      size: 15pt,
      weight: "bold",
      style: "normal",
    )
    #v(9pt)


    #block(breakable: false)[
      #grid(
        columns: (30pt, 1fr),
        gutter: 12pt,
        align: top,
        [#move(dy: -0.75pt)[#logo-tile(
          "/public/resume/logos/ucla.png",
          fill: rgb("#2774ae"),
          size: 30pt,
          image-width: 21pt,
          image-height: 9pt,
          dy: 0pt,
        )]],
        [
          #grid(
            columns: auto,
            gutter: 5pt,
            align: horizon,
            [#t(
              "University of California, Los Angeles",
              fill: strong,
              font: "Literata",
              size: 12pt,
              weight: "bold",
              style: "normal",
              kerning: false,
            )],
          )
          #v(-3.75pt)
          #t(
            "Bachelor of Science.",
            fill: muted,
            font: "Source Sans 3",
            size: 9pt,
            weight: "regular",
            style: "italic",
          )

          #v(3pt)
          #grid(
            columns: (1fr, auto),
            gutter: 12pt,
            [#grid(
              columns: auto,
              gutter: 4pt,
              align: horizon,
              [#t(
                "Computer Science and Engineering",
                fill: strong,
                font: "Source Sans 3",
                size: 10pt,
                weight: "medium",
                style: "normal",
              )],
            )],
            [#t(
              "Los Angeles, CA · 2013 - 2016",
              fill: muted,
              font: "Source Sans 3",
              size: 8.25pt,
              weight: "regular",
              style: "normal",
            )],
          )



        ],
      )
    ]

  ]
  #v(9pt)

  #block(breakable: false)[
    #grid(
      columns: (30pt, 1fr),
      gutter: 12pt,
      align: top,
      [#move(dy: -0.75pt)[#logo-tile(
        "/public/resume/logos/dps-rk-puram.png",
        fill: rgb("#016b2f"),
        size: 30pt,
        image-width: 21pt,
        image-height: 27pt,
        dy: 0pt,
      )]],
      [
        #grid(
          columns: auto,
          gutter: 5pt,
          align: horizon,
          [#t(
            "Delhi Public School, R. K. Puram",
            fill: strong,
            font: "Literata",
            size: 12pt,
            weight: "bold",
            style: "normal",
            kerning: false,
          )],
        )
        #v(-3.75pt)
        #t(
          "High School.",
          fill: muted,
          font: "Source Sans 3",
          size: 9pt,
          weight: "regular",
          style: "italic",
        )

        #v(3pt)
        #grid(
          columns: (1fr, auto),
          gutter: 12pt,
          [#grid(
            columns: auto,
            gutter: 4pt,
            align: horizon,
            [#t(
              "Computer Science, Physics, Chemistry, Math",
              fill: strong,
              font: "Source Sans 3",
              size: 10pt,
              weight: "medium",
              style: "normal",
            )],
          )],
          [#t(
            "New Delhi, India · 2011 - 2013",
            fill: muted,
            font: "Source Sans 3",
            size: 8.25pt,
            weight: "regular",
            style: "normal",
          )],
        )



      ],
    )
  ]


]
