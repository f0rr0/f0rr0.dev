#let data = json(bytes(sys.inputs.resume))

#let px(n) = n * 0.75pt
#let rem(n) = px(n * 16)
#let spacing(n) = rem(n / 4)
#let background = rgb("#1a1918")
#let strong = rgb("#e7e5e4")
#let muted = rgb("#a8a29e")
#let accent = rgb("#d97706")
#let rule-color = rgb("#3a3836")
#let clean(s) = (
  s
    .replace("’", "'")
    .replace("“", "\"")
    .replace("”", "\"")
    .replace("–", "-")
    .replace("—", "-")
)
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
  clean(s),
)
#let paragraph(s) = block[
  #set par(leading: 0.625em)
  #t(s)
]

#let role-colors = (
  hands-on: (fill: "#2d2418", stroke: "#9a6a2b", text: "#f0b85f"),
  leadership: (fill: "#2a2429", stroke: "#7a6171", text: "#e3bfd7"),
)
#let badge(label, colors) = box(
  inset: (x: 4pt, y: px(4)),
  radius: 8pt,
  fill: rgb(colors.fill),
  stroke: 0.75pt + rgb(colors.stroke),
)[#t(label, fill: rgb(colors.text), size: 7.5pt, weight: "medium")]
#let role-marker(marker) = badge(
  data.roleMarkerLabels.at(marker),
  role-colors.at(marker),
)
#let company-stage(stage) = badge(data.companyStageLabels.at(stage), (
  fill: "#242220",
  stroke: "#57534e",
  text: "#c7c2bd",
))

#let size-from-class(classes, dimension, fallback) = {
  let matched = classes.match(regex(
    "(?:^|\\s)" + dimension + "-([0-9]+(?:\\.[0-9]+)?)",
  ))
  if matched == none { fallback } else {
    spacing(float(matched.captures.first()))
  }
}
#let translate-y(classes) = {
  if classes.contains("-translate-y-0.5") {
    -spacing(0.5)
  } else if classes.contains("translate-y-px") { px(1) } else { 0pt }
}
#let tile-fill(logo) = {
  if logo.tileClassName.contains("bg-white") { rgb("#ffffff") } else {
    let matched = logo.tileClassName.match(regex("bg-\\[(#[0-9a-fA-F]+)\\]"))
    if matched == none { background } else { rgb(matched.captures.first()) }
  }
}
#let asset(src) = "/public/" + src.trim("/", at: start)
#let logo-tile(
  logo,
  classes: "",
  size: spacing(10),
  width: spacing(7),
  height: spacing(5),
) = rect(
  width: size,
  height: size,
  radius: size / 2,
  fill: tile-fill(logo),
  stroke: px(1) + rule-color,
)[#align(center + horizon)[#move(dy: translate-y(classes))[
  #image(
    asset(logo.src),
    width: size-from-class(classes, "w", width),
    height: size-from-class(classes, "h", height),
    fit: "contain",
  )
]]]
#let company-logo(logo) = move(dy: -px(1))[
  #logo-tile(logo, classes: logo.at("imageClassName", default: ""))
]
#let bullet-logo(logo) = logo-tile(
  logo,
  classes: logo.at("bulletImageClassName", default: logo.at(
    "imageClassName",
    default: "",
  )),
  size: spacing(7),
  width: spacing(5),
  height: spacing(4),
)

#let bullet-content(bullet) = {
  if type(bullet) == str {
    grid(
      columns: (spacing(2), 1fr),
      gutter: spacing(2),
      align: top,
      [#t("·", fill: accent, weight: "bold")], [#t(bullet)],
    )
  } else {
    let body = [#t(
        bullet.at("label", default: "") + ": ",
        fill: strong,
        weight: "medium",
      )#t(bullet.text)]
    if "logo" in bullet {
      grid(
        columns: (spacing(7), 1fr),
        gutter: spacing(2.5),
        align: top,
        [#move(dy: -0.5pt)[#bullet-logo(bullet.logo)]], body,
      )
    } else {
      grid(
        columns: (spacing(2), 1fr),
        gutter: spacing(2),
        align: top,
        [#t("·", fill: accent, weight: "bold")], body,
      )
    }
  }
}
#let role-block(role) = {
  let headings = (
    (t(role.title, fill: strong, weight: "medium"),)
      + role.at("markers", default: ()).map(role-marker)
  )
  let bullets = role.at("bullets", default: ())
  [
    #v(spacing(1))
    #grid(
      columns: (1fr, auto),
      gutter: spacing(4),
      [#grid(columns: headings.map(_ => {
          auto
        }), gutter: 4pt, align: horizon, ..headings)],
      [#t(role.location + " · " + role.dates, size: px(11))],
    )
    #if "summary" in role [#v(px(3))#t(role.summary)]
    #if bullets.len() > 0 [#v(px(3))#(
        bullets.map(bullet-content).join([#v(spacing(0.5))])
      )]
  ]
}
#let experience-item(item) = {
  let headings = (
    t(
      item.at("displayName", default: item.company),
      fill: strong,
      font: "Literata",
      kerning: false,
      size: rem(1),
      weight: "bold",
    ),
  )
  if "companyStage" in item { headings.push(company-stage(item.companyStage)) }
  block(breakable: false)[
    #grid(
      columns: (spacing(10), 1fr),
      gutter: spacing(4),
      align: top,
      [#company-logo(item.logo)],
      [
        #grid(columns: headings.map(_ => {
            auto
          }), gutter: 5pt, align: horizon, ..headings)
        #v(-3.75pt)
        #t(item.tagline, size: rem(0.75), style: "italic")
        #item.roles.map(role-block).join([ ])
      ],
    )
  ]
}
#let section(title, items, before: spacing(8)) = [
  #block(breakable: false)[
    #v(before)
    #t(title, fill: strong, font: "Literata", size: rem(1.25), weight: "bold")
    #v(spacing(3))
    #if items.len() > 0 [
      #if items.first().at("pdfPageBreakBefore", default: false) { pagebreak() }
      #experience-item(items.first())
    ]
  ]
  #for item in items.slice(calc.min(1, items.len())) [
    #if item.at("pdfPageBreakBefore", default: false) { pagebreak() } else {
      v(spacing(3))
    }
    #experience-item(item)
  ]
]

#set document(
  title: data.pdf.title,
  author: data.person.name,
  keywords: (data.person.role,) + data.skills,
)
#set page(paper: "us-legal", margin: 0.58in, fill: background)
#set text(font: "Source Sans 3", size: 10pt, fill: muted, lang: "en")
#set par(leading: 0.625em, justify: false)

#align(left)[
  #grid(
    columns: (rem(3), auto, 1fr),
    gutter: spacing(4),
    align: top,
    [#image(
      asset(data.person.at("avatarImage", default: data.person.image)),
      width: rem(3),
      height: rem(3),
      fit: "contain",
    )],
    [#box(height: rem(3))[#align(left + horizon)[#t(
      data.person.name + " ",
      fill: strong,
      font: "Literata",
      size: rem(3),
      weight: "bold",
    )]]],
    [#align(right)[#box(height: rem(3))[#align(right + horizon)[#box(
      height: 32pt,
    )[
      #set par(leading: 0.422em)
      #align(right)[
        #(
          data
            .links
            .enumerate()
            .map(((index, item)) => {
              // Preserve the name/contact word boundary for PDF text extraction.
              let label = if index == 0 { " " + item.label } else { item.label }
              link(item.href)[#t(
                label,
                fill: accent,
                size: px(10),
                weight: "medium",
              )]
            })
            .join(linebreak())
        )
      ]
    ]]]]],
  )
  #v(spacing(1))
  #paragraph(data.summary)
  #v(spacing(2))
  #t("Skills", size: rem(1.25), fill: strong, font: "Literata", weight: "bold")
  #v(spacing(1))
  #paragraph(data.skills.join(" · "))

  #section("Experience", data.experience, before: spacing(2))

  #section("Education", data.education)
]
